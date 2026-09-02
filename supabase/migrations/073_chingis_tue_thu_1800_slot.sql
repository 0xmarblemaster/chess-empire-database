-- Migration 073: add an 18:00-19:00 slot to Chingis Baurzhanovich's Tue-Thu schedule
--
-- Requested by Alex on 2026-09-02: new 18:00-19:00 time slot on the
-- Tuesday-Thursday attendance calendar for coach Chingis Baurzhanovich
-- ONLY (Gagarin Park). No other coach or schedule is touched.
--
-- CURRENT STATE (verified live 2026-09-02)
-- ----------------------------------------
-- Chingis / Gagarin Park / tue_thu renders 8 slots for September 2026,
-- resolved per slot_index from the versioned timeline (baseline 1970-01-01
-- overlaid by 2026-06-01, 2026-08-01 and 2026-09-01 versions):
--   0: 09:00-10:00 D      4: 14:00-15:00
--   1: 10:00-11:00 D      5: 15:00-16:00
--   2: 11:00-12:00 D      6: 16:00-17:00 С        (eff 2026-09-01)
--   3: 12:00-13:00 C      7: 17:00-18:00 Группа С (eff 2026-09-01)
--
-- CHANGE
-- ------
-- Pure append: one new empty slot at slot_index 8 (18:00-19:00),
-- effective_from 2026-09-01. Unlike migrations 064/071 there is NO index
-- shifting and NO student_time_slot_assignments rewrite:
--   * slot_index 8 is unused in every tue_thu version for this coach, so
--     indexes stay contiguous 0..8 and nothing collides;
--   * verified there are no orphan student_time_slot_assignments rows at
--     time_slot_index >= 8 for (Gagarin Park, tue_thu), so nothing can
--     resurrect under the new slot — it starts empty;
--   * months before September 2026 do not satisfy
--     effective_from <= last_day_of(month) for the new row, so history is
--     unchanged (same forward-dating mechanism as migration 064).
--
-- IDEMPOTENCY: single INSERT with ON CONFLICT DO NOTHING on the
-- (branch_id, coach_id, schedule_type, slot_index, effective_from) unique
-- key from migration 061. Re-running is safe.

BEGIN;

INSERT INTO time_slots
  (branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from)
VALUES (
  '93bbd1be-8c11-4623-943f-d283894b2f91',  -- Gagarin Park
  '12ecb08f-2a24-40df-8349-169efb76ff7d',  -- Chingis Baurzhanovich
  'tue_thu',
  8,
  TIME '18:00',
  TIME '19:00',
  NULL,
  DATE '2026-09-01'
)
ON CONFLICT (branch_id, coach_id, schedule_type, slot_index, effective_from) DO NOTHING;

COMMIT;
