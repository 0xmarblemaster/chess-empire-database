-- Chess Empire Database Schema
-- This file contains the complete database schema for Supabase

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coaches table
CREATE TABLE IF NOT EXISTS coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT UNIQUE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female')),
    photo_url TEXT,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
    razryad TEXT CHECK (razryad IN ('none', '3rd', '2nd', '1st', 'kms', 'master')) DEFAULT 'none',
    status TEXT CHECK (status IN ('active', 'frozen', 'left')) DEFAULT 'active',
    current_level INTEGER DEFAULT 1,
    current_lesson INTEGER DEFAULT 1,
    total_lessons INTEGER DEFAULT 120,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User roles and permissions table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'viewer')) DEFAULT 'viewer',
    coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,

    -- Permissions for coaches
    can_view_all_students BOOLEAN DEFAULT FALSE,
    can_edit_students BOOLEAN DEFAULT FALSE,
    can_manage_branches BOOLEAN DEFAULT FALSE,
    can_manage_coaches BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id)
);

-- Coach invitation tokens table
CREATE TABLE IF NOT EXISTS coach_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_students_branch_id ON students(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_coach_id ON students(coach_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_coaches_email ON coaches(email);
CREATE INDEX IF NOT EXISTS idx_coaches_branch_id ON coaches(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_coach_id ON user_roles(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_invitations_token ON coach_invitations(token);
CREATE INDEX IF NOT EXISTS idx_coach_invitations_email ON coach_invitations(email);

-- ============================================
-- 3. CREATE FUNCTIONS FOR AUTO-UPDATING TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coaches_updated_at BEFORE UPDATE ON coaches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- BRANCHES RLS POLICIES
-- ============================================

-- Public can read branches (for dropdown selects)
CREATE POLICY "Anyone can read branches"
    ON branches FOR SELECT
    USING (true);

-- Only admins can insert, update, delete branches
CREATE POLICY "Admins can insert branches"
    ON branches FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update branches"
    ON branches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete branches"
    ON branches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- ============================================
-- COACHES RLS POLICIES
-- ============================================

-- Anyone can read coaches (for dropdown selects)
CREATE POLICY "Anyone can read coaches"
    ON coaches FOR SELECT
    USING (true);

-- Only admins can insert, update, delete coaches
CREATE POLICY "Admins can manage coaches"
    ON coaches FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- ============================================
-- STUDENTS RLS POLICIES
-- ============================================

-- Anyone can read students (public search functionality)
CREATE POLICY "Anyone can read students"
    ON students FOR SELECT
    USING (true);

-- Authenticated users with proper permissions can insert students
CREATE POLICY "Authorized users can insert students"
    ON students FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- Authenticated users with proper permissions can update students
CREATE POLICY "Authorized users can update students"
    ON students FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'
                OR (ur.can_edit_students = true AND students.coach_id = ur.coach_id)
            )
        )
    );

-- Only admins can delete students
CREATE POLICY "Admins can delete students"
    ON students FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- ============================================
-- USER_ROLES RLS POLICIES
-- ============================================

-- Users can read their own role
CREATE POLICY "Users can read their own role"
    ON user_roles FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can read all roles
CREATE POLICY "Admins can read all roles"
    ON user_roles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    );

-- Only admins can insert, update, delete user roles
CREATE POLICY "Admins can manage user roles"
    ON user_roles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'admin'
        )
    );

-- ============================================
-- COACH_INVITATIONS RLS POLICIES
-- ============================================

-- Only admins can create invitations
CREATE POLICY "Admins can create invitations"
    ON coach_invitations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Anyone can read invitations by token (for registration)
CREATE POLICY "Anyone can read invitations by token"
    ON coach_invitations FOR SELECT
    USING (true);

