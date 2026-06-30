-- Migration 064: insert 14:30-15:30 slot into Vasily Mikhaylovich's Mon-Wed schedule
--
-- Background
-- ----------
-- Coach Vasily Mikhaylovich (Gagarin Park, mon_wed) reshuffled his June 2026
-- schedule on 2026-06-01 and 2026-06-24 via the versioned Edit Time Slot UI.
-- The resulting six June slots leave a visible gap between 13:30-14:30
-- (slot_index 3) and 15:30-16:30 (slot_index 4). Empty slots are not rendered
-- by the attendance calendar because admin-v2.js iterates the slot bucket
-- one entry at a time — there is no placeholder for a missing slot_index.
--
-- This migration fills the gap with an empty 14:30-15:30 slot, effective
-- from 2026-06-01. The attendance calendar render path treats `timeSlots`
-- as a positional array (`timeSlots[time_slot_index]`) across many call
-- sites (admin-v2.js: 8057, 8127, 8995, 10042, ...), so slot_indexes must
-- stay contiguous starting at 0. Inserting the new slot at index 4
-- therefore requires shifting the existing 2026-06-01 versions of slots 4
-- and 5 up by one, and rewriting any student_time_slot_assignments rows
-- that depended on the old indexes.
--
-- Pre-state — Vasily mon_wed @ Gagarin Park, June 2026:
--   slot 0: 09:00-10:30  Группа В (Разрядники)
--   slot 1: 10:30-11:30  Группа С (2-3 ступень)
--   slot 2: 11:30-12:30  Группа D (Новички)
--   slot 3: 13:30-14:30  Группа D (Новички)
--   slot 4: 15:30-16:30  Группа С (2-3 ступень)
--   slot 5: 16:30-18:00  Группа В (Разрядники)
--
-- Post-state:
--   slot 0..3: unchanged
--   slot 4: 14:30-15:30  (new, empty)
--   slot 5: 15:30-16:30  Группа С (2-3 ступень)  (shifted from old slot 4)
--   slot 6: 16:30-18:00  Группа В (Разрядники)   (shifted from old slot 5)
--
-- Months prior to June 2026 are not affected — the 1970-01-01 versions
-- of slots 0..5 keep their original times and indexes, and the new June
-- rows do not satisfy `effective_from <= last_day_of(month)` for any month
-- before June 2026.
--
-- Idempotency: each UPDATE is keyed by row id, each INSERT uses ON CONFLICT
-- DO NOTHING on the (student, branch, schedule, slot, effective_from)
-- uniqueness from migration 061. Re-running is safe.
--
-- NOTE ON ORDERING (subtle): the student-assignment INSERTs are split into
-- two phases — CARRIES first, HIDES second. The carriers' visibility is
-- derived from the *pre-existing* hidden state of their source slot. If a
-- HIDE step ran first, the carrier's COALESCE lookup would read the
-- newly-inserted hidden=true row and propagate hidden=true. Phasing
-- carries first guarantees they see clean June state. ON CONFLICT then
-- preserves the carrier row when a later HIDE step targets the same key
-- (e.g. a student at both baseline slot 4 and baseline slot 5 stays
-- visible at new slot 5 from the carrier, the hide step is a no-op).

BEGIN;

-- ============================================================
-- 1. Shift the existing June 2026 time_slots rows up by one.
--    Order matters: shift the higher index first so we never
--    collide on (branch, coach, schedule, slot_index, effective_from).
-- ============================================================

-- slot 5 -> 6 (16:30-18:00)
UPDATE time_slots
SET slot_index = 6, updated_at = NOW()
WHERE id = 'cfda9e67-0bbd-4bba-a793-188c0291735e'
  AND effective_from = DATE '2026-06-01'
  AND slot_index = 5;

-- slot 4 -> 5 (15:30-16:30)
UPDATE time_slots
SET slot_index = 5, updated_at = NOW()
WHERE id = '5dd12d29-8c2e-40c9-97b8-ede692b19cbe'
  AND effective_from = DATE '2026-06-01'
  AND slot_index = 4;

