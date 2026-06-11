-- Migration 045: Tournament Registration Deadline
--
-- Adds an optional `registration_deadline TIMESTAMPTZ` to tournaments and
-- teaches register_for_tournament to reject (and lazy-close) past-deadline
-- attempts.
--
-- NULL deadline = no time-based constraint (current behavior preserved).
-- Non-NULL deadline = registration auto-closes when NOW() > deadline on the
-- next registration attempt; the public page also disables the button
-- client-side from the same timestamp + a 60s re-render.
--
-- Idempotent — re-running this migration is safe.

-- ============================================================
-- 1. Column
-- ============================================================

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ NULL;

COMMENT ON COLUMN tournaments.registration_deadline IS
    'Optional absolute cut-off for public registration. NULL = no time-based close (capacity + manual status still apply).';

-- ============================================================
-- 2. register_for_tournament — deadline-aware
-- ============================================================

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
    v_deadline        TIMESTAMPTZ;
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

    SELECT capacity, status, registration_deadline
      INTO v_capacity, v_status, v_deadline
      FROM tournaments
     WHERE id = p_tournament_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    IF v_status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    -- Deadline check — lazy auto-close. Runs before capacity so a single user
    -- can't slip in past the cutoff just because seats remain.
    IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
        UPDATE tournaments SET status = 'closed' WHERE id = p_tournament_id;
        RETURN jsonb_build_object('ok', false, 'reason', 'deadline_passed');
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
