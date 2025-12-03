-- ============================================
-- FIX: Coach cannot delete students
-- ============================================
-- Problem: Missing or incorrect DELETE policy on students table
-- Coach with can_edit_students permission should be able to delete students
--
-- Solution: Add DELETE policy matching the UPDATE policy logic:
-- 1. Admins can delete any student
-- 2. Coaches with can_edit_students = true can delete students
--    (either their assigned students OR any student if coach_id IS NULL)

-- Drop existing DELETE policy if exists
DROP POLICY IF EXISTS "Authorized users can delete students" ON students;

-- Create DELETE policy with same logic as UPDATE
CREATE POLICY "Authorized users can delete students"
    ON students FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                -- Admins can delete any student
                ur.role = 'admin'
                -- Coaches with edit permission can delete their own students
                OR (ur.can_edit_students = true AND students.coach_id = ur.coach_id)
                -- Coaches with edit permission and no specific coach assignment can delete any
                OR (ur.can_edit_students = true AND ur.coach_id IS NULL)
            )
        )
    );

-- Verify all policies on students table
SELECT
    policyname,
    cmd,
    CASE
        WHEN cmd = 'SELECT' THEN 'Read'
        WHEN cmd = 'INSERT' THEN 'Create'
        WHEN cmd = 'UPDATE' THEN 'Update'
        WHEN cmd = 'DELETE' THEN 'Delete'
    END as operation,
    CASE
        WHEN policyname LIKE '%admin%' THEN '✓ Admins allowed'
        WHEN policyname LIKE '%Authorized%' THEN '✓ Role-based access'
        ELSE 'Check policy'
    END as status
FROM pg_policies
WHERE tablename = 'students'
ORDER BY cmd, policyname;

-- Test query to verify coach permissions
-- Replace with actual coach email to test
SELECT
    'Coach Permissions' as check_type,
    u.email,
    ur.role,
    ur.can_edit_students,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✓ Can delete (Admin)'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✓ Can delete any student'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '✓ Can delete own students'
        ELSE '✗ Cannot delete students'
    END as delete_permission
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'dysonsphere01@proton.me';  -- Replace with coach email
