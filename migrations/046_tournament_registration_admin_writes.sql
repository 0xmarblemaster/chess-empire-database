-- Migration 046: Admin writes for tournament_registrations
--
-- Background: tournament_registrations has RLS enabled with only a SELECT
-- policy (migration 043). Direct DELETEs from the client silently succeed
-- (PostgREST returns error=null with 0 rows affected) because no DELETE
-- policy exists. This broke the "remove registration" admin action.
--
-- Fix: SECURITY DEFINER RPC the admin UI calls, mirroring the pattern used
-- by register_for_tournament (migrations 044/045). The function:
--   1. Deletes the registration row
--   2. Returns not_found if the row was already gone
--   3. Re-opens the tournament if freeing a seat brings the registration
--      count back below capacity AND the registration_deadline hasn't
--      passed (so deadline-driven closes stay closed)
--
-- Granted to `authenticated` to match register_for_tournament. UI gating
-- is responsible for restricting access to admins.
--
-- Idempotent — re-running this migration is safe.

CREATE OR REPLACE FUNCTION admin_remove_tournament_registration(
    p_registration_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tournament_id UUID;
    v_capacity      INT;
    v_count         INT;
    v_deadline      TIMESTAMPTZ;
BEGIN
    DELETE FROM tournament_registrations
     WHERE id = p_registration_id
    RETURNING tournament_id INTO v_tournament_id;

    IF v_tournament_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    SELECT capacity, registration_deadline
      INTO v_capacity, v_deadline
      FROM tournaments
     WHERE id = v_tournament_id;

    SELECT COUNT(*) INTO v_count
      FROM tournament_registrations
     WHERE tournament_id = v_tournament_id;

    -- If a seat freed up and the tournament was auto-closed due to capacity
    -- (status='closed'), re-open it. Skip if the deadline has passed — a
    -- deadline-driven close must stay closed.
    IF v_count < v_capacity THEN
        UPDATE tournaments
           SET status = 'open'
         WHERE id = v_tournament_id
           AND status = 'closed'
           AND (v_deadline IS NULL OR NOW() <= v_deadline);
    END IF;

    RETURN jsonb_build_object(
        'ok',            true,
        'tournament_id', v_tournament_id,
        'count',         v_count,
        'capacity',      v_capacity
    );
END$$;

GRANT EXECUTE ON FUNCTION admin_remove_tournament_registration(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION admin_remove_tournament_registration(UUID) FROM anon;

COMMENT ON FUNCTION admin_remove_tournament_registration(UUID) IS
    'Admin: delete a tournament_registrations row. SECURITY DEFINER. Re-opens the tournament if seat freed and deadline not passed.';
