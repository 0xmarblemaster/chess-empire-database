-- Migration 104 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Checks the «Очистить» contract: cleared_at column, the SECURITY DEFINER
-- clear_coach_notifications RPC (authenticated may execute, anon may not), and
-- that clients still cannot UPDATE / DELETE coach_notifications. Every row of
-- the final query must have ok = true.

WITH checks AS (
    SELECT 'cleared_at column (timestamptz, nullable)' AS check_name,
           EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'coach_notifications'
                     AND column_name = 'cleared_at'
                     AND data_type = 'timestamp with time zone'
                     AND is_nullable = 'YES') AS ok
    UNION ALL
    SELECT 'clear function is security definer',
           EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname = 'clear_coach_notifications' AND prosecdef)
    UNION ALL
    SELECT 'authenticated can execute clear function',
           has_function_privilege('authenticated', 'public.clear_coach_notifications(uuid[])', 'EXECUTE')
    UNION ALL
    SELECT 'anon cannot execute clear function',
           NOT has_function_privilege('anon', 'public.clear_coach_notifications(uuid[])', 'EXECUTE')
    UNION ALL
    SELECT 'no DELETE / UPDATE grant to anon / authenticated',
           NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                       WHERE table_name = 'coach_notifications'
                         AND grantee IN ('anon', 'authenticated')
                         AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE'))
    UNION ALL
    SELECT 'only SELECT policies (2)',
           (SELECT count(*) FILTER (WHERE cmd = 'SELECT') = 2 AND count(*) = 2
            FROM pg_policies WHERE tablename = 'coach_notifications')
)
SELECT check_name, ok FROM checks;

-- Read / cleared counts per state for a manual eyeball.
SELECT (read_at IS NOT NULL) AS is_read, (cleared_at IS NOT NULL) AS is_cleared, count(*)
FROM coach_notifications
GROUP BY 1, 2
ORDER BY 1, 2;
