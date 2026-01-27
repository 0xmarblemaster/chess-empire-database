-- ============================================
-- AUTO-DIAGNOSTIC: Coach Karimov Deletion Issue
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- This version automatically finds Coach Karimov and diagnoses the issue
-- No manual placeholder replacement needed!

-- ============================================
-- STEP 1: Verify the DELETE policy exists
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 1: RLS Policy Check' as step;

SELECT
    policyname,
    cmd,
    CASE
        WHEN policyname = 'Users can delete attendance in their branches' THEN '✓ New policy active'
        WHEN policyname = 'Admins can delete attendance' THEN '✗ Old policy (BUG!)'
        ELSE '⚠ Unknown policy'
    END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'attendance'
  AND cmd = 'DELETE'
ORDER BY policyname;

-- ============================================
-- STEP 2: Find Coach Karimov
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 2: Finding Coach Karimov' as step;

SELECT
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.email,
    c.branch_id,
    b.name as branch_name,
    CASE
        WHEN c.branch_id IS NULL THEN '✗ NO BRANCH ASSIGNED (THIS IS THE PROBLEM!)'
        ELSE '✓ Has branch: ' || b.name
    END as branch_status
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.first_name ILIKE '%karimov%'
   OR c.last_name ILIKE '%shokan%'
   OR c.first_name ILIKE '%shokan%'
   OR c.last_name ILIKE '%karimov%'
ORDER BY c.first_name, c.last_name;

-- ============================================
-- STEP 3: Check Coach Karimov's user_role
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 3: Coach Karimov User Role' as step;

SELECT
    ur.user_id,
    c.email as coach_email,
    ur.role,
    ur.coach_id,
    c.first_name || ' ' || c.last_name as coach_name,
    CASE
        WHEN ur.coach_id IS NULL THEN '✗ NO coach_id link (THIS IS THE PROBLEM!)'
        ELSE '✓ Linked to coach: ' || c.first_name || ' ' || c.last_name
    END as coach_link_status
FROM user_roles ur
LEFT JOIN coaches c ON c.id = ur.coach_id
WHERE ur.role = 'coach'
  AND ur.coach_id IN (
      SELECT id FROM coaches
      WHERE first_name ILIKE '%karimov%'
         OR last_name ILIKE '%shokan%'
         OR first_name ILIKE '%shokan%'
         OR last_name ILIKE '%karimov%'
  );

-- ============================================
-- STEP 4: Show recent attendance records
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 4: Recent Attendance Records' as step;

SELECT
    a.id as attendance_id,
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

-- ============================================
-- STEP 5: THE KEY DIAGNOSTIC - Branch Mismatch Analysis
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 5: RLS Policy Simulation (This shows the problem!)' as step;

-- This automatically finds Coach Karimov and checks if they can delete
WITH coach_karimov AS (
    SELECT
        ur.user_id,
        ur.role,
        ur.coach_id,
        c.branch_id as coach_branch_id,
        c.first_name || ' ' || c.last_name as coach_name,
        c.email as coach_email
    FROM user_roles ur
    LEFT JOIN coaches c ON c.id = ur.coach_id
    WHERE c.first_name ILIKE '%karimov%'
       OR c.last_name ILIKE '%shokan%'
       OR c.first_name ILIKE '%shokan%'
       OR c.last_name ILIKE '%karimov%'
    LIMIT 1
)
SELECT
    ck.coach_name,
    ck.coach_email,
    ck.coach_branch_id,
    cb.name as coach_branch_name,
    a.id as attendance_id,
    s.first_name || ' ' || s.last_name as student_name,
    a.branch_id as attendance_branch_id,
    ab.name as attendance_branch_name,
    a.attendance_date,
    -- THE KEY CHECK: Does coach's branch match attendance's branch?
    CASE
        WHEN ck.role = 'admin' THEN '✓ ADMIN - Can delete all'
        WHEN ck.coach_branch_id IS NULL THEN '✗ BLOCKED: Coach has NO branch assigned'
        WHEN a.branch_id IS NULL THEN '⚠ BLOCKED: Attendance has NO branch'
        WHEN ck.coach_branch_id = a.branch_id THEN '✓ CAN DELETE: Branch match'
        ELSE '✗ BLOCKED: Branch mismatch'
    END as can_delete_status,
    -- Show the exact mismatch if it exists
    CASE
        WHEN ck.coach_branch_id IS NULL THEN
            '❌ ROOT CAUSE: Coach Karimov has NO branch_id in coaches table'
        WHEN a.branch_id IS NULL THEN
            '⚠ Attendance record has no branch_id'
        WHEN ck.coach_branch_id != a.branch_id THEN
            '❌ ROOT CAUSE: Coach is in "' || cb.name || '" but attendance is in "' || ab.name || '"'
        ELSE
            '✅ OK - Can delete this record'
    END as diagnostic_result
