-- Migration 061: allow same student in multiple time slots per schedule
--
-- BACKGROUND
-- ----------
-- Migration 051 versioned student_time_slot_assignments with a unique key on
-- (student_id, branch_id, schedule_type, effective_from). That enforced
-- "one slot per (student, branch, schedule)" — coaches could not place the
-- same student in 10:00–11:00 AND 11:00–12:00 of the same Mon-Wed schedule.
--
-- This migration relaxes the key so multi-slot membership is legal:
--   * The unique key now also keys on `time_slot_index`, so each (student,
--     branch, schedule, slot) pair can carry its own version history.
--   * A new `hidden` boolean column marks a (student, slot) pair as removed
--     starting from `effective_from` without losing the slot identity
--     (the prior -1 sentinel collapsed slot + state into one column and
--     therefore can't express per-slot hides under a slot-key constraint).
--   * `hide_student_versioned()` is rewritten to take `p_time_slot_index`
--     as a key parameter and version per-slot. It preserves the per-month
--     versioning cutover behavior from migrations 054 and 057.
--
-- BACKWARD COMPAT WITH LEGACY -1 ROWS
-- -----------------------------------
-- 429 pre-existing rows have `time_slot_index = -1` from the old "hide from
-- the entire schedule" path (migrations 051/054/057). Under the new schema
-- those rows are still valid (the looser slot-key constraint accepts them)
-- and `hidden` defaults to FALSE. The read path in `getTimeSlotAssignments`
-- continues to honour them by detecting "latest row across all slots is a
-- -1 row" and treating that student as schedule-wide hidden — same semantic
-- as before. No backfill required.
--
-- NEW WRITE PATH
-- --------------
-- `hide_student_versioned(student, branch, schedule, slot, effective_from)`
-- now hides ONE specific slot. The new row inserted carries the slot index
-- of the slot being hidden (so the key tuple is unambiguous) plus
-- `hidden = TRUE`. The read path skips hidden rows when deduping by
-- (student, slot).
--
-- ROLLOUT
-- -------
-- Applied via Supabase Management API alongside the app frontend changes —
-- both are required to be deployed together.
--
-- RLS is not touched. Existing policies still key on coach/admin role and
-- remain valid across the new column and per-slot rows.

BEGIN;

-- 1. New column. NOT NULL DEFAULT FALSE keeps existing rows valid.
ALTER TABLE student_time_slot_assignments
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Swap the per-schedule UNIQUE key for a per-slot UNIQUE key.
ALTER TABLE student_time_slot_assignments
  DROP CONSTRAINT IF EXISTS student_time_slot_assignments_version_uk;

ALTER TABLE student_time_slot_assignments
  ADD CONSTRAINT student_time_slot_assignments_version_uk
  UNIQUE (student_id, branch_id, schedule_type, time_slot_index, effective_from);

-- 3. Refresh the composite lookup index to include time_slot_index so
--    per-slot resolutions in `hide_student_versioned` and
--    `getTimeSlotAssignments` are still index-friendly.
DROP INDEX IF EXISTS idx_student_time_slot_assignments_lookup;
CREATE INDEX idx_student_time_slot_assignments_lookup
  ON student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from DESC);

-- 4. Per-slot rewrite of hide_student_versioned. Signature is unchanged
--    (same parameter names + types) so existing RLS grants stay valid.
CREATE OR REPLACE FUNCTION hide_student_versioned(
  p_student_id UUID,
  p_branch_id UUID,
  p_schedule_type TEXT,
  p_time_slot_index INT,
  p_effective_from DATE
) RETURNS student_time_slot_assignments
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing student_time_slot_assignments;
  v_new student_time_slot_assignments;
BEGIN
  -- Per-slot resolution: find the latest row for THIS (student, branch,
  -- schedule, slot) tuple on/before p_effective_from. Hides version
  -- independently per slot, so adding S to slot B does not affect a hide
  -- previously recorded against slot A.
  SELECT * INTO v_existing
  FROM student_time_slot_assignments
  WHERE student_id     = p_student_id
    AND branch_id      = p_branch_id
    AND schedule_type  = p_schedule_type
    AND time_slot_index = p_time_slot_index
    AND effective_from <= p_effective_from
  ORDER BY effective_from DESC
  LIMIT 1;

  -- Migration 054 behavior: no prior version for this (student, slot)
  -- — student renders via attendance-history inference. Insert a fresh
  -- hidden row at p_effective_from instead of raising.
  IF NOT FOUND THEN
    INSERT INTO student_time_slot_assignments
      (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden, created_at, updated_at)
    VALUES
      (p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from, TRUE, NOW(), NOW())
    ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO UPDATE
      SET hidden     = TRUE,
          updated_at = NOW()
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Same-month edit: update in place. Re-hiding in the displayed month is
  -- a no-op aside from the timestamp.
  IF v_existing.effective_from = p_effective_from THEN
    UPDATE student_time_slot_assignments
    SET hidden     = TRUE,
        updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Later-month edit: insert a new version carrying the same slot identity
  -- with hidden=TRUE at p_effective_from. Past months still resolve to the
  -- pre-existing row, preserving migration 057's cutover guarantee.
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden, created_at, updated_at)
  VALUES
    (v_existing.student_id, v_existing.branch_id, v_existing.schedule_type,
     v_existing.time_slot_index, p_effective_from, TRUE, v_existing.created_at, NOW())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_versioned(UUID, UUID, TEXT, INT, DATE) TO authenticated;

COMMENT ON COLUMN student_time_slot_assignments.hidden IS
  'TRUE marks this (student, branch, schedule, time_slot_index) pair as removed from the displayed month forward. The read path skips hidden rows when deduping the latest version per (student, slot). Pre-migration-061 rows default to FALSE; legacy time_slot_index=-1 rows continue to mean "hidden from the entire schedule" and are handled in the read path.';

COMMENT ON FUNCTION hide_student_versioned IS
  'Per-slot versioned hide for student_time_slot_assignments (migration 061). Resolves the current row for (student, branch, schedule, slot=p_time_slot_index) on p_effective_from. If matched at p_effective_from updates hidden=TRUE in place; otherwise inserts a new version carrying the same slot identity with hidden=TRUE. Inserts a fresh hidden row when no prior version exists (migration 054 semantic). Sibling slots in the same schedule are unaffected — allows the same student to participate in multiple time slots per schedule.';

COMMIT;
