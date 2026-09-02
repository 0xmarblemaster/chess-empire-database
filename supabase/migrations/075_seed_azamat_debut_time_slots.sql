-- Migration 075: seed time_slots for Azamat Alemkhanovich @ Debut
--
-- CONTEXT
-- -------
-- Azamat Alemkhanovich (28c56c39-7318-41f1-8f8b-a996dd721f02, added 2026-09-01,
-- azamaisaparov@gmail.com) works at Debut on Tue-Thu (09:00-19:00) and
-- Sat-Sun (09:00-13:00) only. The attendance schedule dropdown is coach-aware
-- for him (getDebutScheduleTypesForCoach in admin-v2.js shows only those two
-- schedules), mirroring the Halyk coach-aware pattern.
--
-- Like migration 072 (Andrei @ Halyk): coaches added after the original 044
-- seeding have zero time_slots rows, so their grid falls back to hard-coded
-- display-only arrays that cannot be edited (no DB id). Seeding baseline rows
-- (effective_from 1970-01-01) makes every slot real and editable. Slots start
-- empty — they render as empty rows until students are assigned.
--
-- Idempotent via ON CONFLICT DO NOTHING on the
-- (branch_id, coach_id, schedule_type, slot_index, effective_from) unique key.
--
-- NOTE ON APPLICATION: exec_sql_statement RPC no longer exists; applied via
-- direct idempotent REST inserts into time_slots with the service-role key
-- (equivalent to the statements below). Kept here as the versioned artifact.

BEGIN;

-- Azamat tue_thu — Debut full-day baseline (09:00-19:00, 10 hourly slots)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
SELECT b.id, c.id, v.schedule_type, v.slot_index, v.start_time, v.end_time, NULL, DATE '1970-01-01'
FROM (SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%' LIMIT 1) b
CROSS JOIN (SELECT id FROM coaches WHERE id = '28c56c39-7318-41f1-8f8b-a996dd721f02') c
CROSS JOIN (VALUES
    ('tue_thu', 0, '09:00'::TIME, '10:00'::TIME),
    ('tue_thu', 1, '10:00'::TIME, '11:00'::TIME),
    ('tue_thu', 2, '11:00'::TIME, '12:00'::TIME),
    ('tue_thu', 3, '12:00'::TIME, '13:00'::TIME),
    ('tue_thu', 4, '13:00'::TIME, '14:00'::TIME),
    ('tue_thu', 5, '14:00'::TIME, '15:00'::TIME),
    ('tue_thu', 6, '15:00'::TIME, '16:00'::TIME),
    ('tue_thu', 7, '16:00'::TIME, '17:00'::TIME),
    ('tue_thu', 8, '17:00'::TIME, '18:00'::TIME),
    ('tue_thu', 9, '18:00'::TIME, '19:00'::TIME)
) AS v(schedule_type, slot_index, start_time, end_time)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- Azamat sat_sun — Debut morning baseline (09:00-13:00, 4 hourly slots)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
SELECT b.id, c.id, v.schedule_type, v.slot_index, v.start_time, v.end_time, NULL, DATE '1970-01-01'
FROM (SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%' LIMIT 1) b
CROSS JOIN (SELECT id FROM coaches WHERE id = '28c56c39-7318-41f1-8f8b-a996dd721f02') c
CROSS JOIN (VALUES
    ('sat_sun', 0, '09:00'::TIME, '10:00'::TIME),
    ('sat_sun', 1, '10:00'::TIME, '11:00'::TIME),
    ('sat_sun', 2, '11:00'::TIME, '12:00'::TIME),
    ('sat_sun', 3, '12:00'::TIME, '13:00'::TIME)
) AS v(schedule_type, slot_index, start_time, end_time)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

COMMIT;
