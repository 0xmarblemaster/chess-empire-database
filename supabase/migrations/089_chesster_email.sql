-- Migration 089: Chesster registration email on students
-- ============================================================
-- Adds a nullable email column that records the email address a student used to
-- register for the Chesster app (chess-empire.chesster.io).
--
-- Like chesster_registered_at (migration 088), this value is NOT written by the
-- app. It is synced from the separate Chesster Supabase project
-- (qtzujwiqzbgyhdgulvcd) by scripts/sync-chesster-registration.mjs, which reads
-- Chesster's organization_members.email for the student's winning verified link.
-- NULL = not registered or the email is unknown.
--
-- The student card (student.js) shows this email on the Chesster status banner
-- when the student is registered. A missing column / NULL value renders as no
-- email line, so the card works correctly even before this migration is applied.
-- ============================================================

BEGIN;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS chesster_email TEXT NULL;

COMMENT ON COLUMN students.chesster_email IS
    'Email the student used to register for the Chesster app '
    '(chess-empire.chesster.io). Synced by scripts/sync-chesster-registration.mjs '
    'from the Chesster project''s organization_members.email (verified links only). '
    'NULL = not registered or unknown.';

COMMIT;
