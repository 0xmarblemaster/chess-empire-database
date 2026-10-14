-- Migration 096: human-readable, permanent, unique Student ID (students.student_code)
-- ============================================================================
-- students.id is a UUID — unique, but nobody can read or say it. This adds a
-- human-readable code per child, format CE-00001 … CE-99999, then CE-100000 …
-- (the number is never truncated).
--
--   1. student_code_seq (NO CYCLE) + students.student_code TEXT.
--   2. format_student_code(n) — 'CE-' || 5-digit zero-padded n; n >= 100000 is
--      printed in full (lpad would TRUNCATE longer strings, so it is not used
--      for those).
--   3. Backfill rows without a code in (created_at, id) order, then setval the
--      sequence past the highest code (never backwards — retired codes stay
--      retired). The audit / updated_at triggers are switched off for the
--      backfill so it neither floods audit_log nor bumps every updated_at.
--   4. BEFORE INSERT trigger: ALWAYS assigns the next code from the sequence and
--      ignores any client-supplied value, so every insert path (dashboard
--      addStudent, students-api create, registration, imports) gets one.
--      SECURITY DEFINER so anon / authenticated inserts need no sequence grant.
--   5. BEFORE UPDATE trigger: any change of student_code raises. Codes are
--      never edited and never reused (the sequence only moves forward; a
--      deleted student's code is simply never handed out again).
--   6. NOT NULL + UNIQUE index + format CHECK.
--   7. RPCs returning student rows to API consumers also return student_code:
--      find_students_by_phone_digits (091) and get_puzzle_rush_leaderboard
--      (093). Return types change, so each is DROPped and recreated with the
--      exact same privileges. get_student_puzzle_rush_best returns no student
--      identity and is untouched.
--   8. anon keeps read access to the code even if migration 095 (column-level
--      anon grants) is applied first.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / catalog guards; the backfill only
-- touches NULL codes). File only — reviewed and applied separately (repo
-- convention, see 091 header). Read-only checks: 096_student_code_verify.sql.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Sequence + column
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS student_code_seq
    AS BIGINT START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS student_code TEXT NULL;

COMMENT ON COLUMN students.student_code IS
    'Human-readable permanent Student ID (CE-00001). Assigned by trigger from '
    'student_code_seq on insert; immutable; never reused.';

-- ============================================================================
-- 2. Formatter
-- ============================================================================
CREATE OR REPLACE FUNCTION format_student_code(n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT 'CE-' || CASE WHEN n < 100000 THEN lpad(n::text, 5, '0') ELSE n::text END;
$$;

-- ============================================================================
-- 3. Backfill (triggers off) + move the sequence past the max code
-- ============================================================================
-- Recreated in step 4/5; dropped first so a re-run's backfill is not blocked.
DROP TRIGGER IF EXISTS trg_students_student_code_insert ON students;
DROP TRIGGER IF EXISTS trg_students_student_code_immutable ON students;

DO $$
DECLARE
    v_max BIGINT;
    v_last BIGINT;
    v_called BOOLEAN;
    v_floor BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'students'::regclass AND tgname = 'audit_students_changes') THEN
        ALTER TABLE students DISABLE TRIGGER audit_students_changes;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'students'::regclass AND tgname = 'update_students_updated_at') THEN
        ALTER TABLE students DISABLE TRIGGER update_students_updated_at;
    END IF;

    SELECT COALESCE(MAX(substring(student_code FROM 4)::BIGINT), 0) INTO v_max
    FROM students WHERE student_code IS NOT NULL;

    UPDATE students s
    SET student_code = format_student_code(v_max + o.rn)
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS FIRST, id ASC) AS rn
        FROM students
        WHERE student_code IS NULL
    ) o
    WHERE s.id = o.id;

    SELECT COALESCE(MAX(substring(student_code FROM 4)::BIGINT), 0) INTO v_max
    FROM students WHERE student_code IS NOT NULL;

    -- Never move the sequence backwards: codes of deleted students stay retired.
    SELECT last_value, is_called INTO v_last, v_called FROM student_code_seq;
    v_floor := GREATEST(v_max, CASE WHEN v_called THEN v_last ELSE v_last - 1 END);
    PERFORM setval('student_code_seq', GREATEST(v_floor, 1), v_floor > 0);

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'students'::regclass AND tgname = 'audit_students_changes') THEN
        ALTER TABLE students ENABLE TRIGGER audit_students_changes;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'students'::regclass AND tgname = 'update_students_updated_at') THEN
        ALTER TABLE students ENABLE TRIGGER update_students_updated_at;
    END IF;
