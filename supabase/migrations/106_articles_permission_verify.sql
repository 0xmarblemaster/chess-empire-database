-- Migration 106 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Checks that user_roles.can_manage_articles exists (NOT NULL, default false),
-- that get_user_roles_with_emails() returns it, and that every admin has it.
-- Every row of the first query must have ok = true.

WITH checks AS (
    SELECT 'user_roles.can_manage_articles exists (boolean, NOT NULL, default false)' AS check_name,
           EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                     AND table_name = 'user_roles'
                     AND column_name = 'can_manage_articles'
                     AND data_type = 'boolean'
                     AND is_nullable = 'NO'
                     AND column_default = 'false') AS ok
    UNION ALL
    SELECT 'get_user_roles_with_emails returns can_manage_articles',
           EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname = 'get_user_roles_with_emails'
                     AND 'can_manage_articles' = ANY (proargnames))
    UNION ALL
    SELECT 'get_user_roles_with_emails is SECURITY DEFINER',
           EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname = 'get_user_roles_with_emails' AND prosecdef)
    UNION ALL
    SELECT 'authenticated can EXECUTE get_user_roles_with_emails',
           has_function_privilege('authenticated', 'get_user_roles_with_emails()', 'EXECUTE')
    UNION ALL
    SELECT 'every admin has can_manage_articles',
           NOT EXISTS (SELECT 1 FROM user_roles
                       WHERE role = 'admin' AND can_manage_articles = false)
)
SELECT check_name, ok FROM checks;

-- Who has the flag, for a manual eyeball.
SELECT role, can_manage_articles, count(*)
FROM user_roles
GROUP BY role, can_manage_articles
ORDER BY role, can_manage_articles;
