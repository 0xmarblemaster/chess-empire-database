-- 054_hide_student_versioned_insert_if_missing.sql
--
-- Fix: hide_student_versioned raised P0001 for students who appear in the
-- attendance calendar via attendance-history inference but have no
-- student_time_slot_assignments row for the (branch, schedule_type) pair.
--
-- Reproduction: Aleksandr Olegovich at Almaty-1 / mon_wed tried to delete
-- Ruslan Azizov. Ruslan had only a tue_thu assignment row (time_slot_index=-1
-- since 2026-03-31). The mon_wed calendar rendered him via
-- loadStudentScheduleAssignments (admin-v2.js:7283) which groups his 16
-- mon_wed attendance rows. The RPC's SELECT found 0 rows and raised
-- "student_time_slot_assignments not found for student=... schedule=mon_wed".
--
-- Resolution: when no prior version exists, INSERT a fresh assignment row at
-- p_effective_from with the requested time_slot_index instead of raising.
-- Past months keep rendering via attendance-history inference (no assignment
-- row <= prior month-end = no opinion); the new row's effective_from gates
-- hiding to the displayed month and forward only.
--
-- Idempotent: re-applying this migration just replaces the function body
-- with the same definition. ON CONFLICT guard on (student_id, branch_id,
-- schedule_type, effective_from) makes the new INSERT path itself idempotent.

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
  SELECT * INTO v_existing
  FROM student_time_slot_assignments
  WHERE student_id = p_student_id
    AND branch_id  = p_branch_id
    AND schedule_type = p_schedule_type
    AND effective_from <= p_effective_from
  ORDER BY effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO student_time_slot_assignments
      (student_id, branch_id, schedule_type, time_slot_index, effective_from, created_at, updated_at)
    VALUES
      (p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from, NOW(), NOW())
    ON CONFLICT (student_id, branch_id, schedule_type, effective_from) DO UPDATE
      SET time_slot_index = EXCLUDED.time_slot_index,
          updated_at      = NOW()
    RETURNING * INTO v_new;
    RETURN v_new;
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

COMMENT ON FUNCTION hide_student_versioned IS
  'Insert-or-update a student_time_slot_assignments row at p_effective_from. If no prior version exists (student appears in the calendar via attendance-history inference rather than an explicit assignment row), inserts a fresh row at p_effective_from instead of raising. Same-month re-edits update in place; later-month edits insert a new version.';
