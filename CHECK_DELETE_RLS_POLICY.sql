-- Check all RLS policies on students table
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
WHERE tablename = 'students'
ORDER BY cmd, policyname;

-- Check if there's a DELETE policy
SELECT
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'students'
  AND cmd = 'DELETE';
