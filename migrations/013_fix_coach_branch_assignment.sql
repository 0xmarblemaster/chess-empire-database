-- ============================================
-- FIX: Coach Branch Assignment Issues
-- Run this in Supabase SQL Editor ONLY AFTER running diagnostic
-- ============================================

-- Purpose: Fix common issues that prevent coaches from deleting attendance
-- IMPORTANT: Only run this if the diagnostic (012_diagnose_coach_deletion_issue.sql)
-- revealed one of these specific issues.

-- ============================================
-- ISSUE 1: Coach has user_role but no coach_id
-- ============================================

-- This query will show coaches who have user_roles but coach_id is NULL
SELECT
    ur.user_id,
    ur.email,
    ur.role,
    ur.coach_id,
    'Missing coach_id link' as issue
FROM user_roles ur
WHERE ur.role = 'coach'
  AND ur.coach_id IS NULL;

-- If Coach Karimov appears above, you need to find their coach record and link it:
/*
-- EXAMPLE FIX (replace values):
UPDATE user_roles
SET coach_id = '<coach-id-from-coaches-table>'
WHERE user_id = '<coach-karimov-user-id>';
*/

-- ============================================
-- ISSUE 2: Coach exists but has no branch_id
-- ============================================

-- This query shows coaches without a branch assignment
SELECT
    c.id as coach_id,
    c.first_name,
    c.last_name,
    c.email,
    c.branch_id,
    'Missing branch assignment' as issue
FROM coaches c
WHERE c.branch_id IS NULL;

-- If Coach Karimov appears above, you need to assign them to a branch:
/*
-- EXAMPLE FIX (replace values):
-- First, find available branches:
SELECT id, name FROM branches ORDER BY name;

-- Then assign coach to correct branch:
UPDATE coaches
SET branch_id = '<correct-branch-id>'
WHERE id = '<coach-karimov-id>';
*/

-- ============================================
-- ISSUE 3: Attendance records have wrong branch_id
-- ============================================

-- This is trickier - attendance records might be assigned to wrong branch
-- First, verify which branch students belong to:
SELECT
    s.id as student_id,
    s.first_name || ' ' || s.last_name as student_name,
    s.branch_id as student_branch_id,
    b.name as student_branch_name,
    COUNT(a.id) as attendance_count,
    COUNT(DISTINCT a.branch_id) as unique_attendance_branches
FROM students s
LEFT JOIN branches b ON b.id = s.branch_id
LEFT JOIN attendance a ON a.student_id = s.id
GROUP BY s.id, s.first_name, s.last_name, s.branch_id, b.name
HAVING COUNT(DISTINCT a.branch_id) > 1  -- Students with attendance in multiple branches
ORDER BY student_name;

-- If you find students with attendance in wrong branches, you can fix with:
/*
-- EXAMPLE FIX (replace values):
-- Update attendance records to match student's branch:
UPDATE attendance
SET branch_id = (SELECT branch_id FROM students WHERE id = attendance.student_id)
WHERE branch_id != (SELECT branch_id FROM students WHERE id = attendance.student_id);

-- OR update specific attendance records:
UPDATE attendance
SET branch_id = '<correct-branch-id>'
WHERE id IN ('<attendance-id-1>', '<attendance-id-2>', ...);
*/

-- ============================================
-- ISSUE 4: RLS Policy not applied (old policy still active)
-- ============================================

-- Check if old policy is still active:
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'attendance'
  AND cmd = 'DELETE'
  AND policyname = 'Admins can delete attendance';

-- If old policy appears above, re-run migration 011:
/*
DROP POLICY IF EXISTS "Admins can delete attendance" ON attendance;

CREATE POLICY "Users can delete attendance in their branches"
    ON attendance FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            LEFT JOIN coaches c ON c.id = ur.coach_id
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'
                OR (
                    ur.role = 'coach'
                    AND attendance.branch_id = c.branch_id
                )
            )
        )
    );
*/

-- ============================================
-- VERIFICATION: Test the fix
-- ============================================

-- After applying fixes, verify with this query (replace <coach-user-id>):
/*
WITH coach_info AS (
    SELECT
        ur.user_id,
        ur.role,
        ur.coach_id,
        c.branch_id as coach_branch_id,
        c.first_name || ' ' || c.last_name as coach_name
    FROM user_roles ur
    LEFT JOIN coaches c ON c.id = ur.coach_id
    WHERE ur.user_id = '<coach-user-id>'
)
SELECT
    ci.coach_name,
    ci.role,
    ci.coach_branch_id,
    b.name as branch_name,
    COUNT(a.id) as attendance_records_can_delete
FROM coach_info ci
LEFT JOIN branches b ON b.id = ci.coach_branch_id
LEFT JOIN attendance a ON a.branch_id = ci.coach_branch_id
GROUP BY ci.coach_name, ci.role, ci.coach_branch_id, b.name;
*/

-- Expected: Should show coach name, branch, and count of deletable attendance records

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT
    'Review the diagnostic results from 012_diagnose_coach_deletion_issue.sql' as step1,
    'Uncomment and run the appropriate fix above' as step2,
    'Test deletion in the UI as Coach Karimov' as step3,
    'Expected: Checkbox should stay unchecked after refresh' as step4;
