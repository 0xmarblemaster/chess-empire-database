-- Migration 105 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Checks that the students INSERT policy is admin-only (no can_edit_students
-- branch) while the UPDATE / DELETE policies from migration 059 still let
-- coaches with can_edit_students edit. Every row of the final query must have
-- ok = true.

WITH checks AS (
    SELECT 'insert policy exists (authenticated)' AS check_name,
           EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'students'
                     AND policyname = 'Authorized users can insert students'
                     AND cmd = 'INSERT'
                     AND 'authenticated' = ANY (roles)) AS ok
    UNION ALL
    SELECT 'only one INSERT policy on students',
           (SELECT count(*) = 1 FROM pg_policies
            WHERE tablename = 'students' AND cmd = 'INSERT')
    UNION ALL
    SELECT 'insert WITH CHECK requires role = admin',
           EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'students'
                     AND policyname = 'Authorized users can insert students'
                     AND with_check LIKE '%''admin''%')
    UNION ALL
    SELECT 'insert WITH CHECK does not reference can_edit_students',
           EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'students'
                     AND policyname = 'Authorized users can insert students'
                     AND with_check NOT LIKE '%can_edit_students%')
    UNION ALL
    SELECT 'update policy unchanged (admin OR can_edit_students)',
           EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'students'
                     AND policyname = 'Authorized users can update students'
                     AND cmd = 'UPDATE'
                     AND qual LIKE '%can_edit_students%'
                     AND qual LIKE '%''admin''%')
    UNION ALL
    SELECT 'delete policy unchanged (admin OR can_edit_students)',
           EXISTS (SELECT 1 FROM pg_policies
                   WHERE tablename = 'students'
                     AND policyname = 'Authorized users can delete students'
                     AND cmd = 'DELETE'
                     AND qual LIKE '%can_edit_students%'
                     AND qual LIKE '%''admin''%')
)
SELECT check_name, ok FROM checks;

-- Full students policy list for a manual eyeball.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'students'
ORDER BY cmd, policyname;
