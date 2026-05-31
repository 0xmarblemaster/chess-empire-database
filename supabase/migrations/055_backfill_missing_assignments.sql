-- 055_backfill_missing_assignments.sql
-- Backfill student_time_slot_assignments for 11 non-Halyk active students
-- who appear in attendance history but have no assignment row.
--
-- Root cause: read path (loadStudentScheduleAssignments + getStudentsForTimeSlot)
-- requires an explicit assignment row to render the student in the calendar at
-- branches other than Halyk Arena. Halyk uses array-position auto-assignment
-- (initializeStudentTimeSlots), so it is excluded from this backfill.
--
-- Scope (Option 2):
--   - Active students only (status='active')
--   - Non-Halyk branches only (НИШ, Zhandosova in this snapshot)
--   - Slot 0 at effective_from='1970-01-01' so all months (past, present, future)
--     render the student
--
-- Idempotent: NOT EXISTS guard + ON CONFLICT DO NOTHING.
-- Reversible: DELETE FROM student_time_slot_assignments WHERE effective_from='1970-01-01' AND created_at=updated_at AND created_at > '2026-05-31 10:00:00+00';

BEGIN;

INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, created_at, updated_at)
SELECT DISTINCT
  a.student_id,
  a.branch_id,
  a.schedule_type,
  0 AS time_slot_index,
  '1970-01-01'::date AS effective_from,
  NOW() AS created_at,
  NOW() AS updated_at
FROM attendance a
JOIN students s ON s.id = a.student_id
JOIN branches b ON b.id = a.branch_id
WHERE s.status = 'active'
  AND b.name <> 'Halyk Arena'
  AND NOT EXISTS (
    SELECT 1 FROM student_time_slot_assignments t
    WHERE t.student_id = a.student_id
      AND t.branch_id = a.branch_id
      AND t.schedule_type = a.schedule_type
  )
ON CONFLICT (student_id, branch_id, schedule_type, effective_from) DO NOTHING;

DO $$
DECLARE
  inserted_count INT;
BEGIN
  SELECT COUNT(*) INTO inserted_count
  FROM student_time_slot_assignments
  WHERE effective_from = '1970-01-01'
    AND created_at = updated_at
    AND created_at > NOW() - INTERVAL '5 minutes';
  RAISE NOTICE 'Backfilled % rows (expected 11 on first run, 0 on re-run)', inserted_count;
END $$;

COMMIT;
