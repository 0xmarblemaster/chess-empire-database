-- Migration 107: students — anon (logged-out) may read only the PUBLIC columns.
--
-- Why: anon had table-level SELECT on every students column and RLS is
-- USING (true), so `GET /rest/v1/students?select=parent_phone` with the
-- publishable key returned every parent's phone number (synced from amoCRM).
-- Staff sign in via Supabase Auth (role authenticated) and keep full access;
-- edge functions / Chesster use the service-role key and are unaffected.
--
-- PRIVATE (staff-only): parent_name, parent_phone, parent_email,
--                       chesster_email, amocrm_customer_id.
--
-- NOTE: with the table-level grant gone, NEW students columns are NOT
-- anon-readable by default. If a public page needs a new column, add it to
-- the GRANT below (in a new migration). Any anon query that names a private
-- column or selects `*` now fails with 42501 — the frontend uses
-- STUDENT_PUBLIC_COLUMNS / studentColumnsForSession() (supabase-data.js).
--
-- Idempotent: REVOKE on the table also drops the column grants, then the
-- GRANT re-adds exactly the public list.

BEGIN;

REVOKE SELECT ON public.students FROM anon;

GRANT SELECT (
    id, first_name, last_name, age, date_of_birth, gender, photo_url,
    branch_id, coach_id, razryad, status, current_level, current_lesson,
    total_lessons, created_at, updated_at, chesster_registered_at, student_code
) ON public.students TO anon;

COMMIT;