END $$;

-- ============================================================================
-- 4. BEFORE INSERT: always assign from the sequence
-- ============================================================================
CREATE OR REPLACE FUNCTION assign_student_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Client-supplied values are ignored on purpose: the DB is the only issuer.
    NEW.student_code := format_student_code(nextval('student_code_seq'));
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_student_code_insert
    BEFORE INSERT ON students
    FOR EACH ROW EXECUTE FUNCTION assign_student_code();

-- ============================================================================
-- 5. BEFORE UPDATE: codes are immutable
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_student_code_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.student_code IS DISTINCT FROM OLD.student_code THEN
        RAISE EXCEPTION 'student_code is immutable (% -> %)', OLD.student_code, NEW.student_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_student_code_immutable
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION prevent_student_code_change();

-- ============================================================================
-- 6. NOT NULL + UNIQUE + format CHECK
-- ============================================================================
ALTER TABLE students ALTER COLUMN student_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_student_code ON students(student_code);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_student_code_format_chk') THEN
        ALTER TABLE students
            ADD CONSTRAINT students_student_code_format_chk
            CHECK (student_code ~ '^CE-[0-9]{5,}$');
    END IF;
END $$;

-- ============================================================================
-- 7a. find_students_by_phone_digits (091) + student_code
-- ============================================================================
DROP FUNCTION IF EXISTS find_students_by_phone_digits(TEXT);

CREATE FUNCTION find_students_by_phone_digits(p_digits TEXT)
RETURNS TABLE (
    id UUID,
    student_code TEXT,
    first_name TEXT,
    last_name TEXT,
    status TEXT,
    branch_id UUID,
    branch_name TEXT,
    amocrm_customer_id BIGINT,
    parent_phone TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.id, s.student_code, s.first_name, s.last_name, s.status, s.branch_id,
        b.name AS branch_name, s.amocrm_customer_id, s.parent_phone
    FROM students s
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE length(regexp_replace(COALESCE(p_digits, ''), '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(COALESCE(s.parent_phone, ''), '[^0-9]', '', 'g'), 10)
          = right(regexp_replace(p_digits, '[^0-9]', '', 'g'), 10);
$$;

REVOKE ALL ON FUNCTION find_students_by_phone_digits(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_students_by_phone_digits(TEXT) FROM anon;
REVOKE ALL ON FUNCTION find_students_by_phone_digits(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION find_students_by_phone_digits(TEXT) TO service_role;

-- ============================================================================
-- 7b. get_puzzle_rush_leaderboard (093) + student_code
-- ============================================================================
DROP FUNCTION IF EXISTS get_puzzle_rush_leaderboard(TEXT, TEXT, UUID, UUID, INT);

CREATE FUNCTION get_puzzle_rush_leaderboard(
    p_scope TEXT,
    p_period TEXT,
    p_branch_id UUID DEFAULT NULL,
    p_student_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    rank BIGINT,
    student_id UUID,
    student_code TEXT,
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
        s.student_code,
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
-- 8. The code is public: keep it anon-readable under column-level grants (095)
-- ============================================================================
GRANT SELECT (student_code) ON students TO anon, authenticated;

COMMIT;
