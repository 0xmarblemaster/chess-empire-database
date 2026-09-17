-- Migration 088: Chesster app registration status on students
-- ============================================================
-- Adds a nullable timestamp column that records whether a student has
-- registered for the Chesster app (chess-empire.chesster.io) via a branch
-- registration link.
--
-- The value is NOT written by the app. It is synced from the separate Chesster
-- Supabase project (qtzujwiqzbgyhdgulvcd) by scripts/sync-chesster-registration.mjs,
-- which reads Chesster's organization_members table and maps verified links back
-- onto students.id. NULL = not registered; a timestamp = the link_verified_at of
-- the student's verified Chesster membership.
--
-- The student card (student.js) reads this column to show a green
-- «Зарегистрирован» / red «Не зарегистрирован» panel. The card treats a missing
-- column / NULL value as "not registered", so it renders correctly even before
-- this migration is applied.
-- ============================================================

BEGIN;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS chesster_registered_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN students.chesster_registered_at IS
    'When the student registered for the Chesster app (chess-empire.chesster.io). '
    'Set by scripts/sync-chesster-registration.mjs from the Chesster project''s '
    'organization_members (verified links only). NULL = not registered.';

COMMIT;
