-- Fix RLS Infinite Recursion on user_roles table
-- This removes the recursive admin policy that was causing the issue

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;

-- Drop the duplicate admin management policy
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;

-- Keep only the simple "Users can read their own role" policy
-- This policy already exists and works without recursion:
-- CREATE POLICY "Users can read their own role"
--     ON user_roles FOR SELECT
--     USING (auth.uid() = user_id);

-- For admin operations, we'll create a security definer function instead
-- This bypasses RLS and avoids recursion

CREATE OR REPLACE FUNCTION get_all_user_roles()
RETURNS SETOF user_roles AS $$
BEGIN
    -- Check if the calling user is an admin
    IF EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    ) THEN
        RETURN QUERY SELECT * FROM user_roles;
    ELSE
        -- Non-admins can only see their own role
        RETURN QUERY SELECT * FROM user_roles WHERE user_id = auth.uid();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create policy for INSERT/UPDATE/DELETE that uses the helper function
-- instead of recursive checks
CREATE POLICY "Admins can manage user roles via function"
    ON user_roles FOR ALL
    USING (
        -- Allow if user is admin (checked via security definer function)
        (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
    )
    WITH CHECK (
        (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
    );
