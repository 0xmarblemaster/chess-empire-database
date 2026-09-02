-- Migration 077: hide_student_versioned resolves the row by logical_slot_id
--
-- INCIDENT (2026-09-02, Zhandosova mon_wed, branch 0766b7e4-…)
-- ------------------------------------------------------------------------
-- Migration 076 made schedule READS renumber-safe (assignments resolve to a
-- slot's current render position via the stable logical_slot_id) and taught
-- hide_student_versioned to CARRY p_logical_slot_id. But the RPC still
-- RESOLVED the row to hide by positional `time_slot_index`:
--
--     WHERE ... AND time_slot_index = p_time_slot_index
--
-- When tombstoned slots make a slot's DISPLAY position ≠ its physical
-- slot_index, the delete path passed the display position and the RPC matched
-- the WRONG row. Real case: "12:00-13:00" is physical slot_index 4
-- (logical_slot_id 007997f2-…) but renders at display position 2. The hide
-- was issued with p_time_slot_index = 2, matched a dead legacy idx-2 row,
-- returned success, and the real idx-4 row survived and re-rendered.
--
-- WHAT THIS DOES
-- --------------
-- Recreate hide_student_versioned (same 6-arg signature as 076) so it
-- resolves the target row by logical_slot_id when p_logical_slot_id is
-- provided, falling back to time_slot_index only for legacy rows that carry
-- no logical identity (logical_slot_id IS NULL). All other 076 semantics are
-- preserved verbatim:
--   * versioned-hide dating (update in place at the same month, else insert a
--     new version with effective_from = the displayed month's first day);
--   * insert-a-fresh-hidden-row when no prior version exists (migration 054);
--   * carry logical_slot_id (COALESCE, never null it) + updated_by = auth.uid().
--
-- The write paths (admin-v2.js) are updated in the same change to pass the
-- slot's real physical slot_index as p_time_slot_index (not the display
-- position), so the legacy fallback and the row it stores stay correct.
--
-- SECURITY INVOKER (RLS unchanged). Do NOT apply to production — Alex reviews
-- and applies. See migrations 051/054/057/061/076 and PRD_SLOT_STABLE_ID.md.

BEGIN;

CREATE OR REPLACE FUNCTION hide_student_versioned(
  p_student_id UUID,
  p_branch_id UUID,
  p_schedule_type TEXT,
  p_time_slot_index INT,
  p_effective_from DATE,
  p_logical_slot_id UUID DEFAULT NULL
) RETURNS student_time_slot_assignments
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing student_time_slot_assignments;
  v_new student_time_slot_assignments;
BEGIN
  -- Resolution (migration 077): prefer the STABLE logical_slot_id. Match the
  -- latest row for THIS (student, branch, schedule, logical slot) on/before
  -- p_effective_from. This is renumber/tombstone-safe: the caller resolves the
  -- display position to the slot's logical id, so a display position that no
  -- longer equals the physical slot_index still hits the right row.
  IF p_logical_slot_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND logical_slot_id = p_logical_slot_id
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- Fallback (legacy): no logical id was given, or no row yet carries this
  -- logical id. Match by positional time_slot_index, but ONLY rows that carry
  -- NO logical identity when a logical id was requested — so we never hijack a
  -- different slot's logical row via a stale numeric index.
  IF v_existing.id IS NULL THEN
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND time_slot_index = p_time_slot_index
      AND (p_logical_slot_id IS NULL OR logical_slot_id IS NULL)
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- Migration 054 behavior: no prior version — student renders via
  -- attendance-history inference. Insert a fresh hidden row instead of raising.
  IF v_existing.id IS NULL THEN
    INSERT INTO student_time_slot_assignments
      (student_id, branch_id, schedule_type, time_slot_index, effective_from,
       hidden, logical_slot_id, updated_by, created_at, updated_at)
    VALUES
      (p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from,
       TRUE, p_logical_slot_id, auth.uid(), NOW(), NOW())
    ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO UPDATE
      SET hidden          = TRUE,
          logical_slot_id = COALESCE(EXCLUDED.logical_slot_id, student_time_slot_assignments.logical_slot_id),
          updated_by      = auth.uid(),
          updated_at      = NOW()
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Same-month edit: update in place.
  IF v_existing.effective_from = p_effective_from THEN
    UPDATE student_time_slot_assignments
    SET hidden          = TRUE,
        logical_slot_id = COALESCE(p_logical_slot_id, logical_slot_id),
        updated_by      = auth.uid(),
        updated_at      = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Later-month edit: insert a new version carrying the same slot identity
  -- with hidden=TRUE. Past months still resolve to the pre-existing row.
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from,
     hidden, logical_slot_id, updated_by, created_at, updated_at)
  VALUES
    (v_existing.student_id, v_existing.branch_id, v_existing.schedule_type,
     v_existing.time_slot_index, p_effective_from, TRUE,
     COALESCE(p_logical_slot_id, v_existing.logical_slot_id), auth.uid(),
     v_existing.created_at, NOW())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_versioned(UUID, UUID, TEXT, INT, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION hide_student_versioned IS
  'Per-slot versioned hide for student_time_slot_assignments (migrations 061 + 076 + 077). Resolves the row to hide by the STABLE logical_slot_id when p_logical_slot_id is given (renumber/tombstone-safe), falling back to positional time_slot_index only for legacy rows with logical_slot_id IS NULL. Updates in place at the same month, else inserts a new version carrying the same slot identity with hidden=TRUE; inserts a fresh hidden row when no prior version exists. Carries logical_slot_id (COALESCE) and sets updated_by = auth.uid().';

COMMIT;
