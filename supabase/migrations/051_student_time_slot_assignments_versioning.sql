-- Migration 051: student_time_slot_assignments effective dating + versioning RPC
--
-- Before this migration, `student_time_slot_assignments` was mutated in place
-- by `deleteStudentFromCalendar` in admin-v2.js (and elsewhere via
-- `upsertTimeSlotAssignment`). Because the attendance render path reads the
-- *current* row for (student, branch, schedule_type) and uses
-- `time_slot_index = -1` as the "hidden from calendar" sentinel, hiding a
-- student retroactively removed them from every past month — even months
-- where they were present and have surviving attendance rows.
--
-- This mirrors the bug we fixed for `time_slots` in migration 049. We apply
-- the same effective-dating pattern here:
--   1. Add `effective_from DATE` (default 1970-01-01 so existing rows stay
--      valid for all historical months).
--   2. Replace the (student_id, branch_id, schedule_type) UNIQUE constraint
--      with one that also includes `effective_from`, so the same logical
--      assignment can have multiple versions over time.
--   3. Add a composite index ordered by `effective_from DESC` to make the
--      "latest version on/before month_end" lookup index-friendly.
--   4. Provide `hide_student_versioned(...)` RPC: in-place UPDATE when the
--      existing row's effective_from equals the request, otherwise INSERT a
--      new version. Same update-if-current-else-insert-new-version semantics
--      as `edit_time_slot_versioned`.
--
-- RLS is not touched. Existing policies key on coach/admin role and remain
-- valid across versions (both UPDATE and INSERT paths covered).
--
-- See PRD_STUDENT_ASSIGNMENTS_VERSIONING.md and
-- ops/berik-restoration-20260531.md.

ALTER TABLE student_time_slot_assignments
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT DATE '1970-01-01';

ALTER TABLE student_time_slot_assignments
  DROP CONSTRAINT IF EXISTS student_time_slot_assignments_student_id_branch_id_schedule_key;

ALTER TABLE student_time_slot_assignments
  DROP CONSTRAINT IF EXISTS student_time_slot_assignments_student_id_branch_id_schedule_t_key;

ALTER TABLE student_time_slot_assignments
  DROP CONSTRAINT IF EXISTS student_time_slot_assignments_version_uk;

ALTER TABLE student_time_slot_assignments
  ADD CONSTRAINT student_time_slot_assignments_version_uk
  UNIQUE (student_id, branch_id, schedule_type, effective_from);

CREATE INDEX IF NOT EXISTS idx_student_time_slot_assignments_lookup
  ON student_time_slot_assignments (student_id, branch_id, schedule_type, effective_from DESC);

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
  -- Resolve the latest (current) version on/before p_effective_from.
  SELECT * INTO v_existing
  FROM student_time_slot_assignments
  WHERE student_id = p_student_id
    AND branch_id  = p_branch_id
    AND schedule_type = p_schedule_type
    AND effective_from <= p_effective_from
  ORDER BY effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_time_slot_assignments not found for student=% branch=% schedule=%',
      p_student_id, p_branch_id, p_schedule_type;
  END IF;

  IF v_existing.effective_from = p_effective_from THEN
    UPDATE student_time_slot_assignments
    SET time_slot_index = p_time_slot_index,
        updated_at      = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from, created_at, updated_at)
  VALUES
    (v_existing.student_id, v_existing.branch_id, v_existing.schedule_type,
     p_time_slot_index, p_effective_from, v_existing.created_at, NOW())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_versioned(UUID, UUID, TEXT, INT, DATE) TO authenticated;

COMMENT ON COLUMN student_time_slot_assignments.effective_from IS
  'Date from which this version of the assignment applies. The current version for a (student, branch, schedule_type) tuple on date D is the row with MAX(effective_from) <= D. Default 1970-01-01 means "always current" for any historical lookup; new versions inserted via hide_student_versioned() set this to the displayed month''s first day.';

COMMENT ON FUNCTION hide_student_versioned IS
  'Versioned write for student_time_slot_assignments. Resolves the current row for (student, branch, schedule) on p_effective_from; if its effective_from matches, updates in place; otherwise inserts a new version with the same (student, branch, schedule) and effective_from = p_effective_from. Used by admin-v2.js deleteStudentFromCalendar to hide a student starting from the displayed month while leaving prior months untouched. Never call .update({time_slot_index: -1}) on this table directly from the client — see PRD_STUDENT_ASSIGNMENTS_VERSIONING.md.';
