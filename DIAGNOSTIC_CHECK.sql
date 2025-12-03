-- ============================================
-- DIAGNOSTIC: Check User and Role Status
-- ============================================

-- 1. Check if user exists in auth.users
SELECT
    'User in auth.users' as check_type,
    id,
    email,
    email_confirmed_at,
    created_at
FROM auth.users
WHERE email = 'dysonsphere01@proton.me';

-- 2. Check if role exists for this user
SELECT
    'Role in user_roles' as check_type,
    ur.*
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'dysonsphere01@proton.me';

-- 3. Check all users without roles
SELECT
    'Users without roles' as check_type,
    u.id,
    u.email,
    u.created_at
FROM auth.users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE ur.user_id IS NULL
ORDER BY u.created_at DESC
LIMIT 10;

-- 4. Check if create_user_role function exists
SELECT
    'Function check' as check_type,
    proname as function_name,
    pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'create_user_role';
