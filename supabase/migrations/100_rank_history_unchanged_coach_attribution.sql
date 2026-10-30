-- Migration 100: attribute rank events of students whose coach never changed
--
-- CONTEXT
-- -------
-- The 099 backfill derived trainer_id_at_change only from audit_log coach_id
-- UPDATE rows. Students whose coach_id was NEVER updated have no such rows, so
-- their legacy events were left 'unknown' (44 of 132 on 2026-10-30).
--
-- audit_students_changes (AFTER INSERT/UPDATE/DELETE ON students, function
-- log_entity_changes) has logged every students.coach_id UPDATE since the
-- first audit row on 2026-02-10. If a student has no coach_id UPDATE row at
-- all and the event is after that date, the coach has not changed since
-- before the event, so the current students.coach_id held the student then.
--
-- Rules:
--   * Only rows with trainer_attribution = 'unknown', source_derived = true,
--     changed_at after the first audit_log coach_id row, and NO coach_id
--     audit row for the student. Rows whose audited coach was later deleted
--     stay 'unknown'.
--   * Sets trainer_id_at_change, trainer_attribution = 'derived_audit_log',
--     appends to evidence. Nothing else changes; NEVER updates students.
--   * The append-only trigger is disabled inside this transaction and
--     re-enabled before COMMIT.
-- Idempotent — re-running finds no 'unknown' rows that qualify.

BEGIN;

ALTER TABLE razryad_history DISABLE TRIGGER trg_razryad_history_append_only;

WITH audit_start AS (
    SELECT min(changed_at) AS t
    FROM audit_log
    WHERE entity_type = 'students' AND field_name = 'coach_id'
)
UPDATE razryad_history rh
SET
    trainer_id_at_change = s.coach_id,
    trainer_attribution  = 'derived_audit_log',
    evidence = rh.evidence || '; 100: no audit_log coach_id change for student since audit start '
               || a.t::TEXT || ' — coach unchanged, current coach held at event'
FROM students s, audit_start a
WHERE s.id = rh.student_id
  AND s.coach_id IS NOT NULL
  AND a.t IS NOT NULL
  AND rh.trainer_attribution = 'unknown'
  AND rh.source_derived = true
  AND rh.changed_at > a.t
  AND NOT EXISTS (
      SELECT 1 FROM audit_log al
      WHERE al.entity_type = 'students' AND al.entity_id = rh.student_id
        AND al.field_name = 'coach_id'
  );

ALTER TABLE razryad_history ENABLE TRIGGER trg_razryad_history_append_only;

COMMIT;
