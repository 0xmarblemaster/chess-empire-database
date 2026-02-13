-- ============================================
-- MIGRATION 024: User Activity Analytics
-- Created: 2026-02-13
-- Purpose: Enhance audit tracking and create user activity analytics functions
-- Priority: HIGH - Required for user activity monitoring and reporting
-- ============================================

-- STEP 1: Add audit trigger for attendance table (same pattern as students/coaches/branches)
-- This ensures attendance changes are tracked in audit_log

-- First check if attendance trigger already exists
DROP TRIGGER IF EXISTS audit_attendance_changes ON attendance;

-- Create trigger for attendance table using existing log_entity_changes function
CREATE TRIGGER audit_attendance_changes
    AFTER INSERT OR UPDATE OR DELETE ON attendance
    FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- Update log_entity_changes function to handle attendance table
CREATE OR REPLACE FUNCTION log_entity_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_entity_type TEXT;
    v_old_record JSONB;
    v_new_record JSONB;
    v_field TEXT;
    v_old_value TEXT;
    v_new_value TEXT;
BEGIN
    -- Get current user info
    v_user_id := auth.uid();

    -- Get user email (with fallback for system operations)
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;

    IF v_user_email IS NULL THEN
        v_user_email := 'system@chessempire.kz';
    END IF;

    -- Determine entity type from table name
    v_entity_type := TG_TABLE_NAME;

    -- Handle DELETE
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (
            entity_type, entity_id, action,
            field_name, old_value, new_value,
            changed_by, changed_by_email
        ) VALUES (
            v_entity_type, OLD.id, 'DELETE',
            NULL, NULL, NULL,
            v_user_id, v_user_email
        );
        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (
            entity_type, entity_id, action,
            field_name, old_value, new_value,
            changed_by, changed_by_email
        ) VALUES (
            v_entity_type, NEW.id, 'CREATE',
            NULL, NULL, NULL,
            v_user_id, v_user_email
        );
        RETURN NEW;
    END IF;

    -- Handle UPDATE - track each changed field separately
    IF (TG_OP = 'UPDATE') THEN
        v_old_record := to_jsonb(OLD);
        v_new_record := to_jsonb(NEW);

        -- Attendance: Track key fields
        IF v_entity_type = 'attendance' THEN
            IF OLD.student_id IS DISTINCT FROM NEW.student_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'student_id', OLD.student_id::TEXT, NEW.student_id::TEXT, v_user_id, v_user_email);
            END IF;

            IF OLD.lesson_date IS DISTINCT FROM NEW.lesson_date THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'lesson_date', OLD.lesson_date::TEXT, NEW.lesson_date::TEXT, v_user_id, v_user_email);
            END IF;

            IF OLD.status IS DISTINCT FROM NEW.status THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'status', OLD.status, NEW.status, v_user_id, v_user_email);
            END IF;

            IF OLD.notes IS DISTINCT FROM NEW.notes THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'notes', OLD.notes, NEW.notes, v_user_id, v_user_email);
            END IF;

            IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email);
            END IF;

            IF OLD.coach_id IS DISTINCT FROM NEW.coach_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'coach_id', OLD.coach_id::TEXT, NEW.coach_id::TEXT, v_user_id, v_user_email);
            END IF;
        END IF;

        -- Students: Track 15 fields (existing logic)
        IF v_entity_type = 'students' THEN
            -- Name fields
            IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'first_name', OLD.first_name, NEW.first_name, v_user_id, v_user_email);
            END IF;

            IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'last_name', OLD.last_name, NEW.last_name, v_user_id, v_user_email);
            END IF;

            -- Age
            IF OLD.age IS DISTINCT FROM NEW.age THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'age', OLD.age::TEXT, NEW.age::TEXT, v_user_id, v_user_email);
            END IF;

            -- Status (CRITICAL for tracking freeze periods, churn, etc.)
            IF OLD.status IS DISTINCT FROM NEW.status THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'status', OLD.status, NEW.status, v_user_id, v_user_email);
            END IF;

            -- Branch assignment
            IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email);
            END IF;

            -- Coach assignment
            IF OLD.coach_id IS DISTINCT FROM NEW.coach_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'coach_id', OLD.coach_id::TEXT, NEW.coach_id::TEXT, v_user_id, v_user_email);
            END IF;

            -- Current level
            IF OLD.current_level IS DISTINCT FROM NEW.current_level THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'current_level', OLD.current_level::TEXT, NEW.current_level::TEXT, v_user_id, v_user_email);
            END IF;

            -- Parent info
            IF OLD.parent_name IS DISTINCT FROM NEW.parent_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_name', OLD.parent_name, NEW.parent_name, v_user_id, v_user_email);
            END IF;

            IF OLD.parent_phone IS DISTINCT FROM NEW.parent_phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_phone', OLD.parent_phone, NEW.parent_phone, v_user_id, v_user_email);
            END IF;

            IF OLD.parent_email IS DISTINCT FROM NEW.parent_email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'parent_email', OLD.parent_email, NEW.parent_email, v_user_id, v_user_email);
            END IF;

            -- Enrollment date
            IF OLD.enrollment_date IS DISTINCT FROM NEW.enrollment_date THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'enrollment_date', OLD.enrollment_date::TEXT, NEW.enrollment_date::TEXT, v_user_id, v_user_email);
            END IF;

            -- School
            IF OLD.school IS DISTINCT FROM NEW.school THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'school', OLD.school, NEW.school, v_user_id, v_user_email);
            END IF;

            -- Address
            IF OLD.address IS DISTINCT FROM NEW.address THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'address', OLD.address, NEW.address, v_user_id, v_user_email);
            END IF;

            -- Notes
            IF OLD.notes IS DISTINCT FROM NEW.notes THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'notes', OLD.notes, NEW.notes, v_user_id, v_user_email);
            END IF;

            -- Photo URL
            IF OLD.photo_url IS DISTINCT FROM NEW.photo_url THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'photo_url', OLD.photo_url, NEW.photo_url, v_user_id, v_user_email);
            END IF;
        END IF;

        -- Coaches: Track 5 fields (existing logic)
        IF v_entity_type = 'coaches' THEN
            IF OLD.first_name IS DISTINCT FROM NEW.first_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'first_name', OLD.first_name, NEW.first_name, v_user_id, v_user_email);
            END IF;

            IF OLD.last_name IS DISTINCT FROM NEW.last_name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'last_name', OLD.last_name, NEW.last_name, v_user_id, v_user_email);
            END IF;

            IF OLD.email IS DISTINCT FROM NEW.email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email);
            END IF;

            IF OLD.phone IS DISTINCT FROM NEW.phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email);
            END IF;

            -- Note: branch_id deprecated in favor of coach_branches junction table
            IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'branch_id', OLD.branch_id::TEXT, NEW.branch_id::TEXT, v_user_id, v_user_email);
            END IF;
        END IF;

        -- Branches: Track 4 fields (existing logic)
        IF v_entity_type = 'branches' THEN
            IF OLD.name IS DISTINCT FROM NEW.name THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'name', OLD.name, NEW.name, v_user_id, v_user_email);
            END IF;

            IF OLD.location IS DISTINCT FROM NEW.location THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'location', OLD.location, NEW.location, v_user_id, v_user_email);
            END IF;

            IF OLD.phone IS DISTINCT FROM NEW.phone THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'phone', OLD.phone, NEW.phone, v_user_id, v_user_email);
            END IF;

            IF OLD.email IS DISTINCT FROM NEW.email THEN
                INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_email)
                VALUES (v_entity_type, NEW.id, 'UPDATE', 'email', OLD.email, NEW.email, v_user_id, v_user_email);
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 2: Add session_id column to audit_log table for linking actions to sessions
ALTER TABLE audit_log 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL;

