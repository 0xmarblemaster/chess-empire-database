-- ============================================
-- Migration: Add can_manage_app_access permission
-- Description: Add can_manage_app_access column and update get_user_roles_with_emails function
-- Date: 2025-11-02
-- ============================================

-- IMPORTANT: Run this entire file in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste this → Run

-- Step 1: Add the new column to user_roles table
ALTER TABLE user_roles
ADD COLUMN IF NOT EXISTS can_manage_app_access BOOLEAN DEFAULT false;

-- Step 2: Set admin users to have app access permission by default
UPDATE user_roles
SET can_manage_app_access = true
WHERE role = 'admin';

-- Step 3: Create or replace the get_user_roles_with_emails function
-- This function is used to fetch all users with their emails and permissions
-- for the App Access management interface
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

-- Step 4: Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_roles_with_emails() TO authenticated;

-- Step 5: Verification queries
-- Uncomment these to verify the migration worked correctly:

-- Check that the column was added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_roles' AND column_name = 'can_manage_app_access';

-- Check admin users have the permission:
-- SELECT user_id, role, can_manage_app_access
-- FROM user_roles
-- WHERE role = 'admin';

-- Test the function:
-- SELECT * FROM get_user_roles_with_emails();

-- ============================================
-- Migration Complete!
-- ============================================
-- After running this:
-- 1. Refresh the admin.html page
-- 2. Toggle any user permission
-- 3. Refresh the page again
-- 4. The permission should remain set
-- ============================================
