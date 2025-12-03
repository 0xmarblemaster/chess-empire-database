-- ============================================
-- DELETE USER: nurgalimov.chingis@gmail.com
-- ============================================

-- Step 1: Delete from user_roles (if exists - probably doesn't)
DELETE FROM user_roles
WHERE user_id = 'd603ab25-de9a-44f4-97e6-203c97eebea5';

-- Step 2: Delete from auth.users
DELETE FROM auth.users
WHERE email = 'nurgalimov.chingis@gmail.com';

-- Step 3: Invitation is already unused, so nothing to update

-- Verify deletion
SELECT 'Verification: User should NOT exist' as status;
SELECT * FROM auth.users WHERE email = 'nurgalimov.chingis@gmail.com';

-- Confirm invitation is available
SELECT 'Available invitation' as status, *
FROM coach_invitations
WHERE email = 'nurgalimov.chingis@gmail.com'
ORDER BY created_at DESC
LIMIT 1;
