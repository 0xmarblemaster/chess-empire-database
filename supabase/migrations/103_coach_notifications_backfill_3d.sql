-- Migration 103: prefill coach_notifications with the last 3 days of AmoCRM events
--
-- One-off backfill (Alex, 2026-11-02): the bell went live at ~08:25 UTC with an
-- empty inbox. This replays every students-api status event (changed_by_type =
-- 'api') from the 3 days before the run, for ALL branches, using the same rules
-- as students-api (students-logic.mjs):
--   kind:  NULL → active             = new_student
--          frozen / left → active    = reactivated (previous_status = old)
--          anything else → frozen    = frozen      (previous_status = old)
--          other transitions          → no notification
--   recipients: students.coach_id when set, else every coach of the student's
--          branch (coaches.branch_id ∪ coach_branches).
-- created_at is the event time, so cards show when it really happened and the
-- 7-day bell window expires them naturally. Names are CURRENT names (no
-- snapshot existed at event time). Idempotent: the (recipient_coach_id,
-- status_history_id) key makes a re-run insert nothing.

BEGIN;

WITH ev AS (
    SELECT h.id AS status_history_id, h.student_id, h.old_status, h.created_at,
           CASE
               WHEN h.old_status IS NULL AND h.new_status = 'active' THEN 'new_student'
               WHEN h.old_status IN ('frozen', 'left') AND h.new_status = 'active' THEN 'reactivated'
               WHEN h.new_status = 'frozen' AND h.old_status IS DISTINCT FROM 'frozen' THEN 'frozen'
           END AS kind
    FROM student_status_history h
    WHERE h.changed_by_type = 'api'
      AND h.created_at >= now() - interval '3 days'
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
