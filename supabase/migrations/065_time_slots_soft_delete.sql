-- Migration 065: soft-delete for time_slots
--
-- Before this migration, the "Delete time slot" button in the Edit Time Slot
-- modal ran a hard `DELETE FROM time_slots WHERE id = ...`. That bypassed the
-- effective_from versioning added in migration 049 and silently left a gap in
-- the attendance calendar — the render loop in admin-v2.js iterates whatever
-- the cache bucket contains, so a removed slot_index disappears entirely with
-- no placeholder. Migration 064 had to restore one such slot for Vasily.
--
-- This migration:
--   1. Adds `deleted_at TIMESTAMPTZ` (NULL = active row, NOT NULL = tombstone).
--   2. Provides `delete_time_slot_versioned(p_slot_id, p_effective_from)` —
--      mirrors the edit RPC: in-place UPDATE when the existing row's
--      effective_from equals the request, otherwise INSERT a tombstone version.
--      Past months keep showing the prior (un-deleted) version; the displayed
--      month forward shows the slot as deleted.
--   3. The frontend cache loader (loadTimeSlotsCache) is updated separately to
--      skip rows whose latest version has deleted_at set.
--
-- RLS: SECURITY INVOKER, so the existing "Coaches manage own time_slots" /
-- "Admins manage time_slots" policies apply to both UPDATE and INSERT paths.

ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE OR REPLACE FUNCTION delete_time_slot_versioned(
  p_slot_id UUID,
  p_effective_from DATE
) RETURNS time_slots
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing time_slots;
  v_new time_slots;
BEGIN
  SELECT * INTO v_existing FROM time_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_slot % not found', p_slot_id;
  END IF;

  IF v_existing.effective_from = p_effective_from THEN
    UPDATE time_slots
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_slot_id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                          start_time, end_time, label, effective_from, deleted_at)
  VALUES (v_existing.branch_id, v_existing.coach_id, v_existing.schedule_type,
          v_existing.slot_index, v_existing.start_time, v_existing.end_time,
          v_existing.label, p_effective_from, NOW())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION delete_time_slot_versioned(UUID, DATE) TO authenticated;

COMMENT ON COLUMN time_slots.deleted_at IS
  'Tombstone marker. NULL = active. Non-NULL = this version of the (branch, coach, schedule, slot_index) tuple is deleted; the calendar hides the slot from effective_from onward. Set via delete_time_slot_versioned().';

COMMENT ON FUNCTION delete_time_slot_versioned IS
  'Versioned soft-delete for time_slots. If the existing row''s effective_from matches p_effective_from, sets deleted_at in place; otherwise inserts a tombstone version with the same (branch, coach, schedule, slot_index). Never call .delete() on time_slots directly from the client — past months would lose history and the calendar would gap-out.';
