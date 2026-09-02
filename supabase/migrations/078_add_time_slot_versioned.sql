-- Migration 078: add_time_slot_versioned — create a NEW slot from the calendar UI
--
-- The attendance calendar (admin-v2) can already edit (049) and soft-delete
-- (065) time slots, but there was no way to ADD one. This migration adds the
-- RPC the "+ Add Time Slot" button calls. See PRD_ADD_TIME_SLOT.md.
--
-- SEMANTICS (mirrors edit_time_slot_versioned exactly)
-- ----------------------------------------------------
--   * SECURITY INVOKER — the versioned RPCs never bypass RLS. The existing
--     time_slots policies (migration 043) are FOR ALL (SELECT/INSERT/UPDATE/
--     DELETE) and key on coach_id, which is invariant across versions:
--       - "Admins manage time_slots"       -> any coach, any branch
--       - "Coaches manage own time_slots"   -> their own coach_id only
--     Both carry a WITH CHECK, so the INSERT path is already covered for every
--     role that can use the calendar. No new policy is required here.
--   * A fresh slot gets slot_index = max(slot_index)+1 for its
--     (branch, coach, schedule) bucket (the stable chain identifier, NOT a
--     render position), a fresh logical_slot_id (column DEFAULT, migration 076),
--     and effective_from = the first day of the month being viewed. Past months
--     keep rendering whatever they rendered before.
--
-- FALLBACK SEEDING
-- ----------------
-- When a (branch, coach, schedule) bucket has ZERO rows in time_slots, the
-- calendar renders the hard-coded ATTENDANCE_TIME_SLOTS_* fallback arrays.
-- Inserting a single row flips that bucket to DB mode and the fallback slots
-- would vanish. So when the bucket is empty and p_seed_slots is provided, we
-- first materialize those currently-rendered fallback slots at
-- effective_from '1970-01-01' (always-current) with sequential slot_index and
-- fresh logical_slot_ids, THEN append the new slot.
--
-- Do NOT apply to production — Alex reviews and applies.

BEGIN;

CREATE OR REPLACE FUNCTION add_time_slot_versioned(
  p_branch UUID,
  p_coach UUID,
  p_schedule TEXT,
  p_start_time TIME,
  p_end_time TIME,
  p_label TEXT,
  p_effective_from DATE,
  p_seed_slots JSONB DEFAULT NULL
) RETURNS time_slots
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_row_count INT;
  v_max_index INT;
  v_seed JSONB;
  v_seed_index INT := 0;
  v_dup INT;
  v_new time_slots;
BEGIN
  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time (%) must be after start_time (%)', p_end_time, p_start_time;
  END IF;

  SELECT COUNT(*) INTO v_row_count
  FROM time_slots
  WHERE branch_id = p_branch AND coach_id = p_coach AND schedule_type = p_schedule;

  -- Seed the currently-rendered fallback slots first so the bucket keeps
  -- showing them once it flips to DB mode. Only when it has no rows at all.
  IF v_row_count = 0 AND p_seed_slots IS NOT NULL THEN
    FOR v_seed IN SELECT * FROM jsonb_array_elements(p_seed_slots)
    LOOP
      INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                              start_time, end_time, label, effective_from,
                              updated_by)
      VALUES (p_branch, p_coach, p_schedule, v_seed_index,
              (v_seed->>'start')::TIME, (v_seed->>'end')::TIME,
              NULLIF(v_seed->>'label', ''), DATE '1970-01-01', auth.uid());
      v_seed_index := v_seed_index + 1;
    END LOOP;
  END IF;

  -- Reject a duplicate: same start+end already ACTIVE (latest non-deleted
  -- version effective on/before the viewed month) in this bucket. The seeds
  -- inserted above are included, so a new slot that clashes with a fallback
  -- slot is rejected too.
  WITH latest AS (
    SELECT DISTINCT ON (slot_index)
           slot_index, start_time, end_time, deleted_at
    FROM time_slots
    WHERE branch_id = p_branch AND coach_id = p_coach
      AND schedule_type = p_schedule
      AND effective_from <= p_effective_from
    ORDER BY slot_index, effective_from DESC
  )
  SELECT COUNT(*) INTO v_dup
  FROM latest
  WHERE deleted_at IS NULL
    AND start_time = p_start_time AND end_time = p_end_time;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'a slot %-% already exists for this coach/schedule', p_start_time, p_end_time;
  END IF;

  -- New chain index = max existing + 1 across ALL versions/tombstones so we
  -- never reuse a retired index. 0 for a first-ever (unseeded) slot.
  SELECT COALESCE(MAX(slot_index) + 1, 0) INTO v_max_index
  FROM time_slots
  WHERE branch_id = p_branch AND coach_id = p_coach AND schedule_type = p_schedule;

  INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                          start_time, end_time, label, effective_from,
                          updated_by)
  VALUES (p_branch, p_coach, p_schedule, v_max_index,
          p_start_time, p_end_time, NULLIF(p_label, ''), p_effective_from,
          auth.uid())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION add_time_slot_versioned(UUID, UUID, TEXT, TIME, TIME, TEXT, DATE, JSONB) TO authenticated;

COMMENT ON FUNCTION add_time_slot_versioned IS
  'Versioned create for time_slots (migration 078). Inserts a new slot with slot_index = max(slot_index)+1 for the (branch, coach, schedule) bucket, a fresh logical_slot_id (column DEFAULT), and effective_from = the viewed month''s first day. When the bucket has zero rows and p_seed_slots (jsonb array of {start,end,label}) is passed, materializes those hard-coded fallback slots at effective_from 1970-01-01 first so they do not disappear when the bucket flips to DB mode. Rejects a duplicate start+end that is already active for the month. SECURITY INVOKER — RLS (migration 043) governs which coach a caller may add to. Never INSERT into time_slots directly from the client — see admin-v2.js submitAddTimeSlot.';

COMMIT;
