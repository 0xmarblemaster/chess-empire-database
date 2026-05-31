-- Migration 049: time_slots effective dating + versioning RPC
--
-- Before this migration, `time_slots` was mutated in place by the
-- "Edit Time Slot" modal in admin-v2.js. Because the attendance render
-- path looks up the *current* row for (branch, coach, schedule, slot_index),
-- editing a slot retroactively re-labelled and re-timed every past month.
-- See PRD_TIMESLOTS_VERSIONING.md and ops/time-slot-edit-audit-20260531.md.
--
-- This migration:
--   1. Adds `effective_from DATE` (default 1970-01-01 so existing rows
--      stay valid for all historical months).
--   2. Replaces the (branch, coach, schedule, slot_index) UNIQUE
--      constraint with one that also includes `effective_from`, so the
--      same logical slot can have multiple versions over time.
--   3. Adds a composite index ordered by `effective_from DESC` to make
--      the "latest version on/before month_end" lookup index-friendly.
--   4. Provides `edit_time_slot_versioned(...)` RPC: in-place UPDATE when
--      the existing row's effective_from equals the request, otherwise
--      INSERT a new version. The RPC encapsulates the "update-if-current
--      else insert-new-version" rule so the client cannot get it wrong.
--
-- RLS is not touched. Existing policies (migration 043) key on `coach_id`,
-- which is invariant across versions, so both UPDATE and INSERT paths are
-- covered by the existing "Coaches manage own time_slots" / "Admins
-- manage time_slots" policies.

ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT DATE '1970-01-01';

ALTER TABLE time_slots
  DROP CONSTRAINT IF EXISTS time_slots_branch_id_coach_id_schedule_type_slot_index_key;

ALTER TABLE time_slots
  DROP CONSTRAINT IF EXISTS time_slots_version_uk;

ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_version_uk
  UNIQUE (branch_id, coach_id, schedule_type, slot_index, effective_from);

CREATE INDEX IF NOT EXISTS idx_time_slots_lookup
  ON time_slots (branch_id, coach_id, schedule_type, slot_index, effective_from DESC);

CREATE OR REPLACE FUNCTION edit_time_slot_versioned(
  p_slot_id UUID,
  p_start TIME,
  p_end TIME,
  p_label TEXT,
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
    SET start_time = p_start,
        end_time   = p_end,
        label      = p_label,
        updated_at = NOW()
    WHERE id = p_slot_id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                          start_time, end_time, label, effective_from)
  VALUES (v_existing.branch_id, v_existing.coach_id, v_existing.schedule_type,
          v_existing.slot_index, p_start, p_end, p_label, p_effective_from)
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION edit_time_slot_versioned(UUID, TIME, TIME, TEXT, DATE) TO authenticated;

COMMENT ON COLUMN time_slots.effective_from IS
  'Date from which this version of the slot applies. The current version for a (branch, coach, schedule, slot_index) tuple on date D is the row with the MAX(effective_from) <= D. Default 1970-01-01 means "always current" for any historical lookup; new versions inserted via edit_time_slot_versioned() set this to the displayed month''s first day.';

COMMENT ON FUNCTION edit_time_slot_versioned IS
  'Versioned edit for time_slots. If the existing row''s effective_from matches p_effective_from, updates in place; otherwise inserts a new row with the same (branch, coach, schedule, slot_index) and effective_from = p_effective_from. Never call .update() on time_slots directly from the client — see admin-v2.js saveTimeSlotEdit and PRD_TIMESLOTS_VERSIONING.md.';
