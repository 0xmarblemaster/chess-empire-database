-- ============================================
-- MIGRATION 021: Entity Change Log (Audit Log)
-- Created: 2025-02-04
-- Purpose: Comprehensive audit trail with field-level change tracking
-- Priority: HIGH - Required for compliance and debugging
-- ============================================

-- STEP 1: Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was changed
    entity_type TEXT NOT NULL, -- 'student', 'coach', 'branch'
    entity_id UUID NOT NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'

    -- Field-level tracking (one row per field change)
    field_name TEXT, -- NULL for CREATE/DELETE, specific field for UPDATE
    old_value TEXT, -- Previous value (NULL for CREATE)
    new_value TEXT, -- New value (NULL for DELETE)

    -- Who and when
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_by_email TEXT, -- Denormalized for reporting (in case user deleted)
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Context
    ip_address INET, -- Will be NULL initially (requires Edge Function)
    user_agent TEXT, -- Will be NULL initially (requires Edge Function)

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_field ON audit_log(entity_type, field_name);

-- Composite index for common queries (entity history)
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_history ON audit_log(entity_type, entity_id, changed_at DESC);

-- STEP 3: Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only read access (audit logs are read-only, created via triggers)
CREATE POLICY "Admins can read audit logs"
    ON audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- No INSERT/UPDATE/DELETE policies - logs are immutable and created only by triggers
COMMENT ON TABLE audit_log IS
    'Immutable audit trail of all entity changes. One row per field change. Created automatically by triggers.';

-- ============================================
-- STEP 4: Create audit trigger function
-- ============================================

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

        -- Students: Track 15 fields
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

        -- Coaches: Track 5 fields
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

        -- Branches: Track 4 fields
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

-- ============================================
-- STEP 5: Attach triggers to tables
-- ============================================

-- Students table
DROP TRIGGER IF EXISTS audit_students_changes ON students;
CREATE TRIGGER audit_students_changes
    AFTER INSERT OR UPDATE OR DELETE ON students
    FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- Coaches table
DROP TRIGGER IF EXISTS audit_coaches_changes ON coaches;
CREATE TRIGGER audit_coaches_changes
    AFTER INSERT OR UPDATE OR DELETE ON coaches
    FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- Branches table
DROP TRIGGER IF EXISTS audit_branches_changes ON branches;
CREATE TRIGGER audit_branches_changes
    AFTER INSERT OR UPDATE OR DELETE ON branches
    FOR EACH ROW EXECUTE FUNCTION log_entity_changes();

-- ============================================
-- STEP 6: Helper functions for querying audit logs
-- ============================================

-- Get recent activity (last 24 hours by default)
CREATE OR REPLACE FUNCTION get_recent_audit_activity(p_limit INT DEFAULT 50)
RETURNS TABLE (
    id UUID,
    entity_type TEXT,
    entity_id UUID,
    action TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by_email TEXT,
    changed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.entity_type,
        a.entity_id,
        a.action,
        a.field_name,
        a.old_value,
        a.new_value,
        a.changed_by_email,
        a.changed_at
    FROM audit_log a
    WHERE a.changed_at > NOW() - INTERVAL '24 hours'
    ORDER BY a.changed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get full history for a specific entity
CREATE OR REPLACE FUNCTION get_entity_audit_history(p_entity_type TEXT, p_entity_id UUID)
RETURNS TABLE (
    id UUID,
    action TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by_email TEXT,
    changed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.action,
        a.field_name,
        a.old_value,
        a.new_value,
        a.changed_by_email,
        a.changed_at
    FROM audit_log a
    WHERE a.entity_type = p_entity_type
    AND a.entity_id = p_entity_id
    ORDER BY a.changed_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 7: Verification and testing
-- ============================================

DO $$
DECLARE
    v_trigger_count INT;
    v_index_count INT;
    v_function_exists BOOLEAN;
BEGIN
    -- Check triggers are active
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgname IN ('audit_students_changes', 'audit_coaches_changes', 'audit_branches_changes')
    AND tgenabled = 'O'; -- 'O' means enabled

    -- Check indexes exist
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE tablename = 'audit_log';

    -- Check function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'log_entity_changes'
    ) INTO v_function_exists;

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 021 Complete: Audit Log System';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Triggers created: % (expected: 3)', v_trigger_count;
    RAISE NOTICE '📊 Indexes created: % (expected: 6)', v_index_count;
    RAISE NOTICE '📊 Trigger function: %', CASE WHEN v_function_exists THEN '✅ Created' ELSE '❌ Missing' END;
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Audit tracking enabled for:';
    RAISE NOTICE '   - Students (15 fields)';
    RAISE NOTICE '   - Coaches (5 fields)';
    RAISE NOTICE '   - Branches (4 fields)';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 RLS enabled: Admin-only read access';
    RAISE NOTICE '📝 Logs are immutable: No UPDATE/DELETE allowed';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';

    IF v_trigger_count < 3 THEN
        RAISE WARNING 'Expected 3 triggers but found %', v_trigger_count;
    END IF;

    IF v_index_count < 6 THEN
        RAISE WARNING 'Expected 6 indexes but found %', v_index_count;
    END IF;
END $$;
