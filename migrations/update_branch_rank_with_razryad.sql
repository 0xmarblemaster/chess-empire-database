-- Migration: Update Branch Rank Function with Razryad Override
-- Run this in Supabase SQL Editor to deploy the new ranking formula
-- Created: 2025-12-11
--
-- New Ranking Logic:
-- 1. First check Razryad: 4th → min Top 5% (95 percentile), 3rd or higher → min Top 1% (99 percentile)
-- 2. Calculate level/lesson rank: count students ahead by Level, then Lesson
-- 3. Tie-breaker: enrollment date (created_at) for students at same Level AND Lesson
-- 4. Return the HIGHER of razryad-based or level/lesson-based percentile
--
-- Formula: percentile = (1 - (students_ahead / total)) * 100
-- Example: 37 students ahead out of 70 total → (1 - 37/70) * 100 = 47.1% → Top 53%

-- Drop existing function and recreate with new logic
DROP FUNCTION IF EXISTS get_student_branch_level_rank(UUID);

CREATE OR REPLACE FUNCTION get_student_branch_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    percentile NUMERIC,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
DECLARE
    v_razryad TEXT;
    v_razryad_percentile NUMERIC;
    v_level_percentile NUMERIC;
    v_total INTEGER;
    v_students_ahead INTEGER;
    v_rank INTEGER;
    v_level INTEGER;
    v_lesson INTEGER;
BEGIN
    -- Get student info including razryad
    SELECT s.razryad, s.current_level, s.current_lesson
    INTO v_razryad, v_level, v_lesson
    FROM students s
    WHERE s.id = p_student_id;

    -- Determine minimum guaranteed percentile based on razryad
    -- 4th razryad = Top 5% (95 percentile minimum)
    -- 3rd or higher (3rd, 2nd, 1st, kms, master) = Top 1% (99 percentile minimum)
    IF v_razryad = '4th' THEN
        v_razryad_percentile := 95.0;
    ELSIF v_razryad IN ('3rd', '2nd', '1st', 'kms', 'master') THEN
        v_razryad_percentile := 99.0;
    ELSE
        v_razryad_percentile := 0.0;
    END IF;

    -- Calculate level/lesson based ranking
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

    -- Calculate level-based percentile: (1 - (students_ahead / total)) * 100
    IF v_total > 0 THEN
        v_level_percentile := ROUND((1.0 - (v_students_ahead::NUMERIC / v_total::NUMERIC)) * 100.0, 1);
    ELSE
        v_level_percentile := 0.0;
    END IF;

    -- Return the HIGHER of razryad-based or level-based percentile
    RETURN QUERY
    SELECT
        v_total,
        v_rank,
        GREATEST(v_razryad_percentile, v_level_percentile),
        v_level,
        v_lesson;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the function was created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_student_branch_level_rank';

-- Test with a sample student (uncomment to test)
-- SELECT * FROM get_student_branch_level_rank('YOUR_STUDENT_UUID_HERE');

-- ============================================
-- FORMULA VERIFICATION
-- ============================================
-- Example: Student at Level 3, Lesson 33
-- Branch has 70 total students:
--   - 30 students at Level 4, 5, 6, 7, or 8 (higher level)
--   - 30 students at Level 1 or 2 (lower level)
--   - 10 students at Level 3 (same level, including our student)
--     - 7 students at Lesson 34+ (ahead)
--     - 2 students at Lesson 1-32 (behind)
--     - 1 student at Lesson 33 (our student)
--
-- students_ahead = 30 (higher level) + 7 (same level, higher lesson) = 37
-- percentile = (1 - (37/70)) * 100 = 47.1%
--
-- Interpretation:
--   - percentile = 47.1% means we're better than 47.1% of students
--   - rank = 38 out of 70 (37 ahead + ourselves)
--   - "Top 53%" (100 - 47.1 = 52.9%, rounded up)
--
-- Razryad Override Examples:
--   - No razryad, Level 3/Lesson 33: percentile = 47.1% (uses level-based)
--   - 4th razryad, Level 3/Lesson 33: percentile = 95% (razryad minimum)
--   - 3rd razryad, Level 3/Lesson 33: percentile = 99% (razryad minimum)
--   - 3rd razryad, Level 8/Lesson 120: percentile = 100% (level-based is higher)
