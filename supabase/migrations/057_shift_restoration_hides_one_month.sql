-- Migration 057: re-stamp mis-dated restoration hides to the versioning cutover (2026-06-01)
--
-- ROOT CAUSE
-- ----------
-- Migrations 052/053 reconstructed historical hide events from audit_log and
-- stamped them at `effective_from = date_trunc('month', changed_at)`. That
-- heuristic has no real signal: the legacy DELETE code path didn't carry a
-- "displayed_month" — it just hard-deleted the student_time_slot_assignments
-- row and the corresponding attendance rows. So a click made on May 31 while
-- viewing June was stamped at 2026-05-01 (wrong, should be 2026-06-01), and
-- the same applies to any other end-of-month "next-month planning" click.
--
-- Berik Zhumabekovich reported (2026-05-31) that students he deleted from
-- June view at Almaty-1 had vanished from May and earlier views as well —
-- this is the user-visible symptom of the heuristic failure.
--
-- CORRECTION
-- ----------
-- There is no defensible per-month "correct" effective_from for migration-
-- restored rows, because the legacy code never recorded which month the
-- coach was viewing. The least surprising rule is:
--
--   "Show every student in every month through May 2026 with their existing
--    attendance checkmarks (legacy data is intact in the audit_log → already
--    restored by 052/053 into the attendance table). Apply hides only from
--    2026-06-01 onward, when the versioned write path (hide_student_versioned,
--    migration 051) takes over."
--
-- This migration re-stamps every -1 row currently at 2026-03/04/05-01 to
-- 2026-06-01. Today's live June-view clicks (already at 2026-06-01) are
-- untouched. Pre-existing 1970-01-01 forever-hidden markers are untouched.
--
-- CURRENT STATE (live, 2026-05-31 14:15 UTC):
--   1970-01-01 : 87 -1 rows  (untouched — pre-existing forever-hidden)
--   2026-03-01 :  5 -1 rows  → 2026-06-01
--   2026-04-01 : 48 -1 rows  → 2026-06-01
--   2026-05-01 : 64 -1 rows  → 2026-06-01 (10 conflict with existing
--                                          2026-06-01 row, dropped instead)
--   2026-06-01 : 13 -1 rows  (untouched — legitimate live clicks)
--
-- NET EFFECT
--   10 redundant rows deleted (Berik's panic-reclick overlap with today's clicks)
--   107 rows re-stamped to 2026-06-01
--   0 -1 rows remain blocking past months (except 1970-01-01)
--   Final 2026-06-01 row count: 13 + 107 = 120
--
-- IDEMPOTENT: rerunning is a no-op (after first run, no rows match the
-- 2026-03/04/05 WHERE filter).
--
-- NO CODE CHANGE: the live write path (deleteStudentFromCalendar →
-- hide_student_versioned) already passes `effective_from = displayedMonthStart`.
-- The bug was only in the restoration migrations' heuristic, not the live path.

BEGIN;

-- Step 1: drop redundant overlap rows.
-- For every (student, branch, schedule) tuple already at 2026-06-01, the
-- 2026-03/04/05 row is a stale duplicate (the same delete was clicked twice:
-- once via the legacy DELETE path, once via the new versioned path).
-- Keep the 2026-06-01 row; drop the older row to avoid the
-- (student_id, branch_id, schedule_type, effective_from) unique-conflict
-- when Step 2 re-stamps.
DELETE FROM student_time_slot_assignments AS old_row
USING student_time_slot_assignments AS new_row
WHERE old_row.time_slot_index = -1
  AND old_row.effective_from IN (DATE '2026-03-01', DATE '2026-04-01', DATE '2026-05-01')
  AND new_row.time_slot_index = -1
  AND new_row.effective_from = DATE '2026-06-01'
  AND new_row.student_id     = old_row.student_id
  AND new_row.branch_id      = old_row.branch_id
  AND new_row.schedule_type  = old_row.schedule_type;

-- Step 2: re-stamp every remaining 2026-03/04/05 -1 row to 2026-06-01.
UPDATE student_time_slot_assignments
SET effective_from = DATE '2026-06-01',
    updated_at     = NOW()
WHERE time_slot_index = -1
  AND effective_from IN (DATE '2026-03-01', DATE '2026-04-01', DATE '2026-05-01');

-- Step 3: verification — no -1 rows should remain blocking any past month
-- (excluding the pre-existing 1970-01-01 forever-hidden markers, which are
-- a separate concern outside this migration's scope).
DO $$
DECLARE v_block INT;
BEGIN
  SELECT COUNT(*) INTO v_block
  FROM student_time_slot_assignments
  WHERE time_slot_index = -1
    AND effective_from > DATE '1970-01-01'
    AND effective_from < DATE '2026-06-01';
  IF v_block <> 0 THEN
    RAISE EXCEPTION 'migration 057 failed: % -1 rows still block past months', v_block;
  END IF;
END$$;

COMMIT;