FROM attendance a
CROSS JOIN coach_karimov ck
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches ab ON ab.id = a.branch_id
LEFT JOIN branches cb ON cb.id = ck.coach_branch_id
ORDER BY a.created_at DESC
LIMIT 20;

-- ============================================
-- STEP 6: Count how many records Coach CAN vs CANNOT delete
-- ============================================

SELECT
    '========================================' as divider,
    'STEP 6: Summary - How many can Coach Karimov delete?' as step;

WITH coach_karimov AS (
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
    COUNT(*) as total_attendance_records,
    COUNT(*) FILTER (WHERE ck.coach_branch_id = a.branch_id) as can_delete_count,
    COUNT(*) FILTER (WHERE ck.coach_branch_id != a.branch_id OR ck.coach_branch_id IS NULL) as cannot_delete_count,
    CASE
        WHEN ck.coach_branch_id IS NULL THEN
            '❌ Coach has NO branch assigned - Cannot delete ANY records'
        WHEN COUNT(*) FILTER (WHERE ck.coach_branch_id = a.branch_id) = 0 THEN
            '❌ Coach cannot delete ANY records (all are in different branches)'
        WHEN COUNT(*) FILTER (WHERE ck.coach_branch_id != a.branch_id OR ck.coach_branch_id IS NULL) = 0 THEN
            '✅ Coach can delete ALL records'
        ELSE
            '⚠ Coach can only delete SOME records (branch mismatch for others)'
    END as summary
FROM attendance a
CROSS JOIN coach_karimov ck;

-- ============================================
-- FINAL RESULT: What's the problem?
-- ============================================

SELECT
    '========================================' as divider,
    'FINAL DIAGNOSIS' as step;

WITH coach_karimov AS (
    SELECT
        c.id as coach_id,
        c.first_name || ' ' || c.last_name as coach_name,
        c.branch_id,
        b.name as branch_name,
        ur.user_id,
        ur.role
    FROM coaches c
    LEFT JOIN branches b ON b.id = c.branch_id
    LEFT JOIN user_roles ur ON ur.coach_id = c.id
    WHERE c.first_name ILIKE '%karimov%'
       OR c.last_name ILIKE '%shokan%'
       OR c.first_name ILIKE '%shokan%'
       OR c.last_name ILIKE '%karimov%'
    LIMIT 1
)
SELECT
    ck.coach_name,
    ck.branch_id as assigned_branch_id,
    ck.branch_name as assigned_branch_name,
    CASE
        WHEN ck.branch_id IS NULL THEN
            '❌ PROBLEM FOUND: Coach has NO branch_id assigned in coaches table. FIX: Run migration 013 to assign a branch.'
        WHEN ck.user_id IS NULL THEN
            '❌ PROBLEM FOUND: Coach has no user_role entry. FIX: Create user_role with coach_id link.'
        ELSE
            '✅ Coach has branch assigned: ' || ck.branch_name || '. If deletion still fails, check if attendance records are in a DIFFERENT branch.'
    END as diagnosis
FROM coach_karimov ck;

SELECT '========================================' as divider;
SELECT 'Diagnostic complete! Review results above.' as message;
