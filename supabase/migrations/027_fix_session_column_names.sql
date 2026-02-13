-- Migration 027: Fix RPCs to match actual user_sessions column names
-- Columns: login_at (not started_at), logout_at (not ended_at), updated_at (not last_active_at)

CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
    closed_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET logout_at = updated_at,
        status = 'expired',
        session_duration_minutes = EXTRACT(EPOCH FROM (updated_at - login_at))::INTEGER / 60
    WHERE logout_at IS NULL
      AND updated_at < NOW() - INTERVAL '30 minutes';
    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_summary(p_user_email TEXT)
RETURNS TABLE (
    last_session_date TIMESTAMPTZ,
    last_session_duration_minutes INTEGER,
    total_sessions_30d BIGINT,
    total_actions_30d BIGINT,
    avg_session_duration_30d NUMERIC
) AS $$
DECLARE
    v_has_sessions BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM user_sessions us
        WHERE us.user_email = p_user_email
    ) INTO v_has_sessions;

    IF v_has_sessions THEN
        RETURN QUERY
        SELECT
            (SELECT MAX(us2.login_at) FROM user_sessions us2 WHERE us2.user_email = p_user_email),
            (SELECT us2.session_duration_minutes
             FROM user_sessions us2
             WHERE us2.user_email = p_user_email ORDER BY us2.login_at DESC LIMIT 1),
            (SELECT COUNT(*) FROM user_sessions us2
             WHERE us2.user_email = p_user_email AND us2.login_at >= NOW() - INTERVAL '30 days'),
            (SELECT COUNT(*) FROM audit_log al
             WHERE al.changed_by_email = p_user_email AND al.created_at >= NOW() - INTERVAL '30 days'),
            (SELECT AVG(us2.session_duration_minutes)
             FROM user_sessions us2
             WHERE us2.user_email = p_user_email AND us2.login_at >= NOW() - INTERVAL '30 days');
    ELSE
        RETURN QUERY
        SELECT
            (SELECT MAX(al.created_at) FROM audit_log al WHERE al.changed_by_email = p_user_email),
            NULL::INTEGER,
            (SELECT COUNT(DISTINCT al.created_at::DATE) FROM audit_log al
             WHERE al.changed_by_email = p_user_email AND al.created_at >= NOW() - INTERVAL '30 days'),
            (SELECT COUNT(*) FROM audit_log al
             WHERE al.changed_by_email = p_user_email AND al.created_at >= NOW() - INTERVAL '30 days'),
            NULL::NUMERIC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix get_my_activity_summary to use corrected get_user_summary
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
