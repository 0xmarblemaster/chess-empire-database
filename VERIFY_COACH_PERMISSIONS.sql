-- Verify coach permissions for deletion
-- This checks the coach who is logged in and trying to delete students

SELECT
    'Current Coach Status' as check_type,
    u.email,
    u.id as user_id,
    ur.role,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✓ Admin - Can delete all students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✓ Coach - Can delete all students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '⚠ Coach - Can only delete own students'
        WHEN ur.can_edit_students = false THEN '✗ No delete permission'
        ELSE '✗ Unknown status'
    END as delete_permission_status
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'dysonsphere01@proton.me'  -- The coach from the screenshot
ORDER BY u.created_at DESC;

-- Check all active coaches with dashboard access
SELECT
    'All Dashboard Coaches' as check_type,
    u.email,
    ur.role,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✓ Full access'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✓ Can manage all students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '⚠ Limited to own students'
        ELSE '✗ No student management'
    END as access_level
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.can_manage_app_access = true
   OR ur.role = 'admin'
   OR ur.can_edit_students = true
ORDER BY ur.role, u.email;
