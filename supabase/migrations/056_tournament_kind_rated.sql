-- Migration 056: add 'rated' to tournament_kind enum + relax rounds constraint
--
-- Adds a 5th tournament kind, "Rated Tournament", to the Ratings Management
-- upload flow. Unlike the existing 4 internal kinds (league_c/league_b/
-- razryad_4/razryad_3) which each have a fixed number of rounds, a rated
-- tournament can have any number of rounds (derived in the parser from
-- max(games_played) across the participant table). It also has no razryad
-- award (the existing detect_razryad_from_result trigger naturally falls
-- through to v_earned = NULL for any kind that isn't razryad_3/razryad_4,
-- so no trigger change is needed).
--
-- Two DDL changes:
--   1. ALTER TYPE tournament_kind ADD VALUE 'rated' (must run outside a
--      transaction block, so we do it as a standalone statement).
--   2. Swap tu_rounds_match_kind to allow 'rated' with any rounds in [1, 20].
--
-- RLS policies live on the tables, not the enum value, so no policy changes.

-- ============================================================
-- 1. Add 'rated' to the enum (idempotent)
-- ============================================================
ALTER TYPE tournament_kind ADD VALUE IF NOT EXISTS 'rated';

-- ============================================================
-- 2. Relax the rounds invariant for 'rated'
-- ============================================================
ALTER TABLE tournaments_uploads DROP CONSTRAINT IF EXISTS tu_rounds_match_kind;
ALTER TABLE tournaments_uploads ADD CONSTRAINT tu_rounds_match_kind CHECK (
    (kind = 'league_c'  AND rounds = 6)              OR
    (kind = 'league_b'  AND rounds = 6)              OR
    (kind = 'razryad_4' AND rounds = 10)             OR
    (kind = 'razryad_3' AND rounds = 9)              OR
    (kind = 'rated'     AND rounds BETWEEN 1 AND 20)
);

COMMENT ON CONSTRAINT tu_rounds_match_kind ON tournaments_uploads IS
    'Migration 056: per-kind rounds invariant. rated kind allows any 1..20.';
