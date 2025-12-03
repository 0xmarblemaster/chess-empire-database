-- ============================================
-- GRANT FULL CRUD PERMISSIONS TO ALL EXISTING COACHES
-- ============================================
-- This updates all existing coaches to have:
-- - can_edit_students = true (add/edit/delete students)
-- - can_manage_app_access = true (dashboard access)
-- - coach_id = NULL (can manage ALL students)

-- Update all existing coaches
UPDATE user_roles
SET can_edit_students = true,
    can_manage_app_access = true,
    coach_id = NULL
WHERE role = 'coach';

-- Verify the update
SELECT
    'Updated Coaches' as status,
    COUNT(*) as total_coaches_updated
FROM user_roles
WHERE role = 'coach';

-- Show all coaches with their new permissions
SELECT
    'All Coaches Permissions' as check_type,
    u.email,
    ur.role,
    ur.can_edit_students as can_add_edit_delete,
    ur.can_manage_app_access as has_dashboard_access,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '👑 Admin - Full access'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✅ Coach - Can manage ALL students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '⚠️ Coach - Can manage assigned students only'
        ELSE '❌ Coach - Read-only access'
    END as permission_level,
    CASE
        WHEN ur.can_edit_students = true THEN '✓ Can delete any student'
        ELSE '✗ Cannot delete students'
    END as delete_permission
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'coach'
ORDER BY u.email;

-- Show summary
SELECT
    'Permission Summary' as summary,
    COUNT(*) as total_coaches,
    COUNT(CASE WHEN can_edit_students = true THEN 1 END) as coaches_with_edit_permission,
    COUNT(CASE WHEN can_manage_app_access = true THEN 1 END) as coaches_with_dashboard_access,
    COUNT(CASE WHEN coach_id IS NULL THEN 1 END) as coaches_managing_all_students
FROM user_roles
WHERE role = 'coach';
