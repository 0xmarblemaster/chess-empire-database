-- Migration 080: backfill Halyk assignment rows + legacy logical_slot_id
--
-- INCIDENT (2026-09-03) — see specs/slot-empty-fix-20260903.md
-- ------------------------------------------------------------------
-- Newly created time slots at Halyk Arena auto-populate with students who have
-- NO row in student_time_slot_assignments. Two client bugs cause it (fixed in
-- admin-v2.js in the same change):
--
--   1. initializeStudentTimeSlots positionally auto-seeds unassigned Halyk
--      students by RENDER POSITION (first 10 -> position 0, next 10 -> position
--      1, ...). Slots render chronologically, so a new earliest-of-day slot
--      (e.g. a 9:00-10:00) takes render position 0 and inherits the auto-seeded
--      students (confirmed: Abdubait Akiev, Ansar Ashirbay in the 9:00 slot with
--      zero assignment rows).
--   2. Legacy assignment rows with logical_slot_id IS NULL resolve via the raw
--      time_slot_index used directly as a render position, so any new slot that
--      changes render order re-homes them.
--
-- The client fix stops the auto-seed on DB-mode buckets and resolves legacy
-- rows by slot_index -> current render position. But it needs real data:
--
--   * PART A — materialize the positional auto-seed as real assignment rows for
--     Halyk students who currently render only because of the auto-seed, so they
--     keep their slot once the client stops seeding. Placement matches the old
--     auto-seed: 10 students per slot by ascending slot_index (render position 0
--     BEFORE any post-078 slot existed == the slot with the lowest slot_index).
--   * PART B — finish migration 076's logical_slot_id backfill for the legacy
--     null-logical rows it could not resolve at the time (their bucket was in
--     fallback mode — no time_slots rows — so the join found nothing). Those
--     buckets have since gained slots, so the same (student.coach, schedule,
--     slot_index) join now resolves them.
--
-- SAFETY
-- ------
--   * Idempotent: PART A guards with NOT EXISTS + ON CONFLICT DO NOTHING; PART B
--     only touches rows where logical_slot_id IS NULL. Re-running inserts /
--     updates zero rows.
--   * Only original (effective_from = 1970-01-01, non-deleted) slots are used as
--     PART A targets, so a post-078 added slot is never a backfill target.
--   * PART A is scoped to (student, schedule) pairs the student actually attends
--     (attendance history), mirroring migration 055 — it never invents a
--     cross-schedule assignment for a student who does not attend that schedule.
--   * Rows PART B cannot resolve (coach truly has no slot at that index) are left
--     NULL and logged, never deleted.
--
-- Do NOT apply to production — Alex reviews and applies.

BEGIN;

-- ============================================================================
-- PART A. Materialize the positional auto-seed for unassigned Halyk students
-- ============================================================================
-- Reproduces initializeStudentTimeSlots: index = position of the student in the
-- branch calendar (active students ordered by last_name, the app's
-- `.order('last_name')`), slot = floor(index / 10) clamped to the last slot.
-- The auto-seed bucketed per the coach whose calendar is shown, so we rank per
-- coach_id. floor(index/10) selects the Nth ORIGINAL slot by ascending
-- slot_index (render position N before any post-078 slot existed).

