-- Migration 098: 3rd razryad and higher may register for League A
--
-- CONTEXT
-- -------
-- Migration 092 blocked students with 3rd razryad or higher from League B, but
-- the rating gate still kept anyone rated 800 or less out of League A. Those
-- students could only enter League C. On 2026-10-28, 52 students with 3rd+
-- razryad were rated 800 or less or had no rating.
--
-- Approved decision (Alex, 2026-10-28): "Students that have 3rd razryad should
-- be allowed to register in League A, regardless of rating."
--
-- Rules:
--   * razryad_rank(students.razryad) >= razryad_rank('3rd') (3rd / 2nd / 1st /
--     kms) skips the rating gate for League A only, including students with
--     no rating at all.
--   * League B gate (092), League C level gate (066), 'R' gate, weekly cap (094)
--     and every other check are unchanged. Such a student can still enter
--     League C only if their rating maps there (unchanged).
--   * Guests are unaffected (no razryad on file).
--
-- This rebuilds register_for_tournament from migration 094 VERBATIM, with ONE
-- change: the student rating gate reads students.razryad and does not reject a
-- 3rd+ razryad student for a League A tournament.
--
-- Idempotent — re-running this migration is safe.

BEGIN;

CREATE OR REPLACE FUNCTION public.register_for_tournament(p_tournament_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_player_name text DEFAULT NULL::text, p_source text DEFAULT 'web'::text, p_external_contact text DEFAULT NULL::text, p_guest_first_name text DEFAULT NULL::text, p_guest_last_name text DEFAULT NULL::text, p_guest_rating integer DEFAULT NULL::integer, p_guest_age integer DEFAULT NULL::integer, p_guest_phone text DEFAULT NULL::text, p_guest_email text DEFAULT NULL::text, p_force boolean DEFAULT FALSE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_capacity          INT;
    v_count             INT;
    v_status            TEXT;
    v_deadline          TIMESTAMPTZ;
    v_tournament_league TEXT;
    v_student_rating    INT;
    v_required_league   TEXT;
    v_student_level     INT;
    v_student_razryad   TEXT;
    v_registration_id   UUID;
    v_tournament        JSONB;
    v_source            TEXT;
    v_is_guest          BOOLEAN;
    v_first             TEXT;
    v_last              TEXT;
    v_phone             TEXT;
    v_email             TEXT;
    v_phone_digits      TEXT;
    v_full_name         TEXT;
    v_tournament_date   DATE;
    v_week_start        DATE;
    v_conflict          JSONB;
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
        -- Email is optional: only validate when supplied, otherwise store NULL.
        IF length(v_email) = 0 THEN
            v_email := NULL;
        ELSIF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
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

    SELECT capacity, status, registration_deadline, league, tournament_date
      INTO v_capacity, v_status, v_deadline, v_tournament_league, v_tournament_date
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
        -- Duplicate-guest check by normalized phone (digits only), scoped to this
        -- tournament. Phone is required, so this is a reliable key even when email
        -- is absent.
        v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
        IF EXISTS (
            SELECT 1
              FROM tournament_guest_contacts gc
              JOIN tournament_registrations tr ON tr.id = gc.registration_id
             WHERE tr.tournament_id = p_tournament_id
               AND regexp_replace(gc.phone, '[^0-9]', '', 'g') = v_phone_digits
        ) THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_guest');
        END IF;

        -- Titled ('R') tournaments: guests only via the admin override. A guest
        -- add without p_force (e.g. a bot self-registration path) is rejected.
        IF v_tournament_league = 'R' AND NOT p_force THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'guests_admin_only');
        END IF;

        -- League gate (only when both rating and tournament league are known).
        -- 'R' is not rating-derived, so skip the rating gate for it.
        -- No rating ⇒ skip: admin signs off at the door.
        IF p_guest_rating IS NOT NULL
           AND v_tournament_league IS NOT NULL
           AND v_tournament_league <> 'R' THEN
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

        -- Weekly cap (migration 094): one tournament per student per Mon–Sun
        -- week, across ALL branches and leagues. p_force (admin override) skips
        -- it so an admin can still add a second tournament by hand. COALESCE so
        -- an explicit NULL p_force cannot slip past the cap.
        IF NOT COALESCE(p_force, FALSE) THEN
            -- Serialise concurrent registrations for this student (released at
            -- transaction end) so two simultaneous requests for different
            -- tournaments in the same week cannot both pass the check below.
            PERFORM pg_advisory_xact_lock(
                hashtextextended('tournament_weekly_cap:' || p_student_id::text, 0)
            );

            v_week_start := date_trunc('week', v_tournament_date)::date;

            SELECT jsonb_build_object(
                       'id',         t.id,
                       'name',       t.name,
                       'date',       t.tournament_date,
                       'start_time', t.start_time
                   )
              INTO v_conflict
              FROM tournament_registrations tr
              JOIN tournaments t ON t.id = tr.tournament_id
             WHERE tr.student_id = p_student_id
               AND t.id <> p_tournament_id
               AND t.status <> 'cancelled'
               AND t.tournament_date >= v_week_start
               AND t.tournament_date <  v_week_start + 7
             ORDER BY t.tournament_date, t.start_time
             LIMIT 1;

            IF v_conflict IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'reason', 'weekly_limit',
                    'conflict_tournament', v_conflict,
                    'week_start', v_week_start
                );
            END IF;
        END IF;

        IF v_tournament_league = 'R' THEN
            -- Titled tournament: self-registration requires a razryad. Eligibility
            -- is read straight from students.razryad (any value != 'none').
            -- p_force (admin override) bypasses this gate entirely.
            IF NOT p_force THEN
                SELECT razryad
                  INTO v_student_razryad
                  FROM students
                 WHERE id = p_student_id;

                IF v_student_razryad IS NULL
                   OR v_student_razryad = 'none' THEN
                    RETURN jsonb_build_object(
                        'ok', false,
                        'reason', 'no_razryad',
                        'student_razryad', v_student_razryad
                    );
                END IF;
            END IF;
        ELSIF v_tournament_league IS NOT NULL THEN
            SELECT rating INTO v_student_rating
              FROM student_current_ratings
             WHERE student_id = p_student_id;

            v_required_league := calc_league_from_rating(COALESCE(v_student_rating, 0));

            -- League A razryad pass (migration 098): a student holding 3rd razryad
            -- or higher (razryad_rank >= 2) may register for League A whatever
            -- their rating (or with no rating). Pairs with the League B gate
            -- below, which blocks the same students from B.
            SELECT razryad INTO v_student_razryad
              FROM students
             WHERE id = p_student_id;

            IF v_required_league IS DISTINCT FROM v_tournament_league
               AND NOT (v_tournament_league = 'A'
                        AND razryad_rank(v_student_razryad) >= razryad_rank('3rd')) THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'reason', 'ineligible',
                    'student_rating', v_student_rating,
                    'student_league', v_required_league,
                    'tournament_league', v_tournament_league
                );
            END IF;

            -- League C level gate (migration 066).
            -- League C additionally requires students.current_level >= 2.
            -- NULL level is allowed (unknown = verified off-system, like walk-ins).
            IF v_tournament_league = 'C' THEN
                SELECT current_level INTO v_student_level
                  FROM students
                 WHERE id = p_student_id;

                IF v_student_level IS NOT NULL AND v_student_level < 2 THEN
                    RETURN jsonb_build_object(
                        'ok', false,
                        'reason', 'level_too_low',
                        'student_level', v_student_level,
                        'required_level', 2
                    );
                END IF;
            END IF;

            -- League B razryad gate (migration 092).
            -- League B is reserved for developing players: a student who already
            -- holds 3rd razryad or higher (3rd / 2nd / 1st / kms → razryad_rank >= 2)
            -- has outgrown League B and may not self-register for it. 'none' / '4th'
            -- / NULL (rank 0-1) remain eligible. The rating gate above still applies
            -- first. There is no admin force path on A/B/C self-registration, so no
            -- p_force check here (mirrors the existing League-C level gate).
            IF v_tournament_league = 'B' THEN
                SELECT razryad INTO v_student_razryad
                  FROM students
                 WHERE id = p_student_id;

                IF razryad_rank(v_student_razryad) >= razryad_rank('3rd') THEN
                    RETURN jsonb_build_object(
                        'ok', false,
                        'reason', 'razryad_too_high',
                        'student_razryad', v_student_razryad,
                        'tournament_league', 'B'
                    );
                END IF;
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
END$function$;

-- Preserve the post-069 security posture: anon + PUBLIC execute stay revoked;
-- only authenticated (admin dashboard) and service_role (edge function / bots).
REVOKE EXECUTE ON FUNCTION register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) TO authenticated, service_role;

COMMIT;
