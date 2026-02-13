-- Migration 032: Fix session_count in activity stats + add email-based action query fallback

-- Fix get_user_activity_stats: count sessions from user_sessions table, not audit_log
CREATE OR REPLACE FUNCTION get_user_activity_stats(
    p_user_email TEXT,
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
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_from_date::DATE, p_to_date::DATE, '1 day'::INTERVAL)::DATE AS d
    ),
    daily_sessions AS (
        SELECT us.login_at::DATE AS d, COUNT(*) AS cnt
        FROM user_sessions us
        WHERE us.user_email = p_user_email
          AND us.login_at >= p_from_date AND us.login_at <= p_to_date
        GROUP BY us.login_at::DATE
    ),
    daily_actions AS (
        SELECT al.created_at::DATE AS d,
            COUNT(*) FILTER (WHERE al.action = 'CREATE') AS creates,
            COUNT(*) FILTER (WHERE al.action = 'UPDATE') AS updates,
            COUNT(*) FILTER (WHERE al.action = 'DELETE') AS deletes,
            COUNT(*) AS total
        FROM audit_log al
        WHERE al.changed_by_email = p_user_email
          AND al.created_at >= p_from_date AND al.created_at <= p_to_date
        GROUP BY al.created_at::DATE
    )
    SELECT
        ds.d AS activity_date,
        COALESCE(sess.cnt, 0) AS session_count,
        COALESCE(act.creates, 0) AS crud_create_count,
        COALESCE(act.updates, 0) AS crud_update_count,
        COALESCE(act.deletes, 0) AS crud_delete_count,
        COALESCE(act.total, 0) AS total_actions
    FROM date_series ds
    LEFT JOIN daily_sessions sess ON sess.d = ds.d
    LEFT JOIN daily_actions act ON act.d = ds.d
    ORDER BY ds.d DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New RPC: get actions by email + date range (fallback for sessions without session_id)
CREATE OR REPLACE FUNCTION get_user_actions_by_date(
    p_user_email TEXT,
    p_from_date TIMESTAMPTZ,
    p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
    audit_id UUID,
    entity_type TEXT,
    entity_id UUID,
    action TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMPTZ,
    session_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id AS audit_id,
        al.entity_type::TEXT,
        al.entity_id,
        al.action::TEXT,
        al.field_name::TEXT,
        al.old_value::TEXT,
        al.new_value::TEXT,
        al.changed_at,
        al.session_id
    FROM audit_log al
    WHERE al.changed_by_email = p_user_email
      AND al.created_at >= p_from_date
      AND al.created_at <= p_to_date
    ORDER BY al.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
