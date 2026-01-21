-- Migration: Add management dashboard permissions
-- Date: 2026-01-21
-- Description: Adds permissions for Ratings Management, Data Management, and Attendance dashboards

-- Add new permission columns to user_roles table
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_manage_ratings BOOLEAN DEFAULT FALSE;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_manage_data BOOLEAN DEFAULT FALSE;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_manage_attendance BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN user_roles.can_manage_ratings IS 'Permission to access the Ratings Management dashboard';
COMMENT ON COLUMN user_roles.can_manage_data IS 'Permission to access the Data Management dashboard (import/export)';
COMMENT ON COLUMN user_roles.can_manage_attendance IS 'Permission to access the Attendance tracking dashboard';

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_user_roles_with_emails();

-- Update the get_user_roles_with_emails function to include new permissions
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
        COALESCE(ur.can_manage_data, FALSE) AS can_manage_data,
        COALESCE(ur.can_manage_attendance, FALSE) AS can_manage_attendance
    FROM user_roles ur
    JOIN auth.users au ON ur.user_id = au.id
    LEFT JOIN coaches c ON ur.coach_id = c.id
    ORDER BY ur.role ASC, au.email ASC;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_user_roles_with_emails() TO authenticated;
