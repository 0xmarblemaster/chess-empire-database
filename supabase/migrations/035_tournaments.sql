-- Migration 035: Tournament tracking — Phase 1 (DB schema only)
-- Adds tournaments + tournament_participants tables, links student_ratings to
-- tournaments, and introduces can_manage_tournaments permission with matching RLS.
-- See PRD_TOURNAMENTS.md sections 4 and 10. Phase 2+ (UI, importer, edge fn) follow later.

-- ============================================================
-- 1. TOURNAMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournaments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    league          TEXT NOT NULL CHECK (league IN ('A', 'B', 'C')),
    tournament_date DATE NOT NULL,
    director_name   TEXT,
    organizer       TEXT,
    avg_rating      INTEGER,
    rounds          INTEGER,
    source_file     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      UUID REFERENCES auth.users(id),
    UNIQUE (name, tournament_date, league)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(tournament_date DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_league ON tournaments(league);

-- ============================================================
-- 2. TOURNAMENT PARTICIPANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    place           INTEGER NOT NULL,
    rating_before   INTEGER,
    rating_after    INTEGER,
    rating_delta    INTEGER,
    raw_name        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tournament_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_student_tournament ON tournament_participants(student_id, tournament_id);
CREATE INDEX IF NOT EXISTS idx_tp_tournament ON tournament_participants(tournament_id);

-- ============================================================
-- 3. LINK student_ratings TO TOURNAMENTS
-- ============================================================
ALTER TABLE student_ratings
    ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_ratings_tournament ON student_ratings(tournament_id);

-- ============================================================
-- 4. PERMISSION FLAG
-- ============================================================
ALTER TABLE user_roles
    ADD COLUMN IF NOT EXISTS can_manage_tournaments BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_roles.can_manage_tournaments IS 'Permission to upload/edit/delete tournaments and participant data';

UPDATE user_roles SET can_manage_tournaments = TRUE WHERE role = 'admin';

-- ============================================================
-- 5. RLS — TOURNAMENTS
-- ============================================================
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read tournaments" ON tournaments;
CREATE POLICY "Anyone can read tournaments"
    ON tournaments FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authorized users can insert tournaments" ON tournaments;
CREATE POLICY "Authorized users can insert tournaments"
    ON tournaments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );

DROP POLICY IF EXISTS "Authorized users can update tournaments" ON tournaments;
CREATE POLICY "Authorized users can update tournaments"
    ON tournaments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );

DROP POLICY IF EXISTS "Authorized users can delete tournaments" ON tournaments;
CREATE POLICY "Authorized users can delete tournaments"
    ON tournaments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );

-- ============================================================
-- 6. RLS — TOURNAMENT PARTICIPANTS
-- ============================================================
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read tournament participants" ON tournament_participants;
CREATE POLICY "Anyone can read tournament participants"
    ON tournament_participants FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authorized users can insert tournament participants" ON tournament_participants;
CREATE POLICY "Authorized users can insert tournament participants"
    ON tournament_participants FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );

DROP POLICY IF EXISTS "Authorized users can update tournament participants" ON tournament_participants;
CREATE POLICY "Authorized users can update tournament participants"
    ON tournament_participants FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );

DROP POLICY IF EXISTS "Authorized users can delete tournament participants" ON tournament_participants;
CREATE POLICY "Authorized users can delete tournament participants"
    ON tournament_participants FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_manage_tournaments = true)
        )
    );
