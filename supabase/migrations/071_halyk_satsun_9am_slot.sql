-- Migration 071: add a 09:00-10:00 slot to Halyk Arena's Sat-Sun schedule
--
-- STEP-0 FINDING (which slot system actually renders Halyk's Sat-Sun grid)
-- -----------------------------------------------------------------------
-- Two slot systems coexist:
--   (a) hard-coded arrays in admin.js / admin-v2.js
--       (ATTENDANCE_TIME_SLOTS_HALYK, returned by getTimeSlotsForBranch);
--   (b) the DB-driven `time_slots` table (seeded from the arrays by
--       migration 044, effective-dated by 049, multi-slot by 061,
--       add-slot precedent 064).
--
-- In admin-v2.js getTimeSlotsForBranch() the DB path WINS whenever a
-- non-empty TIME_SLOTS_CACHE bucket exists for
-- `${branch}|${coach}|${schedule}|${YYYY-MM}` — it only falls back to the
-- hard-coded ATTENDANCE_TIME_SLOTS_HALYK array on a cache miss. Migration
-- 044 seeded `time_slots` for EVERY coach at Halyk across mon_wed / tue_thu
-- / sat_sun / mon_wed_fri, and migration 050 restored Halyk time_slot
-- history (Aleksandr / Halyk / tue_thu) — proving Halyk slots are live and
-- versioned in production. The coach/admin attendance view always selects a
-- coach and calls loadTimeSlotsCache() for the displayed month, so Halyk's
-- Sat-Sun grid renders from the DB `time_slots` table.
--
-- => This is the DB-migration branch of the spec: NO JavaScript change. We
--    add the new slot to `time_slots` and keep student placements correct.
--
-- GOAL
-- ----
-- Sat-Sun at Halyk currently starts at 10:00-11:00 (8 slots, 10:00-19:00).
-- Prepend a 09:00-10:00 slot at slot_index 0 so Sat-Sun becomes:
--   0: 09:00-10:00  (new, empty)
--   1: 10:00-11:00
--   2: 11:00-12:00
--   3: 12:00-13:00
--   4: 14:00-15:00
--   5: 15:00-16:00
--   6: 16:00-17:00
--   7: 17:00-18:00
--   8: 18:00-19:00
-- Halyk WEEKDAY schedules (mon_wed / tue_thu / mon_wed_fri) and every other
-- branch are UNTOUCHED — this migration filters strictly on
-- schedule_type = 'sat_sun' for the Halyk branch id.
--
-- WHY A GLOBAL (in-place) SHIFT, NOT A FORWARD-DATED VERSION
-- ---------------------------------------------------------
-- Migration 064 layered a NEW forward-dated month version (2026-06-01) on
-- top of an unchanged baseline, so it had to CARRY/HIDE assignments to keep
-- past months on the old array. Halyk's Sat-Sun slots are a SINGLE baseline
-- (effective_from = 1970-01-01, "always current") — they were never split
-- into month versions. The desired behaviour is that the 09:00 slot appears
-- and every other slot shifts down one row in ALL months, consistently. That
-- means an in-place +1 relabel of the slot_index across every version row,
-- not a forward-dated carry. attendance rows are keyed by the time STRING
-- (e.g. "10:00-11:00"), never by slot_index, so already-recorded attendance
-- is unaffected by the relabel.
--
-- COLLISION-SAFE SHIFT (the +1000 / -999 offset trick)
-- ----------------------------------------------------
-- Postgres checks the UNIQUE keys
--   time_slots(branch, coach, schedule, slot_index, effective_from)  and
--   student_time_slot_assignments(student, branch, schedule, time_slot_index, effective_from)
-- per row as each row updates, so a bulk `SET slot_index = slot_index + 1`
-- can transiently collide (row 0->1 while row 1 still holds 1). We first
-- park every affected row at slot_index + 1000 (far above the 0..8 range,
-- so no collision), then bring them back with slot_index - 999 (landing at
-- old + 1). Two passes, no id lookups, works for every coach and every
-- effective_from version at once.
--
-- LEGACY -1 SENTINELS
-- -------------------
-- student_time_slot_assignments rows with time_slot_index = -1 are the old
-- "hidden from the entire schedule" sentinel (migrations 051/054/057). They
-- must NOT shift (0 is now a real slot). Every assignment UPDATE is gated on
-- time_slot_index >= 0 so sentinels are preserved verbatim.
--
-- IDEMPOTENCY
-- -----------
-- The whole body runs inside one guarded DO block within BEGIN/COMMIT. The
-- guard checks whether a 09:00 slot already sits at Sat-Sun slot_index 0 for
-- Halyk; if so the migration is a no-op. The new-slot INSERT additionally
-- uses ON CONFLICT DO NOTHING. Re-running is safe.
--
-- ** DO NOT APPLY TO PRODUCTION WITHOUT ALEX'S APPROVAL. ** This file is a
-- versioned artifact only; applying it rewrites live student placements.

BEGIN;

DO $$
DECLARE
  v_branch UUID;
BEGIN
  -- Resolve the Halyk branch id (do not hard-code a guessed UUID).
  SELECT id INTO v_branch
  FROM branches
  WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%'
  LIMIT 1;

  IF v_branch IS NULL THEN
    RAISE NOTICE 'Halyk branch not found — nothing to do.';
    RETURN;
  END IF;

  -- Idempotency guard: bail if the 09:00 Sat-Sun slot already exists.
  IF EXISTS (
    SELECT 1 FROM time_slots
    WHERE branch_id = v_branch
      AND schedule_type = 'sat_sun'
      AND slot_index = 0
      AND start_time = TIME '09:00'
  ) THEN
    RAISE NOTICE 'Halyk Sat-Sun 09:00 slot already present — migration is a no-op.';
    RETURN;
  END IF;

  -- ============================================================
  -- 1. Shift every existing Halyk Sat-Sun time_slots row up by one,
  --    across all coaches and all effective_from versions.
  -- ============================================================
  UPDATE time_slots
  SET slot_index = slot_index + 1000, updated_at = NOW()
  WHERE branch_id = v_branch
    AND schedule_type = 'sat_sun';

  UPDATE time_slots
  SET slot_index = slot_index - 999, updated_at = NOW()
  WHERE branch_id = v_branch
    AND schedule_type = 'sat_sun'
    AND slot_index >= 1000;

  -- ============================================================
  -- 2. Insert the new 09:00-10:00 slot at index 0. One row per
  --    (coach, effective_from) timeline that has a live 10:00 slot
  --    (now sitting at slot_index 1). The 1970-01-01 baseline row is
  --    "always current", so a single baseline 09:00 slot covers every
  --    month for that coach. label NULL, matching migration 064.
  -- ============================================================
  INSERT INTO time_slots
    (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
  SELECT DISTINCT branch_id, coach_id, schedule_type, 0,
         TIME '09:00', TIME '10:00', NULL, effective_from
  FROM time_slots
  WHERE branch_id = v_branch
    AND schedule_type = 'sat_sun'
    AND slot_index = 1
    AND deleted_at IS NULL
  ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

  -- ============================================================
  -- 3. Shift every real Halyk Sat-Sun student assignment up by one so
  --    each student stays in their correct TIME row (old slot N time ==
  --    new slot N+1 time). Same collision-safe two-pass offset. Legacy
  --    -1 sentinels (schedule-wide hides) are excluded and left as-is.
  --    New slot_index 0 (09:00-10:00) is intentionally left empty.
  -- ============================================================
  UPDATE student_time_slot_assignments
  SET time_slot_index = time_slot_index + 1000, updated_at = NOW()
  WHERE branch_id = v_branch
    AND schedule_type = 'sat_sun'
    AND time_slot_index >= 0;

  UPDATE student_time_slot_assignments
  SET time_slot_index = time_slot_index - 999, updated_at = NOW()
  WHERE branch_id = v_branch
    AND schedule_type = 'sat_sun'
    AND time_slot_index >= 1000;

  RAISE NOTICE 'Halyk Sat-Sun 09:00 slot added; slots and student assignments shifted +1.';
END $$;

COMMIT;
