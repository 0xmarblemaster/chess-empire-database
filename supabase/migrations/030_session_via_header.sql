-- Migration 030: Read session_id from request header instead of session variable
-- Supabase connection pooling breaks set_config across requests
-- Use request.headers which Supabase passes through to each connection

CREATE OR REPLACE FUNCTION fill_audit_session_id()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
BEGIN
    IF NEW.session_id IS NULL THEN
        BEGIN
            -- Try request header first (works with Supabase connection pooling)
            v_session_id := nullif(
                current_setting('request.header.x-session-id', true), 
                ''
            )::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_session_id := NULL;
        END;
        
        -- Fallback to session variable (works for direct DB connections)
        IF v_session_id IS NULL THEN
            BEGIN
                v_session_id := nullif(
                    current_setting('app.current_session_id', true), 
                    ''
                )::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_session_id := NULL;
            END;
        END IF;
        
        NEW.session_id := v_session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
