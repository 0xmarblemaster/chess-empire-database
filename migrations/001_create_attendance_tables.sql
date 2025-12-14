-- ============================================
-- ATTENDANCE TRACKING SYSTEM MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    schedule_type TEXT CHECK (schedule_type IN ('mon_wed', 'tue_thu', 'sat_sun')) NOT NULL,
    time_slot TEXT,
    status TEXT CHECK (status IN ('present', 'absent', 'late', 'excused')) DEFAULT 'absent',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(student_id, attendance_date, schedule_type, time_slot)
);

-- Russian name aliases for Excel import matching
CREATE TABLE IF NOT EXISTS student_name_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for attendance
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_schedule ON attendance(schedule_type);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

-- Indexes for student name aliases
CREATE INDEX IF NOT EXISTS idx_student_name_aliases_name ON student_name_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_student_name_aliases_student ON student_name_aliases(student_id);

-- Apply timestamp trigger to attendance (create trigger function if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_attendance_updated_at ON attendance;
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ATTENDANCE RLS POLICIES
-- ============================================

-- Enable RLS on attendance tables
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_name_aliases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read attendance" ON attendance;
DROP POLICY IF EXISTS "Authorized users can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Authorized users can update attendance" ON attendance;
DROP POLICY IF EXISTS "Admins can delete attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can read student aliases" ON student_name_aliases;
DROP POLICY IF EXISTS "Authorized users can manage student aliases" ON student_name_aliases;

-- Attendance Policies
CREATE POLICY "Anyone can read attendance"
    ON attendance FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can insert attendance"
    ON attendance FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

CREATE POLICY "Authorized users can update attendance"
    ON attendance FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'
                OR (ur.can_edit_students = true AND attendance.branch_id IN (
                    SELECT c.branch_id FROM coaches c WHERE c.id = ur.coach_id
                ))
            )
        )
    );

CREATE POLICY "Admins can delete attendance"
    ON attendance FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Student Name Aliases Policies
CREATE POLICY "Anyone can read student aliases"
    ON student_name_aliases FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can manage student aliases"
    ON student_name_aliases FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- ============================================
-- ATTENDANCE STATISTICS FUNCTIONS
-- ============================================

-- View: Student attendance rate (last 30 days)
CREATE OR REPLACE VIEW student_attendance_rates AS
SELECT
    a.student_id,
    a.branch_id,
    a.schedule_type,
    COUNT(*) as total_sessions,
    COUNT(*) FILTER (WHERE a.status = 'present') as present_count,
    COUNT(*) FILTER (WHERE a.status = 'late') as late_count,
    COUNT(*) FILTER (WHERE a.status = 'excused') as excused_count,
    COUNT(*) FILTER (WHERE a.status = 'absent') as absent_count,
    ROUND(
        (COUNT(*) FILTER (WHERE a.status IN ('present', 'late'))::NUMERIC /
         NULLIF(COUNT(*), 0)) * 100, 1
    ) as attendance_rate
FROM attendance a
WHERE a.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.student_id, a.branch_id, a.schedule_type;

-- Function: Get branch attendance summary for a date range
CREATE OR REPLACE FUNCTION get_branch_attendance_summary(
    p_branch_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    total_students INTEGER,
    total_sessions INTEGER,
    avg_attendance_rate NUMERIC,
    students_below_70 INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH student_rates AS (
        SELECT
            a.student_id,
            ROUND(
                (COUNT(*) FILTER (WHERE a.status IN ('present', 'late'))::NUMERIC /
                 NULLIF(COUNT(*), 0)) * 100, 1
            ) as rate
        FROM attendance a
        WHERE a.branch_id = p_branch_id
        AND a.attendance_date BETWEEN p_start_date AND p_end_date
        GROUP BY a.student_id
    )
    SELECT
        (SELECT COUNT(DISTINCT student_id)::INTEGER FROM attendance WHERE branch_id = p_branch_id AND attendance_date BETWEEN p_start_date AND p_end_date),
        (SELECT COUNT(DISTINCT attendance_date)::INTEGER FROM attendance WHERE branch_id = p_branch_id AND attendance_date BETWEEN p_start_date AND p_end_date),
        ROUND(AVG(rate), 1),
        COUNT(*) FILTER (WHERE rate < 70)::INTEGER
    FROM student_rates;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
SELECT 'Attendance tables created successfully!' as result;