-- Admins can view all invitations
CREATE POLICY "Admins can view all invitations"
    ON coach_invitations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = user_uuid
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM user_roles
    WHERE user_id = user_uuid;

    RETURN COALESCE(user_role, 'viewer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create coach invitation
CREATE OR REPLACE FUNCTION create_coach_invitation(
    p_email TEXT,
    p_coach_id UUID
)
RETURNS UUID AS $$
DECLARE
    invitation_token TEXT;
    invitation_id UUID;
BEGIN
    -- Generate random token
    invitation_token := encode(gen_random_bytes(32), 'hex');

    -- Insert invitation
    INSERT INTO coach_invitations (email, token, coach_id, expires_at)
    VALUES (
        p_email,
        invitation_token,
        p_coach_id,
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO invitation_id;

    RETURN invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New simplified function for sending invitations to anyone (not just coaches)
-- This uses Supabase Auth to send invitation emails
CREATE OR REPLACE FUNCTION create_user_invitation(
    p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    invitation_token TEXT;
    invitation_id UUID;
BEGIN
    -- Generate random token
    invitation_token := encode(gen_random_bytes(32), 'hex');

    -- Insert invitation without coach_id (NULL by default)
    INSERT INTO coach_invitations (email, token, expires_at)
    VALUES (
        p_email,
        invitation_token,
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO invitation_id;

    -- Return invitation details for email sending via frontend/API
    RETURN jsonb_build_object(
        'invitation_id', invitation_id,
        'token', invitation_token,
        'email', p_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. STORAGE BUCKET POLICIES (for student photos)
-- ============================================

-- NOTE: The storage bucket 'student-photos' must be created in Supabase Dashboard first:
-- 1. Go to Storage > Create Bucket
-- 2. Name: student-photos
-- 3. Public bucket: Yes (to allow public URL access)
-- 4. File size limit: 5MB recommended
-- 5. Allowed MIME types: image/jpeg, image/png, image/webp

-- Storage policies for student-photos bucket
-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload student photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'students'
    );

-- Allow authenticated users to update their uploaded photos
CREATE POLICY "Authenticated users can update student photos"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

-- Allow authenticated users to delete photos (for replacements)
CREATE POLICY "Authenticated users can delete student photos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

-- Allow anyone to read photos (public bucket)
CREATE POLICY "Anyone can view student photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'student-photos');

-- ============================================
-- 7. RANKING & ACHIEVEMENT SYSTEM TABLES
-- ============================================

-- Student ratings history (internal school rating system)
CREATE TABLE IF NOT EXISTS student_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL DEFAULT 400,
    rating_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT CHECK (source IN ('manual', 'csv_import', 'tournament')) DEFAULT 'manual',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_ratings_student_date ON student_ratings(student_id, rating_date DESC);
CREATE INDEX IF NOT EXISTS idx_student_ratings_rating ON student_ratings(rating);

-- Bot battles (Chess.com bot defeat tracking)
CREATE TABLE IF NOT EXISTS bot_battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    bot_name TEXT NOT NULL,
    bot_rating INTEGER NOT NULL,
    defeated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_control TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(student_id, bot_name)
);

CREATE INDEX IF NOT EXISTS idx_bot_battles_student ON bot_battles(student_id);
CREATE INDEX IF NOT EXISTS idx_bot_battles_bot_rating ON bot_battles(bot_rating);

-- Survival scores (Puzzle Rush/Survival mode)
CREATE TABLE IF NOT EXISTS survival_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    mode TEXT DEFAULT 'survival_3' CHECK (mode IN ('survival_3', 'survival_5', 'timed_3min', 'timed_5min')),
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_survival_scores_student ON survival_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_survival_scores_score ON survival_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_survival_scores_mode ON survival_scores(mode);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    name_kk TEXT,
    description_en TEXT,
    description_ru TEXT,
    description_kk TEXT,
    category TEXT CHECK (category IN ('bot', 'survival', 'rating', 'lesson', 'streak', 'special')),
    icon TEXT,
    color TEXT,
    tier TEXT CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')) DEFAULT 'bronze',
    threshold_value INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student achievements (earned achievements)
CREATE TABLE IF NOT EXISTS student_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    UNIQUE(student_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_student_achievements_student ON student_achievements(student_id);
CREATE INDEX IF NOT EXISTS idx_student_achievements_earned ON student_achievements(earned_at DESC);

-- ============================================
-- 8. RANKING VIEWS AND FUNCTIONS
-- ============================================

-- View: Current rating per student (latest rating)
CREATE OR REPLACE VIEW student_current_ratings AS
SELECT DISTINCT ON (student_id)
    student_id,
    rating,
    rating_date,
    CASE
        WHEN rating >= 1500 THEN 'League A+'
        WHEN rating >= 1200 THEN 'League A'
        WHEN rating >= 900 THEN 'League B'
        WHEN rating >= 400 THEN 'League C'
        ELSE 'Beginner'
    END AS league,
    CASE
        WHEN rating >= 1500 THEN 'diamond'
        WHEN rating >= 1200 THEN 'gold'
        WHEN rating >= 900 THEN 'silver'
        WHEN rating >= 400 THEN 'bronze'
        ELSE 'none'
    END AS league_tier
FROM student_ratings
ORDER BY student_id, rating_date DESC;

-- View: Best survival score per student per mode
CREATE OR REPLACE VIEW student_best_survival AS
SELECT
    student_id,
    mode,
    MAX(score) as best_score,
    MAX(achieved_at) as achieved_at
FROM survival_scores
GROUP BY student_id, mode;

-- View: Bot battle progress per student
CREATE OR REPLACE VIEW student_bot_progress AS
SELECT
    student_id,
    COUNT(*) as bots_defeated,
    MAX(bot_rating) as highest_bot_rating,
    array_agg(bot_name ORDER BY bot_rating) as defeated_bots
FROM bot_battles
GROUP BY student_id;

-- Function: Get student's percentile rank within their branch
CREATE OR REPLACE FUNCTION get_student_branch_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    percentile NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH student_info AS (
        SELECT branch_id FROM students WHERE id = p_student_id
    ),
    branch_rankings AS (
        SELECT
            s.id,
            COALESCE(r.rating, 0) as rating,
            ROW_NUMBER() OVER (ORDER BY COALESCE(r.rating, 0) DESC) as rank
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.branch_id = (SELECT branch_id FROM student_info)
        AND s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM branch_rankings),
        (SELECT rank::INTEGER FROM branch_rankings WHERE id = p_student_id),
        ROUND(100.0 - ((SELECT rank FROM branch_rankings WHERE id = p_student_id) - 1) * 100.0 /
            NULLIF((SELECT COUNT(*) FROM branch_rankings), 0), 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get student's percentile rank school-wide
CREATE OR REPLACE FUNCTION get_student_school_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_school INTEGER,
    rank_in_school INTEGER,
    percentile NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH school_rankings AS (
        SELECT
            s.id,
            COALESCE(r.rating, 0) as rating,
            ROW_NUMBER() OVER (ORDER BY COALESCE(r.rating, 0) DESC) as rank
        FROM students s
        LEFT JOIN student_current_ratings r ON s.id = r.student_id
        WHERE s.status = 'active'
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM school_rankings),
        (SELECT rank::INTEGER FROM school_rankings WHERE id = p_student_id),
        ROUND(100.0 - ((SELECT rank FROM school_rankings WHERE id = p_student_id) - 1) * 100.0 /
            NULLIF((SELECT COUNT(*) FROM school_rankings), 0), 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get survival mode percentile rank
CREATE OR REPLACE FUNCTION get_student_survival_rank(p_student_id UUID, p_mode TEXT DEFAULT 'survival_3')
RETURNS TABLE (
    total_players INTEGER,
    rank INTEGER,
    percentile NUMERIC,
    best_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH survival_rankings AS (
        SELECT
            student_id,
            best_score as score,
            ROW_NUMBER() OVER (ORDER BY best_score DESC) as rank
        FROM student_best_survival
        WHERE mode = p_mode
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM survival_rankings),
        (SELECT sr.rank::INTEGER FROM survival_rankings sr WHERE sr.student_id = p_student_id),
        ROUND(100.0 - ((SELECT sr.rank FROM survival_rankings sr WHERE sr.student_id = p_student_id) - 1) * 100.0 /
            NULLIF((SELECT COUNT(*) FROM survival_rankings), 0), 1),
        (SELECT sr.score::INTEGER FROM survival_rankings sr WHERE sr.student_id = p_student_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get student's LEVEL-based rank within their branch
-- Returns position (e.g., 5 out of 70) based purely on Level and Lesson progress
-- Ranking Logic:
-- 1. Calculate rank by counting students ahead (higher Level, or same Level with higher Lesson)
-- 2. Tie-breaker: enrollment date (created_at) for students at same Level AND Lesson
CREATE OR REPLACE FUNCTION get_student_branch_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_branch INTEGER,
    rank_in_branch INTEGER,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_students_ahead INTEGER;
    v_rank INTEGER;
    v_level INTEGER;
    v_lesson INTEGER;
BEGIN
    -- Get student's current level and lesson
    SELECT s.current_level, s.current_lesson
    INTO v_level, v_lesson
    FROM students s
    WHERE s.id = p_student_id;

    -- Count total active students in branch
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.branch_id = (SELECT branch_id FROM students WHERE id = p_student_id)
    AND s.status = 'active';

    -- Count students ahead (higher level OR same level with higher lesson OR same level+lesson but earlier enrollment)
    SELECT COUNT(*)
    INTO v_students_ahead
    FROM students s
    WHERE s.branch_id = (SELECT branch_id FROM students WHERE id = p_student_id)
    AND s.status = 'active'
    AND s.id != p_student_id
    AND (
        -- Higher level
        s.current_level > v_level
        OR
        -- Same level, higher lesson
        (s.current_level = v_level AND s.current_lesson > v_lesson)
        OR
        -- Same level AND same lesson, but earlier enrollment (tie-breaker)
        (s.current_level = v_level AND s.current_lesson = v_lesson AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
    );

    -- Calculate rank (1-based: rank 1 = best)
    v_rank := v_students_ahead + 1;

    RETURN QUERY
    SELECT
        v_total,
        v_rank,
        v_level,
        v_lesson;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get student's LEVEL-based rank school-wide
-- Returns position (e.g., 50 out of 618) based purely on Level and Lesson progress
CREATE OR REPLACE FUNCTION get_student_school_level_rank(p_student_id UUID)
RETURNS TABLE (
    total_in_school INTEGER,
    rank_in_school INTEGER,
    current_level INTEGER,
    current_lesson INTEGER
) AS $$
DECLARE
    v_total INTEGER;
    v_students_ahead INTEGER;
    v_rank INTEGER;
    v_level INTEGER;
    v_lesson INTEGER;
BEGIN
    -- Get student's current level and lesson
    SELECT s.current_level, s.current_lesson
    INTO v_level, v_lesson
    FROM students s
    WHERE s.id = p_student_id;

    -- Count total active students school-wide
    SELECT COUNT(*)
    INTO v_total
    FROM students s
    WHERE s.status = 'active';

    -- Count students ahead (higher level OR same level with higher lesson OR same level+lesson but earlier enrollment)
    SELECT COUNT(*)
    INTO v_students_ahead
    FROM students s
    WHERE s.status = 'active'
    AND s.id != p_student_id
    AND (
        -- Higher level
        s.current_level > v_level
        OR
        -- Same level, higher lesson
        (s.current_level = v_level AND s.current_lesson > v_lesson)
        OR
        -- Same level AND same lesson, but earlier enrollment (tie-breaker)
        (s.current_level = v_level AND s.current_lesson = v_lesson AND s.created_at < (SELECT created_at FROM students WHERE id = p_student_id))
    );

    -- Calculate rank (1-based: rank 1 = best)
    v_rank := v_students_ahead + 1;

    RETURN QUERY
    SELECT
        v_total,
        v_rank,
        v_level,
        v_lesson;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. RLS POLICIES FOR RANKING TABLES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE student_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE survival_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_achievements ENABLE ROW LEVEL SECURITY;

-- Student Ratings Policies
CREATE POLICY "Anyone can read student ratings"
    ON student_ratings FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can insert student ratings"
    ON student_ratings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

CREATE POLICY "Authorized users can update student ratings"
    ON student_ratings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

CREATE POLICY "Admins can delete student ratings"
    ON student_ratings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Bot Battles Policies
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

-- Survival Scores Policies
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

-- Achievements Policies (definitions - read-only for most)
CREATE POLICY "Anyone can read achievements"
    ON achievements FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage achievements"
    ON achievements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- Student Achievements Policies
CREATE POLICY "Anyone can read student achievements"
    ON student_achievements FOR SELECT
    USING (true);

CREATE POLICY "Authorized users can manage student achievements"
    ON student_achievements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );

-- ============================================
-- 10. SEED ACHIEVEMENT DEFINITIONS
-- ============================================

INSERT INTO achievements (code, name_en, name_ru, name_kk, category, icon, tier, threshold_value, sort_order) VALUES
-- Bot Battle Achievements
('first_bot', 'First Victory', 'Первая победа', 'Алғашқы жеңіс', 'bot', 'sword', 'bronze', 1, 1),
('bot_3', 'Bot Hunter', 'Охотник на ботов', 'Бот аулаушы', 'bot', 'target', 'bronze', 3, 2),
('bot_5', 'Bot Slayer', 'Победитель ботов', 'Ботты жеңуші', 'bot', 'swords', 'silver', 5, 3),
('bot_10', 'Bot Master', 'Мастер ботов', 'Бот шебері', 'bot', 'crown', 'gold', 10, 4),
('bot_15', 'Bot Legend', 'Легенда ботов', 'Бот аңызы', 'bot', 'trophy', 'platinum', 15, 5),
('bot_500', 'Beat 500 Rating Bot', 'Победа над ботом 500', '500 рейтингті ботты жеңу', 'bot', 'zap', 'bronze', 500, 10),
('bot_1000', 'Beat 1000 Rating Bot', 'Победа над ботом 1000', '1000 рейтингті ботты жеңу', 'bot', 'flame', 'silver', 1000, 11),
('bot_1500', 'Beat 1500 Rating Bot', 'Победа над ботом 1500', '1500 рейтингті ботты жеңу', 'bot', 'star', 'gold', 1500, 12),

-- Survival Mode Achievements
('survival_5', 'Survivor', 'Выживший', 'Тірі қалған', 'survival', 'shield', 'bronze', 5, 20),
('survival_10', 'Puzzle Pro', 'Мастер головоломок', 'Жұмбақ шебері', 'survival', 'puzzle', 'silver', 10, 21),
('survival_15', 'Puzzle Expert', 'Эксперт головоломок', 'Жұмбақ сарапшысы', 'survival', 'brain', 'gold', 15, 22),
('survival_20', 'Puzzle Legend', 'Легенда головоломок', 'Жұмбақ аңызы', 'survival', 'sparkles', 'platinum', 20, 23),
('survival_30', 'Puzzle God', 'Бог головоломок', 'Жұмбақ құдайы', 'survival', 'gem', 'diamond', 30, 24),

-- Rating Achievements
('rating_500', 'Rising Star', 'Восходящая звезда', 'Көтеріліп келе жатқан жұлдыз', 'rating', 'trending-up', 'bronze', 500, 30),
('rating_800', 'Solid Player', 'Уверенный игрок', 'Сенімді ойыншы', 'rating', 'anchor', 'bronze', 800, 31),
('rating_1000', 'Breakthrough', 'Прорыв', 'Жарылыс', 'rating', 'zap', 'silver', 1000, 32),
('rating_1200', 'Advanced Player', 'Продвинутый игрок', 'Озық ойыншы', 'rating', 'award', 'gold', 1200, 33),
('rating_1500', 'Elite Player', 'Элитный игрок', 'Элиталық ойыншы', 'rating', 'crown', 'platinum', 1500, 34),
('rating_1800', 'Master Class', 'Мастер класс', 'Шебер класы', 'rating', 'trophy', 'diamond', 1800, 35),

-- Lesson Achievements
('lessons_10', 'Getting Started', 'Начало пути', 'Жолдың басы', 'lesson', 'book-open', 'bronze', 10, 40),
('lessons_30', 'Dedicated Learner', 'Усердный ученик', 'Ынталы оқушы', 'lesson', 'book', 'bronze', 30, 41),
('lessons_60', 'Knowledge Seeker', 'Искатель знаний', 'Білім іздеуші', 'lesson', 'graduation-cap', 'silver', 60, 42),
('lessons_90', 'Almost There', 'Почти у цели', 'Мақсатқа жақын', 'lesson', 'target', 'gold', 90, 43),
('lessons_120', 'Course Master', 'Мастер курса', 'Курс шебері', 'lesson', 'medal', 'platinum', 120, 44),

-- Special Achievements
('first_razryad', 'First Razryad', 'Первый разряд', 'Алғашқы разряд', 'special', 'award', 'gold', NULL, 50),
('kms', 'Candidate Master', 'Кандидат в мастера', 'Шебер үміткері', 'special', 'crown', 'platinum', NULL, 51),
('top_10_branch', 'Branch Top 10', 'Топ 10 филиала', 'Филиал топ 10', 'special', 'medal', 'silver', 10, 52),
('top_10_school', 'School Top 10', 'Топ 10 школы', 'Мектеп топ 10', 'special', 'trophy', 'gold', 10, 53)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 11. CREATE INITIAL ADMIN USER (Run this after authentication is set up)
-- ============================================

-- This needs to be run AFTER the admin user is created via Supabase Auth
-- You'll need to get the user_id from auth.users and then run:
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('<admin-user-id>', 'admin');

-- ============================================
-- 12. ATTENDANCE TRACKING SYSTEM
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

-- Apply timestamp trigger to attendance
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ATTENDANCE RLS POLICIES
-- ============================================

-- Enable RLS on attendance tables
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_name_aliases ENABLE ROW LEVEL SECURITY;

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

-- ============================================
-- 13. STUDENT TIME SLOT ASSIGNMENTS
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

-- Enable RLS
ALTER TABLE student_time_slot_assignments ENABLE ROW LEVEL SECURITY;

-- Anyone can read time slot assignments
CREATE POLICY "Anyone can read time slot assignments"
    ON student_time_slot_assignments FOR SELECT
    USING (true);

-- Authorized users can manage time slot assignments
CREATE POLICY "Authorized users can manage time slot assignments"
    ON student_time_slot_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND (user_roles.role = 'admin' OR user_roles.can_edit_students = true)
        )
    );
