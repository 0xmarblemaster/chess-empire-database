-- Migration 028: Fix close_stale_sessions — session_duration_minutes is a generated column

CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
    closed_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET logout_at = updated_at,
        status = 'expired'
    WHERE logout_at IS NULL
      AND updated_at < NOW() - INTERVAL '30 minutes';
    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
