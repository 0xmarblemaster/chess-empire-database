-- Migration: Add can_manage_app_access permission
-- Description: Replace can_view_all_students with can_manage_app_access permission
-- Date: 2025-11-02

-- Step 1: Add the new column
ALTER TABLE user_roles
ADD COLUMN IF NOT EXISTS can_manage_app_access BOOLEAN DEFAULT false;

-- Step 2: Set admin users to have app access permission
UPDATE user_roles
SET can_manage_app_access = true
WHERE role = 'admin';

-- Step 3: Update the SQL function to include the new column
CREATE OR REPLACE FUNCTION get_user_roles_with_emails()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    role TEXT,
    coach_id UUID,
    can_view_all_students BOOLEAN,
    can_edit_students BOOLEAN,
    can_manage_branches BOOLEAN,
    can_manage_coaches BOOLEAN,
    can_manage_app_access BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    email VARCHAR(255),
    coach_first_name TEXT,
    coach_last_name TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.id,
        ur.user_id,
        ur.role,
        ur.coach_id,
        ur.can_view_all_students,
        ur.can_edit_students,
        ur.can_manage_branches,
        ur.can_manage_coaches,
        ur.can_manage_app_access,
        ur.created_at,
        ur.updated_at,
        au.email::VARCHAR(255),
        c.first_name as coach_first_name,
        c.last_name as coach_last_name
    FROM user_roles ur
    LEFT JOIN auth.users au ON ur.user_id = au.id
    LEFT JOIN coaches c ON ur.coach_id = c.id
    ORDER BY ur.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_roles_with_emails() TO authenticated;

-- Verification queries (comment out when running)
-- SELECT * FROM user_roles WHERE can_manage_app_access = true;
-- SELECT * FROM get_user_roles_with_emails();
