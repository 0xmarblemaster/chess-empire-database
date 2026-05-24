-- Migration 037: tournament_type enum + column
-- Distinguishes regular weekly tournaments from qualification events (where
-- a player may earn a razryad), team events, and other special formats.
-- KPI rollups will weight these differently in later phases.
-- NOTE: Existing rows default to 'regular' via the NOT NULL DEFAULT — no
-- explicit backfill needed.

-- ============================================================
-- 1. ENUM
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_type') THEN
        CREATE TYPE tournament_type AS ENUM ('regular', 'qualification', 'team', 'other');
    END IF;
END $$;

-- ============================================================
-- 2. COLUMN
-- ============================================================
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS tournament_type tournament_type NOT NULL DEFAULT 'regular';

COMMENT ON COLUMN tournaments.tournament_type IS
    'Distinguishes regular events from qualification/team/other. Used by Coach KPI rollups (qualification events count toward "new razryads earned").';

CREATE INDEX IF NOT EXISTS idx_tournaments_type ON tournaments(tournament_type);
