-- ============================================
-- CREATE FUNCTION: create_user_role
-- ============================================
-- This function creates a user_role entry for new coaches
-- Called by the complete-registration Edge Function
-- Uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION create_user_role(
    p_user_id UUID,
    p_role TEXT,
    p_can_view_all_students BOOLEAN DEFAULT false,
    p_can_edit_students BOOLEAN DEFAULT true,
    p_can_manage_branches BOOLEAN DEFAULT false,
    p_can_manage_coaches BOOLEAN DEFAULT false,
    p_can_manage_app_access BOOLEAN DEFAULT true,  -- Coaches need dashboard access
    p_coach_id UUID DEFAULT NULL
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
        can_manage_coaches,
        can_manage_app_access,
        coach_id
    )
    VALUES (
        p_user_id,
        p_role,
        p_can_view_all_students,
        p_can_edit_students,
        p_can_manage_branches,
        p_can_manage_coaches,
        p_can_manage_app_access,
        p_coach_id
    )
    RETURNING id INTO role_id;

    RETURN role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_role TO authenticated, service_role;

-- Verify the function was created
SELECT
    'Function created successfully' as status,
    proname as function_name,
    pronargs as num_args
FROM pg_proc
WHERE proname = 'create_user_role';
