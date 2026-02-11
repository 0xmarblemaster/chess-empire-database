-- ============================================
-- Grant Admin Access to dysonsphere01@proton.me
-- Created: 2026-02-11
-- Purpose: Grant full admin permissions and database role
-- ============================================

-- Grant admin access to dysonsphere01@proton.me
INSERT INTO user_roles (
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches,
    can_manage_app_access,
    can_manage_ratings,
    can_manage_data,
    can_manage_attendance
)
SELECT
    u.id,
    'admin',                    -- Admin role
    true,                       -- Can view all students
    true,                       -- Can edit students
    true,                       -- Can manage branches
    true,                       -- Can manage coaches
    true,                       -- Can manage app access (Analytics Dashboard)
    true,                       -- Can manage ratings
    true,                       -- Can manage data
    true                        -- Can manage attendance
FROM auth.users u
WHERE u.email = 'dysonsphere01@proton.me'
ON CONFLICT (user_id)
DO UPDATE SET
    role = 'admin',
    can_view_all_students = true,
    can_edit_students = true,
    can_manage_branches = true,
    can_manage_coaches = true,
    can_manage_app_access = true,
    can_manage_ratings = true,
    can_manage_data = true,
    can_manage_attendance = true,
    updated_at = NOW();

-- ============================================
-- VERIFICATION QUERY
-- Run this after executing the above INSERT to confirm success:
-- ============================================
/*
SELECT
    u.email,
    ur.role,
    ur.can_view_all_students,
    ur.can_edit_students,
    ur.can_manage_branches,
    ur.can_manage_coaches,
    ur.can_manage_app_access,
    ur.can_manage_ratings,
    ur.can_manage_data,
    ur.can_manage_attendance,
    ur.created_at,
    ur.updated_at
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'dysonsphere01@proton.me';
*/

-- ============================================
-- ROLLBACK QUERY (if needed)
-- To revoke admin access, run:
-- ============================================
/*
DELETE FROM user_roles
WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE email = 'dysonsphere01@proton.me'
);
*/
