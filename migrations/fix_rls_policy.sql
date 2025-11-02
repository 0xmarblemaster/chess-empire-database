-- ============================================
-- Fix RLS Policy for user_roles Updates
-- This fixes the issue where admins cannot update user permissions
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;

-- Recreate with separate INSERT, UPDATE, DELETE policies for clarity
-- This is more explicit and less likely to have issues

-- Admins can INSERT new user roles
CREATE POLICY "Admins can insert user roles"
    ON user_roles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    );

-- Admins can UPDATE existing user roles
CREATE POLICY "Admins can update user roles"
    ON user_roles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    );

-- Admins can DELETE user roles
CREATE POLICY "Admins can delete user roles"
    ON user_roles FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    );

-- ============================================
-- Verification
-- ============================================
-- Check the policies were created:
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'user_roles';
