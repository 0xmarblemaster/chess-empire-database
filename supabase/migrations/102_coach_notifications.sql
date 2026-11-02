-- Migration 102: coach "new student" notifications (bell inbox)
--
-- CONTEXT
-- -------
-- Coaches see AmoCRM-driven roster events in a bell inbox on the dashboard
-- (coach-notifications.js, admin-v2.html), written by
-- supabase/functions/students-api:
--   * kind 'new_student' — action=create inserted a NEW student (the insert
--     path, never an existing match); previous_status is NULL.
--   * kind 'reactivated' — the API moved a student from 'frozen' or 'left' to
--     'active' (action=activate, or create matching a frozen student);
--     previous_status is the status it came back from.
--
-- Objects:
--   * coach_notifications — one row per (recipient coach, status event).
--     Recipients (decided in students-logic.mjs notificationRecipients):
--       student has coach_id → that coach only;
--       no coach_id          → every coach of the branch (coaches.branch_id or
--                              a coach_branches row).
--     Admins get no rows in this phase. student_name / student_code /
--     assigned_coach_* / branch_* are SNAPSHOTS taken at event time, so the
--     inbox reads the same after a rename. status_history_id is the
--     student_status_history row of the event; the unique key
--     (recipient_coach_id, status_history_id) makes a replayed fan-out a no-op
--     (the edge function upserts with ignoreDuplicates) while a student frozen
--     → active twice notifies twice.
--   * coach_notifications_my_coach_ids() — coaches whose email matches the
--     JWT email case-insensitively (the same resolution as auth-helpers.js
--     getRoleInfo; coaches.email is lowercased by 048).
--   * coach_notifications_is_admin() — user_roles.role = 'admin' for auth.uid().
--   * mark_coach_notifications_read(ids uuid[] DEFAULT NULL) — sets read_at on
--     the caller's unread rows (NULL = all of them); returns the count. The only
--     client write path: there is no UPDATE policy, so read_at is the only
--     column a coach can ever change.
--
-- RLS: a coach SELECTs their own rows, admins SELECT all. No INSERT / UPDATE /
-- DELETE policy and no table write grants for anon / authenticated — rows are
-- written by the service role (students-api) only.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS coach_notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_coach_id  UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL DEFAULT 'new_student'
                        CHECK (kind IN ('new_student', 'reactivated')),
    previous_status     TEXT,
    status_history_id   UUID NOT NULL REFERENCES student_status_history(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name        TEXT,
    student_code        TEXT,
    assigned_coach_id   UUID,
    assigned_coach_name TEXT,
    branch_id           UUID,
    branch_name         TEXT,
    source              TEXT NOT NULL DEFAULT 'amocrm',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at             TIMESTAMPTZ,
    CONSTRAINT coach_notifications_recipient_event_key
        UNIQUE (recipient_coach_id, status_history_id)
);

CREATE INDEX IF NOT EXISTS coach_notifications_inbox_idx
    ON coach_notifications (recipient_coach_id, read_at, created_at DESC);

CREATE OR REPLACE FUNCTION coach_notifications_my_coach_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id FROM coaches c
    WHERE auth.email() IS NOT NULL
      AND lower(c.email) = lower(auth.email());
$$;

CREATE OR REPLACE FUNCTION coach_notifications_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    );
$$;

ALTER TABLE coach_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON coach_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON coach_notifications TO authenticated;

DROP POLICY IF EXISTS coach_notifications_select_own ON coach_notifications;
CREATE POLICY coach_notifications_select_own
    ON coach_notifications FOR SELECT TO authenticated
    USING (recipient_coach_id IN (SELECT coach_notifications_my_coach_ids()));

DROP POLICY IF EXISTS coach_notifications_select_admin ON coach_notifications;
CREATE POLICY coach_notifications_select_admin
    ON coach_notifications FOR SELECT TO authenticated
    USING (coach_notifications_is_admin());

CREATE OR REPLACE FUNCTION mark_coach_notifications_read(ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n INTEGER;
BEGIN
    UPDATE coach_notifications cn
       SET read_at = now()
     WHERE cn.read_at IS NULL
       AND cn.recipient_coach_id IN (SELECT coach_notifications_my_coach_ids())
       AND (ids IS NULL OR cn.id = ANY (ids));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION coach_notifications_my_coach_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION coach_notifications_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mark_coach_notifications_read(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION coach_notifications_my_coach_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION coach_notifications_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_coach_notifications_read(UUID[]) TO authenticated;

COMMIT;