-- Add index for session_id lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_session_id ON audit_log(session_id);

-- STEP 3: Create RPC functions for user activity analytics

-- Get user activity stats per day within a date range
CREATE OR REPLACE FUNCTION get_user_activity_stats(
    p_user_email TEXT,
    p_from_date TIMESTAMPTZ,
    p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
    date DATE,
    session_count BIGINT,
    crud_create_count BIGINT,
    crud_update_count BIGINT,
    crud_delete_count BIGINT,
    total_actions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(
            p_from_date::DATE,
            p_to_date::DATE,
            '1 day'::INTERVAL
        )::DATE as day
    ),
    daily_sessions AS (
        SELECT 
            DATE(s.login_at) as session_date,
            COUNT(*) as session_count
        FROM user_sessions s
        WHERE s.user_email = p_user_email
        AND s.login_at BETWEEN p_from_date AND p_to_date
        GROUP BY DATE(s.login_at)
    ),
    daily_actions AS (
        SELECT 
            DATE(a.changed_at) as action_date,
            COUNT(*) FILTER (WHERE a.action = 'CREATE') as create_count,
            COUNT(*) FILTER (WHERE a.action = 'UPDATE') as update_count,
            COUNT(*) FILTER (WHERE a.action = 'DELETE') as delete_count,
            COUNT(*) as total_count
        FROM audit_log a
        WHERE a.changed_by_email = p_user_email
        AND a.changed_at BETWEEN p_from_date AND p_to_date
        GROUP BY DATE(a.changed_at)
    )
    SELECT 
        d.day as date,
        COALESCE(s.session_count, 0) as session_count,
        COALESCE(a.create_count, 0) as crud_create_count,
        COALESCE(a.update_count, 0) as crud_update_count,
        COALESCE(a.delete_count, 0) as crud_delete_count,
        COALESCE(a.total_count, 0) as total_actions
    FROM date_series d
    LEFT JOIN daily_sessions s ON s.session_date = d.day
    LEFT JOIN daily_actions a ON a.action_date = d.day
    ORDER BY d.day DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all audit log entries for a specific session
