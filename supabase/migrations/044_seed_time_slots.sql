-- Migration 044: seed time_slots from hard-coded admin-v2.js arrays
--
-- One row per (branch, coach, schedule_type, slot_index). Mirrors the
-- 17 ATTENDANCE_TIME_SLOTS_* arrays and the getTimeSlotsForBranch()
-- routing logic in admin-v2.js (lines 5463-5793). Idempotent via
-- ON CONFLICT DO NOTHING on the (branch_id, coach_id, schedule_type,
-- slot_index) unique constraint, so re-running is safe.
--
-- Coach->branch assignments come from the coach_branches junction
-- (migration 019). Coach name matching uses ILIKE on first_name /
-- last_name and the same name fragments the JS uses ('nail'/'наиль',
-- 'sylkhan'/'асылхан' — note 'sylkhan' substring-matches 'asylkhan' —
-- 'vasily'/'василий').

BEGIN;

-- ============================================================
-- 1. HALYK ARENA — one shared array for all schedule_types,
--    applied to every coach assigned to the branch.
--    Source: ATTENDANCE_TIME_SLOTS_HALYK (admin-v2.js:5475-5484)
-- ============================================================
WITH branch AS (
    SELECT id FROM branches
    WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN branch b ON b.id = cb.branch_id
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('10:00'::TIME, '11:00'::TIME, 0),
    ('11:00'::TIME, '12:00'::TIME, 1),
    ('12:00'::TIME, '13:00'::TIME, 2),
    ('14:00'::TIME, '15:00'::TIME, 3),
    ('15:00'::TIME, '16:00'::TIME, 4),
    ('16:00'::TIME, '17:00'::TIME, 5),
    ('17:00'::TIME, '18:00'::TIME, 6),
    ('18:00'::TIME, '19:00'::TIME, 7)
),
schedules(schedule_type) AS (
    VALUES ('mon_wed'), ('tue_thu'), ('sat_sun'), ('mon_wed_fri')
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, sch.schedule_type, s.slot_index, s.start_time, s.end_time
FROM target t
CROSS JOIN slots s
CROSS JOIN schedules sch
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 2. DEBUT — Nail (Ildusovich) overrides
-- ============================================================

-- 2a. Nail tue_thu — ATTENDANCE_TIME_SLOTS_DEBUT_TUE_THU_NAIL (admin-v2.js:5561-5571)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%nail%' OR c.last_name ILIKE '%nail%'
       OR c.first_name ILIKE '%наиль%' OR c.last_name ILIKE '%наиль%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:00'::TIME, 6),
    ('17:00'::TIME, '18:00'::TIME, 7),
    ('18:00'::TIME, '19:30'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'tue_thu', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 2b. Nail sat_sun — ATTENDANCE_TIME_SLOTS_DEBUT_SAT_SUN_NAIL (admin-v2.js:5548-5558)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%nail%' OR c.last_name ILIKE '%nail%'
       OR c.first_name ILIKE '%наиль%' OR c.last_name ILIKE '%наиль%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('13:00'::TIME, '14:00'::TIME, 4),
    ('14:00'::TIME, '15:00'::TIME, 5),
    ('15:00'::TIME, '16:00'::TIME, 6),
    ('16:00'::TIME, '17:00'::TIME, 7),
    ('17:00'::TIME, '18:00'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 2c. Nail mon_wed_fri — ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED_FRI_NAIL (admin-v2.js:5535-5545)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%nail%' OR c.last_name ILIKE '%nail%'
       OR c.first_name ILIKE '%наиль%' OR c.last_name ILIKE '%наиль%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:00'::TIME, 6),
    ('17:00'::TIME, '18:00'::TIME, 7),
    ('18:00'::TIME, '19:00'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'mon_wed_fri', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 3. DEBUT — Asylkhan (Agbaevich) overrides
--    JS uses normalizedCoach.includes('sylkhan') which substring-
--    matches 'asylkhan'/'assylkhan', so ILIKE '%sylkhan%' suffices.
-- ============================================================

-- 3a. Asylkhan tue_thu — ATTENDANCE_TIME_SLOTS_DEBUT_TUE_THU_ASYLKHAN (admin-v2.js:5574-5578)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%sylkhan%' OR c.last_name ILIKE '%sylkhan%'
       OR c.first_name ILIKE '%асылхан%' OR c.last_name ILIKE '%асылхан%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('15:00'::TIME, '16:30'::TIME, 0),
    ('16:30'::TIME, '18:00'::TIME, 1),
    ('18:00'::TIME, '19:30'::TIME, 2)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'tue_thu', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 3b. Asylkhan sat_sun — ATTENDANCE_TIME_SLOTS_DEBUT_SAT_SUN_ASYLKHAN (admin-v2.js:5581-5585)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%sylkhan%' OR c.last_name ILIKE '%sylkhan%'
       OR c.first_name ILIKE '%асылхан%' OR c.last_name ILIKE '%асылхан%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:30'::TIME, 0),
    ('10:30'::TIME, '12:00'::TIME, 1),
    ('12:00'::TIME, '13:30'::TIME, 2)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 3c. Asylkhan mon_wed — ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED (admin-v2.js:5500-5510)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%sylkhan%' OR c.last_name ILIKE '%sylkhan%'
       OR c.first_name ILIKE '%асылхан%' OR c.last_name ILIKE '%асылхан%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:30'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:30'::TIME, 5),
    ('16:30'::TIME, '17:30'::TIME, 6),
    ('17:30'::TIME, '18:30'::TIME, 7),
    ('18:30'::TIME, '19:30'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'mon_wed', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 4. DEBUT — default (non-Nail, non-Asylkhan) and shared fallbacks
--    For coaches at Debut who don't match the Nail/Asylkhan filters,
--    AND for Nail's mon_wed (which the JS routes to the Debut default),
--    AND for Asylkhan's mon_wed_fri (same).
-- ============================================================

-- 4a. Debut default mon_wed + tue_thu — ATTENDANCE_TIME_SLOTS_DEBUT (admin-v2.js:5487-5497)
--     Applies to: Nail (mon_wed only), all other non-Asylkhan coaches (mon_wed + tue_thu).
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
non_asylkhan AS (
    SELECT cb.coach_id, cb.branch_id, c.first_name, c.last_name
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%sylkhan%' OR c.last_name ILIKE '%sylkhan%'
            OR c.first_name ILIKE '%асылхан%' OR c.last_name ILIKE '%асылхан%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:30'::TIME, 5),
    ('16:30'::TIME, '17:30'::TIME, 6),
    ('17:30'::TIME, '18:30'::TIME, 7),
    ('18:30'::TIME, '19:30'::TIME, 8)
),
schedules(schedule_type, coach_filter) AS (VALUES
    -- mon_wed: applies to Nail + everyone else non-Asylkhan
    ('mon_wed', 'all_non_asylkhan'),
    -- tue_thu: applies only to non-Nail non-Asylkhan (Nail has its own tue_thu)
    ('tue_thu', 'non_nail_non_asylkhan')
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT na.branch_id, na.coach_id, sch.schedule_type, s.slot_index, s.start_time, s.end_time
FROM non_asylkhan na
CROSS JOIN slots s
CROSS JOIN schedules sch
WHERE sch.coach_filter = 'all_non_asylkhan'
   OR (sch.coach_filter = 'non_nail_non_asylkhan'
       AND NOT (na.first_name ILIKE '%nail%' OR na.last_name ILIKE '%nail%'
            OR na.first_name ILIKE '%наиль%' OR na.last_name ILIKE '%наиль%'))
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 4b. Debut default sat_sun — ATTENDANCE_TIME_SLOTS_SAT_SUN (admin-v2.js:5526-5532)
--     Applies to all Debut coaches NOT matching Nail or Asylkhan.
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%nail%' OR c.last_name ILIKE '%nail%'
            OR c.first_name ILIKE '%наиль%' OR c.last_name ILIKE '%наиль%'
            OR c.first_name ILIKE '%sylkhan%' OR c.last_name ILIKE '%sylkhan%'
            OR c.first_name ILIKE '%асылхан%' OR c.last_name ILIKE '%асылхан%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('13:00'::TIME, '14:00'::TIME, 4)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 4c. Debut default mon_wed_fri — ATTENDANCE_TIME_SLOTS_DEBUT_MON_WED_FRI (admin-v2.js:5513-5523)
--     Applies to non-Nail Debut coaches (Asylkhan + everyone else; Nail has its own).
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%debut%' OR name ILIKE '%дебют%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%nail%' OR c.last_name ILIKE '%nail%'
            OR c.first_name ILIKE '%наиль%' OR c.last_name ILIKE '%наиль%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:30'::TIME, 5),
    ('16:30'::TIME, '17:30'::TIME, 6),
    ('17:30'::TIME, '18:30'::TIME, 7),
    ('18:30'::TIME, '19:30'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'mon_wed_fri', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 5. GAGARIN PARK — Vasily (Mikhaylovich) overrides
-- ============================================================

-- 5a. Vasily mon_wed — ATTENDANCE_TIME_SLOTS_GAGARIN_MON_WED_VASILY (admin-v2.js:5628-5639)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
       OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('13:00'::TIME, '14:00'::TIME, 4),
    ('14:00'::TIME, '15:00'::TIME, 5),
    ('15:00'::TIME, '16:00'::TIME, 6),
    ('16:00'::TIME, '17:00'::TIME, 7),
    ('17:00'::TIME, '18:00'::TIME, 8),
    ('18:00'::TIME, '19:00'::TIME, 9)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'mon_wed', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 5b. Vasily tue_thu — ATTENDANCE_TIME_SLOTS_GAGARIN_TUE_THU_VASILY (admin-v2.js:5608-5617)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
       OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:00'::TIME, 6),
    ('17:00'::TIME, '18:00'::TIME, 7)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'tue_thu', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 5c. Vasily sat_sun — ATTENDANCE_TIME_SLOTS_GAGARIN_SAT_SUN_VASILY (admin-v2.js:5620-5625)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
       OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%'
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 6. GAGARIN PARK — defaults (non-Vasily coaches)
-- ============================================================

-- 6a. Gagarin default mon_wed — ATTENDANCE_TIME_SLOTS_GAGARIN_MON_WED (admin-v2.js:5642-5652)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
            OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('13:00'::TIME, '14:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:00'::TIME, 6),
    ('17:00'::TIME, '18:00'::TIME, 7),
    ('18:00'::TIME, '19:00'::TIME, 8)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'mon_wed', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 6b. Gagarin default tue_thu — ATTENDANCE_TIME_SLOTS_GAGARIN_TUE_THU (admin-v2.js:5596-5605)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
            OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:30'::TIME, 1),
    ('11:30'::TIME, '12:30'::TIME, 2),
    ('12:30'::TIME, '13:30'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:30'::TIME, 6),
    ('17:30'::TIME, '19:00'::TIME, 7)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'tue_thu', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 6c. Gagarin default sat_sun — ATTENDANCE_TIME_SLOTS_GAGARIN_SAT_SUN (admin-v2.js:5588-5593)
WITH branch AS (
    SELECT id FROM branches WHERE name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    JOIN coaches c ON c.id = cb.coach_id
    JOIN branch b ON b.id = cb.branch_id
    WHERE NOT (c.first_name ILIKE '%vasily%' OR c.last_name ILIKE '%vasily%'
            OR c.first_name ILIKE '%василий%' OR c.last_name ILIKE '%василий%')
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:30'::TIME, 0),
    ('10:30'::TIME, '12:00'::TIME, 1),
    ('12:00'::TIME, '13:00'::TIME, 2),
    ('13:00'::TIME, '14:00'::TIME, 3)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- ============================================================
-- 7. OTHER BRANCHES (not Halyk / Debut / Gagarin) — fallbacks
--    JS: weekday schedules return ATTENDANCE_TIME_SLOTS_DEFAULT,
--    sat_sun returns ATTENDANCE_TIME_SLOTS_SAT_SUN.
-- ============================================================

-- 7a. Other branches default weekdays — ATTENDANCE_TIME_SLOTS_DEFAULT (admin-v2.js:5463-5472)
WITH excluded_branches AS (
    SELECT id FROM branches
    WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%'
       OR name ILIKE '%debut%' OR name ILIKE '%дебют%'
       OR name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    WHERE cb.branch_id NOT IN (SELECT id FROM excluded_branches)
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('14:00'::TIME, '15:00'::TIME, 4),
    ('15:00'::TIME, '16:00'::TIME, 5),
    ('16:00'::TIME, '17:00'::TIME, 6),
    ('17:00'::TIME, '18:00'::TIME, 7)
),
schedules(schedule_type) AS (VALUES ('mon_wed'), ('tue_thu'), ('mon_wed_fri'))
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, sch.schedule_type, s.slot_index, s.start_time, s.end_time
FROM target t
CROSS JOIN slots s
CROSS JOIN schedules sch
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

-- 7b. Other branches sat_sun — ATTENDANCE_TIME_SLOTS_SAT_SUN (admin-v2.js:5526-5532)
WITH excluded_branches AS (
    SELECT id FROM branches
    WHERE name ILIKE '%halyk%' OR name ILIKE '%khalyk%'
       OR name ILIKE '%debut%' OR name ILIKE '%дебют%'
       OR name ILIKE '%gagarin%' OR name ILIKE '%гагарин%'
),
target AS (
    SELECT cb.coach_id, cb.branch_id
    FROM coach_branches cb
    WHERE cb.branch_id NOT IN (SELECT id FROM excluded_branches)
),
slots(start_time, end_time, slot_index) AS (VALUES
    ('09:00'::TIME, '10:00'::TIME, 0),
    ('10:00'::TIME, '11:00'::TIME, 1),
    ('11:00'::TIME, '12:00'::TIME, 2),
    ('12:00'::TIME, '13:00'::TIME, 3),
    ('13:00'::TIME, '14:00'::TIME, 4)
)
INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index, start_time, end_time)
SELECT t.branch_id, t.coach_id, 'sat_sun', s.slot_index, s.start_time, s.end_time
FROM target t CROSS JOIN slots s
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index) DO NOTHING;

COMMIT;

-- Sanity check (run separately after applying):
-- SELECT b.name AS branch, c.first_name || ' ' || c.last_name AS coach,
--        ts.schedule_type, COUNT(*) AS slots
-- FROM time_slots ts
-- JOIN coaches c ON c.id = ts.coach_id
-- JOIN branches b ON b.id = ts.branch_id
-- GROUP BY 1, 2, 3
-- ORDER BY 1, 2, 3;
