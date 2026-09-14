-- Migration 084: Titled Tournament ("Турнир Разрядников") — league code 'R'
--
-- CONTEXT (tasks/titled-tournament-spec.md)
-- -----------------------------------------
-- A new tournament type keyed off the existing `tournaments.league` column with
-- code 'R'. Only students who hold a razryad may self-register.
--
-- Approved decisions:
--   1. Guests: only admins may add guests to 'R' tournaments. Guest
--      self-registration paths are blocked (reason 'guests_admin_only').
--   2. Students: a student with razryad != 'none' may self-register. Eligibility
--      is read straight from students.razryad; there is no confirmation step.
--      Manually-entered razryads count the same as system-detected ones. Others
--      are rejected with reason 'no_razryad'.
--   3. Admin override: admins force-register ANYONE (students without razryad,
--      guests alike) via the new p_force flag, which bypasses the 'R' gate.
--      The gate applies to self-registration paths only; force bypasses it
--      explicitly (not accidentally).
--
-- Idempotent — re-running this migration is safe.

BEGIN;

-- ============================================================
-- 1. tournaments.league — allow 'R'
-- ============================================================
-- The original CHECK (migration 035) allowed only ('A','B','C'); the admin form
-- has long offered 'A+' too. Rebuild the constraint idempotently so it reflects
-- the full set the app uses plus the new 'R'. league stays nullable (043).
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_league_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_league_check
    CHECK (league IS NULL OR league IN ('A+', 'A', 'B', 'C', 'R'));

-- ============================================================
-- 2. register_for_tournament — league 'R' gate + p_force override
-- ============================================================
-- Based on migration 070. New: a trailing p_force BOOLEAN (default FALSE) that
-- lets the admin dashboard force-register anyone into an 'R' tournament, and a
-- league='R' eligibility branch. A/B/C behavior is untouched: the rating gate
-- and the League-C level gate run exactly as before and ignore p_force.
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

            IF v_required_league IS DISTINCT FROM v_tournament_league THEN
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

-- Drop the old 11-arg overload so PostgREST dispatches to the new 12-arg
-- signature only.
DROP FUNCTION IF EXISTS register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT
);

-- Preserve the post-069 security posture: anon + PUBLIC execute stay revoked;
-- only authenticated (admin dashboard) and service_role (edge function / bots).
REVOKE EXECUTE ON FUNCTION register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN
) TO authenticated, service_role;

COMMIT;
