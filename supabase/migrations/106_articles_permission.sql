-- Migration 106: Article Management permission
-- =========================================================
-- Adds user_roles.can_manage_articles, the per-user flag that gates the
-- «Статьи» section (articles-admin.js / admin-v2.js updateMenuVisibility).
-- It is granted in App Access (crud-management.js) like the other toggles.
--
--   1. ADD COLUMN can_manage_articles BOOLEAN NOT NULL DEFAULT false.
--   2. Recreate get_user_roles_with_emails() (definition from 087) with the
--      new column so the App Access grid can display and drive the toggle.
--      Return type changes → DROP + CREATE.
--   3. Backfill: current admins keep access (can_manage_articles = true).
--      No auto-grant trigger — coaches only get it when explicitly granted.
-- =========================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Column
-- ------------------------------------------------------------
ALTER TABLE user_roles
    ADD COLUMN IF NOT EXISTS can_manage_articles BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_roles.can_manage_articles IS 'Permission to manage chessempire.kz articles from the dashboard';

-- ------------------------------------------------------------
-- 2. Recreate get_user_roles_with_emails with can_manage_articles
-- ------------------------------------------------------------
-- Settings preserved exactly as 087: SECURITY DEFINER, plpgsql, no explicit
-- search_path. can_manage_articles is placed right after
-- can_manage_tournaments to match the sidebar / permission-grid order.
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
    can_manage_articles BOOLEAN,
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
        COALESCE(ur.can_manage_articles, FALSE) AS can_manage_articles,
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
-- 3. Backfill — current admins keep access
-- ------------------------------------------------------------
UPDATE user_roles
SET can_manage_articles = true
WHERE role = 'admin'
  AND can_manage_articles = false;

COMMIT;
