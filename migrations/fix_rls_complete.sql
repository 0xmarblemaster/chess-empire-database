-- ============================================
-- Complete RLS Fix for user_roles
-- This removes the recursive policy check that's blocking updates
-- ============================================

-- Step 1: Drop ALL existing policies on user_roles
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON user_roles;

-- Step 2: Create a helper function to check if current user is admin
-- This avoids the recursive query issue in RLS policies
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create new RLS policies using the helper function

-- Allow users to read their own role
CREATE POLICY "Users can read own role"
    ON user_roles FOR SELECT
    USING (user_id = auth.uid());

-- Allow admins to read all roles
CREATE POLICY "Admins read all"
    ON user_roles FOR SELECT
    USING (is_current_user_admin());

-- Allow admins to insert user roles
CREATE POLICY "Admins insert"
    ON user_roles FOR INSERT
    WITH CHECK (is_current_user_admin());

-- Allow admins to update user roles
CREATE POLICY "Admins update"
    ON user_roles FOR UPDATE
    USING (is_current_user_admin())
    WITH CHECK (is_current_user_admin());

-- Allow admins to delete user roles
CREATE POLICY "Admins delete"
    ON user_roles FOR DELETE
    USING (is_current_user_admin());

-- Step 4: Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated;

-- ============================================
-- Verification
-- ============================================
-- Check the policies:
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'user_roles';

-- Test update as admin:
-- UPDATE user_roles
-- SET can_manage_branches = true
-- WHERE user_id = '90aff916-ae96-4abe-ab98-73e6caf26241';
