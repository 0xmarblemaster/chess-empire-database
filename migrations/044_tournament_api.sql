-- Migration 044: Public Tournament Registration API
--
-- Extends tournament_registrations (added in 043) to support two registration
-- paths: link to an existing students row, OR free-text player_name for players
-- not in the DB (used by bots / online-students website).
--
-- Also rewrites register_for_tournament with named-default arguments so that:
--   - bots can pass {p_tournament_id, p_player_name, p_source, p_external_contact}
--   - the existing public tournaments page keeps working with its 2-arg call
--     supabase.rpc('register_for_tournament', { p_tournament_id, p_student_id })
--     — PostgREST resolves by named args, and the unmentioned params fall back
--     to their defaults.
--
-- Idempotent — re-running this migration is safe.

-- ============================================================
-- 1. tournament_registrations — manual-entry columns
-- ============================================================

-- Drop the NOT NULL on student_id so manual entries (player_name only) work.
ALTER TABLE tournament_registrations
    ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE tournament_registrations
    ADD COLUMN IF NOT EXISTS player_name      TEXT,
    ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'web',
    ADD COLUMN IF NOT EXISTS external_contact TEXT;

-- Source whitelist — drop+add so re-runs reflect any future additions.
ALTER TABLE tournament_registrations DROP CONSTRAINT IF EXISTS tournament_registrations_source_check;
ALTER TABLE tournament_registrations
    ADD CONSTRAINT tournament_registrations_source_check
    CHECK (source IN ('web','telegram','whatsapp','online','admin'));

-- Identity guard: at least one of student_id / player_name must be set. Both
-- set together is allowed (an admin may attach a free-text label to a known
-- student) but the empty row is rejected.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reg_identity_chk'
    ) THEN
        ALTER TABLE tournament_registrations
            ADD CONSTRAINT reg_identity_chk
            CHECK (student_id IS NOT NULL OR player_name IS NOT NULL);
    END IF;
END$$;

-- ============================================================
-- 2. register_for_tournament — new signature with defaults
-- ============================================================

-- Drop the legacy 2-arg overload so PostgREST has a single function to dispatch
-- to. The new signature covers the 2-arg call via defaults.
DROP FUNCTION IF EXISTS register_for_tournament(UUID, UUID);

CREATE OR REPLACE FUNCTION register_for_tournament(
    p_tournament_id    UUID,
    p_student_id       UUID DEFAULT NULL,
    p_player_name      TEXT DEFAULT NULL,
    p_source           TEXT DEFAULT 'web',
    p_external_contact TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_capacity        INT;
    v_count           INT;
    v_status          TEXT;
    v_registration_id UUID;
    v_tournament      JSONB;
    v_source          TEXT;
BEGIN
    -- Identity validation — exactly the API surface check, mirrored in SQL so
    -- direct RPC callers can't bypass it.
    IF p_student_id IS NULL AND (p_player_name IS NULL OR length(trim(p_player_name)) = 0) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;

    -- Coerce unknown source values back to 'web' so the CHECK constraint
    -- doesn't surface as a generic 23514.
    v_source := COALESCE(p_source, 'web');
    IF v_source NOT IN ('web','telegram','whatsapp','online','admin') THEN
        v_source := 'web';
    END IF;

    SELECT capacity, status INTO v_capacity, v_status
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
        RETURN jsonb_build_object(
            'ok', false, 'reason', 'full',
            'registered_count', v_count, 'capacity', v_capacity
        );
    END IF;

    -- Surface duplicate as a clean enum (the UNIQUE index would otherwise
    -- raise a generic 23505).
    IF p_student_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM tournament_registrations
             WHERE tournament_id = p_tournament_id AND student_id = p_student_id
        ) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
        END IF;
    END IF;

    INSERT INTO tournament_registrations
        (tournament_id, student_id, player_name, source, external_contact)
    VALUES (
        p_tournament_id,
        p_student_id,
        CASE WHEN p_student_id IS NULL THEN trim(p_player_name) ELSE NULL END,
        v_source,
        p_external_contact
    )
    RETURNING id INTO v_registration_id;

    -- Auto-close on last seat.
    IF v_count + 1 >= v_capacity THEN
        UPDATE tournaments SET status = 'closed' WHERE id = p_tournament_id;
        v_status := 'closed';
    END IF;

    SELECT jsonb_build_object(
        'id',          id,
        'name',        name,
        'date',        tournament_date,
        'start_time',  start_time,
        'time_format', time_format
    ) INTO v_tournament
      FROM tournaments
     WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'ok',               true,
        'registration_id',  v_registration_id,
        'registered_count', v_count + 1,
        'capacity',         v_capacity,
        'status',           v_status,
        'tournament',       v_tournament
    );
END$$;

GRANT EXECUTE ON FUNCTION
    register_for_tournament(UUID, UUID, TEXT, TEXT, TEXT)
    TO anon, authenticated, service_role;
