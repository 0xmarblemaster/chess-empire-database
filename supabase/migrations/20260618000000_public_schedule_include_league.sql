-- Migration: include `league` in get_public_tournament_schedule output
--
-- The public tournament schedule RPC returns a JSONB document consumed by
-- tournaments.js. The display layer now composes localized titles from
-- (league, branch) instead of rendering the raw stored `name`, so the RPC
-- must surface the `league` column to the client.
--
-- Re-creates the function with one extra field in the inner
-- jsonb_build_object — `'league', tw.league`. Everything else is identical
-- to supabase/migrations/20260612120000_get_public_tournament_schedule.sql.
--
-- Idempotent — CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.get_public_tournament_schedule()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH t_with_count AS (
        SELECT
            t.id,
            t.branch_id,
            t.name,
            t.league,
            t.info,
            t.tournament_date,
            t.start_time,
            t.time_format,
            t.registration_fee,
            t.rounds,
            t.capacity,
            t.status,
            t.registration_deadline,
            COUNT(tr.id)::INT AS registration_count
        FROM tournaments t
        LEFT JOIN tournament_registrations tr
               ON tr.tournament_id = t.id
        WHERE t.tournament_date >= CURRENT_DATE
        GROUP BY t.id
    ),
    branch_tournaments AS (
        SELECT
            tw.branch_id,
            jsonb_agg(
                jsonb_build_object(
                    'id',                    tw.id,
                    'branch_id',             tw.branch_id,
                    'name',                  tw.name,
                    'league',                tw.league,
                    'info',                  tw.info,
                    'tournament_date',       tw.tournament_date,
                    'start_time',            tw.start_time,
                    'time_format',           tw.time_format,
                    'registration_fee',      tw.registration_fee,
                    'rounds',                tw.rounds,
                    'capacity',              tw.capacity,
                    'status',                tw.status,
                    'registration_deadline', tw.registration_deadline,
                    'registration_count',    tw.registration_count
                )
                ORDER BY tw.tournament_date ASC
            ) AS tournaments
        FROM t_with_count tw
        GROUP BY tw.branch_id
    )
    SELECT jsonb_build_object(
        'branches',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id',                   b.id,
                    'name',                 b.name,
                    'upcoming_tournaments', COALESCE(bt.tournaments, '[]'::jsonb)
                )
                ORDER BY b.name ASC
            ),
            '[]'::jsonb
        )
    )
    FROM branches b
    LEFT JOIN branch_tournaments bt ON bt.branch_id = b.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_tournament_schedule() TO anon, authenticated;
