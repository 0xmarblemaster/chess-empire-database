-- Migration: Rank by Rating with Level/Lesson Fallback
-- Run this in Supabase SQL Editor
-- Created: 2026-02-05
--
-- Logic:
-- 1. PRIMARY: Students with ratings ranked by rating DESC
-- 2. FALLBACK: Students without ratings ranked by Level DESC, Lesson DESC
-- 3. Students WITH ratings always rank above students WITHOUT ratings

-- Drop and recreate branch rank function
DROP FUNCTION IF EXISTS get_student_branch_level_rank(UUID);

CREATE OR REPLACE FUNCTION get_student_branch_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_students_ahead INTEGER;
    v_rank INTEGER;
    v_level INTEGER;
    v_lesson INTEGER;
    v_rating INTEGER;
    v_has_rating BOOLEAN;
    v_branch_id UUID;
BEGIN
    -- Get student's info
    SELECT s.current_level, s.current_lesson, s.branch_id,
           COALESCE(r.rating, 0), (r.rating IS NOT NULL)
    INTO v_level, v_lesson, v_branch_id, v_rating, v_has_rating
    FROM students s
    LEFT JOIN student_current_ratings r ON s.id = r.student_id
    WHERE s.id = p_student_id;

    -- Count total active students in branch
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.branch_id = v_branch_id
    AND s.status = 'active';

    -- Count students ahead based on rating (primary) or level/lesson (fallback)
    IF v_has_rating THEN
        -- Student HAS rating: count those with higher rating
        SELECT COUNT(*)
        INTO v_students_ahead
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.branch_id = v_branch_id
        AND s.status = 'active'
        AND s.id != p_student_id
        AND r.rating IS NOT NULL
        AND r.rating > v_rating;
    ELSE
        -- Student has NO rating: all rated students + higher level/lesson unrated students are ahead
        SELECT COUNT(*)
        INTO v_students_ahead
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.branch_id = v_branch_id
        AND s.status = 'active'
        AND s.id != p_student_id
        AND (
            -- All students with ratings are ahead
            r.rating IS NOT NULL
            OR
            -- OR unrated students with higher level
            (r.rating IS NULL AND s.current_level > v_level)
            OR
            -- OR unrated students with same level but higher lesson
            (r.rating IS NULL AND s.current_level = v_level AND s.current_lesson > v_lesson)
            OR
            -- OR same level+lesson but earlier enrollment (tie-breaker)
            (r.rating IS NULL AND s.current_level = v_level AND s.current_lesson = v_lesson 
             AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
        );
    END IF;

    -- Calculate rank (1-based: rank 1 = best)
    v_rank := v_students_ahead + 1;

    RETURN QUERY
    SELECT
        v_total,
        v_rank,
        v_level,
        v_lesson;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate school rank function with same logic
DROP FUNCTION IF EXISTS get_student_school_level_rank(UUID);

CREATE OR REPLACE FUNCTION get_student_school_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_school INTEGER,
    rank_in_school INTEGER,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_students_ahead INTEGER;
    v_rank INTEGER;
    v_level INTEGER;
    v_lesson INTEGER;
    v_rating INTEGER;
    v_has_rating BOOLEAN;
BEGIN
    -- Get student's info
    SELECT s.current_level, s.current_lesson,
           COALESCE(r.rating, 0), (r.rating IS NOT NULL)
    INTO v_level, v_lesson, v_rating, v_has_rating
    FROM students s
    LEFT JOIN student_current_ratings r ON s.id = r.student_id
    WHERE s.id = p_student_id;

    -- Count total active students school-wide
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.status = 'active';

    -- Count students ahead based on rating (primary) or level/lesson (fallback)
    IF v_has_rating THEN
        -- Student HAS rating: count those with higher rating
        SELECT COUNT(*)
        INTO v_students_ahead
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.status = 'active'
        AND s.id != p_student_id
        AND r.rating IS NOT NULL
        AND r.rating > v_rating;
    ELSE
        -- Student has NO rating: all rated students + higher level/lesson unrated students are ahead
        SELECT COUNT(*)
        INTO v_students_ahead
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.status = 'active'
        AND s.id != p_student_id
        AND (
            -- All students with ratings are ahead
            r.rating IS NOT NULL
            OR
            -- OR unrated students with higher level
            (r.rating IS NULL AND s.current_level > v_level)
            OR
            -- OR unrated students with same level but higher lesson
            (r.rating IS NULL AND s.current_level = v_level AND s.current_lesson > v_lesson)
            OR
            -- OR same level+lesson but earlier enrollment (tie-breaker)
            (r.rating IS NULL AND s.current_level = v_level AND s.current_lesson = v_lesson 
             AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
        );
    END IF;

    -- Calculate rank (1-based: rank 1 = best)
    v_rank := v_students_ahead + 1;

    RETURN QUERY
    SELECT
        v_total,
        v_rank,
        v_level,
        v_lesson;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify functions were created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_student_branch_level_rank', 'get_student_school_level_rank');

-- ============================================
-- NEW RANKING LOGIC
-- ============================================
-- 1. Students WITH ratings: ranked by rating DESC
--    - Rating 1199 → Rank 1
--    - Rating 948 → Rank 8 (if 7 students have higher rating)
--
-- 2. Students WITHOUT ratings: ranked after all rated students
--    - Sorted by Level DESC, then Lesson DESC
--    - Tie-breaker: earlier enrollment date
--
-- EXAMPLE for Berkin Sanzhar (rating 948):
-- - 7 students in Debut have rating > 948
-- - New rank: 8/237 (instead of 29/237)
