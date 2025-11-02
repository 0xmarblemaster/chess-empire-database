-- ============================================
-- Verification Queries
-- Run these in Supabase SQL Editor to verify the migration worked
-- ============================================

-- 1. Check if can_manage_app_access column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_roles'
AND column_name = 'can_manage_app_access';

-- Expected: Should return 1 row showing the column exists

-- 2. Check all columns in user_roles table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_roles'
ORDER BY ordinal_position;

-- Expected: Should show all permission columns including can_manage_app_access

-- 3. Check if the function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'get_user_roles_with_emails';

-- Expected: Should return 1 row showing the function exists

-- 4. Test the function - get all user roles
SELECT * FROM get_user_roles_with_emails();

-- Expected: Should return all users with their permissions

-- 5. Check current permission values for all users
SELECT
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches,
    can_manage_app_access
FROM user_roles;

-- Expected: Should show current permission values for all users
