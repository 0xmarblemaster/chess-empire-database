-- ============================================
-- FIX: User Roles Creation Issue
-- ============================================
-- This fixes the issue where Edge Functions cannot create user roles
-- due to missing RLS policies and creates a secure function to handle role creation

-- Function to create user role with proper permissions
CREATE OR REPLACE FUNCTION create_user_role(
    p_user_id UUID,
    p_role TEXT,
    p_can_view_all_students BOOLEAN DEFAULT false,
    p_can_edit_students BOOLEAN DEFAULT true,  -- Coaches should be able to edit students
    p_can_manage_branches BOOLEAN DEFAULT false,
    p_can_manage_coaches BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    role_id UUID;
BEGIN
    -- Insert user role
    INSERT INTO user_roles (
        user_id,
        role,
        can_view_all_students,
        can_edit_students,
        can_manage_branches,
        can_manage_coaches
    )
    VALUES (
        p_user_id,
        p_role,
        p_can_view_all_students,
        p_can_edit_students,
        p_can_manage_branches,
        p_can_manage_coaches
    )
    RETURNING id INTO role_id;

    RETURN role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION create_user_role TO service_role;

-- Also grant to authenticated users (for future use)
GRANT EXECUTE ON FUNCTION create_user_role TO authenticated;

-- Note: The test section below is commented out because the user might not exist yet
-- Once a user registers, the Edge Function will automatically create their role using this function

-- Test the function (uncomment and replace with actual user_id after registration):
-- SELECT create_user_role(
--     'USER_ID_HERE'::UUID,
--     'coach',
--     false,  -- can_view_all_students
--     true,   -- can_edit_students (COACH CAN EDIT STUDENTS)
--     false,  -- can_manage_branches
--     false   -- can_manage_coaches
-- );

-- Verify function was created successfully
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'create_user_role';