-- ============================================================
-- 2. Insert the new 14:30-15:30 slot at index 4, effective June 2026.
-- ============================================================
INSERT INTO time_slots
  (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
VALUES (
  '93bbd1be-8c11-4623-943f-d283894b2f91',  -- Gagarin Park
  'b87e8249-57d9-4ee5-bfd9-9133f3ccc23d',  -- Vasily Mikhaylovich
  'mon_wed',
  4,
  TIME '14:30',
  TIME '15:30',
  NULL,
  DATE '2026-06-01'
)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

-- ============================================================
-- 3. CARRY old slot 4 → new slot 5 (must run BEFORE the slot-4 HIDE
--    below, otherwise COALESCE reads the hide and propagates true).
--    Each student visible at baseline slot 4 gets a June row at slot 5
--    with COALESCE(<their pre-existing June slot 4 hidden override>, false).
-- ============================================================
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden)
SELECT DISTINCT s1970.student_id, s1970.branch_id, s1970.schedule_type, 5, DATE '2026-06-01',
       COALESCE(s_june.hidden, false)
FROM student_time_slot_assignments s1970
LEFT JOIN student_time_slot_assignments s_june
  ON s_june.student_id      = s1970.student_id
 AND s_june.branch_id       = s1970.branch_id
 AND s_june.schedule_type   = s1970.schedule_type
 AND s_june.time_slot_index = 4
 AND s_june.effective_from  = DATE '2026-06-01'
WHERE s1970.branch_id      = '93bbd1be-8c11-4623-943f-d283894b2f91'
  AND s1970.schedule_type  = 'mon_wed'
  AND s1970.time_slot_index = 4
  AND s1970.effective_from = DATE '1970-01-01'
  AND s1970.hidden = false
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO NOTHING;

-- ============================================================
-- 4. CARRY old slot 5 → new slot 6 (must run BEFORE the slot-5 HIDE
--    below for the same reason).
-- ============================================================
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden)
SELECT DISTINCT s1970.student_id, s1970.branch_id, s1970.schedule_type, 6, DATE '2026-06-01',
       COALESCE(s_june.hidden, false)
FROM student_time_slot_assignments s1970
LEFT JOIN student_time_slot_assignments s_june
  ON s_june.student_id      = s1970.student_id
 AND s_june.branch_id       = s1970.branch_id
 AND s_june.schedule_type   = s1970.schedule_type
 AND s_june.time_slot_index = 5
 AND s_june.effective_from  = DATE '2026-06-01'
WHERE s1970.branch_id      = '93bbd1be-8c11-4623-943f-d283894b2f91'
  AND s1970.schedule_type  = 'mon_wed'
  AND s1970.time_slot_index = 5
  AND s1970.effective_from = DATE '1970-01-01'
  AND s1970.hidden = false
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO NOTHING;

-- ============================================================
-- 5. HIDE all baseline slot-4 students at the new slot 4 (placeholder).
--    Runs after the carry above. ON CONFLICT preserves any pre-existing
--    explicit hidden override.
-- ============================================================
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden)
SELECT DISTINCT student_id, branch_id, schedule_type, 4, DATE '2026-06-01', true
FROM student_time_slot_assignments
WHERE branch_id = '93bbd1be-8c11-4623-943f-d283894b2f91'
  AND schedule_type = 'mon_wed'
  AND time_slot_index = 4
  AND effective_from = DATE '1970-01-01'
  AND hidden = false
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO NOTHING;

-- ============================================================
-- 6. HIDE baseline slot-5 students at the shifted slot 5 (they belong at
--    slot 6 now). ON CONFLICT preserves the carrier from step 3 if a
--    student is at BOTH baseline 4 and baseline 5 — that student stays
--    visible at slot 5 via the carrier and visible at slot 6 via step 4.
-- ============================================================
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden)
SELECT DISTINCT student_id, branch_id, schedule_type, 5, DATE '2026-06-01', true
FROM student_time_slot_assignments
WHERE branch_id = '93bbd1be-8c11-4623-943f-d283894b2f91'
  AND schedule_type = 'mon_wed'
  AND time_slot_index = 5
  AND effective_from = DATE '1970-01-01'
  AND hidden = false
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO NOTHING;

-- ============================================================
-- 7. HIDE the orphan slot_index=6 students whose 1970-01-01 rows
--    never had a matching time_slots row before the shift. With slot
--    6 now occupied by the shifted 16:30-18:00 slot, those rows
--    would otherwise resurrect under that slot in June.
-- ============================================================
INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, hidden)
SELECT DISTINCT student_id, branch_id, schedule_type, 6, DATE '2026-06-01', true
FROM student_time_slot_assignments
WHERE branch_id = '93bbd1be-8c11-4623-943f-d283894b2f91'
  AND schedule_type = 'mon_wed'
  AND time_slot_index = 6
  AND effective_from = DATE '1970-01-01'
  AND hidden = false
ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO NOTHING;

COMMIT;
