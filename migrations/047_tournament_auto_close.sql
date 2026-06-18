-- Migration 047: Tournament Auto-Close (time-based)
--
-- Adds close_expired_tournaments() — bulk transition of `open` tournaments
-- to `closed` when ANY of the following is true (Asia/Almaty time):
--   1. tournament_date < today
--   2. registration_deadline IS NOT NULL AND NOW() > registration_deadline
--   3. start_time IS NOT NULL AND (tournament_date + start_time) has passed
--
-- Manual `cancelled` status is NEVER overwritten — only `open` rows flip.
--
-- Schedules a pg_cron job (every 5 minutes) when the extension is present,
-- otherwise emits a RAISE NOTICE explaining the manual fallback. Also extends
-- register_for_tournament to apply the same three-condition gate so a race
-- can't slip a registration past the cut-off between cron ticks.
--
-- Idempotent — re-running this migration is safe.

-- ============================================================
-- 1. close_expired_tournaments() — bulk auto-close
-- ============================================================

CREATE OR REPLACE FUNCTION close_expired_tournaments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE tournaments
           SET status = 'closed'
         WHERE status = 'open'
           AND (
                  tournament_date < (NOW() AT TIME ZONE 'Asia/Almaty')::DATE
               OR (registration_deadline IS NOT NULL AND NOW() > registration_deadline)
               OR (
                      start_time IS NOT NULL
                      AND ((tournament_date + start_time) AT TIME ZONE 'Asia/Almaty') <= NOW()
                  )
           )
         RETURNING 1
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END$$;

GRANT EXECUTE ON FUNCTION close_expired_tournaments()
    TO anon, authenticated, service_role;

COMMENT ON FUNCTION close_expired_tournaments() IS
    'Auto-closes open tournaments whose date passed, registration deadline passed, or start time has elapsed (Asia/Almaty). Returns the number of rows updated. Never touches cancelled rows.';

-- ============================================================
-- 2. register_for_tournament — apply the auto-close gate
-- ============================================================
--
-- Pre-checks the same three conditions as close_expired_tournaments() after
-- the FOR UPDATE lock, lazy-closes the row, and returns reason='closed'
-- (or the existing 'deadline_passed' for the deadline path). All other
-- reasons — not_found / full / duplicate / invalid_input — preserved from
-- migration 045.

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
    v_tournament_date DATE;
    v_start_time      TIME;
    v_today_almaty    DATE;
    v_registration_id UUID;
    v_tournament      JSONB;
    v_source          TEXT;
BEGIN
    IF p_student_id IS NULL AND (p_player_name IS NULL OR length(trim(p_player_name)) = 0) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;

    v_source := COALESCE(p_source, 'web');
    IF v_source NOT IN ('web','telegram','whatsapp','online','admin') THEN
        v_source := 'web';
    END IF;

    SELECT capacity, status, registration_deadline, tournament_date, start_time
      INTO v_capacity, v_status, v_deadline, v_tournament_date, v_start_time
      FROM tournaments
     WHERE id = p_tournament_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    IF v_status <> 'open' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    -- Time-based auto-close gate (date passed OR start_time elapsed today).
    v_today_almaty := (NOW() AT TIME ZONE 'Asia/Almaty')::DATE;
    IF v_tournament_date < v_today_almaty
       OR (v_start_time IS NOT NULL
           AND ((v_tournament_date + v_start_time) AT TIME ZONE 'Asia/Almaty') <= NOW())
    THEN
        UPDATE tournaments SET status = 'closed' WHERE id = p_tournament_id;
        RETURN jsonb_build_object('ok', false, 'reason', 'closed');
    END IF;

    -- Deadline check — preserved from migration 045.
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

-- ============================================================
-- 3. pg_cron schedule (every 5 minutes) — guarded + idempotent
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Drop any prior copy of the job so re-running this migration is safe.
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'tournament_auto_close_5min';

        PERFORM cron.schedule(
            'tournament_auto_close_5min',
            '*/5 * * * *',
            $cron$SELECT close_expired_tournaments();$cron$
        );
        RAISE NOTICE 'Scheduled pg_cron job tournament_auto_close_5min (every 5 minutes)';
    ELSE
        RAISE NOTICE
            'pg_cron extension not installed — close_expired_tournaments() will not auto-run. '
            'Either install pg_cron (CREATE EXTENSION pg_cron; as superuser), or call '
            'SELECT close_expired_tournaments(); from an external scheduler.';
    END IF;
END$$;

-- ============================================================
-- 4. Initial backfill — close already-expired rows once now.
-- ============================================================

SELECT close_expired_tournaments();