CREATE OR REPLACE FUNCTION get_user_session_with_actions(p_session_id UUID)
RETURNS TABLE (
    audit_id UUID,
    entity_type TEXT,
    entity_id UUID,
    action TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP WITH TIME ZONE,
    session_info JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as audit_id,
        a.entity_type,
        a.entity_id,
        a.action,
        a.field_name,
        a.old_value,
        a.new_value,
        a.changed_at,
        json_build_object(
            'session_id', s.id,
            'login_at', s.login_at,
            'logout_at', s.logout_at,
            'device_type', s.device_type,
            'browser', s.browser,
            'os', s.os,
            'duration_minutes', s.session_duration_minutes
        ) as session_info
    FROM audit_log a
    LEFT JOIN user_sessions s ON s.id = a.session_id
    WHERE a.session_id = p_session_id
    ORDER BY a.changed_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user summary statistics
CREATE OR REPLACE FUNCTION get_user_summary(p_user_email TEXT)
RETURNS TABLE (
    last_session_date TIMESTAMP WITH TIME ZONE,
    last_session_duration_minutes INTEGER,
    total_sessions_30d BIGINT,
    total_actions_30d BIGINT,
    avg_session_duration_30d NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH user_sessions_30d AS (
        SELECT *
        FROM user_sessions s
        WHERE s.user_email = p_user_email
        AND s.login_at > NOW() - INTERVAL '30 days'
    ),
    user_actions_30d AS (
        SELECT COUNT(*) as action_count
        FROM audit_log a
        WHERE a.changed_by_email = p_user_email
        AND a.changed_at > NOW() - INTERVAL '30 days'
    ),
    latest_session AS (
        SELECT 
            login_at,
            session_duration_minutes
        FROM user_sessions
        WHERE user_email = p_user_email
        ORDER BY login_at DESC
        LIMIT 1
    )
    SELECT 
        l.login_at as last_session_date,
        l.session_duration_minutes as last_session_duration_minutes,
        (SELECT COUNT(*) FROM user_sessions_30d) as total_sessions_30d,
        (SELECT action_count FROM user_actions_30d) as total_actions_30d,
        (SELECT ROUND(AVG(session_duration_minutes)::NUMERIC, 1) FROM user_sessions_30d WHERE session_duration_minutes IS NOT NULL) as avg_session_duration_30d
    FROM latest_session l;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Helper function to get admin and coach users for dropdown
CREATE OR REPLACE FUNCTION get_admin_and_coach_users()
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    role TEXT,
    first_name TEXT,
    last_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.user_id,
        au.email,
        ur.role,
        CASE 
            WHEN ur.role = 'coach' THEN c.first_name
            ELSE 'Admin'
        END as first_name,
        CASE 
            WHEN ur.role = 'coach' THEN c.last_name
            ELSE 'User'
        END as last_name
    FROM user_roles ur
    JOIN auth.users au ON au.id = ur.user_id
    LEFT JOIN coaches c ON c.user_id = ur.user_id AND ur.role = 'coach'
    WHERE ur.role IN ('admin', 'coach')
    ORDER BY ur.role DESC, au.email ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 5: Verification and testing
-- ============================================

DO $$
DECLARE
    v_trigger_count INT;
    v_function_count INT;
    v_column_exists BOOLEAN;
BEGIN
    -- Check triggers are active
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgname IN ('audit_students_changes', 'audit_coaches_changes', 'audit_branches_changes', 'audit_attendance_changes')
    AND tgenabled = 'O'; -- 'O' means enabled

    -- Check functions exist
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'get_user_activity_stats',
        'get_user_session_with_actions', 
        'get_user_summary',
        'get_admin_and_coach_users'
    );

    -- Check session_id column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log'
        AND column_name = 'session_id'
    ) INTO v_column_exists;

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 024 Complete: User Activity Analytics';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Triggers active: % (expected: 4)', v_trigger_count;
    RAISE NOTICE '📊 Functions created: % (expected: 4)', v_function_count;
    RAISE NOTICE '📊 Session_id column: %', CASE WHEN v_column_exists THEN '✅ Added' ELSE '❌ Missing' END;
    RAISE NOTICE '';
    RAISE NOTICE '🔍 New tracking features:';
    RAISE NOTICE '   - Attendance table audit triggers';
    RAISE NOTICE '   - Session linking for audit logs';
    RAISE NOTICE '   - Per-day activity statistics';
    RAISE NOTICE '   - Session action details';
    RAISE NOTICE '   - User summary analytics';
    RAISE NOTICE '   - Admin/coach user listing';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Available RPC functions:';
    RAISE NOTICE '   - get_user_activity_stats(email, from, to)';
    RAISE NOTICE '   - get_user_session_with_actions(session_id)';
    RAISE NOTICE '   - get_user_summary(email)';
    RAISE NOTICE '   - get_admin_and_coach_users()';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';

    IF v_trigger_count < 4 THEN
        RAISE WARNING 'Expected 4 triggers but found %', v_trigger_count;
    END IF;

    IF v_function_count < 4 THEN
        RAISE WARNING 'Expected 4 functions but found %', v_function_count;
    END IF;
END $$;