-- Migration 102 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Checks the coach_notifications contract: table + unique key + inbox index,
-- RLS enabled, exactly the two SELECT policies (no client INSERT / UPDATE /
-- DELETE policy), no write grants for anon / authenticated, and the three
-- SECURITY DEFINER helpers. Every row of the final query must have ok = true.

WITH checks AS (
    SELECT 'table exists' AS check_name,
           to_regclass('public.coach_notifications') IS NOT NULL AS ok
    UNION ALL
    SELECT 'rls enabled',
           COALESCE((SELECT relrowsecurity FROM pg_class
                     WHERE oid = to_regclass('public.coach_notifications')), false)
    UNION ALL
    SELECT 'unique (recipient_coach_id, student_id, kind)',
           EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'coach_notifications_recipient_student_kind_key'
                     AND contype = 'u')
    UNION ALL
    SELECT 'inbox index',
           to_regclass('public.coach_notifications_inbox_idx') IS NOT NULL
    UNION ALL
    SELECT 'only SELECT policies (2)',
           (SELECT count(*) FILTER (WHERE cmd = 'SELECT') = 2 AND count(*) = 2
            FROM pg_policies WHERE tablename = 'coach_notifications')
    UNION ALL
    SELECT 'no write grants for anon / authenticated',
           NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                       WHERE table_name = 'coach_notifications'
                         AND grantee IN ('anon', 'authenticated')
                         AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
    UNION ALL
    SELECT 'anon cannot select',
           NOT has_table_privilege('anon', 'public.coach_notifications', 'SELECT')
    UNION ALL
    SELECT 'security definer helpers',
           (SELECT count(*) = 3 FROM pg_proc
            WHERE proname IN ('coach_notifications_my_coach_ids',
                              'coach_notifications_is_admin',
                              'mark_coach_notifications_read')
              AND prosecdef)
)
SELECT check_name, ok FROM checks;

-- Recent fan-out (latest 20 rows) for a manual eyeball.
SELECT created_at, recipient_coach_id, student_code, student_name,
       assigned_coach_name, branch_name, read_at
FROM coach_notifications
ORDER BY created_at DESC
LIMIT 20;
