-- Migration 042 — public.users view for admin UI email resolution
--
-- Background:
--   admin-v2.js (Upload History tab) calls
--     supabase.from('users').select('id,email').in('id', uploaderIds)
--   to resolve uploader emails. There is no public.users table — auth.users
--   lives in the auth schema and is not exposed via PostgREST, so the query
--   currently 404s.
--
-- Solution:
--   Expose a thin view at public.users that surfaces only (id, email) from
--   auth.users. RLS on the view is simulated by a WHERE-clause admin gate
--   that mirrors the admin RLS pattern used in migration 041's
--   "Admins manage rating_uploads" policy and the admin_users_cache pattern
--   in fix-rls-recursion-v2.sql.
--
-- Note on view security mode:
--   We use the default (security definer) rather than security_invoker = true.
--   Supabase locks auth.users with RLS that is not satisfied by any
--   authenticated grant, so an invoker-mode view returns zero rows for
--   browser admin sessions even with column-level grants. Running as the
--   view owner (postgres) bypasses auth.users RLS, and the admin gate in
--   the WHERE clause is what enforces the "admin-only SELECT" requirement —
--   functionally equivalent to an RLS policy on a real table.
--
-- Admin gate:
--   - current_user = 'service_role'    → see all rows (verification / edge
--                                         functions / server-side scripts).
--   - authenticated admin (user_roles) → see all rows.
--   - anyone else                      → see zero rows.

DROP VIEW IF EXISTS public.users;

CREATE VIEW public.users AS
SELECT u.id, u.email
FROM auth.users u
WHERE
    current_user = 'service_role'
    OR EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'admin'
    );

REVOKE ALL ON public.users FROM PUBLIC;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.users TO service_role;

COMMENT ON VIEW public.users IS
    'Migration 042: exposes auth.users(id, email) for admin UI uploader email lookup. Admin-only via WHERE-clause gate on user_roles (mirrors migration 041 RLS pattern). service_role bypasses the gate.';
