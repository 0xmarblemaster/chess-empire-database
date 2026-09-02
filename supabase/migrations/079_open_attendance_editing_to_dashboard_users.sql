-- Migration 079: open Attendance Dashboard editing to all dashboard users
--
-- PERMISSION MODEL CHANGE
-- -----------------------
-- Until now the attendance calendar restricted slot and assignment writes to
-- the owning coach (or an admin):
--   * time_slots "Coaches manage own time_slots" — a coach could only write
--     rows where user_roles.coach_id = time_slots.coach_id (their own coach).
--   * student_time_slot_assignments "Authorized users can manage time slot
--     assignments" — only admins OR users with can_edit_students = true;
--     plain coaches were BLOCKED from adding/removing students to slots.
--
-- The Attendance Dashboard is now a shared tool: anyone who can open it (any
-- authenticated user with a user_roles row — admin, coach, or
-- can_edit_students) may fully edit it — any branch, any coach, add/remove
-- students from slots, add/edit/remove time slots. This mirrors the earlier
-- openings of attendance marking (migration 016) and the students table
-- (migration 059): the dashboard's access IS the permission; RLS just needs
-- a user_roles row to exist.
--
-- We therefore replace the two per-coach / can_edit_students policies with a
-- single "any user_roles row" predicate on each table. The versioned slot
-- RPCs (add/edit/delete_time_slot_versioned) are SECURITY INVOKER and inherit
-- these policies automatically — no RPC changes are needed.
--
-- Untouched:
--   * time_slots "Admins manage time_slots" + "Anyone can read time_slots"
--   * student_time_slot_assignments "Anyone can read time slot assignments"
--   * attendance marking (migration 016) and students table (migration 059)
--     are already open — not touched here.
--
-- Reversible: a follow-up migration can re-narrow either predicate back to the
-- per-coach / can_edit_students form. The user_roles.coach_id backfill (047)
-- is preserved (other policies still depend on it).
--
-- Follows the style of migrations 043 / 059 / 078.
-- Do NOT apply to production — Alex reviews and applies.

BEGIN;

-- time_slots: any dashboard user (any user_roles row) manages any coach's slots
DROP POLICY IF EXISTS "Coaches manage own time_slots" ON time_slots;

CREATE POLICY "Dashboard users manage time_slots"
    ON time_slots FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
        )
    );

-- student_time_slot_assignments: any dashboard user manages any assignment
DROP POLICY IF EXISTS "Authorized users can manage time slot assignments" ON student_time_slot_assignments;

CREATE POLICY "Dashboard users manage time slot assignments"
    ON student_time_slot_assignments FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
        )
    );

COMMENT ON POLICY "Dashboard users manage time_slots" ON time_slots IS
    'Migration 079: any authenticated user with a user_roles row (admin, coach, or can_edit_students) may manage time_slots for any branch/coach. The Attendance Dashboard is a shared tool. Replaces the per-coach "Coaches manage own time_slots" policy.';

COMMENT ON POLICY "Dashboard users manage time slot assignments" ON student_time_slot_assignments IS
    'Migration 079: any authenticated user with a user_roles row may add/remove students from time slots. Replaces the admin-or-can_edit_students "Authorized users can manage time slot assignments" policy so plain coaches are no longer blocked.';

COMMIT;
