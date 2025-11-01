-- Fix RLS Infinite Recursion - Complete Solution
-- Remove ALL recursive policies from user_roles table

-- 1. Drop ALL existing policies on user_roles
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles via function" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON user_roles;

-- 2. Create simple, non-recursive policy for SELECT
-- Users can ONLY read their own role - no admin checks, no recursion
CREATE POLICY "user_roles_select_own"
    ON user_roles FOR SELECT
    USING (user_id = auth.uid());

-- 3. For INSERT/UPDATE/DELETE, we'll use a helper table to avoid recursion
-- Create a table to store admin user IDs (cached for performance)
CREATE TABLE IF NOT EXISTS admin_users_cache (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create a trigger to maintain the admin cache
CREATE OR REPLACE FUNCTION update_admin_cache()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'admin' THEN
        INSERT INTO admin_users_cache (user_id)
        VALUES (NEW.user_id)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();
    ELSE
        DELETE FROM admin_users_cache WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS maintain_admin_cache ON user_roles;
CREATE TRIGGER maintain_admin_cache
    AFTER INSERT OR UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_cache();

-- 5. Populate the admin cache with existing admins
INSERT INTO admin_users_cache (user_id)
SELECT user_id FROM user_roles WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- 6. Create policies using the cache (no recursion!)
CREATE POLICY "user_roles_insert_admin"
    ON user_roles FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM admin_users_cache WHERE user_id = auth.uid())
    );

CREATE POLICY "user_roles_update_admin"
    ON user_roles FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM admin_users_cache WHERE user_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM admin_users_cache WHERE user_id = auth.uid())
    );

CREATE POLICY "user_roles_delete_admin"
    ON user_roles FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM admin_users_cache WHERE user_id = auth.uid())
    );

-- 7. Enable RLS on the cache table
ALTER TABLE admin_users_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read the admin cache (it's just UUIDs, not sensitive)
CREATE POLICY "admin_cache_read_all"
    ON admin_users_cache FOR SELECT
    USING (true);

-- Only system can write to cache (via trigger)
CREATE POLICY "admin_cache_system_only"
    ON admin_users_cache FOR ALL
    USING (false);
