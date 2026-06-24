-- Migration 063: dedupe NULL-time_slot attendance + enforce NULLS NOT DISTINCT
--
-- BACKGROUND
-- ----------
-- attendance has a UNIQUE (student_id, attendance_date, schedule_type, time_slot)
-- constraint. The frontend has always written `time_slot = NULL` from the
-- "All time slots" view (admin-v2.js:8382), which is ~all rows: as of this
-- migration 22,221 of 22,223 rows have time_slot IS NULL.
--
-- Postgres treats NULLs as distinct in UNIQUE constraints by default, so the
-- constraint never fired for those rows. Every checkbox toggle inserted a new
-- row instead of updating the existing one, accumulating 1,180 duplicate rows
-- across 965 (student, date, schedule) groups.
--
-- On read, supabase-data.js builds an attendance map keyed by date alone for
-- NULL-time_slot rows (getAttendanceCalendarData line 2184-2186), so duplicates
-- collide and the row Postgres returns last wins the final overwrite. The
-- frontend was unable to order this deterministically because the query had no
-- ORDER BY; the companion change in supabase-data.js now orders by updated_at
-- ascending so the most recently updated row wins. This migration removes the
-- duplicates and prevents new ones from being created.
--
-- VISIBLE SYMPTOM
-- ---------------
-- Baysari Molochieva Jun 22: one stale "absent" row from auto-mark + four
-- "present" rows from coach corrections. Postgres heap scan returned the
-- "absent" row last, so the calendar always rendered red after refresh.
--
-- STRATEGY
-- --------
-- 1. Dedupe with ROW_NUMBER OVER (PARTITION BY student_id, attendance_date,
--    schedule_type, time_slot ORDER BY updated_at DESC, created_at DESC, id).
--    The most-recently-updated row wins. Older duplicates are deleted.
-- 2. Drop the existing UNIQUE constraint.
-- 3. Recreate the same UNIQUE constraint with NULLS NOT DISTINCT (PG15+).
--    This makes (student_id, date, schedule_type, NULL) collide with itself,
--    so future upserts from the 'all' view update instead of insert.
--
-- IRREVERSIBLE
-- ------------
-- The DELETE step removes 1,180 attendance rows. They are duplicates of rows
-- that are kept, so the per-(student, date, schedule) attendance state is
-- preserved: the latest coach decision wins. We snapshot deleted ids into
-- attendance_dedupe_063_log for forensic purposes.

BEGIN;

-- 1. Snapshot the rows we are about to delete (forensic, idempotent name).
CREATE TABLE IF NOT EXISTS attendance_dedupe_063_log (
  deleted_id UUID PRIMARY KEY,
  student_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  schedule_type TEXT NOT NULL,
  time_slot TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  kept_id UUID NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH ranked AS (
  SELECT
    id,
    student_id,
    attendance_date,
    schedule_type,
    time_slot,
    status,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, attendance_date, schedule_type, time_slot
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY student_id, attendance_date, schedule_type, time_slot
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
    ) AS kept_id
  FROM attendance
),
to_delete AS (
  SELECT * FROM ranked WHERE rn > 1
)
INSERT INTO attendance_dedupe_063_log
  (deleted_id, student_id, attendance_date, schedule_type, time_slot, status, created_at, updated_at, kept_id)
SELECT id, student_id, attendance_date, schedule_type, time_slot, status, created_at, updated_at, kept_id
FROM to_delete
ON CONFLICT (deleted_id) DO NOTHING;

-- 2. Delete the duplicates. Re-derive the doomed ids from the log we just
--    wrote so this step is decoupled from the CTE above.
DELETE FROM attendance
WHERE id IN (SELECT deleted_id FROM attendance_dedupe_063_log);

-- 3. Swap the UNIQUE constraint for the NULLS NOT DISTINCT version.
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_student_id_attendance_date_schedule_type_time_sl_key;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_student_id_attendance_date_schedule_type_time_sl_key
  UNIQUE NULLS NOT DISTINCT (student_id, attendance_date, schedule_type, time_slot);

COMMENT ON CONSTRAINT
  attendance_student_id_attendance_date_schedule_type_time_sl_key
  ON attendance IS
  'Migration 063: NULLS NOT DISTINCT so the "All time slots" view (time_slot IS NULL) upserts update the existing row instead of inserting a duplicate.';

COMMIT;
