-- ============================================
-- DELETE USER: dysonsphere01@proton.me
-- ============================================
-- This will completely remove the user and allow fresh registration testing

-- Step 1: Delete from user_roles (if exists)
DELETE FROM user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dysonsphere01@proton.me');

-- Step 2: Delete from auth.users (this is the main account)
-- Note: This requires admin privileges
DELETE FROM auth.users
WHERE email = 'dysonsphere01@proton.me';

-- Step 3: Mark invitation as unused so it can be used again
-- (Optional - you can also create a new invitation instead)
UPDATE coach_invitations
SET used = false
WHERE email = 'dysonsphere01@proton.me'
AND used = true;

-- Verify user was deleted
SELECT 'Verification: User should NOT exist' as check_type;
SELECT * FROM auth.users WHERE email = 'dysonsphere01@proton.me';

-- Verify role was deleted
SELECT 'Verification: Role should NOT exist' as check_type;
SELECT * FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'dysonsphere01@proton.me';

-- Check invitations status
SELECT 'Invitation status' as check_type, *
FROM coach_invitations
WHERE email = 'dysonsphere01@proton.me'
ORDER BY created_at DESC
LIMIT 5;
