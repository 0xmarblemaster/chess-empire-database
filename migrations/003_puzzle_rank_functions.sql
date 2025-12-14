-- ============================================
-- PUZZLE SCORE RANKING FUNCTIONS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Get student's puzzle score rank within their branch
-- Returns: total_in_branch, rank_in_branch, best_score
CREATE OR REPLACE FUNCTION get_student_branch_puzzle_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    best_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH student_branch AS (
        SELECT branch_id FROM students WHERE id = p_student_id
    ),
    branch_scores AS (
        SELECT
            s.id as student_id,
            COALESCE(sb.best_score, 0) as score,
            ROW_NUMBER() OVER (ORDER BY COALESCE(sb.best_score, 0) DESC, s.created_at ASC) as rank
        FROM students s
        LEFT JOIN student_best_survival sb ON sb.student_id = s.id AND sb.mode = 'puzzle_rush'
        WHERE s.branch_id = (SELECT branch_id FROM student_branch)
        AND s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM branch_scores),
        COALESCE((SELECT bs.rank::INTEGER FROM branch_scores bs WHERE bs.student_id = p_student_id), 0),
        COALESCE((SELECT bs.score::INTEGER FROM branch_scores bs WHERE bs.student_id = p_student_id), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get student's puzzle score rank school-wide
-- Returns: total_in_school, rank_in_school, best_score
CREATE OR REPLACE FUNCTION get_student_school_puzzle_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_school INTEGER,
    rank_in_school INTEGER,
    best_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH school_scores AS (
        SELECT
            s.id as student_id,
            COALESCE(sb.best_score, 0) as score,
            ROW_NUMBER() OVER (ORDER BY COALESCE(sb.best_score, 0) DESC, s.created_at ASC) as rank
        FROM students s
        LEFT JOIN student_best_survival sb ON sb.student_id = s.id AND sb.mode = 'puzzle_rush'
        WHERE s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM school_scores),
        COALESCE((SELECT ss.rank::INTEGER FROM school_scores ss WHERE ss.student_id = p_student_id), 0),
        COALESCE((SELECT ss.score::INTEGER FROM school_scores ss WHERE ss.student_id = p_student_id), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
SELECT 'Puzzle ranking functions created successfully!' as result;
