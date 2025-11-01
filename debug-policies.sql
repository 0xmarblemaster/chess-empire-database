-- Debug script to check current state of RLS policies and data

-- 1. Check all policies on user_roles table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_roles';

-- 2. Check if admin_users_cache table exists and has data
SELECT COUNT(*) as admin_cache_count FROM admin_users_cache;

-- 3. Check the actual admin user in user_roles
SELECT
    id,
    user_id,
    role,
    created_at
FROM user_roles
WHERE role = 'admin';

-- 4. Check if the user exists in auth.users
SELECT
    id,
    email,
    created_at
FROM auth.users
WHERE email = '0xmarblemaster@gmail.com';
