-- ============================================
-- FIX: Coach cannot update students
-- ============================================
-- Problem: RLS policy requires coach_id in user_roles to match student's coach_id
-- But coach_id might not be set during registration
--
-- Solution: Allow coaches to edit students in two ways:
-- 1. If their coach_id in user_roles matches the student's coach_id
-- 2. If can_edit_students = true (regardless of coach_id match)

-- Drop the old policy
DROP POLICY IF EXISTS "Authorized users can update students" ON students;

-- Create new policy with better logic
CREATE POLICY "Authorized users can update students"
    ON students FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                -- Admins can edit any student
                ur.role = 'admin'
                -- Coaches with edit permission can edit their own students
                OR (ur.can_edit_students = true AND students.coach_id = ur.coach_id)
                -- Coaches with edit permission and no specific coach assignment can edit any
                OR (ur.can_edit_students = true AND ur.coach_id IS NULL)
            )
        )
    );

-- Also fix the INSERT policy to match
DROP POLICY IF EXISTS "Authorized users can insert students" ON students;

CREATE POLICY "Authorized users can insert students"
    ON students FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                -- Admins can insert any student
                ur.role = 'admin'
                -- Coaches with edit permission can insert students
                OR ur.can_edit_students = true
            )
        )
    );

-- Verify the policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'students'
ORDER BY policyname;
