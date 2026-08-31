-- Migration 072: seed time_slots for Andrei Olegovich @ Halyk Arena
--
-- ROOT CAUSE
-- ----------
-- The attendance grid is data-driven with a hard-coded fallback:
-- getTimeSlotsForBranch() (admin-v2.js) renders DB `time_slots` rows when
-- they exist for a (branch, coach, schedule) and otherwise falls back to the
-- hard-coded ATTENDANCE_TIME_SLOTS_HALYK array purely for DISPLAY. Fallback
-- slots have no DB id, so openEditTimeSlotModal -> getTimeSlotIdForTime()
-- returns null and the UI shows "This slot has no ID in the database
-- (probably a reserve record). Editing is currently unavailable."
--
-- Migration 044 seeded `time_slots` once, cross-joining coach_branches AT
-- MIGRATION TIME. It never re-runs when a coach is added later.
--   * Aleksandr Olegovich (de188ac1..) created 2025-11-05 -> seeded -> editable.
--   * Andrei    Olegovich (3a6d5a08..) created 2026-08-23 -> AFTER 044 -> ZERO
--     time_slots rows anywhere -> every schedule falls back -> not editable.
-- The coach-aware dropdown (commit b280a73 / 3942a20) routes Andrei to
-- tue_thu + sat_sun at Halyk, which is exactly where the failure shows.
--
-- FIX
-- ---
-- Seed Andrei the SAME baseline (effective_from 1970-01-01) Halyk slots
-- Aleksandr already has for the two schedules Andrei uses:
--   * tue_thu  -> 8 slots (10:00-19:00)
--   * sat_sun  -> 9 slots (09:00-19:00) incl. the 09:00 slot from migration 071
-- This gives full parity with the other Halyk coach and matches the current
-- Halyk Sat-Sun product spec. Idempotent via ON CONFLICT DO NOTHING on the
-- (branch_id, coach_id, schedule_type, slot_index, effective_from) unique key.
-- Attendance rows are keyed by time-string, not slot_index, so existing marks
-- are unaffected.
--
-- NOTE ON APPLICATION: this project's exec_sql_statement RPC no longer exists,
-- so this file was applied via the service-role Supabase JS client doing a
-- direct idempotent insert into time_slots (equivalent to the statements
-- below). Kept here as the versioned artifact / source of truth.

BEGIN;

-- Andrei tue_thu — Halyk 8-slot baseline (10:00-19:00)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
SELECT b.id, c.id, v.schedule_type, v.slot_index, v.start_time, v.end_time, NULL, DATE '1970-01-01'
FROM (SELECT id FROM branches WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%' LIMIT 1) b
CROSS JOIN (SELECT id FROM coaches WHERE first_name ILIKE '%andrei%' OR first_name ILIKE '%андрей%' LIMIT 1) c
CROSS JOIN (VALUES
    ('tue_thu', 0, '10:00'::TIME, '11:00'::TIME),
    ('tue_thu', 1, '11:00'::TIME, '12:00'::TIME),
    ('tue_thu', 2, '12:00'::TIME, '13:00'::TIME),
    ('tue_thu', 3, '14:00'::TIME, '15:00'::TIME),
    ('tue_thu', 4, '15:00'::TIME, '16:00'::TIME),
    ('tue_thu', 5, '16:00'::TIME, '17:00'::TIME),
    ('tue_thu', 6, '17:00'::TIME, '18:00'::TIME),
    ('tue_thu', 7, '18:00'::TIME, '19:00'::TIME)
) AS v(schedule_type, slot_index, start_time, end_time)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- Andrei sat_sun — Halyk 9-slot baseline (09:00-19:00, incl. migration 071's 09:00)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
SELECT b.id, c.id, v.schedule_type, v.slot_index, v.start_time, v.end_time, NULL, DATE '1970-01-01'
FROM (SELECT id FROM branches WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%' LIMIT 1) b
CROSS JOIN (SELECT id FROM coaches WHERE first_name ILIKE '%andrei%' OR first_name ILIKE '%андрей%' LIMIT 1) c
CROSS JOIN (VALUES
    ('sat_sun', 0, '09:00'::TIME, '10:00'::TIME),
    ('sat_sun', 1, '10:00'::TIME, '11:00'::TIME),
    ('sat_sun', 2, '11:00'::TIME, '12:00'::TIME),
    ('sat_sun', 3, '12:00'::TIME, '13:00'::TIME),
    ('sat_sun', 4, '14:00'::TIME, '15:00'::TIME),
    ('sat_sun', 5, '15:00'::TIME, '16:00'::TIME),
    ('sat_sun', 6, '16:00'::TIME, '17:00'::TIME),
    ('sat_sun', 7, '17:00'::TIME, '18:00'::TIME),
    ('sat_sun', 8, '18:00'::TIME, '19:00'::TIME)
) AS v(schedule_type, slot_index, start_time, end_time)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

COMMIT;
