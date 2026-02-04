-- ============================================
-- MIGRATION 022: Student Status Change History
-- Created: 2026-02-04
-- Purpose: Track all student status transitions for analytics and reporting
-- Priority: MEDIUM - Useful for freeze period analysis, churn tracking, and conversion metrics
-- ============================================

-- STEP 1: Create student_status_history table
CREATE TABLE IF NOT EXISTS student_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Student reference
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    -- Status transition
    old_status TEXT, -- NULL for initial status
    new_status TEXT NOT NULL, -- 'active', 'frozen', 'trial', 'left', 'graduated', 'inactive'

    -- When and who
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_by_email TEXT, -- Denormalized for reporting

    -- Additional context
    reason TEXT, -- Optional reason for status change (e.g., "vacation", "financial", "graduated")
    notes TEXT, -- Additional notes

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_history_student ON student_status_history(student_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON student_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_new_status ON student_status_history(new_status);
CREATE INDEX IF NOT EXISTS idx_status_history_old_status ON student_status_history(old_status);

-- Composite index for common queries (status transitions)
CREATE INDEX IF NOT EXISTS idx_status_history_transitions ON student_status_history(old_status, new_status, changed_at DESC);

-- STEP 3: Enable RLS
ALTER TABLE student_status_history ENABLE ROW LEVEL SECURITY;

-- Admins and coaches can read status history
CREATE POLICY "Admins and coaches can read status history"
    ON student_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'coach')
        )
    );

-- Only system/triggers can insert (no manual INSERT policy)
COMMENT ON TABLE student_status_history IS
    'Tracks all student status changes for analytics. Created automatically by triggers.';

-- ============================================
-- STEP 4: Create status change trigger function
-- ============================================

