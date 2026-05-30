-- Migration 046: backfill attendance.time_slot_id
--
-- Walks every attendance row with a non-null time_slot string and no
-- time_slot_id yet, finds the matching time_slots row by
-- (branch_id, coach_id-of-student, weekday-of-attendance_date,
-- start_time-end_time string), and writes the id. Idempotent — the
-- `time_slot_id IS NULL` predicate makes re-runs no-op safe.
--
-- Weekday derivation (PostgreSQL EXTRACT(DOW): Sun=0, Mon=1 .. Sat=6):
--   mon_wed     -> 1, 3
--   tue_thu     -> 2, 4
--   mon_wed_fri -> 1, 3, 5
--   wed_fri     -> 3, 5
--   sat_sun     -> 6, 0
--
-- Time string match handles both formats produced by admin-v2.js:
--   - cache / new rows:  '10:00-11:00' (zero-padded — to_char HH24:MI)
--   - hard-coded arrays: '9:00-10:00'  (no leading zero — to_char FMHH24:MI)
--
-- Student->coach link uses students.coach_id (per supabase-schema.sql).

UPDATE attendance a
SET time_slot_id = ts.id
FROM time_slots ts, students s
WHERE a.student_id = s.id
  AND a.branch_id = ts.branch_id
  AND s.coach_id = ts.coach_id
  AND a.time_slot IS NOT NULL
  AND a.time_slot_id IS NULL
  AND (
    to_char(ts.start_time, 'HH24:MI') || '-' || to_char(ts.end_time, 'HH24:MI') = a.time_slot
    OR to_char(ts.start_time, 'FMHH24:MI') || '-' || to_char(ts.end_time, 'FMHH24:MI') = a.time_slot
  )
  AND CASE
    WHEN ts.schedule_type = 'mon_wed'     THEN EXTRACT(DOW FROM a.attendance_date) IN (1, 3)
    WHEN ts.schedule_type = 'tue_thu'     THEN EXTRACT(DOW FROM a.attendance_date) IN (2, 4)
    WHEN ts.schedule_type = 'mon_wed_fri' THEN EXTRACT(DOW FROM a.attendance_date) IN (1, 3, 5)
    WHEN ts.schedule_type = 'wed_fri'     THEN EXTRACT(DOW FROM a.attendance_date) IN (3, 5)
    WHEN ts.schedule_type = 'sat_sun'     THEN EXTRACT(DOW FROM a.attendance_date) IN (6, 0)
    ELSE FALSE
  END;

-- SANITY CHECK (run after backfill):
-- SELECT
--   COUNT(*) AS total_rows_with_time_slot,
--   COUNT(time_slot_id) AS matched,
--   COUNT(*) - COUNT(time_slot_id) AS unmatched
-- FROM attendance
-- WHERE time_slot IS NOT NULL;
