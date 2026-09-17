-- Migration 087: Tournament Management toggle in App Access
-- =========================================================
-- Two changes, both about the can_manage_tournaments permission:
--
--   1. get_user_roles_with_emails() did not return can_manage_tournaments,
--      so the App Access permission grid (crud-management.js) had no way to
--      display or drive a Tournament Management toggle. Recreate the function
--      with the column added (return type changes → DROP + CREATE).
--
--   2. Migration 058 installed sync_ratings_tournaments_permissions_trg which
--      kept can_manage_ratings and can_manage_tournaments in lockstep on every
--      write. Alex confirmed the two dashboards are independent now, so drop
--      that trigger (and its function) — flipping one flag must not flip the
--      other. The 060/062 default_coach_ratings_permission_trg auto-grant is
--      left untouched (new coaches still get both flags on creation).
--
-- RLS is deliberately not changed: tournaments_uploads / tournament_results /
-- rating_uploads accepting ratings OR tournaments permission is intentional.
-- =========================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Recreate get_user_roles_with_emails with can_manage_tournaments
-- ------------------------------------------------------------
-- Return type changes, so the old function must be dropped first. Settings
-- preserved exactly as the live definition: SECURITY DEFINER, plpgsql, no
-- explicit search_path. can_manage_tournaments is placed right after
-- can_manage_ratings to match the "Ещё" menu / permission-grid order.
DROP FUNCTION IF EXISTS get_user_roles_with_emails();

CREATE OR REPLACE FUNCTION get_user_roles_with_emails()
RETURNS TABLE (
    user_id UUID,
    role TEXT,
    email VARCHAR(255),
    coach_id UUID,
    coach_first_name TEXT,
    coach_last_name TEXT,
    can_view_all_students BOOLEAN,
    can_edit_students BOOLEAN,
    can_manage_branches BOOLEAN,
    can_manage_coaches BOOLEAN,
    can_manage_app_access BOOLEAN,
    can_manage_ratings BOOLEAN,
    can_manage_tournaments BOOLEAN,
    can_manage_data BOOLEAN,
    can_manage_attendance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.user_id,
        ur.role,
        au.email,
        ur.coach_id,
        c.first_name AS coach_first_name,
        c.last_name AS coach_last_name,
        ur.can_view_all_students,
        ur.can_edit_students,
        ur.can_manage_branches,
        ur.can_manage_coaches,
        COALESCE(ur.can_manage_app_access, FALSE) AS can_manage_app_access,
        COALESCE(ur.can_manage_ratings, FALSE) AS can_manage_ratings,
        COALESCE(ur.can_manage_tournaments, FALSE) AS can_manage_tournaments,
        COALESCE(ur.can_manage_data, FALSE) AS can_manage_data,
        COALESCE(ur.can_manage_attendance, FALSE) AS can_manage_attendance
    FROM user_roles ur
    JOIN auth.users au ON ur.user_id = au.id
    LEFT JOIN coaches c ON ur.coach_id = c.id
    ORDER BY ur.role ASC, au.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_roles_with_emails() TO authenticated;

-- ------------------------------------------------------------
-- 2. Decouple ratings/tournaments — drop the migration-058 sync trigger
-- ------------------------------------------------------------
-- default_coach_ratings_permission_trg (060/062) is NOT touched. The sync
-- function is used only by this trigger, so drop it too.
DROP TRIGGER IF EXISTS sync_ratings_tournaments_permissions_trg ON user_roles;
DROP FUNCTION IF EXISTS sync_ratings_tournaments_permissions();

COMMIT;
