-- Migration 047: backfill user_roles.coach_id for coach users
--
-- Migration 043 added a RLS policy "Coaches manage own time_slots" that
-- joins user_roles.coach_id = time_slots.coach_id. Several existing rows
-- in user_roles have role = 'coach' but coach_id IS NULL, so coach UPDATEs
-- silently match 0 rows under RLS (PostgREST returns {error:null,data:[]}
-- and the admin-v2.js Edit Time Slot modal closes as if it succeeded).
--
-- Backfill coach_id from the coaches table by joining auth.users on email.
-- Idempotent: re-running is a no-op when coach_id is already correct.
-- The WHERE clause prevents overwriting admin rows.

INSERT INTO user_roles (user_id, role, coach_id)
SELECT au.id, 'coach', c.id
FROM coaches c
JOIN auth.users au ON au.email = c.email
ON CONFLICT (user_id) DO UPDATE
  SET coach_id = EXCLUDED.coach_id
  WHERE user_roles.coach_id IS DISTINCT FROM EXCLUDED.coach_id
    AND user_roles.role <> 'admin';
