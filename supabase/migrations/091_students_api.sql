-- Migration 091: students write-API support (AmoCRM integration)
-- ============================================================================
-- Backs the students-api edge function (supabase/functions/students-api). Adds:
--   1. students.amocrm_customer_id — the AmoCRM customer key, with a partial
--      unique index so each AmoCRM customer maps to at most one student.
--   2. student_status_history actor columns. NOTE: this table ALREADY EXISTS
--      (migration 022) with changed_by as a UUID (auth.users FK) and an
--      AFTER INSERT/UPDATE trigger that auto-logs every status change. We do NOT
--      redefine it. We ADD two nullable columns so the write API / dashboard can
--      record WHO changed the status:
--        * changed_by_type TEXT — 'api' | 'manual' | 'system'
--        * source          TEXT — e.g. 'students-api', 'dashboard'
--      (The task's "changed_by TEXT ('api'|'manual'|'system')" maps to
--      changed_by_type here — the pre-existing changed_by UUID column cannot be
--      repurposed without breaking migration 022's trigger and the analytics-*
--      functions.) The trigger keeps writing NULL-typed audit rows; the 3-day
--      manual guard reasons only about typed rows.
--   3. An INSERT RLS policy so authenticated dashboard admins/coaches may write
--      a 'manual'/'dashboard' typed row (service role bypasses RLS and writes
--      'api' rows). Reads stay as migration 022 defined them.
--   4. find_students_by_phone_digits() — normalized-phone lookup used by the
--      write API's dedup / find; execute is restricted to service_role.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / catalog-guarded constraint).
-- File only — Alex reviews and applies (repo convention, see 081 header).
-- MUST NOT touch student_time_slot_assignments (migration 081).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. students.amocrm_customer_id + partial unique index
-- ============================================================================
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS amocrm_customer_id BIGINT NULL;

COMMENT ON COLUMN students.amocrm_customer_id IS
    'AmoCRM customer id for the external sync integration (students-api). '
    'NULL for students not sourced from / linked to AmoCRM.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_amocrm_customer_id
    ON students(amocrm_customer_id)
    WHERE amocrm_customer_id IS NOT NULL;

-- ============================================================================
-- 2. student_status_history actor columns (table pre-exists — migration 022)
-- ============================================================================
ALTER TABLE student_status_history
    ADD COLUMN IF NOT EXISTS changed_by_type TEXT NULL;

ALTER TABLE student_status_history
    ADD COLUMN IF NOT EXISTS source TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'student_status_history_changed_by_type_chk'
    ) THEN
        ALTER TABLE student_status_history
            ADD CONSTRAINT student_status_history_changed_by_type_chk
            CHECK (changed_by_type IS NULL OR changed_by_type IN ('api', 'manual', 'system'));
    END IF;
END $$;

COMMENT ON COLUMN student_status_history.changed_by_type IS
    'Actor type for status changes written by the write API / dashboard: '
    '''api'' | ''manual'' | ''system''. NULL on rows written by the '
    'track_student_status_changes trigger (migration 022). The 3-day manual '
    'guard in students-api reasons only about non-NULL (typed) rows.';

COMMENT ON COLUMN student_status_history.source IS
    'Origin of a typed status change, e.g. ''students-api'' or ''dashboard''.';

-- Fast "latest typed row for this student" lookup used by the manual guard.
CREATE INDEX IF NOT EXISTS idx_status_history_typed_latest
    ON student_status_history(student_id, created_at DESC)
    WHERE changed_by_type IS NOT NULL;

-- ============================================================================
-- 3. RLS: dashboard admins/coaches may insert a manual/dashboard typed row
-- ============================================================================
-- The write API uses the service role (bypasses RLS) for 'api' rows. The
-- dashboard runs as an authenticated admin/coach and needs to record a 'manual'
-- row so the 3-day guard has data — but it must not be able to forge 'api' rows,
-- hence the WITH CHECK pins the values.
DROP POLICY IF EXISTS "Dashboard users can insert manual status history" ON student_status_history;
CREATE POLICY "Dashboard users can insert manual status history"
    ON student_status_history FOR INSERT
    WITH CHECK (
        changed_by_type = 'manual'
        AND source = 'dashboard'
        AND EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'coach')
        )
    );

-- ============================================================================
-- 4. Normalized-phone lookup for the write API (dedup / find)
-- ============================================================================
-- Matches on the last 10 digits of the digit-stripped parent_phone, so it finds
-- a student regardless of how parent_phone happens to be formatted (+7 777…,
-- 8777…, with spaces/dashes, etc.). parent_phone is the only phone-like column
-- on students. SECURITY DEFINER so it runs with a stable search scope; execute
-- is restricted to service_role (the write API) — it is not exposed to anon.
CREATE OR REPLACE FUNCTION find_students_by_phone_digits(p_digits TEXT)
RETURNS TABLE (
    id UUID,
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
        s.id, s.first_name, s.last_name, s.status, s.branch_id,
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

COMMIT;
