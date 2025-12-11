-- Migration: Simplify Ranking to Show Position Instead of Percentile
-- Run this in Supabase SQL Editor
-- Created: 2025-12-11
--
-- Changes:
-- 1. Remove razryad override from branch ranking
-- 2. Calculate rank purely based on Level and Lesson
-- 3. Return rank position (e.g., 5 out of 70) instead of percentile
-- 4. Tie-breaker: enrollment date (created_at) for students at same Level AND Lesson

-- Drop and recreate branch level rank function
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
BEGIN
    -- Get student's current level and lesson
    SELECT s.current_level, s.current_lesson
    INTO v_level, v_lesson
    FROM students s
    WHERE s.id = p_student_id;

    -- Count total active students in branch
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.branch_id = (SELECT branch_id FROM students WHERE id = p_student_id)
    AND s.status = 'active';

    -- Count students ahead (higher level OR same level with higher lesson OR same level+lesson but earlier enrollment)
    SELECT COUNT(*)
    INTO v_students_ahead
    FROM students s
    WHERE s.branch_id = (SELECT branch_id FROM students WHERE id = p_student_id)
    AND s.status = 'active'
    AND s.id != p_student_id
    AND (
        -- Higher level
        s.current_level > v_level
        OR
        -- Same level, higher lesson
        (s.current_level = v_level AND s.current_lesson > v_lesson)
        OR
        -- Same level AND same lesson, but earlier enrollment (tie-breaker)
        (s.current_level = v_level AND s.current_lesson = v_lesson AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
    );

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

-- Drop and recreate school level rank function with same logic
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
BEGIN
    -- Get student's current level and lesson
    SELECT s.current_level, s.current_lesson
    INTO v_level, v_lesson
    FROM students s
    WHERE s.id = p_student_id;

    -- Count total active students school-wide
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.status = 'active';

    -- Count students ahead (higher level OR same level with higher lesson OR same level+lesson but earlier enrollment)
    SELECT COUNT(*)
    INTO v_students_ahead
    FROM students s
    WHERE s.status = 'active'
    AND s.id != p_student_id
    AND (
        -- Higher level
        s.current_level > v_level
        OR
        -- Same level, higher lesson
        (s.current_level = v_level AND s.current_lesson > v_lesson)
        OR
        -- Same level AND same lesson, but earlier enrollment (tie-breaker)
        (s.current_level = v_level AND s.current_lesson = v_lesson AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
    );

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
-- EXAMPLE OUTPUT
-- ============================================
-- For a student at Level 3, Lesson 33 in a branch with 70 students:
-- - 37 students are ahead (higher level or same level with higher lesson)
-- - rank_in_branch = 38
-- - total_in_branch = 70
--
-- Display: "38 / 70" (position 38 out of 70 students)
