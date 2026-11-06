-- Migration 105: students INSERT RLS — admins only.
--
-- Decision (Alex, 2026-11-06): only admins (user_roles.role = 'admin') and API
-- keys (students-api edge function, service-role key — bypasses RLS) may create
-- students. Coaches with can_edit_students keep UPDATE / DELETE (migration 059),
-- but lose INSERT.
--
-- Previously (FIX_STUDENT_UPDATE_RLS.sql):
--   WITH CHECK (role = 'admin' OR can_edit_students = true)
--
-- Only the INSERT policy changes. The UPDATE / DELETE policies and the
-- can_edit_students flag are untouched. Idempotent.

BEGIN;

DROP POLICY IF EXISTS "Authorized users can insert students" ON students;

CREATE POLICY "Authorized users can insert students"
    ON students FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'admin'
        )
    );

COMMIT;
