-- ============================================
-- MIGRATION 023: User Session Logging
-- Created: 2026-02-04
-- Purpose: Track user login/logout sessions for security and usage analytics
-- Priority: MEDIUM - Useful for security auditing and user behavior analysis
-- ============================================

-- STEP 1: Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User reference
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,

    -- Session details
    session_token TEXT, -- Optional session identifier from Supabase auth
    login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    logout_at TIMESTAMP WITH TIME ZONE, -- NULL if still active

    -- Session metadata
    ip_address INET, -- Will be NULL initially (requires Edge Function or client-side)
    user_agent TEXT, -- Browser user agent string

    -- Parsed device information (from user_agent)
    device_type TEXT, -- 'desktop', 'mobile', 'tablet'
    browser TEXT, -- 'Chrome', 'Firefox', 'Safari', etc.
    browser_version TEXT,
    os TEXT, -- 'Windows', 'macOS', 'Linux', 'iOS', 'Android'
    os_version TEXT,

    -- Session status
    status TEXT DEFAULT 'active', -- 'active', 'expired', 'logged_out'

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 2: Create computed column for session duration
-- Add a generated column for session duration in minutes
ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER
GENERATED ALWAYS AS (
    CASE
        WHEN logout_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (logout_at - login_at))::INTEGER / 60
        ELSE NULL
    END
) STORED;

-- STEP 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_type ON user_sessions(device_type);

-- Composite index for active sessions query
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, status, login_at DESC)
    WHERE status = 'active';

-- STEP 4: Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can read all sessions
CREATE POLICY "Admins can read all sessions"
    ON user_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Users can read their own sessions
CREATE POLICY "Users can read own sessions"
    ON user_sessions FOR SELECT
    USING (user_id = auth.uid());

-- Only system functions can insert/update (no manual policies)
COMMENT ON TABLE user_sessions IS
    'Tracks user login/logout sessions for security auditing and usage analytics. Created by login/logout functions.';

-- ============================================
-- STEP 5: Helper function to parse user agent
-- ============================================

CREATE OR REPLACE FUNCTION parse_user_agent(p_user_agent TEXT)
RETURNS TABLE (
    device_type TEXT,
    browser TEXT,
    browser_version TEXT,
    os TEXT,
    os_version TEXT
) AS $$
DECLARE
    v_device_type TEXT := 'desktop';
    v_browser TEXT := 'Unknown';
    v_browser_version TEXT := '';
    v_os TEXT := 'Unknown';
    v_os_version TEXT := '';
BEGIN
    -- Detect device type
    IF p_user_agent ~* 'Mobile|Android|iPhone|iPad|iPod' THEN
        IF p_user_agent ~* 'iPad' THEN
            v_device_type := 'tablet';
        ELSE
            v_device_type := 'mobile';
        END IF;
    ELSIF p_user_agent ~* 'Tablet' THEN
        v_device_type := 'tablet';
    END IF;

    -- Detect browser
    IF p_user_agent ~* 'Chrome' AND p_user_agent !~* 'Edge|Edg' THEN
        v_browser := 'Chrome';
        v_browser_version := substring(p_user_agent from 'Chrome/([0-9.]+)');
    ELSIF p_user_agent ~* 'Firefox' THEN
        v_browser := 'Firefox';
        v_browser_version := substring(p_user_agent from 'Firefox/([0-9.]+)');
    ELSIF p_user_agent ~* 'Safari' AND p_user_agent !~* 'Chrome' THEN
        v_browser := 'Safari';
        v_browser_version := substring(p_user_agent from 'Version/([0-9.]+)');
    ELSIF p_user_agent ~* 'Edge|Edg' THEN
        v_browser := 'Edge';
        v_browser_version := substring(p_user_agent from 'Edg/([0-9.]+)');
    ELSIF p_user_agent ~* 'Opera|OPR' THEN
        v_browser := 'Opera';
        v_browser_version := substring(p_user_agent from 'OPR/([0-9.]+)');
    END IF;

    -- Detect OS
    IF p_user_agent ~* 'Windows NT' THEN
        v_os := 'Windows';
        v_os_version := CASE
            WHEN p_user_agent ~* 'Windows NT 10.0' THEN '10/11'
            WHEN p_user_agent ~* 'Windows NT 6.3' THEN '8.1'
            WHEN p_user_agent ~* 'Windows NT 6.2' THEN '8'
            WHEN p_user_agent ~* 'Windows NT 6.1' THEN '7'
            ELSE 'Other'
        END;
    ELSIF p_user_agent ~* 'Mac OS X' THEN
        v_os := 'macOS';
        v_os_version := substring(p_user_agent from 'Mac OS X ([0-9_]+)');
        v_os_version := replace(v_os_version, '_', '.');
    ELSIF p_user_agent ~* 'Linux' THEN
        v_os := 'Linux';
    ELSIF p_user_agent ~* 'Android' THEN
        v_os := 'Android';
        v_os_version := substring(p_user_agent from 'Android ([0-9.]+)');
    ELSIF p_user_agent ~* 'iPhone|iPad|iPod' THEN
        v_os := 'iOS';
        v_os_version := substring(p_user_agent from 'OS ([0-9_]+)');
        v_os_version := replace(v_os_version, '_', '.');
    END IF;

    RETURN QUERY SELECT v_device_type, v_browser, v_browser_version, v_os, v_os_version;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- STEP 6: Login/Logout functions
-- ============================================

