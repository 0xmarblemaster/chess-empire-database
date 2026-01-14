-- ============================================
-- SURVIVAL SCORES TABLE AND VIEW MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Create survival_scores table and student_best_survival view
-- for tracking Puzzle Rush and other survival mode scores

-- Step 1: Create the survival_scores table if it doesn't exist
CREATE TABLE IF NOT EXISTS survival_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    mode TEXT DEFAULT 'puzzle_rush' CHECK (mode IN ('survival_3', 'survival_5', 'timed_3min', 'timed_5min', 'puzzle_rush')),
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_survival_scores_student ON survival_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_survival_scores_score ON survival_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_survival_scores_mode ON survival_scores(mode);

-- Step 3: Create the view for best scores per student per mode
CREATE OR REPLACE VIEW student_best_survival AS
SELECT
    student_id,
    mode,
    MAX(score) as best_score,
    MAX(achieved_at) as achieved_at
FROM survival_scores
GROUP BY student_id, mode;

-- Step 4: Enable RLS on survival_scores table
ALTER TABLE survival_scores ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Anyone can read survival scores" ON survival_scores;
DROP POLICY IF EXISTS "Authorized users can manage survival scores" ON survival_scores;

CREATE POLICY "Anyone can read survival scores"
    ON survival_scores FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can manage survival scores"
    ON survival_scores FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- Step 6: Create bot_battles table if not exists (needed for student_bot_progress view)
CREATE TABLE IF NOT EXISTS bot_battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    bot_name TEXT NOT NULL,
    bot_rating INTEGER NOT NULL,
    time_control TEXT,
    notes TEXT,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_bot_battles_student ON bot_battles(student_id);
CREATE INDEX IF NOT EXISTS idx_bot_battles_bot_rating ON bot_battles(bot_rating);

-- Enable RLS on bot_battles
ALTER TABLE bot_battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read bot battles" ON bot_battles;
DROP POLICY IF EXISTS "Authorized users can manage bot battles" ON bot_battles;

CREATE POLICY "Anyone can read bot battles"
    ON bot_battles FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can manage bot battles"
    ON bot_battles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- Step 7: Create student_bot_progress view
CREATE OR REPLACE VIEW student_bot_progress AS
SELECT
    student_id,
    COUNT(*) as bots_defeated,
    MAX(bot_rating) as highest_bot_rating,
    array_agg(bot_name ORDER BY bot_rating) as defeated_bots
FROM bot_battles
GROUP BY student_id;

-- Success message
SELECT 'Survival scores table, bot battles table, and views created successfully!' as result;
