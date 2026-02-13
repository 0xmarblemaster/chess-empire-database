-- ============================================
-- MIGRATION 025: Coach Activity Access Control
-- Created: 2026-02-13
-- Purpose: Allow coaches to view their own activity with proper access control
-- ============================================

-- Self-scoped version of get_user_summary (uses auth.uid(), no email param needed)
CREATE OR REPLACE FUNCTION get_my_activity_summary()
RETURNS TABLE (
    last_session_date TIMESTAMPTZ,
    last_session_duration_minutes INTEGER,
    total_sessions_30d BIGINT,
    total_actions_30d BIGINT,
    avg_session_duration_30d NUMERIC
) AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    RETURN QUERY SELECT * FROM get_user_summary(v_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Self-scoped version of get_user_activity_stats
CREATE OR REPLACE FUNCTION get_my_activity_stats(
    p_from_date TIMESTAMPTZ,
    p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
    activity_date DATE,
    session_count BIGINT,
    crud_create_count BIGINT,
    crud_update_count BIGINT,
    crud_delete_count BIGINT,
    total_actions BIGINT
) AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    RETURN QUERY SELECT * FROM get_user_activity_stats(v_email, p_from_date, p_to_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify
DO $$ DECLARE v INT;
BEGIN
    SELECT COUNT(*) INTO v FROM pg_proc WHERE proname IN ('get_my_activity_summary', 'get_my_activity_stats');
    RAISE NOTICE 'Self-scoped functions created: %/2', v;
END $$;
