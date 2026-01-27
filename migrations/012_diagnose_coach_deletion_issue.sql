-- ============================================
-- DIAGNOSTIC: Why can't Coach Karimov delete attendance?
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Diagnose why the RLS DELETE policy blocks Coach Karimov Shokan
-- from deleting attendance records despite the migration being run.

-- ============================================
-- STEP 1: Verify the DELETE policy exists
-- ============================================

SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname = 'Users can delete attendance in their branches' THEN '✓ New policy'
        WHEN policyname = 'Admins can delete attendance' THEN '✗ Old policy (should be dropped)'
        ELSE '⚠ Unknown policy'
    END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'attendance'
  AND cmd = 'DELETE'
ORDER BY policyname;

-- Expected: Should see only "Users can delete attendance in their branches"
-- If you see "Admins can delete attendance", the migration didn't run correctly

-- ============================================
-- STEP 2: Find Coach Karimov's user record
-- ============================================

SELECT
    ur.user_id,
    ur.role,
    ur.coach_id,
    CASE
        WHEN ur.coach_id IS NULL THEN '✗ No coach_id (RLS will fail)'
        ELSE '✓ Has coach_id'
    END as coach_id_status
FROM user_roles ur
WHERE ur.role = 'coach'
  AND (
      -- Try to find by checking coaches table
      ur.coach_id IN (
          SELECT c.id FROM coaches c
          WHERE c.first_name ILIKE '%karimov%'
             OR c.last_name ILIKE '%shokan%'
             OR c.first_name ILIKE '%shokan%'
             OR c.last_name ILIKE '%karimov%'
      )
  )
ORDER BY ur.user_id;

-- Expected: Should find one user_role with role='coach' and a non-null coach_id
-- If coach_id is NULL, the RLS policy will fail

-- ============================================
-- STEP 3: Get Coach Karimov's branch assignment
-- ============================================

SELECT
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.branch_id,
    b.name as branch_name,
    CASE
        WHEN c.branch_id IS NULL THEN '✗ No branch_id (RLS will fail)'
        ELSE '✓ Has branch_id'
    END as branch_status
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.first_name ILIKE '%karimov%'
   OR c.last_name ILIKE '%shokan%'
   OR c.first_name ILIKE '%shokan%'
   OR c.last_name ILIKE '%karimov%'
ORDER BY c.first_name, c.last_name;

-- Expected: Should show Coach Karimov with a non-null branch_id
-- If branch_id is NULL, the RLS policy will fail

-- ============================================
-- STEP 4: Check attendance records and their branches
-- ============================================

-- Show a sample of attendance records with their branch assignments
SELECT
    a.id as attendance_id,
    a.student_id,
    s.first_name || ' ' || s.last_name as student_name,
    a.branch_id,
    b.name as branch_name,
    a.attendance_date,
    a.created_at
FROM attendance a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = a.branch_id
ORDER BY a.created_at DESC
LIMIT 10;

-- Note the branch_id values - do they match Coach Karimov's branch_id from STEP 3?

-- ============================================
-- STEP 5: Simulate the RLS policy check
-- ============================================

-- Replace <coach-user-id> with the actual user_id from STEP 2
-- Replace <attendance-id> with the ID of an attendance record you're trying to delete

-- This query simulates what the RLS policy does:
WITH coach_info AS (
    SELECT
        ur.user_id,
        ur.role,
        ur.coach_id,
        c.branch_id as coach_branch_id
    FROM user_roles ur
    LEFT JOIN coaches c ON c.id = ur.coach_id
    WHERE ur.user_id = '<coach-user-id>'  -- REPLACE THIS
)
SELECT
    a.id as attendance_id,
    a.branch_id as attendance_branch_id,
    ci.coach_branch_id,
    ci.role,
    CASE
        WHEN ci.role = 'admin' THEN '✓ Admin - should be allowed'
        WHEN ci.role = 'coach' AND a.branch_id = ci.coach_branch_id THEN '✓ Coach with matching branch - should be allowed'
        WHEN ci.role = 'coach' AND a.branch_id != ci.coach_branch_id THEN '✗ Coach with DIFFERENT branch - will be blocked'
        WHEN ci.role = 'coach' AND ci.coach_branch_id IS NULL THEN '✗ Coach with NO branch assigned - will be blocked'
        ELSE '✗ Other issue - will be blocked'
    END as rls_result,
    -- Show the condition that's failing:
    CASE
        WHEN ci.role IS NULL THEN 'No user_role found'
        WHEN ci.role = 'coach' AND ci.coach_branch_id IS NULL THEN 'Coach has no branch_id in coaches table'
        WHEN ci.role = 'coach' AND a.branch_id IS NULL THEN 'Attendance record has no branch_id'
        WHEN ci.role = 'coach' AND a.branch_id != ci.coach_branch_id THEN
            'Branch mismatch: attendance.branch_id=' || a.branch_id::text || ' but coach.branch_id=' || ci.coach_branch_id::text
        ELSE 'OK'
    END as failure_reason
FROM attendance a
CROSS JOIN coach_info ci
WHERE a.id = '<attendance-id>'  -- REPLACE THIS
LIMIT 1;

-- Expected: Should show why the RLS check is failing

-- ============================================
-- STEP 6: Alternative - Find ALL mismatches
-- ============================================

-- If you want to see ALL attendance records that Coach Karimov CAN'T delete:
WITH coach_info AS (
    SELECT
        ur.user_id,
        ur.role,
        ur.coach_id,
        c.branch_id as coach_branch_id,
        c.first_name || ' ' || c.last_name as coach_name
    FROM user_roles ur
    LEFT JOIN coaches c ON c.id = ur.coach_id
    WHERE c.first_name ILIKE '%karimov%'
       OR c.last_name ILIKE '%shokan%'
       OR c.first_name ILIKE '%shokan%'
       OR c.last_name ILIKE '%karimov%'
    LIMIT 1
)
SELECT
    a.id as attendance_id,
    s.first_name || ' ' || s.last_name as student_name,
    a.attendance_date,
    a.branch_id as attendance_branch,
    b.name as attendance_branch_name,
    ci.coach_branch_id as coach_branch,
    cb.name as coach_branch_name,
    CASE
        WHEN a.branch_id = ci.coach_branch_id THEN '✓ Can delete'
        WHEN a.branch_id != ci.coach_branch_id THEN '✗ Cannot delete (branch mismatch)'
        WHEN ci.coach_branch_id IS NULL THEN '✗ Cannot delete (coach has no branch)'
        ELSE '✗ Cannot delete (unknown reason)'
    END as deletion_allowed
FROM attendance a
CROSS JOIN coach_info ci
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = a.branch_id
LEFT JOIN branches cb ON cb.id = ci.coach_branch_id
ORDER BY a.created_at DESC
LIMIT 20;

-- This shows which attendance records Coach Karimov can vs cannot delete

-- ============================================
-- SUMMARY
-- ============================================

SELECT
    'Diagnostic complete. Review the results above to find the issue.' as message,
    'Common issues:' as hint1,
    '1. Coach has no coach_id in user_roles table' as hint2,
    '2. Coach has no branch_id in coaches table' as hint3,
    '3. Attendance record branch_id does not match coach branch_id' as hint4,
    '4. Old RLS policy still active (migration not run)' as hint5;
