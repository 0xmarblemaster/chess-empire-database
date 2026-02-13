-- Migration 028: Link session_id to audit_log entries via Postgres session variables
-- This allows audit triggers to automatically capture which user session caused the change

-- 1. Function to set current session context (called from frontend)
CREATE OR REPLACE FUNCTION set_session_context(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_session_id', p_session_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to retrieve current session ID safely
CREATE OR REPLACE FUNCTION get_current_session_id()
RETURNS UUID AS $$
BEGIN
    RETURN nullif(current_setting('app.current_session_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. BEFORE INSERT trigger on audit_log to auto-fill session_id
CREATE OR REPLACE FUNCTION fill_audit_session_id()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
BEGIN
    v_session_id := get_current_session_id();
    IF v_session_id IS NOT NULL AND NEW.session_id IS NULL THEN
        NEW.session_id := v_session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_fill_audit_session_id ON audit_log;

CREATE TRIGGER trg_fill_audit_session_id
    BEFORE INSERT ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION fill_audit_session_id();

-- Grant execute permissions so authenticated users can call set_session_context
GRANT EXECUTE ON FUNCTION set_session_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_session_context(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_current_session_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_session_id() TO service_role;
