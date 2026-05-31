-- Migration 050: restore historical time_slot schedules for May 2026 and earlier
--
-- Background: between 2026-05-30 17:24 UTC and 2026-05-31 05:18 UTC, four
-- coaches (Aleksandr, Chingis, Assylkhan, Berik) edited 10 time_slots rows
-- via the admin attendance UI. Migration 049 added effective_from versioning
-- and reshaped the UNIQUE constraint to (branch, coach, schedule, slot_index,
-- effective_from), so the same slot can have multiple historical versions.
--
-- However, the 049 migration left every existing row at effective_from
-- '1970-01-01', meaning the 10 edited rows still apply to every prior month.
-- This migration:
--   1. Pins each of the 10 edited rows to effective_from '2026-06-01' so
--      they only take effect from June 2026 onward.
--   2. Inserts a sibling seed-value row at effective_from '1970-01-01'
--      that covers every month from data inception through May 2026.
--
-- Source of seed values: supabase/migrations/044_seed_time_slots.sql
-- (applied 2026-05-30 14:35:44 UTC). Manually verified per slot.
--
-- Attendance rows are NOT modified. Checkmarks are matched to calendar
-- columns by (date, students.time_slot_index); restoring the slot version
-- automatically restores how past months render.
--
-- Idempotent: re-running is safe because:
--   * Step 1's UPDATE moves an already-pinned row's effective_from to the
--     same value (no-op).
--   * Step 2's INSERT is guarded with ON CONFLICT DO NOTHING on the
--     (branch_id, coach_id, schedule_type, slot_index, effective_from)
--     uniqueness from migration 049.

BEGIN;

-- ============================================================
-- Step 1: pin all 10 edited rows to effective_from = 2026-06-01
-- ============================================================
UPDATE time_slots
SET effective_from = DATE '2026-06-01'
WHERE id IN (
    '13fb6782-1f01-4eda-a313-804df1a23a84',  -- Aleksandr / Halyk Arena / tue_thu / 0
    'd4e3d77b-fa15-48e3-8b15-48cba0f3636a',  -- Chingis / Gagarin Park / mon_wed / 0
    '727d160b-5de6-47d4-aebd-c1fa374fe7b4',  -- Chingis / Gagarin Park / mon_wed / 1
    '04e05a2e-f830-4577-9bcf-2f86a0fad999',  -- Chingis / Gagarin Park / mon_wed / 3
    '9f9f736d-3b51-4fc6-b952-b282ac26b0e9',  -- Assylkhan / Debut / sat_sun / 0
    'ea74d63f-ef0c-4bf1-bf36-1b2c637595ec',  -- Berik / Almaty-1 / sat_sun / 0
    'cc405fc8-4ebb-4c61-8e0e-314c28f43fc0',  -- Berik / Almaty-1 / sat_sun / 1
    'b25a5b86-b7ca-42f6-9825-3df40792324d',  -- Berik / Almaty-1 / sat_sun / 2
    '4fc20cab-adb8-4307-85db-cca3f03299d7',  -- Berik / Almaty-1 / sat_sun / 3
    '8974a5ea-a5bb-4b6b-9aff-8f97ca38bbae'   -- Berik / Almaty-1 / sat_sun / 4
);

-- ============================================================
-- Step 2: insert seed-value sibling rows at effective_from = 1970-01-01
-- ============================================================

-- 1. Aleksandr / Halyk Arena / tue_thu / 0 — seed 10:00-11:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '10:00', TIME '11:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '13fb6782-1f01-4eda-a313-804df1a23a84'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 2. Chingis / Gagarin Park / mon_wed / 0 — seed 09:00-10:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '09:00', TIME '10:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = 'd4e3d77b-fa15-48e3-8b15-48cba0f3636a'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 3. Chingis / Gagarin Park / mon_wed / 1 — seed 10:00-11:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '10:00', TIME '11:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '727d160b-5de6-47d4-aebd-c1fa374fe7b4'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 4. Chingis / Gagarin Park / mon_wed / 3 — seed 12:00-13:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '12:00', TIME '13:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '04e05a2e-f830-4577-9bcf-2f86a0fad999'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 5. Assylkhan / Debut / sat_sun / 0 — seed 09:00-10:30, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '09:00', TIME '10:30', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '9f9f736d-3b51-4fc6-b952-b282ac26b0e9'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 6. Berik / Almaty-1 / sat_sun / 0 — seed 09:00-10:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '09:00', TIME '10:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = 'ea74d63f-ef0c-4bf1-bf36-1b2c637595ec'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 7. Berik / Almaty-1 / sat_sun / 1 — seed 10:00-11:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '10:00', TIME '11:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = 'cc405fc8-4ebb-4c61-8e0e-314c28f43fc0'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 8. Berik / Almaty-1 / sat_sun / 2 — seed 11:00-12:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '11:00', TIME '12:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = 'b25a5b86-b7ca-42f6-9825-3df40792324d'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 9. Berik / Almaty-1 / sat_sun / 3 — seed 12:00-13:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '12:00', TIME '13:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '4fc20cab-adb8-4307-85db-cca3f03299d7'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- 10. Berik / Almaty-1 / sat_sun / 4 — seed 13:00-14:00, label NULL
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                        start_time, end_time, label, effective_from)
SELECT branch_id, coach_id, schedule_type, slot_index,
       TIME '13:00', TIME '14:00', NULL, DATE '1970-01-01'
FROM time_slots WHERE id = '8974a5ea-a5bb-4b6b-9aff-8f97ca38bbae'
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

COMMIT;

-- Verification (run separately after applying):
--
-- 1. Each affected (branch, coach, schedule, slot_index) now has exactly 2 versions
-- SELECT branch_id, coach_id, schedule_type, slot_index, COUNT(*)
-- FROM time_slots
-- WHERE id IN (
--     '13fb6782-1f01-4eda-a313-804df1a23a84','d4e3d77b-fa15-48e3-8b15-48cba0f3636a',
--     '727d160b-5de6-47d4-aebd-c1fa374fe7b4','04e05a2e-f830-4577-9bcf-2f86a0fad999',
--     '9f9f736d-3b51-4fc6-b952-b282ac26b0e9','ea74d63f-ef0c-4bf1-bf36-1b2c637595ec',
--     'cc405fc8-4ebb-4c61-8e0e-314c28f43fc0','b25a5b86-b7ca-42f6-9825-3df40792324d',
--     '4fc20cab-adb8-4307-85db-cca3f03299d7','8974a5ea-a5bb-4b6b-9aff-8f97ca38bbae'
-- )
-- GROUP BY 1,2,3,4;  -- should also union with the 1970-01-01 siblings, expect 2 per tuple
--
-- 2. May 2026 resolution returns seed values for the affected (branch, coach, schedule, slot_index)
-- SELECT DISTINCT ON (branch_id, coach_id, schedule_type, slot_index)
--        start_time, end_time, label, effective_from
-- FROM time_slots
-- WHERE effective_from <= DATE '2026-05-31'
-- ORDER BY branch_id, coach_id, schedule_type, slot_index, effective_from DESC;
