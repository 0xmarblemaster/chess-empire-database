-- ============================================
-- CHECK IF USER EXISTS: vasilyevvasily.1997@mail.ru
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
WHERE email = 'vasilyevvasily.1997@mail.ru';

-- Check if role exists for this user
SELECT
    'Role in user_roles' as check_type,
    ur.*
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';

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
WHERE email = 'vasilyevvasily.1997@mail.ru'
ORDER BY created_at DESC
LIMIT 5;

-- Check all recent users (last 10)
SELECT
    'Recent users' as check_type,
    id,
    email,
    email_confirmed_at,
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;
