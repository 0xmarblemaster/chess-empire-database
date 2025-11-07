-- Verification and Fix for RLS after constraint changes
-- Date: 2025-01-07
-- Description: Ensures RLS policies and helper functions are intact after ALTER TABLE operations

-- Step 1: Verify the is_current_user_admin function exists
-- If it doesn't exist, recreate it
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Ensure execute permission is granted
GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_current_user_admin() TO anon;

-- Step 3: Verify RLS is enabled on critical tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Step 4: Check if policies exist on user_roles (these should already exist)
-- If they don't, recreate them

-- Drop existing policies if they exist (to avoid duplicates)
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Admins read all" ON user_roles;
DROP POLICY IF EXISTS "Admins insert" ON user_roles;
DROP POLICY IF EXISTS "Admins update" ON user_roles;
DROP POLICY IF EXISTS "Admins delete" ON user_roles;

-- Recreate policies
CREATE POLICY "Users can read own role"
    ON user_roles FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins read all"
    ON user_roles FOR SELECT
    USING (is_current_user_admin());

CREATE POLICY "Admins insert"
    ON user_roles FOR INSERT
    WITH CHECK (is_current_user_admin());

CREATE POLICY "Admins update"
    ON user_roles FOR UPDATE
    USING (is_current_user_admin())
    WITH CHECK (is_current_user_admin());

CREATE POLICY "Admins delete"
    ON user_roles FOR DELETE
    USING (is_current_user_admin());

-- Verification queries (commented out - run separately if needed)
-- SELECT * FROM pg_policies WHERE tablename = 'user_roles';
-- SELECT * FROM pg_policies WHERE tablename = 'students';
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_current_user_admin';
