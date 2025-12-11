-- Migration: Deploy Level-Based Ranking Functions
-- Run this in Supabase SQL Editor to enable level rank badges
-- Created: 2025-12-10

-- Function: Get student's LEVEL-based percentile rank within their branch
-- This ranks students by their current_level and current_lesson progress
CREATE OR REPLACE FUNCTION get_student_branch_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    percentile NUMERIC,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH student_info AS (
        SELECT branch_id, s.current_level, s.current_lesson
        FROM students s WHERE id = p_student_id
    ),
    branch_rankings AS (
        SELECT
            s.id,
            s.current_level as level,
            s.current_lesson as lesson,
            -- Rank by level first, then by lesson within level
            ROW_NUMBER() OVER (ORDER BY s.current_level DESC, s.current_lesson DESC) as rank
        FROM students s
        WHERE s.branch_id = (SELECT branch_id FROM student_info)
        AND s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM branch_rankings),
        (SELECT br.rank::INTEGER FROM branch_rankings br WHERE br.id = p_student_id),
        ROUND(100.0 - ((SELECT br.rank FROM branch_rankings br WHERE br.id = p_student_id) - 1) * 100.0 /
            NULLIF((SELECT COUNT(*) FROM branch_rankings), 0), 1),
        (SELECT si.current_level FROM student_info si),
        (SELECT si.current_lesson FROM student_info si);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get student's LEVEL-based percentile rank school-wide
CREATE OR REPLACE FUNCTION get_student_school_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_school INTEGER,
    rank_in_school INTEGER,
    percentile NUMERIC,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH student_info AS (
        SELECT s.current_level, s.current_lesson
        FROM students s WHERE id = p_student_id
    ),
    school_rankings AS (
        SELECT
            s.id,
            s.current_level as level,
            s.current_lesson as lesson,
            -- Rank by level first, then by lesson within level
            ROW_NUMBER() OVER (ORDER BY s.current_level DESC, s.current_lesson DESC) as rank
        FROM students s
        WHERE s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM school_rankings),
        (SELECT sr.rank::INTEGER FROM school_rankings sr WHERE sr.id = p_student_id),
        ROUND(100.0 - ((SELECT sr.rank FROM school_rankings sr WHERE sr.id = p_student_id) - 1) * 100.0 /
            NULLIF((SELECT COUNT(*) FROM school_rankings), 0), 1),
        (SELECT si.current_level FROM student_info si),
        (SELECT si.current_lesson FROM student_info si);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify functions were created
SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_student_branch_level_rank', 'get_student_school_level_rank');
