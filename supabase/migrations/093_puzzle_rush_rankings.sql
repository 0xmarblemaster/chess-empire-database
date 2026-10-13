-- Migration 093: Puzzle Rush school/branch rankings (P1 — Chess Empire DB side)
-- ============================================================================
-- Chesster will push students' Puzzle Rush **Survival** runs into
-- survival_scores (the score coaches enter today). CE stays the single source
-- of truth. This migration adds:
--   1. survival_scores.source ('coach' | 'chesster') — existing rows are coach
--      entries, so the column DEFAULT backfills them as 'coach'.
--   2. survival_scores.external_ref (Chesster run id) + partial unique index so
--      a retried push never creates a second row (idempotency).
--   3. (student_id, achieved_at) index for the windowed leaderboard queries.
--   4. puzzle_rush_window_start(period) — week/month window start computed in
--      Asia/Almaty local time (week starts Monday 00:00 local).
--   5. get_puzzle_rush_leaderboard(...) — school/branch board, best score per
--      active student in the window, competition RANK(), self row appended.
--   6. get_student_puzzle_rush_best(student) — week/month/all-time bests, used
--      by Chesster to decide whether a run is worth pushing.
--
-- Types verified against supabase-schema.sql: branches.id / students.branch_id
-- are UUID; students.status ∈ ('active','frozen','left').
--
-- Idempotent (IF NOT EXISTS / OR REPLACE). File only — reviewed and applied
-- separately (repo convention, see 091 header). Does NOT modify existing
-- survival_scores data beyond the column default for the new `source` column.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1-3. survival_scores columns + indexes
-- ============================================================================
ALTER TABLE survival_scores
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'coach'
    CHECK (source IN ('coach', 'chesster'));

ALTER TABLE survival_scores
    ADD COLUMN IF NOT EXISTS external_ref TEXT NULL;

COMMENT ON COLUMN survival_scores.source IS
    'Who recorded the score: ''coach'' (admin form) or ''chesster'' (students-api push).';
COMMENT ON COLUMN survival_scores.external_ref IS
    'External run id (Chesster Puzzle Rush run). Unique when set — makes pushes idempotent.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_survival_scores_external_ref
    ON survival_scores(external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survival_scores_student_achieved
    ON survival_scores(student_id, achieved_at);

-- ============================================================================
-- 4. Window start in Asia/Almaty local time
-- ============================================================================
-- now() AT TIME ZONE 'Asia/Almaty' → local wall-clock timestamp; date_trunc on
-- that gives local Monday 00:00 / 1st-of-month 00:00; the outer AT TIME ZONE
-- converts the local wall-clock back to a real timestamptz. 'all' → NULL.
CREATE OR REPLACE FUNCTION puzzle_rush_window_start(p_period TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE p_period
        WHEN 'week'  THEN date_trunc('week',  now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'
        WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'
        ELSE NULL
    END;
$$;

GRANT EXECUTE ON FUNCTION puzzle_rush_window_start(TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- 5. Leaderboard
-- ============================================================================
CREATE OR REPLACE FUNCTION get_puzzle_rush_leaderboard(
    p_scope TEXT,
    p_period TEXT,
    p_branch_id UUID DEFAULT NULL,
    p_student_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    rank BIGINT,
    student_id UUID,
    first_name TEXT,
    last_name TEXT,
    branch_id UUID,
    branch_name TEXT,
    best_score INT,
    achieved_at TIMESTAMPTZ,
    source TEXT,
    total_count BIGINT,
    is_self BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_start TIMESTAMPTZ;
BEGIN
    IF p_scope IS NULL OR p_scope NOT IN ('school', 'branch') THEN
        RAISE EXCEPTION 'invalid scope: % (expected school | branch)', p_scope;
    END IF;
    IF p_scope = 'branch' AND p_branch_id IS NULL THEN
        RAISE EXCEPTION 'scope branch requires p_branch_id';
    END IF;
    IF p_period IS NULL OR p_period NOT IN ('week', 'month', 'all') THEN
        RAISE EXCEPTION 'invalid period: % (expected week | month | all)', p_period;
    END IF;

    v_start := puzzle_rush_window_start(p_period);

    RETURN QUERY
    WITH best AS (
        -- Best score per student in the window; tie-break = earliest achieved_at.
        SELECT DISTINCT ON (ss.student_id)
            ss.student_id, ss.score, ss.achieved_at, ss.source
        FROM survival_scores ss
        JOIN students s ON s.id = ss.student_id
        WHERE ss.mode = 'puzzle_rush'
          AND s.status = 'active'
          AND (v_start IS NULL OR ss.achieved_at >= v_start)
          AND (p_scope = 'school' OR s.branch_id = p_branch_id)
        ORDER BY ss.student_id, ss.score DESC, ss.achieved_at ASC NULLS LAST
    ),
    ranked AS (
        SELECT
            RANK() OVER (ORDER BY b.score DESC) AS rnk,
            ROW_NUMBER() OVER (ORDER BY b.score DESC, b.achieved_at ASC NULLS LAST, b.student_id) AS pos,
            COUNT(*) OVER () AS total,
            b.*
        FROM best b
    )
    SELECT
        r.rnk,
        r.student_id,
        s.first_name,
        s.last_name,
        s.branch_id,
        br.name,
        r.score,
        r.achieved_at,
        r.source,
        r.total,
        (p_student_id IS NOT NULL AND r.student_id = p_student_id)
    FROM ranked r
    JOIN students s ON s.id = r.student_id
    LEFT JOIN branches br ON br.id = s.branch_id
    WHERE r.pos <= GREATEST(COALESCE(p_limit, 50), 1)
       OR (p_student_id IS NOT NULL AND r.student_id = p_student_id)
    ORDER BY r.pos;
END;
$$;

GRANT EXECUTE ON FUNCTION get_puzzle_rush_leaderboard(TEXT, TEXT, UUID, UUID, INT) TO anon, authenticated, service_role;

-- ============================================================================
-- 6. Per-student bests (week / month / all-time)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_student_puzzle_rush_best(p_student_id UUID)
RETURNS TABLE (
    week_best INT,
    month_best INT,
    all_best INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        MAX(ss.score) FILTER (WHERE ss.achieved_at >= puzzle_rush_window_start('week')),
        MAX(ss.score) FILTER (WHERE ss.achieved_at >= puzzle_rush_window_start('month')),
        MAX(ss.score)
    FROM survival_scores ss
    WHERE ss.student_id = p_student_id
      AND ss.mode = 'puzzle_rush';
$$;

GRANT EXECUTE ON FUNCTION get_student_puzzle_rush_best(UUID) TO anon, authenticated, service_role;

COMMIT;
