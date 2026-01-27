-- ============================================
-- COMPLETE UPDATE: Allow ALL Coaches to Modify Attendance in ANY Branch
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Remove branch restrictions from ALL attendance operations (INSERT, UPDATE, DELETE)
-- All coaches with role='coach' OR can_edit_students=true can now modify attendance in any branch

-- ============================================
-- STEP 1: Drop all current restrictive policies
-- ============================================

DROP POLICY IF EXISTS "Users can delete attendance in their branches" ON attendance;
DROP POLICY IF EXISTS "Coaches and admins can delete attendance" ON attendance;
DROP POLICY IF EXISTS "Authorized users can update attendance" ON attendance;
DROP POLICY IF EXISTS "Authorized users can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Admins can delete attendance" ON attendance;

-- ============================================
-- STEP 2: Create new permissive INSERT policy
-- ============================================

CREATE POLICY "Coaches and admins can insert attendance"
    ON attendance FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'  -- Admins can insert
                OR ur.role = 'coach'  -- All coaches can insert
                OR ur.can_edit_students = true  -- Users with edit permission can insert
            )
        )
    );

COMMENT ON POLICY "Coaches and admins can insert attendance" ON attendance IS
    'Allows admins, ALL coaches, and users with can_edit_students permission to insert attendance records in any branch. No branch restrictions.';

-- ============================================
-- STEP 3: Create new permissive UPDATE policy
-- ============================================

CREATE POLICY "Coaches and admins can update attendance"
    ON attendance FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'  -- Admins can update
                OR ur.role = 'coach'  -- All coaches can update
                OR ur.can_edit_students = true  -- Users with edit permission can update
            )
        )
    );

COMMENT ON POLICY "Coaches and admins can update attendance" ON attendance IS
    'Allows admins, ALL coaches, and users with can_edit_students permission to update attendance records in any branch. No branch restrictions.';

-- ============================================
-- STEP 4: Create new permissive DELETE policy
-- ============================================

CREATE POLICY "Coaches and admins can delete attendance"
    ON attendance FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'  -- Admins can delete
                OR ur.role = 'coach'  -- All coaches can delete
                OR ur.can_edit_students = true  -- Users with edit permission can delete
            )
        )
    );

COMMENT ON POLICY "Coaches and admins can delete attendance" ON attendance IS
    'Allows admins, ALL coaches, and users with can_edit_students permission to delete attendance records in any branch. No branch restrictions.';

-- ============================================
-- VERIFICATION: Check all policies were created
-- ============================================

SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE
        WHEN cmd = 'INSERT' THEN '✓ INSERT policy updated'
        WHEN cmd = 'UPDATE' THEN '✓ UPDATE policy updated'
        WHEN cmd = 'DELETE' THEN '✓ DELETE policy updated'
        ELSE cmd
    END as command_type
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'attendance'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY cmd, policyname;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT '✅ All attendance policies updated! Coaches can now insert, update, and delete attendance in any branch.' as result;
