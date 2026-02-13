-- Migration 026: Proper session tracking + hybrid user summary

-- 1. Close stale sessions (no proper logout, inactive >30min)
CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
    closed_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET ended_at = last_active_at
    WHERE ended_at IS NULL
      AND last_active_at < NOW() - INTERVAL '30 minutes';
    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hybrid get_user_summary: uses sessions if available, falls back to audit_log
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
    -- Check if user has any sessions
    SELECT EXISTS(
        SELECT 1 FROM user_sessions us
        JOIN auth.users au ON au.id = us.user_id
        WHERE au.email = p_user_email
    ) INTO v_has_sessions;

    IF v_has_sessions THEN
        -- Original: session-based stats
        RETURN QUERY
        SELECT
            (SELECT MAX(us2.started_at) FROM user_sessions us2 JOIN auth.users au2 ON au2.id = us2.user_id WHERE au2.email = p_user_email),
            (SELECT EXTRACT(EPOCH FROM (COALESCE(us2.ended_at, us2.last_active_at) - us2.started_at))::INTEGER / 60
             FROM user_sessions us2 JOIN auth.users au2 ON au2.id = us2.user_id
             WHERE au2.email = p_user_email ORDER BY us2.started_at DESC LIMIT 1),
            (SELECT COUNT(*) FROM user_sessions us2 JOIN auth.users au2 ON au2.id = us2.user_id
             WHERE au2.email = p_user_email AND us2.started_at >= NOW() - INTERVAL '30 days'),
            (SELECT COUNT(*) FROM audit_log al
             WHERE al.changed_by_email = p_user_email AND al.created_at >= NOW() - INTERVAL '30 days'),
            (SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(us2.ended_at, us2.last_active_at) - us2.started_at)) / 60)
             FROM user_sessions us2 JOIN auth.users au2 ON au2.id = us2.user_id
             WHERE au2.email = p_user_email AND us2.started_at >= NOW() - INTERVAL '30 days');
    ELSE
        -- Fallback: derive from audit_log only
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
