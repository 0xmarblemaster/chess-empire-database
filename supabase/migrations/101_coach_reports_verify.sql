-- Migration 101 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Cross-checks coach_report() totals against direct SQL recounts for one
-- window (edit the two timestamps in `w`; default = October 2026, Almaty).
-- Every row of the final query must have ok = true.

WITH
w AS (
    SELECT TIMESTAMPTZ '2026-10-01 00:00:00+05' AS s, TIMESTAMPTZ '2026-11-01 00:00:00+05' AS e
),
r AS (
    SELECT coach_report(w.s, w.e) AS j FROM w
),
coach_rows AS (
    SELECT x FROM r, jsonb_array_elements(r.j -> 'coaches') x
),
sum_rows AS (
    SELECT
        sum((x ->> 'new_students')::INT) AS new_students,
        sum((x ->> 'left')::INT) AS left_n,
        sum((x ->> 'frozen_30d')::INT) AS frozen_30d,
        sum((x ->> 'active_students')::INT) AS active,
        sum((x -> 'razryad_changes' ->> 'promotions')::INT) AS promotions,
        sum((x -> 'podiums' ->> 'finishes')::INT) AS finishes,
        sum((x -> 'retention' ->> 'n')::INT) AS retention_n
    FROM coach_rows
),
school AS (
    SELECT r.j -> 'school' AS x FROM r
),
-- direct recounts (dedupe inline: same student + transition within 5 min)
dedup AS (
    SELECT h.*
    FROM student_status_history h
    WHERE NOT EXISTS (
        SELECT 1 FROM student_status_history p
        WHERE p.student_id = h.student_id
          AND p.old_status IS NOT DISTINCT FROM h.old_status
          AND p.new_status = h.new_status
          AND (p.changed_at, p.id) < (h.changed_at, h.id)
          AND h.changed_at - p.changed_at <= INTERVAL '5 minutes'
          AND NOT EXISTS (  -- no other event in between
              SELECT 1 FROM student_status_history q
              WHERE q.student_id = h.student_id
                AND (q.changed_at, q.id) > (p.changed_at, p.id)
                AND (q.changed_at, q.id) < (h.changed_at, h.id)
          )
    )
),
direct AS (
    SELECT
        (SELECT count(*) FROM dedup d, w
          WHERE d.new_status = 'left' AND d.old_status IS NOT NULL AND d.old_status <> 'left'
            AND d.changed_at >= w.s AND d.changed_at < w.e) AS left_n,
        (SELECT count(*) FROM students WHERE status = 'active') AS active,
        (SELECT count(*) FROM razryad_history rh, w
          WHERE rh.changed_at >= w.s AND rh.changed_at < w.e
            AND razryad_rank(rh.new_razryad) > razryad_rank(rh.old_razryad)) AS promotions,
        (SELECT count(*) FROM tournament_results tr JOIN tournaments_uploads tu ON tu.id = tr.upload_id, w
          WHERE tr.games_played > 0 AND tr.rank BETWEEN 1 AND 3
            AND tu.tournament_date >= (w.s AT TIME ZONE 'Asia/Almaty')::DATE
            AND tu.tournament_date <  (w.e AT TIME ZONE 'Asia/Almaty')::DATE) AS finishes,
        (SELECT count(*) FROM students s, w
          WHERE s.status = 'active' AND s.coach_id IS NULL) AS active_no_coach,
        (SELECT count(*) FROM v_student_start v, w
          WHERE v.start_date IS NOT NULL
            AND (v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < LEAST(w.e, now())) AS retention_n
)
SELECT 'school.left = direct recount' AS check, (school.x ->> 'left')::BIGINT AS report, direct.left_n AS expected,
       (school.x ->> 'left')::BIGINT = direct.left_n AS ok FROM school, direct
UNION ALL
SELECT 'school.active_students = students active', (school.x ->> 'active_students')::BIGINT, direct.active,
       (school.x ->> 'active_students')::BIGINT = direct.active FROM school, direct
UNION ALL
SELECT 'school.promotions = razryad_history recount', (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT, direct.promotions,
       (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT = direct.promotions FROM school, direct
UNION ALL
SELECT 'school.podium finishes = tournament_results recount', (school.x -> 'podiums' ->> 'finishes')::BIGINT, direct.finishes,
       (school.x -> 'podiums' ->> 'finishes')::BIGINT = direct.finishes FROM school, direct
UNION ALL
SELECT 'school.retention.n = started students', (school.x -> 'retention' ->> 'n')::BIGINT, direct.retention_n,
       (school.x -> 'retention' ->> 'n')::BIGINT = direct.retention_n FROM school, direct
UNION ALL
SELECT 'unattributed.active = active students without coach',
       (SELECT (x ->> 'active_students')::BIGINT FROM coach_rows WHERE x ->> 'coach_id' IS NULL), direct.active_no_coach,
       (SELECT (x ->> 'active_students')::BIGINT FROM coach_rows WHERE x ->> 'coach_id' IS NULL) = direct.active_no_coach
FROM direct
UNION ALL
SELECT 'Σ coaches.new_students = school', s.new_students, (school.x ->> 'new_students')::BIGINT,
       s.new_students = (school.x ->> 'new_students')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.left = school', s.left_n, (school.x ->> 'left')::BIGINT,
       s.left_n = (school.x ->> 'left')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.frozen_30d = school', s.frozen_30d, (school.x ->> 'frozen_30d')::BIGINT,
       s.frozen_30d = (school.x ->> 'frozen_30d')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.active_students = school', s.active, (school.x ->> 'active_students')::BIGINT,
       s.active = (school.x ->> 'active_students')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.promotions = school', s.promotions, (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT,
       s.promotions = (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.podium finishes = school', s.finishes, (school.x -> 'podiums' ->> 'finishes')::BIGINT,
       s.finishes = (school.x -> 'podiums' ->> 'finishes')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'Σ coaches.retention.n = school', s.retention_n, (school.x -> 'retention' ->> 'n')::BIGINT,
       s.retention_n = (school.x -> 'retention' ->> 'n')::BIGINT FROM sum_rows s, school
UNION ALL
SELECT 'churn = left + frozen_30d (school)', (school.x ->> 'churn')::BIGINT,
       (school.x ->> 'left')::BIGINT + (school.x ->> 'frozen_30d')::BIGINT,
       (school.x ->> 'churn')::BIGINT = (school.x ->> 'left')::BIGINT + (school.x ->> 'frozen_30d')::BIGINT FROM school;

-- Informational: duplicate status events removed by the dedupe view.
SELECT (SELECT count(*) FROM student_status_history) AS raw_events,
       (SELECT count(*) FROM v_status_events_dedup) AS deduped_events;

-- Informational: cohort matrix shape (school-wide).
SELECT jsonb_array_length(coach_cohort_matrix() -> 'rows') AS cohorts,
       (coach_cohort_matrix() ->> 'max_months')::INT AS max_months;
