-- ============================================
-- FIX ATTENDANCE DELETE POLICY
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Allow coaches with can_edit_students permission to delete attendance records
-- Previously, only admins could delete attendance records, causing coaches' deletions
-- to fail silently (RLS policy blocked but returned no error).

-- Issue: When a coach tried to uncheck attendance, the RLS policy blocked the deletion
-- but Supabase returned success (error = null, rowsAffected = 0). The UI updated
-- locally but the database record remained, causing the checkbox to reappear on refresh.

-- Solution: Update the DELETE policy to match the UPDATE policy permissions, allowing
-- coaches with can_edit_students = true to delete attendance records in their branches.

-- ============================================
-- STEP 1: Drop old restrictive policy
-- ============================================

DROP POLICY IF EXISTS "Admins can delete attendance" ON attendance;

-- ============================================
-- STEP 2: Create new policy matching UPDATE permissions
-- ============================================

CREATE POLICY "Users can delete attendance in their branches"
    ON attendance FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            LEFT JOIN branch_coaches bc ON bc.coach_id = ur.coach_id
            WHERE ur.user_id = auth.uid()
            AND (
                -- Admins can delete all attendance records
                ur.role = 'admin'
                OR (
                    -- Coaches with permission can delete in their branches
                    ur.can_edit_students = true
                    AND attendance.branch_id IN (
                        SELECT bc2.branch_id
                        FROM branch_coaches bc2
                        WHERE bc2.coach_id = ur.coach_id
                    )
                )
            )
        )
    );

-- ============================================
-- STEP 3: Add helpful comment
-- ============================================

COMMENT ON POLICY "Users can delete attendance in their branches" ON attendance IS
    'Allows admins to delete all attendance records, and coaches with can_edit_students permission to delete attendance in their assigned branches. This matches the UPDATE policy permissions.';

-- ============================================
-- VERIFICATION: Check policy was created
-- ============================================

SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE
        WHEN cmd = 'DELETE' THEN '✓ DELETE policy'
        ELSE cmd
    END as command_type
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'attendance'
  AND cmd = 'DELETE'
ORDER BY policyname;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'Attendance DELETE policy updated successfully! Coaches can now delete attendance records in their branches.' as result;

-- ============================================
-- TESTING NOTES
-- ============================================

-- To test this policy:
-- 1. Log in as a coach user with can_edit_students = true
-- 2. Navigate to attendance page for a branch where the coach is assigned
-- 3. Check an attendance checkbox
-- 4. Uncheck the checkbox
-- 5. Expected: Checkbox disappears immediately
-- 6. Refresh the page
-- 7. Expected: Checkbox remains unchecked (deletion persisted)
-- 8. Check browser console: Should see "Successfully deleted attendance record: [uuid]"

-- Before this fix:
-- - Coach unchecks box → UI shows unchecked
-- - Refresh page → Checkbox reappears (deletion failed silently)
-- - Console shows: "Deleting attendance by ID: [uuid]" but no error

-- After this fix:
-- - Coach unchecks box → UI shows unchecked
-- - Refresh page → Checkbox remains unchecked (deletion succeeded)
-- - Console shows: "Successfully deleted attendance record: [uuid]"