-- Log user login
CREATE OR REPLACE FUNCTION log_user_login(
    p_session_token TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_session_id UUID;
    v_parsed_ua RECORD;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No authenticated user found';
    END IF;

    -- Get user email
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;

    -- Parse user agent if provided
    IF p_user_agent IS NOT NULL THEN
        SELECT * INTO v_parsed_ua FROM parse_user_agent(p_user_agent);
    END IF;

    -- Insert login session
    INSERT INTO user_sessions (
        user_id,
        user_email,
        session_token,
        ip_address,
        user_agent,
        device_type,
        browser,
        browser_version,
        os,
        os_version,
        status
    ) VALUES (
        v_user_id,
        v_user_email,
        p_session_token,
        p_ip_address::INET,
        p_user_agent,
        v_parsed_ua.device_type,
        v_parsed_ua.browser,
        v_parsed_ua.browser_version,
        v_parsed_ua.os,
        v_parsed_ua.os_version,
        'active'
    )
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log user logout
CREATE OR REPLACE FUNCTION log_user_logout(p_session_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No authenticated user found';
    END IF;

    -- If session_id provided, logout that specific session
    IF p_session_id IS NOT NULL THEN
        UPDATE user_sessions
        SET
            logout_at = NOW(),
            status = 'logged_out',
            updated_at = NOW()
        WHERE id = p_session_id
        AND user_id = v_user_id
        AND status = 'active';
    ELSE
        -- Otherwise, logout all active sessions for this user
        UPDATE user_sessions
        SET
            logout_at = NOW(),
            status = 'logged_out',
            updated_at = NOW()
        WHERE user_id = v_user_id
        AND status = 'active';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 7: Analytics functions
-- ============================================

-- Get active sessions for a user
CREATE OR REPLACE FUNCTION get_user_active_sessions(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    login_at TIMESTAMP WITH TIME ZONE,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    ip_address INET
) AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user specified';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.login_at,
        s.device_type,
        s.browser,
        s.os,
        s.ip_address
    FROM user_sessions s
    WHERE s.user_id = v_user_id
    AND s.status = 'active'
    ORDER BY s.login_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get session statistics
CREATE OR REPLACE FUNCTION get_session_stats(
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_sessions BIGINT,
    unique_users BIGINT,
    avg_session_duration_minutes NUMERIC,
    desktop_sessions BIGINT,
    mobile_sessions BIGINT,
    tablet_sessions BIGINT,
    top_browser TEXT,
    top_os TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        ROUND(AVG(session_duration_minutes)::NUMERIC, 1) as avg_session_duration_minutes,
        COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_sessions,
        COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_sessions,
        COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_sessions,
        (
            SELECT browser
            FROM user_sessions
            WHERE login_at BETWEEN p_from_date AND p_to_date
            AND browser IS NOT NULL
            GROUP BY browser
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as top_browser,
        (
            SELECT os
            FROM user_sessions
            WHERE login_at BETWEEN p_from_date AND p_to_date
            AND os IS NOT NULL
            GROUP BY os
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as top_os
    FROM user_sessions
    WHERE login_at BETWEEN p_from_date AND p_to_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get recent sessions (last 7 days)
CREATE OR REPLACE FUNCTION get_recent_sessions(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    id UUID,
    user_email TEXT,
    login_at TIMESTAMP WITH TIME ZONE,
    logout_at TIMESTAMP WITH TIME ZONE,
    session_duration_minutes INTEGER,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.user_email,
        s.login_at,
        s.logout_at,
        s.session_duration_minutes,
        s.device_type,
        s.browser,
        s.os,
        s.status
    FROM user_sessions s
    WHERE s.login_at > NOW() - INTERVAL '7 days'
    ORDER BY s.login_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 8: Scheduled cleanup function
-- ============================================

-- Function to expire old active sessions (can be run via cron)
CREATE OR REPLACE FUNCTION expire_old_sessions(p_expiry_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET
        status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
    AND login_at < NOW() - (p_expiry_hours || ' hours')::INTERVAL;

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;

    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 9: Timestamp trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_sessions_updated_at ON user_sessions;
CREATE TRIGGER update_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 10: Verification and testing
-- ============================================

DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_index_count INT;
    v_function_count INT;
BEGIN
    -- Check table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_sessions'
    ) INTO v_table_exists;

    -- Check indexes exist
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE tablename = 'user_sessions';

    -- Check functions exist
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'parse_user_agent',
        'log_user_login',
        'log_user_logout',
        'get_user_active_sessions',
        'get_session_stats',
        'get_recent_sessions',
        'expire_old_sessions'
    );

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 023 Complete: User Sessions';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Table created: %', CASE WHEN v_table_exists THEN '✅ Yes' ELSE '❌ No' END;
    RAISE NOTICE '📊 Indexes created: % (expected: 5)', v_index_count;
    RAISE NOTICE '📊 Functions created: % (expected: 7)', v_function_count;
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Session tracking features:';
    RAISE NOTICE '   - Login/logout logging';
    RAISE NOTICE '   - Device/browser/OS detection';
    RAISE NOTICE '   - Session duration calculation';
    RAISE NOTICE '   - Active session management';
    RAISE NOTICE '   - Session analytics';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 RLS enabled: Admin read all, users read own';
    RAISE NOTICE '⏰ Auto-expire: Sessions older than 24 hours';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Note: IP address tracking requires Edge Function';
    RAISE NOTICE '⚠️  Note: Call log_user_login() on login, log_user_logout() on logout';
    RAISE NOTICE '';

    IF v_function_count < 7 THEN
        RAISE WARNING 'Expected 7 functions but found %', v_function_count;
    END IF;
END $$;
