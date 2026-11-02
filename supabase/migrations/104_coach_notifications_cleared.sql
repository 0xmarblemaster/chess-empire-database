-- Migration 104: coach bell Unread / Read tabs — «Очистить» on the Read tab
--
-- Alex, 2026-11-02: the bell panel gets two tabs. «Очистить» on Unread marks
-- everything read (mark_coach_notifications_read, migration 102); «Очистить»
-- on Read hides those rows from the bell only. Notifications are NEVER
-- deleted — clearing just stamps cleared_at; every row stays in the database.
--
-- Objects:
--   * coach_notifications.cleared_at — set when the coach clears a READ row
--     from the bell; NULL = still listed in the Read tab.
--   * clear_coach_notifications(ids uuid[] DEFAULT NULL) — stamps cleared_at
--     on the caller's read, not-yet-cleared rows (NULL = all of them); returns
--     the count. Unread rows can never be cleared. Like the mark-read RPC it
--     is the only write path: still no UPDATE / DELETE policy or grant.
--   * Prefill: replays the last 7 days of students-api events (same rules as
--     103) for the rolled-out branches only — Halyk Arena and Online. The
--     (recipient_coach_id, status_history_id) key makes a re-run insert
--     nothing and leaves 103's rows untouched.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE coach_notifications ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION clear_coach_notifications(ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n INTEGER;
BEGIN
    UPDATE coach_notifications cn
       SET cleared_at = now()
     WHERE cn.cleared_at IS NULL
       AND cn.read_at IS NOT NULL
       AND cn.recipient_coach_id IN (SELECT coach_notifications_my_coach_ids())
       AND (ids IS NULL OR cn.id = ANY (ids));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION clear_coach_notifications(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION clear_coach_notifications(UUID[]) TO authenticated;

WITH ev AS (
    SELECT h.id AS status_history_id, h.student_id, h.old_status, h.created_at,
           CASE
               WHEN h.old_status IS NULL AND h.new_status = 'active' THEN 'new_student'
               WHEN h.old_status IN ('frozen', 'left') AND h.new_status = 'active' THEN 'reactivated'
               WHEN h.new_status = 'frozen' AND h.old_status IS DISTINCT FROM 'frozen' THEN 'frozen'
           END AS kind
    FROM student_status_history h
    WHERE h.changed_by_type = 'api'
      AND h.created_at >= now() - interval '7 days'
),
st AS (
    SELECT ev.*, s.branch_id, s.coach_id, s.student_code,
           NULLIF(trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '') AS student_name,
           NULLIF(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') AS coach_name,
           b.name AS branch_name
    FROM ev
    JOIN students s ON s.id = ev.student_id
    LEFT JOIN coaches c ON c.id = s.coach_id
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE ev.kind IS NOT NULL
      AND s.branch_id IN ('b146c01e-4a37-440e-84e7-4540358a21b9',  -- Halyk Arena
                          '0b631805-16b9-4d9e-bbda-d595865cb96d')  -- Online
),
rcpt AS (
    SELECT st.*, st.coach_id AS recipient_coach_id FROM st WHERE st.coach_id IS NOT NULL
    UNION
    SELECT st.*, bc.id FROM st
    JOIN coaches bc ON st.coach_id IS NULL AND st.branch_id IS NOT NULL AND (
        bc.branch_id = st.branch_id
        OR EXISTS (SELECT 1 FROM coach_branches cb WHERE cb.coach_id = bc.id AND cb.branch_id = st.branch_id))
)
INSERT INTO coach_notifications (
    recipient_coach_id, kind, previous_status, status_history_id, student_id,
    student_name, student_code, assigned_coach_id, assigned_coach_name,
    branch_id, branch_name, source, created_at)
SELECT recipient_coach_id, kind,
       CASE WHEN kind = 'new_student' THEN NULL ELSE old_status END,
       status_history_id, student_id, student_name, student_code, coach_id, coach_name,
       branch_id, branch_name, 'amocrm', created_at
FROM rcpt
ON CONFLICT (recipient_coach_id, status_history_id) DO NOTHING;

COMMIT;
