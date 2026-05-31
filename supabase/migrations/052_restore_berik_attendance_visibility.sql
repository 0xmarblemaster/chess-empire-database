-- Migration 052: restore Berik Zhumabekovich's hidden students + Zakhar Osipov's
-- April 2026 attendance rows.
--
-- Background: Berik (coach_id d5d68db8-…, auth user_id ada27d52-…) used
-- the "remove student from calendar" action 41 times between 2026-04-08 and
-- 2026-05-31. Because the pre-fix `deleteStudentFromCalendar` set
-- `time_slot_index = -1` globally and the calendar render path read the row
-- globally, those students vanished from every past month — including months
-- where they had surviving attendance.
--
-- Additionally, on 2026-05-02 Berik clicked "remove Zakhar Osipov" from the
-- calendar. The pre-fix code also `DELETE`d 8 attendance rows for Zakhar in
-- one batch. 7 of those rows belonged to past months (April 2026) — those
-- are the knock-on rows we restore here. The 8th (May 2, 2026) is in the
-- "current" month at the time of the click and is left out per PRD (the new
-- semantics scope hide to the displayed month onward, but the May 2 row was
-- not on a calendar slot that survived this restoration's scope).
--
-- Migration 051 added effective_from versioning and the
-- (student_id, branch_id, schedule_type, effective_from) UNIQUE constraint.
-- This migration uses that to:
--
-- Block A: for each of Berik's 41 hide events, pin the existing
--   `time_slot_index = -1` row to the click month's first day and insert a
--   sibling row at effective_from = 1970-01-01 carrying the prior slot.
--   Past months resolve to the baseline (visible). Click-month onward
--   resolves to the hide row (excluded).
--
-- Block B: re-insert the 7 deleted April attendance rows for Zakhar Osipov
--   using the original entity_id from the audit_log (so re-runs are no-ops
--   via ON CONFLICT DO NOTHING).
--
-- Idempotent:
--   * Block A's UPDATE is gated on the row still being at
--     (effective_from='1970-01-01', time_slot_index=-1), so re-runs hit no
--     rows. Block A's INSERT is gated on the
--     (student, branch, schedule, effective_from) uniqueness from
--     migration 051.
--   * Block B's INSERT uses ON CONFLICT (id) DO NOTHING.
--
-- Two of the 41 entity_ids were manually restored to a positive slot before
-- this migration runs (Alexander Shin → slot 1, Timofey Zakharenko mon_wed
-- → slot 2). For those, Block A's UPDATE no-ops (slot != -1) and Block A's
-- INSERT no-ops (1970-01-01 row already exists). End state: those rows
-- remain at the operator's chosen positive slot at effective_from
-- 1970-01-01, which is correct.
--
-- See ops/berik-restoration-20260531.md for the full per-event table and
-- pre/post counts.

BEGIN;

-- ============================================================
-- Block A: 41 hide reversals (39 active, 2 already-restored no-ops)
-- ============================================================
--
-- UPDATE must precede INSERT: moving the existing -1 row off
-- effective_from='1970-01-01' frees the unique-constraint slot for the
-- new baseline insert.

WITH hide_events AS (
  SELECT
    al.entity_id,
    regexp_replace(al.old_value, '^.* \| slot ', '')::INT AS prior_slot,
    date_trunc('month', al.changed_at)::DATE         AS click_month
  FROM audit_log al
  WHERE al.entity_type = 'time_slots'
    AND al.field_name  = 'time_slot_index'
    AND al.changed_by  = 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
    AND al.new_value LIKE '% | slot -1'
)
UPDATE student_time_slot_assignments s
SET effective_from = e.click_month,
    updated_at     = NOW()
FROM hide_events e
WHERE s.id = e.entity_id
  AND s.effective_from   = DATE '1970-01-01'
  AND s.time_slot_index  = -1;

INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, created_at, updated_at)
SELECT
  s.student_id, s.branch_id, s.schedule_type,
  regexp_replace(al.old_value, '^.* \| slot ', '')::INT,
  DATE '1970-01-01',
  s.created_at, NOW()
FROM audit_log al
JOIN student_time_slot_assignments s ON s.id = al.entity_id
WHERE al.entity_type = 'time_slots'
  AND al.field_name  = 'time_slot_index'
  AND al.changed_by  = 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
  AND al.new_value LIKE '% | slot -1'
ON CONFLICT (student_id, branch_id, schedule_type, effective_from) DO NOTHING;

-- ============================================================
-- Block B: restore 7 Zakhar Osipov attendance rows
-- ============================================================
--
-- Filter narrows to the 2026-05-02 batch (Berik calendar-deletion event):
-- without `changed_at >= '2026-05-01'`, an earlier unrelated deletion on
-- 2026-03-16 (date 2026-03-08) would also match. See
-- ops/berik-restoration-20260531.md → "Zakhar Osipov attendance deletes (7)".

INSERT INTO attendance
  (id, student_id, branch_id, attendance_date, schedule_type, status, notes)
SELECT
  al.entity_id::uuid,
  (SELECT id FROM students WHERE first_name = 'Zakhar' AND last_name = 'Osipov' LIMIT 1),
  '7d1946c8-183b-4ad9-8f49-77402bac2210'::uuid,
  split_part(al.old_value, ' | ', 3)::date,
  'sat_sun',
  split_part(al.old_value, ' | ', 2),
  'restored from audit_log on 2026-05-31 — Berik knock-on'
FROM audit_log al
WHERE al.entity_type = 'attendance'
  AND al.action      = 'DELETE'
  AND al.changed_by  = 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
  AND al.old_value LIKE 'Zakhar Osipov | %'
  AND al.changed_at  >= '2026-05-01'
  AND split_part(al.old_value, ' | ', 3)::date < '2026-05-01'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Verification: enforce end state
-- ============================================================

DO $$
DECLARE
  v_baseline_count INT;
  v_zakhar_count   INT;
BEGIN
  -- Each of the 41 (student, branch, schedule) tuples must now have a row
  -- at effective_from='1970-01-01' with a positive (visible) slot.
  SELECT COUNT(DISTINCT al.entity_id)
  INTO v_baseline_count
  FROM audit_log al
  JOIN student_time_slot_assignments orig ON orig.id = al.entity_id
  WHERE al.entity_type = 'time_slots'
    AND al.field_name  = 'time_slot_index'
    AND al.changed_by  = 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
    AND al.new_value LIKE '% | slot -1'
    AND EXISTS (
      SELECT 1 FROM student_time_slot_assignments base
      WHERE base.student_id    = orig.student_id
        AND base.branch_id     = orig.branch_id
        AND base.schedule_type = orig.schedule_type
        AND base.effective_from = DATE '1970-01-01'
        AND base.time_slot_index >= 0
    );

  IF v_baseline_count <> 41 THEN
    RAISE EXCEPTION 'Block A verification failed: expected 41 hide-event tuples with a positive-slot baseline at 1970-01-01, got %', v_baseline_count;
  END IF;

  -- Zakhar must now have exactly 7 attendance rows tagged with the
  -- restoration note.
  SELECT COUNT(*) INTO v_zakhar_count
  FROM attendance
  WHERE notes = 'restored from audit_log on 2026-05-31 — Berik knock-on';

  IF v_zakhar_count <> 7 THEN
    RAISE EXCEPTION 'Block B verification failed: expected 7 restored Zakhar attendance rows, got %', v_zakhar_count;
  END IF;
END
$$;

COMMIT;
