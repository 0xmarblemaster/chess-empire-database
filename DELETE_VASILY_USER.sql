-- ============================================
-- DELETE USER: vasilyevvasily.1997@mail.ru
-- ============================================

-- Step 1: Delete from user_roles (if exists)
DELETE FROM user_roles
WHERE user_id = '1c8ee104-4278-4a1c-9ee8-aceed108c946';

-- Step 2: Delete from auth.users
DELETE FROM auth.users
WHERE email = 'vasilyevvasily.1997@mail.ru';

-- Step 3: Mark invitation as unused (if you want to reuse it)
UPDATE coach_invitations
SET used = false
WHERE email = 'vasilyevvasily.1997@mail.ru'
AND used = true;

-- Verify deletion
SELECT 'Verification: User should NOT exist' as status;
SELECT * FROM auth.users WHERE email = 'vasilyevvasily.1997@mail.ru';

-- Check invitations are available
SELECT 'Available invitations' as status, *
FROM coach_invitations
WHERE email = 'vasilyevvasily.1997@mail.ru'
ORDER BY created_at DESC
LIMIT 3;
