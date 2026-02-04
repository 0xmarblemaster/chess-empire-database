-- ============================================
-- MIGRATION 019: Enable Multi-Branch Coach Assignments
-- Created: 2026-02-04
-- Purpose: Allow coaches to be assigned to multiple branches
-- ============================================

-- STEP 1: Create coach_branches junction table
CREATE TABLE IF NOT EXISTS coach_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Prevent duplicate assignments
    UNIQUE(coach_id, branch_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_branches_coach_id ON coach_branches(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_branches_branch_id ON coach_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_coach_branches_lookup ON coach_branches(coach_id, branch_id);

-- Apply timestamp trigger
CREATE TRIGGER update_coach_branches_updated_at
    BEFORE UPDATE ON coach_branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 2: Migrate existing data from coaches.branch_id to coach_branches
-- This preserves all current coach-branch assignments
INSERT INTO coach_branches (coach_id, branch_id)
SELECT id, branch_id
FROM coaches
WHERE branch_id IS NOT NULL
ON CONFLICT (coach_id, branch_id) DO NOTHING;

-- STEP 3: Verification query
SELECT
    c.first_name,
    c.last_name,
    c.email,
    b.name as branch_name,
    'Migrated from coaches.branch_id' as source
FROM coaches c
JOIN coach_branches cb ON c.id = cb.coach_id
JOIN branches b ON cb.branch_id = b.id
ORDER BY c.last_name, b.name;

-- STEP 4: Enable RLS on new table
ALTER TABLE coach_branches ENABLE ROW LEVEL SECURITY;

-- Anyone can read coach-branch assignments (for dropdown population)
CREATE POLICY "Anyone can read coach branches"
    ON coach_branches FOR SELECT
    USING (true);

-- Only admins can manage coach-branch assignments
CREATE POLICY "Admins can manage coach branches"
    ON coach_branches FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

COMMENT ON TABLE coach_branches IS
    'Junction table for many-to-many relationship between coaches and branches. Allows coaches to work at multiple locations.';

COMMENT ON COLUMN coach_branches.coach_id IS
    'Reference to the coach (from coaches table)';

COMMENT ON COLUMN coach_branches.branch_id IS
    'Reference to the branch (from branches table)';

-- ============================================
-- HELPER FUNCTION: Get branches for a coach
-- ============================================

CREATE OR REPLACE FUNCTION get_coach_branches(p_coach_id UUID)
RETURNS TABLE (
    branch_id UUID,
    branch_name TEXT,
    branch_location TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.name,
        b.location
    FROM coach_branches cb
    JOIN branches b ON cb.branch_id = b.id
    WHERE cb.coach_id = p_coach_id
    ORDER BY b.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Get coaches for a branch
-- ============================================

CREATE OR REPLACE FUNCTION get_branch_coaches(p_branch_id UUID)
RETURNS TABLE (
    coach_id UUID,
    coach_first_name TEXT,
    coach_last_name TEXT,
    coach_email TEXT,
    coach_phone TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone
    FROM coach_branches cb
    JOIN coaches c ON cb.coach_id = c.id
    WHERE cb.branch_id = p_branch_id
    ORDER BY c.last_name, c.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if coach is assigned to branch
-- ============================================

CREATE OR REPLACE FUNCTION is_coach_at_branch(p_coach_id UUID, p_branch_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM coach_branches
        WHERE coach_id = p_coach_id
        AND branch_id = p_branch_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Final verification output
-- ============================================

DO $$
DECLARE
    total_assignments INTEGER;
    total_coaches INTEGER;
    total_branches INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_assignments FROM coach_branches;
    SELECT COUNT(DISTINCT coach_id) INTO total_coaches FROM coach_branches;
    SELECT COUNT(DISTINCT branch_id) INTO total_branches FROM coach_branches;

    RAISE NOTICE '✅ Migration 019 complete!';
    RAISE NOTICE '📊 Total coach-branch assignments: %', total_assignments;
    RAISE NOTICE '👥 Coaches with assignments: %', total_coaches;
    RAISE NOTICE '🏢 Branches with coaches: %', total_branches;
END $$;
