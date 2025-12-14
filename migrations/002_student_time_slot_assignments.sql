-- ============================================
-- STUDENT TIME SLOT ASSIGNMENTS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Student time slot assignments table
-- Stores which time slot each student is assigned to for each branch/schedule combination
CREATE TABLE IF NOT EXISTS student_time_slot_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    schedule_type TEXT CHECK (schedule_type IN ('mon_wed', 'tue_thu', 'sat_sun')) NOT NULL,
    time_slot_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Each student can only have one assignment per branch/schedule combination
    UNIQUE(student_id, branch_id, schedule_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_slot_assignments_student ON student_time_slot_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_time_slot_assignments_branch ON student_time_slot_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_time_slot_assignments_schedule ON student_time_slot_assignments(schedule_type);
CREATE INDEX IF NOT EXISTS idx_time_slot_assignments_lookup ON student_time_slot_assignments(branch_id, schedule_type, time_slot_index);

-- Apply timestamp trigger
DROP TRIGGER IF EXISTS update_student_time_slot_assignments_updated_at ON student_time_slot_assignments;
CREATE TRIGGER update_student_time_slot_assignments_updated_at
    BEFORE UPDATE ON student_time_slot_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE student_time_slot_assignments ENABLE ROW LEVEL SECURITY;

-- Anyone can read time slot assignments
CREATE POLICY "Anyone can read time slot assignments"
    ON student_time_slot_assignments FOR SELECT
    USING (true);

-- Authorized users can insert/update time slot assignments
CREATE POLICY "Authorized users can manage time slot assignments"
    ON student_time_slot_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- Success message
SELECT 'Student time slot assignments table created successfully!' as result;
