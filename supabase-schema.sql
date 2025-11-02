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
    total_lessons INTEGER DEFAULT 40,
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
-- 6. CREATE INITIAL ADMIN USER (Run this after authentication is set up)
-- ============================================

-- This needs to be run AFTER the admin user is created via Supabase Auth
-- You'll need to get the user_id from auth.users and then run:
-- INSERT INTO user_roles (user_id, role)
-- VALUES ('<admin-user-id>', 'admin');