WITH halyk AS (
  SELECT id AS branch_id FROM branches WHERE name = 'Halyk Arena'
),
-- Each Halyk coach's original (1970-01-01, non-deleted) slots, ranked by
-- ascending slot_index. rk (0-based) is the render position the slot had before
-- any post-078 slot shifted the chronological order.
orig_slots AS (
  SELECT ts.coach_id,
         ts.schedule_type,
         ts.slot_index,
         ts.logical_slot_id,
         ROW_NUMBER() OVER (
           PARTITION BY ts.coach_id, ts.schedule_type ORDER BY ts.slot_index
         ) - 1 AS rk,
         COUNT(*) OVER (PARTITION BY ts.coach_id, ts.schedule_type) AS n_slots
  FROM time_slots ts
  JOIN halyk h ON h.branch_id = ts.branch_id
  WHERE ts.effective_from = DATE '1970-01-01'
    AND ts.deleted_at IS NULL
),
-- Every active Halyk student, ranked by last_name within their coach — the same
-- index the auto-seed used (0-based).
ranked_students AS (
  SELECT s.id AS student_id,
         s.coach_id,
         ROW_NUMBER() OVER (
           PARTITION BY s.coach_id ORDER BY s.last_name, s.id
         ) - 1 AS idx
  FROM students s
  JOIN halyk h ON h.branch_id = s.branch_id
  WHERE s.status = 'active'
    AND s.coach_id IS NOT NULL
),
-- The (student, schedule) pairs the student actually attends at Halyk. Prevents
-- inventing a cross-schedule assignment for a schedule the student never joined.
attended AS (
  SELECT DISTINCT a.student_id, a.schedule_type
  FROM attendance a
  JOIN halyk h ON h.branch_id = a.branch_id
),
-- Join a student's index to the slot at floor(idx/10), clamped to the coach's
-- last slot, for each schedule the student attends and has original slots in.
targets AS (
  SELECT rs.student_id,
         (SELECT branch_id FROM halyk) AS branch_id,
         os.schedule_type,
         os.slot_index,
         os.logical_slot_id
  FROM ranked_students rs
  JOIN attended at2 ON at2.student_id = rs.student_id
  JOIN orig_slots os
    ON os.coach_id = rs.coach_id
   AND os.schedule_type = at2.schedule_type
   AND os.rk = LEAST(FLOOR(rs.idx / 10)::INT, os.n_slots - 1)
)
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from,
   hidden, logical_slot_id, created_at, updated_at)
SELECT t.student_id, t.branch_id, t.schedule_type, t.slot_index,
       DATE '1970-01-01', FALSE, t.logical_slot_id, NOW(), NOW()
FROM targets t
-- Skip students who already have ANY row for this (branch, schedule) bucket.
WHERE NOT EXISTS (
  SELECT 1 FROM student_time_slot_assignments e
  WHERE e.student_id = t.student_id
    AND e.branch_id = t.branch_id
    AND e.schedule_type = t.schedule_type
)
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from)
  DO NOTHING;

-- ============================================================================
-- PART B. Finish migration 076's logical_slot_id backfill for legacy NULL rows
-- ============================================================================
-- Same resolution 076 used — (assignment.branch, student.coach, schedule,
-- time_slot_index = slot.slot_index) — but re-run now that fallback-mode buckets
-- have gained time_slots rows. All versions of a chain share one
-- logical_slot_id, so any matching version yields the correct value.

UPDATE student_time_slot_assignments a
SET logical_slot_id = ts.logical_slot_id
FROM students s, time_slots ts
WHERE a.student_id      = s.id
  AND a.branch_id       = ts.branch_id
  AND s.coach_id        = ts.coach_id
  AND a.schedule_type   = ts.schedule_type
  AND a.time_slot_index = ts.slot_index
  AND a.time_slot_index >= 0
  AND a.logical_slot_id IS NULL;

-- ============================================================================
-- Reporting — surface what remains unresolved (never delete it)
-- ============================================================================
DO $$
DECLARE
  v_seeded INT;
  v_unresolved INT;
  v_legacy_hides INT;
BEGIN
  SELECT COUNT(*) INTO v_seeded
  FROM student_time_slot_assignments
  WHERE effective_from = DATE '1970-01-01'
    AND created_at = updated_at
    AND created_at > NOW() - INTERVAL '5 minutes';

  SELECT COUNT(*) INTO v_unresolved
  FROM student_time_slot_assignments
  WHERE time_slot_index >= 0 AND logical_slot_id IS NULL;

  SELECT COUNT(*) INTO v_legacy_hides
  FROM student_time_slot_assignments
  WHERE time_slot_index = -1;

  RAISE NOTICE '[080] PART A seeded % assignment row(s) this run (0 on re-run).', v_seeded;
  RAISE NOTICE '[080] PART B: % assignment row(s) with a real slot index still have NULL logical_slot_id (coach has no slot at that index — left untouched, not deleted).', v_unresolved;
  RAISE NOTICE '[080] % legacy schedule-wide hide row(s) (time_slot_index = -1) intentionally keep NULL logical_slot_id.', v_legacy_hides;
END
$$;

COMMIT;

-- Reverse PART A (if needed, before any student edits the seeded rows):
--   DELETE FROM student_time_slot_assignments
--   WHERE effective_from = DATE '1970-01-01'
--     AND created_at = updated_at
--     AND created_at > '2026-09-03 00:00:00+00';
-- PART B is not reversible in isolation (it only fills values migration 076
-- would have filled had the buckets carried slots then).
