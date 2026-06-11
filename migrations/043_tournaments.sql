-- Migration 043: Tournament schedule — public registration flow.
-- Extends the existing tournaments table (created in supabase/migrations/035_tournaments.sql)
-- with scheduling columns (branch_id, start_time, capacity, status, etc.), introduces
-- tournament_registrations, an atomic register_for_tournament RPC, public read RLS,
-- and a 4-Saturday League C seed for Halyk Arena.
--
-- Idempotent: re-running this migration is safe — every ADD COLUMN / ADD CONSTRAINT /
-- INSERT guards against the prior state.

-- ============================================================
-- 1. TOURNAMENTS — scheduling columns
-- ============================================================
CREATE TABLE IF NOT EXISTS tournaments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    info            TEXT,
    tournament_date DATE NOT NULL,
    start_time      TIME,
    time_format     TEXT,
    registration_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    rounds          INTEGER NOT NULL CHECK (rounds > 0),
    capacity        INTEGER NOT NULL DEFAULT 24 CHECK (capacity > 0),
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','closed','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill scheduling columns when the table was created by migration 035.
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS branch_id        UUID REFERENCES branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS info             TEXT,
    ADD COLUMN IF NOT EXISTS start_time       TIME,
    ADD COLUMN IF NOT EXISTS time_format      TEXT,
    ADD COLUMN IF NOT EXISTS registration_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS capacity         INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'open';

-- Status check constraint (idempotent — drop+add so it always reflects the current set).
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_status_check
    CHECK (status IN ('open','closed','cancelled'));

-- Capacity check
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_capacity_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_capacity_check
    CHECK (capacity > 0);

-- Migration 035 left the `league` column NOT NULL. The new public-schedule flow
-- does not require a league tag — drop NOT NULL so seeded rows / future inserts
-- can omit it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tournaments' AND column_name = 'league'
    ) THEN
        EXECUTE 'ALTER TABLE tournaments ALTER COLUMN league DROP NOT NULL';
    END IF;
END$$;

-- Unique (branch_id, tournament_date, name) — needed for the seed ON CONFLICT.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tournaments_branch_date_name_key'
    ) THEN
        ALTER TABLE tournaments
            ADD CONSTRAINT tournaments_branch_date_name_key
            UNIQUE (branch_id, tournament_date, name);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS t_upcoming_idx
    ON tournaments(branch_id, tournament_date);

-- ============================================================
-- 2. TOURNAMENT REGISTRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_registrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tournament_id, student_id)
);

CREATE INDEX IF NOT EXISTS tr_tournament_idx
    ON tournament_registrations(tournament_id);

-- ============================================================
-- 3. RLS — public read; no direct write (writes go through RPC)
-- ============================================================
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read tournaments" ON tournaments;
CREATE POLICY "Public read tournaments"
    ON tournaments FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public read registrations" ON tournament_registrations;
CREATE POLICY "Public read registrations"
    ON tournament_registrations FOR SELECT
    USING (true);

-- ============================================================
-- 4. RPC: register_for_tournament — atomic capacity-checked insert
-- ============================================================
CREATE OR REPLACE FUNCTION register_for_tournament(
    p_tournament_id UUID,
    p_student_id    UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_capacity INT;
    v_count    INT;
    v_status   TEXT;
BEGIN
    SELECT capacity, status
      INTO v_capacity, v_status
      FROM tournaments
     WHERE id = p_tournament_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    IF v_status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM tournament_registrations
     WHERE tournament_id = p_tournament_id;

    IF v_count >= v_capacity THEN
        UPDATE tournaments SET status = 'closed' WHERE id = p_tournament_id;
        RETURN jsonb_build_object('ok', false, 'reason', 'full');
    END IF;

    BEGIN
        INSERT INTO tournament_registrations(tournament_id, student_id)
             VALUES (p_tournament_id, p_student_id);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
    END;

    IF v_count + 1 >= v_capacity THEN
        UPDATE tournaments SET status = 'closed' WHERE id = p_tournament_id;
    END IF;

    RETURN jsonb_build_object('ok', true);
END$$;

GRANT EXECUTE ON FUNCTION register_for_tournament(UUID, UUID) TO anon, authenticated;

-- ============================================================
-- 5. REALTIME — publish registrations for live roster updates
-- ============================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tournament_registrations;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
    END;
END$$;

-- ============================================================
-- 6. SEED — 4 consecutive Saturdays of League C at Halyk Arena
-- ============================================================
DO $$
DECLARE
    v_branch_id UUID;
    v_sat       DATE;
    i           INT;
BEGIN
    SELECT id INTO v_branch_id
      FROM branches
     WHERE name ILIKE 'Halyk Arena'
     LIMIT 1;

    IF v_branch_id IS NULL THEN
        RAISE NOTICE 'Halyk Arena branch not found — skipping seed';
        RETURN;
    END IF;

    -- Next Saturday on or after today. DOW: Sunday=0, Saturday=6.
    -- ((6 - dow + 7) % 7) yields 0 when today IS Saturday, so the first row
    -- lands on today's Saturday (idempotent re-runs are guarded by the
    -- ON CONFLICT clause below).
    v_sat := CURRENT_DATE + ((6 - EXTRACT(DOW FROM CURRENT_DATE)::INT + 7) % 7);

    FOR i IN 0..3 LOOP
        INSERT INTO tournaments (
            branch_id, name, info, tournament_date, start_time,
            time_format, registration_fee, rounds, capacity, status, league
        ) VALUES (
            v_branch_id, 'League C', '', v_sat + (i * 7),
            '14:00', 'Rapid 10+5', 0, 6, 24, 'open', 'C'
        )
        ON CONFLICT (branch_id, tournament_date, name) DO NOTHING;
    END LOOP;
END$$;
