-- Migration 025: Coach self-scoped activity access
-- Lets coaches view their own activity stats via RLS-friendly wrappers

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
