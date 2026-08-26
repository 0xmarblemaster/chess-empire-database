-- 069: Gate tournament registration — registration now happens only through
-- the Chess Empire app (chess-empire.chesster.io) or key-holding bots.
-- The public web page no longer calls this RPC directly (removed in commit 540078e),
-- so the anon grant is revoked. Kept: authenticated (admin dashboard),
-- service_role (tournaments-api edge function / Telegram / WhatsApp bots).
-- PUBLIC must be revoked too: Postgres grants EXECUTE TO PUBLIC on function
-- creation, so anon inherits execute even without an explicit anon grant.
-- Rollback: GRANT EXECUTE ... TO anon;
-- Applied to production 2026-08-26 via Management API.

REVOKE EXECUTE ON FUNCTION register_for_tournament(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT
) FROM anon, PUBLIC;
