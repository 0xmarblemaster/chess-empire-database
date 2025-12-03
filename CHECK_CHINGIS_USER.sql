-- ============================================
-- CHECK USER: nurgalimov.chingis@gmail.com
-- ============================================

-- Check if user exists in auth.users
SELECT
    'User in auth.users' as check_type,
    id,
    email,
    email_confirmed_at,
    created_at,
    last_sign_in_at
FROM auth.users
WHERE email = 'nurgalimov.chingis@gmail.com';

-- Check if role exists for this user
SELECT
    'Role status' as check_type,
    u.id as user_id,
    u.email,
    u.email_confirmed_at,
    u.created_at,
    ur.role,
    ur.can_edit_students,
    ur.can_view_all_students,
    ur.can_manage_branches,
    ur.can_manage_coaches
FROM auth.users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'nurgalimov.chingis@gmail.com';

-- Check invitations for this email
SELECT
    'Invitations' as check_type,
    id,
    email,
    token,
    used,
    expires_at,
    created_at
FROM coach_invitations
WHERE email = 'nurgalimov.chingis@gmail.com'
ORDER BY created_at DESC
LIMIT 5;
