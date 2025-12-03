-- ============================================
-- CHECK: Coach vasilyevvasily.1997@mail.ru permissions
-- ============================================

-- Step 1: Check user_roles for this coach
SELECT
    'Vasily Coach Permissions' as check_type,
    u.id as user_id,
    u.email,
    u.created_at as account_created,
    u.last_sign_in_at,
    ur.role,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.can_manage_branches,
    ur.can_manage_coaches,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✅ Admin - Full permissions (add/edit/delete all)'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✅ Coach - Can add/edit/delete ALL students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '⚠️ Coach - Can only add/edit/delete OWN students'
        WHEN ur.can_edit_students = false THEN '❌ Coach - Read-only access (cannot add/edit/delete)'
        ELSE '❓ Unknown permission level'
    END as permission_summary
FROM auth.users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';

-- Step 2: Check if this coach exists in coaches table
SELECT
    'Coach Record in Coaches Table' as check_type,
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.branch_id,
    b.name as branch_name,
    c.email,
    c.phone,
    (SELECT COUNT(*) FROM students s WHERE s.coach_id = c.id) as assigned_students_count
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.email = 'vasilyevvasily.1997@mail.ru'
   OR c.first_name = 'Vasily'
   OR LOWER(c.last_name) LIKE '%vasiliev%'
   OR LOWER(c.last_name) LIKE '%vasily%';

-- Step 3: Compare with dysonsphere01 (who we know has permissions)
SELECT
    'Permission Comparison' as check_type,
    u.email,
    ur.role,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.coach_id,
    CASE
        WHEN ur.can_edit_students = true THEN '✅ Can delete'
        ELSE '❌ Cannot delete'
    END as delete_permission
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email IN ('vasilyevvasily.1997@mail.ru', 'dysonsphere01@proton.me')
ORDER BY u.email;

-- Step 4: Show all coaches with dashboard access
SELECT
    'All Coaches with Dashboard Access' as check_type,
    u.email,
    ur.role,
    ur.can_edit_students as can_delete_students,
    ur.can_manage_app_access as has_dashboard_access,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '👑 Admin'
        WHEN ur.can_edit_students = true THEN '✅ Full CRUD'
        ELSE '👁️ View only'
    END as access_level
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role IN ('admin', 'coach')
   OR ur.can_manage_app_access = true
   OR ur.can_edit_students = true
ORDER BY
    CASE
        WHEN ur.role = 'admin' THEN 1
        WHEN ur.can_edit_students = true THEN 2
        ELSE 3
    END,
    u.email;

-- Step 5: Quick check - does this user exist at all?
SELECT
    'User Exists Check' as check_type,
    COUNT(*) as user_count,
    CASE
        WHEN COUNT(*) > 0 THEN '✅ User exists in auth.users'
        ELSE '❌ User NOT found - may need invitation'
    END as status
FROM auth.users
WHERE email = 'vasilyevvasily.1997@mail.ru';
