-- Migration 050: Guest player registration (admin-only)
--
-- Adds a path for coaches/admins to register non-students (walk-ins, parents'
-- friends, kids from other schools) into a tournament via the admin dashboard.
--
-- Why a separate PII table:
--   tournament_registrations is in the supabase_realtime publication and has
--   public SELECT (the live roster on tournaments.html needs it). Putting
--   phone/email columns on that table would leak guest PII to every visitor.
--   Keep the public table display-safe; push PII into a locked side-table.
--
-- Public roster shows guests as "Firstname L." via the new display_name column.
-- The capacity meter stays truthful because guest rows still occupy seats.
--
-- The register_for_tournament RPC gains six optional guest parameters. The
-- existing student-path call sites keep working unchanged (back-compatible
-- via named defaults).
--
-- Idempotent — re-running this migration is safe.

-- ============================================================
-- 1. tournament_registrations — display_name for guests
-- ============================================================

-- student_id is already nullable (migration 044) — kept as a no-op safety net.
ALTER TABLE tournament_registrations
    ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE tournament_registrations
    ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN tournament_registrations.display_name IS
    'Display-safe "Firstname L." for guest registrations (student_id IS NULL). NULL for student rows.';

-- ============================================================
-- 2. tournament_guest_contacts — private PII side-table
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_guest_contacts (
    registration_id UUID PRIMARY KEY REFERENCES tournament_registrations(id) ON DELETE CASCADE,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    rating      INT,                                    -- nullable: rating is optional
    age         INT NOT NULL CHECK (age BETWEEN 4 AND 99),
    phone       TEXT NOT NULL,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tgc_names_nonblank
        CHECK (length(trim(first_name)) > 0 AND length(trim(last_name)) > 0),
    CONSTRAINT tgc_email_format
        CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT tgc_phone_format
        CHECK (phone ~ '^\+?[0-9 ()\-]{7,20}$'),
    CONSTRAINT tgc_rating_range
        CHECK (rating IS NULL OR rating BETWEEN 0 AND 3500)
);

CREATE INDEX IF NOT EXISTS tgc_email_idx
    ON tournament_guest_contacts (lower(email));

-- RLS: authenticated coaches/admins read; anon denied. Writes only via the
-- SECURITY DEFINER RPC below — no policies for INSERT/UPDATE/DELETE.
ALTER TABLE tournament_guest_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tgc_read_authenticated ON tournament_guest_contacts;
CREATE POLICY tgc_read_authenticated
    ON tournament_guest_contacts
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================
-- 3. register_for_tournament — guest-aware signature
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
    v_display_name      TEXT;
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
        v_display_name := v_first || ' ' || upper(left(v_last, 1)) || '.';

        INSERT INTO tournament_registrations
            (tournament_id, student_id, player_name, display_name, source, external_contact)
        VALUES (
            p_tournament_id,
            NULL,
            v_first || ' ' || v_last,
            v_display_name,
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

-- Drop the old 5-arg overload so PostgREST dispatches to the new signature only.
DROP FUNCTION IF EXISTS register_for_tournament(UUID, UUID, TEXT, TEXT, TEXT);

GRANT EXECUTE ON FUNCTION
    register_for_tournament(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT)
    TO anon, authenticated, service_role;
