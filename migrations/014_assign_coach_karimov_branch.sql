-- ============================================
-- FIX: Assign Branch to Coach Karimov
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Assign Coach Karimov Shokan to the correct branch
-- This fix addresses the diagnostic finding that Coach Karimov has no branch_id

-- ============================================
-- STEP 1: Show available branches
-- ============================================

SELECT
    '========================================' as divider,
    'Available Branches' as step;

SELECT
    id as branch_id,
    name as branch_name,
    address,
    created_at
FROM branches
ORDER BY name;

-- ============================================
-- STEP 2: Find Coach Karimov
-- ============================================

SELECT
    '========================================' as divider,
    'Coach Karimov Current Status' as step;

SELECT
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.email,
    c.branch_id as current_branch_id,
    CASE
        WHEN c.branch_id IS NULL THEN '❌ NO BRANCH ASSIGNED'
        ELSE '✓ Branch: ' || b.name
    END as status
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.first_name ILIKE '%karimov%'
   OR c.last_name ILIKE '%shokan%'
   OR c.first_name ILIKE '%shokan%'
   OR c.last_name ILIKE '%karimov%';

-- ============================================
-- STEP 3: Check which branch Coach Karimov's students are in
-- ============================================

SELECT
    '========================================' as divider,
    'Student Branch Distribution for Coach Karimov' as step;

-- This helps determine which branch to assign
WITH coach_karimov AS (
    SELECT id FROM coaches
    WHERE first_name ILIKE '%karimov%'
       OR last_name ILIKE '%shokan%'
       OR first_name ILIKE '%shokan%'
       OR last_name ILIKE '%karimov%'
    LIMIT 1
)
SELECT
    b.id as branch_id,
    b.name as branch_name,
    COUNT(DISTINCT a.student_id) as student_count,
    COUNT(a.id) as attendance_count,
    MAX(a.attendance_date) as latest_attendance_date
FROM attendance a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN branches b ON b.id = a.branch_id
WHERE a.branch_id IS NOT NULL
GROUP BY b.id, b.name
ORDER BY attendance_count DESC;

-- ============================================
-- STEP 4: APPLY FIX - Assign Coach to Branch
-- ============================================

-- INSTRUCTIONS:
-- 1. Look at the "Available Branches" results above
-- 2. Look at "Student Branch Distribution" to see which branch has the most attendance records
-- 3. Copy the branch_id of the correct branch
-- 4. Uncomment the UPDATE query below and replace <branch-id> with the actual branch_id
-- 5. Run the entire script again

/*
-- UNCOMMENT AND RUN THIS AFTER CHOOSING THE CORRECT BRANCH:

UPDATE coaches
SET branch_id = '<branch-id>'  -- REPLACE with actual branch_id from STEP 1
WHERE first_name ILIKE '%karimov%'
   OR last_name ILIKE '%shokan%'
   OR first_name ILIKE '%shokan%'
   OR last_name ILIKE '%karimov%';

-- Verify the update
SELECT
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.email,
    c.branch_id,
    b.name as branch_name,
    '✅ Branch assigned successfully!' as status
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.first_name ILIKE '%karimov%'
   OR c.last_name ILIKE '%shokan%'
   OR c.first_name ILIKE '%shokan%'
   OR c.last_name ILIKE '%karimov%';
*/

-- ============================================
-- ALTERNATIVE: Auto-assign to most common branch
-- ============================================

-- If you want to automatically assign Coach Karimov to the branch
-- with the most attendance records, uncomment this instead:

/*
WITH coach_karimov AS (
    SELECT id FROM coaches
    WHERE first_name ILIKE '%karimov%'
       OR last_name ILIKE '%shokan%'
       OR first_name ILIKE '%shokan%'
       OR last_name ILIKE '%karimov%'
    LIMIT 1
),
most_common_branch AS (
    SELECT
        a.branch_id,
        COUNT(*) as attendance_count
    FROM attendance a
    WHERE a.branch_id IS NOT NULL
    GROUP BY a.branch_id
    ORDER BY attendance_count DESC
    LIMIT 1
)
UPDATE coaches
SET branch_id = (SELECT branch_id FROM most_common_branch)
WHERE id = (SELECT id FROM coach_karimov)
  AND branch_id IS NULL;  -- Only update if currently NULL

-- Verify the update
SELECT
    c.id as coach_id,
    c.first_name || ' ' || c.last_name as coach_name,
    c.email,
    c.branch_id,
    b.name as branch_name,
    '✅ Branch auto-assigned successfully!' as status
FROM coaches c
LEFT JOIN branches b ON b.id = c.branch_id
WHERE c.first_name ILIKE '%karimov%'
   OR c.last_name ILIKE '%shokan%'
   OR c.first_name ILIKE '%shokan%'
   OR c.last_name ILIKE '%karimov%';
*/

-- ============================================
-- STEP 5: Test RLS Policy After Fix
-- ============================================

SELECT
    '========================================' as divider,
    'After applying the fix above, run this to verify' as step;

-- This simulates the RLS policy check after the fix
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
    ck.coach_branch_id,
    b.name as coach_branch_name,
    COUNT(*) as total_attendance_records,
    COUNT(*) FILTER (WHERE ck.coach_branch_id = a.branch_id) as can_delete_count,
    COUNT(*) FILTER (WHERE ck.coach_branch_id != a.branch_id OR ck.coach_branch_id IS NULL) as cannot_delete_count,
    CASE
        WHEN ck.coach_branch_id IS NULL THEN
            '❌ Coach still has NO branch assigned'
        WHEN COUNT(*) FILTER (WHERE ck.coach_branch_id = a.branch_id) = 0 THEN
            '⚠ Coach cannot delete ANY records (all are in different branches)'
        WHEN COUNT(*) FILTER (WHERE ck.coach_branch_id != a.branch_id OR ck.coach_branch_id IS NULL) = 0 THEN
            '✅✅✅ Coach can now delete ALL attendance records! ✅✅✅'
        ELSE
            '⚠ Coach can only delete SOME records (branch mismatch for others)'
    END as result
FROM attendance a
CROSS JOIN coach_karimov ck
LEFT JOIN branches b ON b.id = ck.coach_branch_id
GROUP BY ck.coach_name, ck.coach_branch_id, b.name;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT
    '========================================' as divider,
    'Next Steps' as step;

SELECT
    '1. Review available branches above' as step1,
    '2. Uncomment ONE of the UPDATE queries (manual or auto)' as step2,
    '3. Run the entire script again' as step3,
    '4. Verify the result shows "Coach can now delete ALL attendance records"' as step4,
    '5. Test in the UI as Coach Karimov - uncheck attendance and refresh' as step5,
    'Expected: Checkbox stays unchecked after refresh' as expected;
