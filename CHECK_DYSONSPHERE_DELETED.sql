-- ============================================
-- VERIFY DELETION: dysonsphere01@proton.me
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
WHERE email = 'dysonsphere01@proton.me';

-- Check if role exists for this user
SELECT
    'Role in user_roles' as check_type,
    ur.*
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'dysonsphere01@proton.me';

-- Check all current users (to confirm deletion)
SELECT
    'All current users' as check_type,
    id,
    email,
    email_confirmed_at,
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- Expected result: dysonsphere01@proton.me should NOT appear in any of the above queries