CREATE OR REPLACE FUNCTION track_status_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    -- Only track if status actually changed
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Get current user info
        v_user_id := auth.uid();

        -- Get user email (with fallback for system operations)
        SELECT email INTO v_user_email
        FROM auth.users
        WHERE id = v_user_id;

        IF v_user_email IS NULL THEN
            v_user_email := 'system@chessempire.kz';
        END IF;

        -- Insert status change record
        INSERT INTO student_status_history (
            student_id,
            old_status,
            new_status,
            changed_by,
            changed_by_email
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            v_user_id,
            v_user_email
        );
    END IF;

    -- For INSERT, record initial status
    IF (TG_OP = 'INSERT') THEN
        v_user_id := auth.uid();

        SELECT email INTO v_user_email
        FROM auth.users
        WHERE id = v_user_id;

        IF v_user_email IS NULL THEN
            v_user_email := 'system@chessempire.kz';
        END IF;

        INSERT INTO student_status_history (
            student_id,
            old_status,
            new_status,
            changed_by,
            changed_by_email
        ) VALUES (
            NEW.id,
            NULL, -- No previous status
            NEW.status,
            v_user_id,
            v_user_email
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 5: Attach trigger to students table
DROP TRIGGER IF EXISTS track_student_status_changes ON students;
CREATE TRIGGER track_student_status_changes
    AFTER INSERT OR UPDATE OF status ON students
    FOR EACH ROW EXECUTE FUNCTION track_status_changes();

-- ============================================
-- STEP 6: Analytics functions
-- ============================================

-- Get all status changes for a student
CREATE OR REPLACE FUNCTION get_student_status_history(p_student_id UUID)
RETURNS TABLE (
    id UUID,
    old_status TEXT,
    new_status TEXT,
    changed_at TIMESTAMP WITH TIME ZONE,
    changed_by_email TEXT,
    reason TEXT,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id,
        h.old_status,
        h.new_status,
        h.changed_at,
        h.changed_by_email,
        h.reason,
        h.notes
    FROM student_status_history h
    WHERE h.student_id = p_student_id
    ORDER BY h.changed_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate freeze periods for a student
CREATE OR REPLACE FUNCTION get_student_freeze_periods(p_student_id UUID)
RETURNS TABLE (
    freeze_start TIMESTAMP WITH TIME ZONE,
    freeze_end TIMESTAMP WITH TIME ZONE,
    duration_days INTEGER,
    is_currently_frozen BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH freeze_events AS (
        SELECT
            changed_at,
            new_status,
            old_status,
            LEAD(changed_at) OVER (ORDER BY changed_at) as next_change,
            LEAD(new_status) OVER (ORDER BY changed_at) as next_status
        FROM student_status_history
        WHERE student_id = p_student_id
    )
    SELECT
        fe.changed_at as freeze_start,
        COALESCE(fe.next_change, NOW()) as freeze_end,
        EXTRACT(DAY FROM COALESCE(fe.next_change, NOW()) - fe.changed_at)::INTEGER as duration_days,
        (fe.next_change IS NULL) as is_currently_frozen
    FROM freeze_events fe
    WHERE fe.new_status = 'frozen'
    ORDER BY fe.changed_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get recent status changes (last 30 days)
CREATE OR REPLACE FUNCTION get_recent_status_changes(p_days INTEGER DEFAULT 30, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    student_first_name TEXT,
    student_last_name TEXT,
    old_status TEXT,
    new_status TEXT,
    changed_at TIMESTAMP WITH TIME ZONE,
    changed_by_email TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id,
        h.student_id,
        s.first_name,
        s.last_name,
        h.old_status,
        h.new_status,
        h.changed_at,
        h.changed_by_email
    FROM student_status_history h
    JOIN students s ON h.student_id = s.id
    WHERE h.changed_at > NOW() - (p_days || ' days')::INTERVAL
    ORDER BY h.changed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get status transition statistics
CREATE OR REPLACE FUNCTION get_status_transition_stats(p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days')
RETURNS TABLE (
    old_status TEXT,
    new_status TEXT,
    transition_count BIGINT,
    avg_days_in_old_status NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH status_durations AS (
        SELECT
            student_id,
            old_status,
            new_status,
            changed_at,
            LAG(changed_at) OVER (PARTITION BY student_id ORDER BY changed_at) as prev_change
        FROM student_status_history
        WHERE changed_at >= p_from_date
    )
    SELECT
        sd.old_status,
        sd.new_status,
        COUNT(*) as transition_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (sd.changed_at - sd.prev_change)) / 86400)::NUMERIC, 1) as avg_days_in_old_status
    FROM status_durations sd
    WHERE sd.old_status IS NOT NULL
    GROUP BY sd.old_status, sd.new_status
    ORDER BY transition_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 7: Create materialized view for quick access
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS recent_status_changes AS
SELECT
    h.id,
    h.student_id,
    s.first_name,
    s.last_name,
    h.old_status,
    h.new_status,
    h.changed_at,
    h.changed_by_email
FROM student_status_history h
JOIN students s ON h.student_id = s.id
WHERE h.changed_at > NOW() - INTERVAL '7 days'
ORDER BY h.changed_at DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_recent_status_changes_changed_at
    ON recent_status_changes(changed_at DESC);

-- Function to refresh the materialized view (can be called via cron)
CREATE OR REPLACE FUNCTION refresh_status_changes_view()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY recent_status_changes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 8: Backfill existing student statuses
-- ============================================

-- Insert current status for all existing students (one-time backfill)
INSERT INTO student_status_history (student_id, old_status, new_status, changed_by_email)
SELECT
    id,
    NULL as old_status,
    status as new_status,
    'system@chessempire.kz' as changed_by_email
FROM students
WHERE NOT EXISTS (
    SELECT 1 FROM student_status_history
    WHERE student_status_history.student_id = students.id
)
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 9: Verification and testing
-- ============================================

DO $$
DECLARE
    v_trigger_count INT;
    v_index_count INT;
    v_function_count INT;
    v_total_history_records INT;
    v_students_with_history INT;
BEGIN
    -- Check trigger is active
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgname = 'track_student_status_changes'
    AND tgenabled = 'O'; -- 'O' means enabled

    -- Check indexes exist
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE tablename = 'student_status_history';

    -- Check functions exist
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'track_status_changes',
        'get_student_status_history',
        'get_student_freeze_periods',
        'get_recent_status_changes',
        'get_status_transition_stats',
        'refresh_status_changes_view'
    );

    -- Check data
    SELECT COUNT(*) INTO v_total_history_records FROM student_status_history;
    SELECT COUNT(DISTINCT student_id) INTO v_students_with_history FROM student_status_history;

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 022 Complete: Status History';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Trigger created: % (expected: 1)', v_trigger_count;
    RAISE NOTICE '📊 Indexes created: % (expected: 6)', v_index_count;
    RAISE NOTICE '📊 Functions created: % (expected: 6)', v_function_count;
    RAISE NOTICE '📊 History records: %', v_total_history_records;
    RAISE NOTICE '📊 Students with history: %', v_students_with_history;
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Status tracking enabled:';
    RAISE NOTICE '   - Automatic trigger on status changes';
    RAISE NOTICE '   - Freeze period analytics';
    RAISE NOTICE '   - Transition statistics';
    RAISE NOTICE '   - Materialized view for recent changes';
    RAISE NOTICE '';
    RAISE NOTICE '🔐 RLS enabled: Admin and coach read access';
    RAISE NOTICE '📝 Backfill complete: All existing students';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';

    IF v_trigger_count < 1 THEN
        RAISE WARNING 'Expected 1 trigger but found %', v_trigger_count;
    END IF;

    IF v_function_count < 6 THEN
        RAISE WARNING 'Expected 6 functions but found %', v_function_count;
    END IF;
END $$;
