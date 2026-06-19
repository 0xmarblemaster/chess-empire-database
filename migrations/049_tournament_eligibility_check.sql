-- Migration 049: Tournament League Eligibility Check
--
-- Enforces that a student can only register for a tournament whose `league`
-- matches the league derived from their current rating, per:
--   League C : rating < 450
--   League B : 450 <= rating <= 800
--   League A : rating > 800
--
-- Helper `calc_league_from_rating(INTEGER)` (migration 038) implements those
-- thresholds and is reused as the single source of truth.
--
-- Semantics:
--   * Walk-in / external players (p_student_id IS NULL, p_player_name provided)
--     skip the rating check — they're verified off-system by an admin.
--   * Students with no rating yet (NULL in student_current_ratings) are treated
--     as rating 0, i.e. League C only.
--   * Tournaments with league IS NULL (legacy / custom titles) skip the check.
--
-- New rejection reason returned in JSONB:
--   { ok: false, reason: 'ineligible',
--     student_rating: <int|null>,
--     student_league: 'A'|'B'|'C',
--     tournament_league: 'A'|'B'|'C' }
--
-- Idempotent — re-running this migration is safe.

CREATE OR REPLACE FUNCTION register_for_tournament(
    p_tournament_id    UUID,
    p_student_id       UUID DEFAULT NULL,
    p_player_name      TEXT DEFAULT NULL,
    p_source           TEXT DEFAULT 'web',
    p_external_contact TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_capacity         INT;
    v_count            INT;
    v_status           TEXT;
    v_deadline         TIMESTAMPTZ;
    v_tournament_league TEXT;
    v_student_rating   INT;
    v_required_league  TEXT;
    v_registration_id  UUID;
    v_tournament       JSONB;
    v_source           TEXT;
BEGIN
    IF p_student_id IS NULL AND (p_player_name IS NULL OR length(trim(p_player_name)) = 0) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;

    v_source := COALESCE(p_source, 'web');
    IF v_source NOT IN ('web','telegram','whatsapp','online','admin') THEN
        v_source := 'web';
    END IF;

    SELECT capacity, status, registration_deadline, league
      INTO v_capacity, v_status, v_deadline, v_tournament_league
      FROM tournaments
     WHERE id = p_tournament_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    IF v_status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

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

        -- League eligibility check.
        -- Skipped when the tournament has no league tag (legacy / custom).
        -- Walk-in registrations (p_student_id IS NULL) bypass entirely.
        IF v_tournament_league IS NOT NULL THEN
            SELECT rating INTO v_student_rating
              FROM student_current_ratings
             WHERE student_id = p_student_id;

            v_required_league := calc_league_from_rating(COALESCE(v_student_rating, 0));

            IF v_required_league IS DISTINCT FROM v_tournament_league THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'reason', 'ineligible',
                    'student_rating', v_student_rating,
                    'student_league', v_required_league,
                    'tournament_league', v_tournament_league
                );
            END IF;
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
