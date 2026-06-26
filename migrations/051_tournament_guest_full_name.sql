-- Migration 051: Show full guest name on public roster
--
-- Migration 050 stored an abbreviated "Firstname L." in
-- tournament_registrations.display_name to keep guest surnames off the public
-- tournaments.html roster. The school owner wants full guest names on the
-- public roster (same shape as student rows), so this migration:
--
--   1. Replaces register_for_tournament so the guest path writes the full
--      "Firstname Lastname" into display_name (matching player_name).
--   2. Backfills existing guest rows by mirroring player_name into display_name.
--   3. Updates the display_name column COMMENT to reflect the new semantics.
--
-- PII (phone/email/age) stays in the locked tournament_guest_contacts table;
-- only the surname's visibility on the public roster changes here.
--
-- Idempotent — CREATE OR REPLACE + backfill guarded by IS DISTINCT FROM.

-- ============================================================
-- 1. Column comment — new semantics
-- ============================================================

COMMENT ON COLUMN tournament_registrations.display_name IS
    'Public display name for guest registrations (student_id IS NULL): full "Firstname Lastname". NULL for student rows (rendered from students.first_name + last_name).';

-- ============================================================
-- 2. register_for_tournament — full name in display_name
-- ============================================================

CREATE OR REPLACE FUNCTION register_for_tournament(
    p_tournament_id    UUID,
    p_student_id       UUID DEFAULT NULL,
    p_player_name      TEXT DEFAULT NULL,
    p_source           TEXT DEFAULT 'web',
    p_external_contact TEXT DEFAULT NULL,
    p_guest_first_name TEXT DEFAULT NULL,
    p_guest_last_name  TEXT DEFAULT NULL,
    p_guest_rating     INT  DEFAULT NULL,
    p_guest_age        INT  DEFAULT NULL,
    p_guest_phone      TEXT DEFAULT NULL,
    p_guest_email      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_capacity          INT;
    v_count             INT;
    v_status            TEXT;
    v_deadline          TIMESTAMPTZ;
    v_tournament_league TEXT;
    v_student_rating    INT;
    v_required_league   TEXT;
    v_registration_id   UUID;
    v_tournament        JSONB;
    v_source            TEXT;
    v_is_guest          BOOLEAN;
    v_first             TEXT;
    v_last              TEXT;
    v_phone             TEXT;
    v_email             TEXT;
    v_full_name         TEXT;
BEGIN
    -- Detect path: guest (admin-supplied first name + student_id IS NULL) vs student.
    v_is_guest := (p_student_id IS NULL AND p_guest_first_name IS NOT NULL);

    IF v_is_guest THEN
        v_first := trim(COALESCE(p_guest_first_name, ''));
        v_last  := trim(COALESCE(p_guest_last_name, ''));
        v_phone := trim(COALESCE(p_guest_phone, ''));
        v_email := lower(trim(COALESCE(p_guest_email, '')));

        IF length(v_first) = 0 THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'first_name');
        END IF;
        IF length(v_last) = 0 THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'last_name');
        END IF;
        IF p_guest_age IS NULL OR p_guest_age < 4 OR p_guest_age > 99 THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'age');
        END IF;
        IF length(v_phone) = 0 OR v_phone !~ '^\+?[0-9 ()\-]{7,20}$' THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'phone');
        END IF;
        IF length(v_email) = 0 OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'email');
        END IF;
        IF p_guest_rating IS NOT NULL
           AND (p_guest_rating < 0 OR p_guest_rating > 3500) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input', 'field', 'rating');
        END IF;
    ELSIF p_student_id IS NULL
          AND (p_player_name IS NULL OR length(trim(p_player_name)) = 0) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;

    -- Coerce unknown source values back to 'web'.
    v_source := COALESCE(p_source, 'web');
    IF v_is_guest THEN
        v_source := 'admin';
    ELSIF v_source NOT IN ('web','telegram','whatsapp','online','admin') THEN
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

    IF v_is_guest THEN
        -- Case-insensitive duplicate-email check, scoped to this tournament.
        IF EXISTS (
            SELECT 1
              FROM tournament_guest_contacts gc
              JOIN tournament_registrations tr ON tr.id = gc.registration_id
             WHERE tr.tournament_id = p_tournament_id
               AND lower(gc.email) = v_email
        ) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_guest');
        END IF;

        -- League gate (only when both rating and tournament league are known).
        -- No rating ⇒ skip: admin signs off at the door.
        IF p_guest_rating IS NOT NULL AND v_tournament_league IS NOT NULL THEN
            v_required_league := calc_league_from_rating(p_guest_rating);
            IF v_required_league IS DISTINCT FROM v_tournament_league THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'reason', 'ineligible',
                    'student_rating', p_guest_rating,
                    'student_league', v_required_league,
                    'tournament_league', v_tournament_league
                );
            END IF;
        END IF;
    ELSIF p_student_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM tournament_registrations
             WHERE tournament_id = p_tournament_id AND student_id = p_student_id
        ) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
        END IF;

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

    IF v_is_guest THEN
        v_full_name := v_first || ' ' || v_last;

        INSERT INTO tournament_registrations
            (tournament_id, student_id, player_name, display_name, source, external_contact)
        VALUES (
            p_tournament_id,
            NULL,
            v_full_name,
            v_full_name,
            v_source,
            NULL
        )
        RETURNING id INTO v_registration_id;

        INSERT INTO tournament_guest_contacts
            (registration_id, first_name, last_name, rating, age, phone, email)
        VALUES (
            v_registration_id, v_first, v_last, p_guest_rating, p_guest_age, v_phone, v_email
        );
    ELSE
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
    END IF;

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
    register_for_tournament(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT)
    TO anon, authenticated, service_role;

-- ============================================================
-- 3. Backfill existing guest rows
-- ============================================================

-- Guest rows already store the full "Firstname Lastname" in player_name; mirror
-- it into display_name. IS DISTINCT FROM keeps the UPDATE idempotent.
UPDATE tournament_registrations
   SET display_name = player_name
 WHERE student_id IS NULL
   AND player_name IS NOT NULL
   AND length(trim(player_name)) > 0
   AND display_name IS DISTINCT FROM player_name;
