-- Migration 101 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Cross-checks coach_report() totals against direct SQL recounts for one
-- window (edit the two timestamps in `w`; default = October 2026, Almaty).
-- Every row of the final query must have ok = true.
--
-- The recounts re-implement the 101 rules inline (not via its helpers):
--   B1  cleanup batch 2026-10-14 16:00–17:15 UTC (→frozen, changed_by NULL):
--       returned / real_left / dated (left on last present lesson) / undated
--   B2  022 backfill rows (old NULL, changed_by NULL, system@, 2026-02-04 UTC,
--       ≥ 1 day after the student row) are initial state, not transitions
--   S1  frozen_30d and non-cleanup left (left − cleanup_leavers_dated.in_window)
--       are additive: the window's 7-day chunks and the three months of its
--       quarter sum to the window / quarter. Cleanup-sourced left is NOT
--       additive by design: each span judges the batch as of its own end, so a
--       student whose last lesson falls in a week and who returns after that
--       week ends is `left` in the week but not in the month.

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
    SELECT r.j -> 'school' AS x, r.j -> 'data_notes' AS notes FROM r
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
-- B1: the cleanup batch, classified as of the report's evaluation instant
batch_rows AS (
    SELECT d.* FROM dedup d
    WHERE d.new_status = 'frozen' AND d.changed_by IS NULL
      AND d.changed_at >= TIMESTAMPTZ '2026-10-14 16:00:00+00' AND d.changed_at < TIMESTAMPTZ '2026-10-14 17:15:00+00'
),
asof AS (
    SELECT CASE WHEN LEAST(w.e, now()) >= TIMESTAMPTZ '2026-10-14 17:15:00+00' THEN LEAST(w.e, now()) ELSE now() END AS t
    FROM w
),
batch AS (
    SELECT b.student_id, min(b.changed_at) AS batch_at,
           (SELECT max(a.attendance_date) FROM attendance a
             WHERE a.student_id = b.student_id AND a.status = 'present'
               AND a.attendance_date <= DATE '2026-10-14') AS last_present
    FROM batch_rows b GROUP BY b.student_id
),
cls AS (
    SELECT b.student_id, b.batch_at, b.last_present,
        CASE
            WHEN EXISTS (SELECT 1 FROM dedup d, asof WHERE d.student_id = b.student_id AND d.new_status = 'active'
                           AND d.changed_at > b.batch_at AND d.changed_at < asof.t)
              OR EXISTS (SELECT 1 FROM attendance a, asof WHERE a.student_id = b.student_id AND a.status = 'present'
                           AND a.attendance_date > DATE '2026-10-14'
                           AND (a.attendance_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < asof.t)
                THEN 'returned'
            WHEN EXISTS (SELECT 1 FROM dedup d, asof WHERE d.student_id = b.student_id AND d.new_status = 'left'
                           AND d.changed_at > b.batch_at AND d.changed_at < asof.t)
              OR (SELECT d.new_status FROM dedup d WHERE d.student_id = b.student_id AND d.changed_at < b.batch_at
                   ORDER BY d.changed_at DESC, d.id DESC LIMIT 1) = 'left'
              OR EXISTS (SELECT 1 FROM dedup d WHERE d.student_id = b.student_id AND d.new_status = 'left'
                           AND d.changed_at < b.batch_at
                           AND (b.last_present IS NULL OR d.changed_at >= (b.last_present::TIMESTAMP AT TIME ZONE 'Asia/Almaty')))
                THEN 'real_left'
            WHEN b.last_present IS NULL THEN 'undated'
            ELSE 'dated'
        END AS outcome,
        (b.last_present + 1)::TIMESTAMP AT TIME ZONE 'Asia/Almaty' - INTERVAL '1 microsecond' AS leave_ts
    FROM batch b, asof
    WHERE b.batch_at < asof.t
),
-- B2: 022 backfill rows
backfill AS (
    SELECT d.id FROM dedup d JOIN students s ON s.id = d.student_id
    WHERE d.old_status IS NULL AND d.changed_by IS NULL AND d.changed_by_email = 'system@chessempire.kz'
      AND d.changed_at >= TIMESTAMPTZ '2026-02-04 00:00:00+00' AND d.changed_at < TIMESTAMPTZ '2026-02-05 00:00:00+00'
      AND d.changed_at >= s.created_at + INTERVAL '1 day'
),
-- cleaned stream: no batch rows, dated leavers cut at leave_ts + synthetic →left
clean AS (
    SELECT d.id, d.student_id, d.old_status, d.new_status, d.changed_at,
           d.id IN (SELECT id FROM backfill) AS is_backfill
    FROM dedup d
    WHERE d.id NOT IN (SELECT id FROM batch_rows)
      AND NOT EXISTS (SELECT 1 FROM cls c WHERE c.outcome = 'dated' AND c.student_id = d.student_id AND d.changed_at > c.leave_ts)
    UNION ALL
    SELECT NULL, c.student_id, 'active', 'left', c.leave_ts, false FROM cls c WHERE c.outcome = 'dated'
),
clean_next AS (
    SELECT c.*, (SELECT min(n.changed_at) FROM clean n WHERE n.student_id = c.student_id AND n.changed_at > c.changed_at) AS next_at
    FROM clean c
),
spans AS (  -- the window, its 7-day chunks and the 3 months of its quarter
    SELECT 'window' AS kind, w.s, w.e FROM w
    UNION ALL
    SELECT 'week', x, LEAST(x + INTERVAL '7 days', w.e) FROM w, generate_series(w.s, w.e - INTERVAL '1 second', INTERVAL '7 days') x
    UNION ALL
    SELECT 'month',
           (date_trunc('quarter', w.s AT TIME ZONE 'Asia/Almaty') + m * INTERVAL '1 month') AT TIME ZONE 'Asia/Almaty',
           (date_trunc('quarter', w.s AT TIME ZONE 'Asia/Almaty') + (m + 1) * INTERVAL '1 month') AT TIME ZONE 'Asia/Almaty'
    FROM w, generate_series(0, 2) m
    UNION ALL
    SELECT 'quarter',
           date_trunc('quarter', w.s AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty',
           (date_trunc('quarter', w.s AT TIME ZONE 'Asia/Almaty') + INTERVAL '3 months') AT TIME ZONE 'Asia/Almaty'
    FROM w
),
span_rep AS (
    SELECT sp.kind, sp.s,
           (x.j -> 'school' ->> 'frozen_30d')::INT AS frozen_30d,
           (x.j -> 'school' ->> 'left')::INT
             - (x.j -> 'data_notes' -> 'cleanup_freeze' -> 'cleanup_leavers_dated' ->> 'in_window')::INT AS left_n
    FROM spans sp
    CROSS JOIN LATERAL (SELECT coach_report(sp.s, sp.e) AS j) x
),
s1 AS (
    SELECT
        (SELECT frozen_30d FROM span_rep WHERE kind = 'window') AS win_frozen,
        (SELECT sum(frozen_30d) FROM span_rep WHERE kind = 'week') AS weeks_frozen,
        (SELECT left_n FROM span_rep WHERE kind = 'window') AS win_left,
        (SELECT sum(left_n) FROM span_rep WHERE kind = 'week') AS weeks_left,
        (SELECT frozen_30d FROM span_rep WHERE kind = 'quarter') AS q_frozen,
        (SELECT sum(frozen_30d) FROM span_rep WHERE kind = 'month') AS months_frozen,
        (SELECT left_n FROM span_rep WHERE kind = 'quarter') AS q_left,
        (SELECT sum(left_n) FROM span_rep WHERE kind = 'month') AS months_left
),
first_left AS (
    SELECT DISTINCT ON (student_id) student_id, is_backfill
    FROM clean WHERE new_status = 'left' ORDER BY student_id, changed_at
),
direct AS (
    SELECT
        (SELECT count(*) FROM clean d, w
          WHERE d.new_status = 'left' AND NOT d.is_backfill
            AND d.old_status IS NOT NULL AND d.old_status <> 'left'
            AND d.changed_at >= w.s AND d.changed_at < w.e) AS left_n,
        (SELECT count(*) FROM clean_next d, w
          WHERE d.new_status = 'frozen' AND NOT d.is_backfill AND d.old_status IS DISTINCT FROM 'frozen'
            AND d.changed_at + INTERVAL '30 days' >= w.s AND d.changed_at + INTERVAL '30 days' < w.e
            AND d.changed_at + INTERVAL '30 days' <= now()
            AND (d.next_at IS NULL OR d.next_at > d.changed_at + INTERVAL '30 days')) AS frozen_30d,
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
            AND (v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < LEAST(w.e, now())
            AND NOT EXISTS (SELECT 1 FROM first_left f WHERE f.student_id = v.student_id AND f.is_backfill)
            AND NOT EXISTS (SELECT 1 FROM cls c WHERE c.student_id = v.student_id AND c.outcome = 'undated')) AS retention_n,
        (SELECT count(*) FROM first_left f JOIN v_student_start v ON v.student_id = f.student_id, w
          WHERE f.is_backfill AND v.start_date IS NOT NULL
            AND (v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < LEAST(w.e, now())) AS pre_history,
        (SELECT count(*) FROM cls) AS batch_students,
        (SELECT count(*) FROM cls WHERE outcome = 'returned') AS returned,
        (SELECT count(*) FROM cls WHERE outcome = 'dated') AS dated,
        (SELECT count(*) FROM cls c, w WHERE c.outcome = 'dated' AND c.leave_ts >= w.s AND c.leave_ts < w.e) AS dated_in_window,
        (SELECT count(*) FROM cls WHERE outcome = 'undated') AS undated
)
SELECT 'school.left = direct recount (real + dated cleanup leavers)' AS check, (school.x ->> 'left')::BIGINT AS report,
       direct.left_n AS expected, (school.x ->> 'left')::BIGINT = direct.left_n AS ok FROM school, direct
UNION ALL
SELECT 'school.frozen_30d = direct recount (no batch / backfill spells)', (school.x ->> 'frozen_30d')::BIGINT, direct.frozen_30d,
       (school.x ->> 'frozen_30d')::BIGINT = direct.frozen_30d FROM school, direct
UNION ALL
SELECT 'school.active_students = students active (running window; past = as-of roster)', (school.x ->> 'active_students')::BIGINT, direct.active,
       w.e < now() OR (school.x ->> 'active_students')::BIGINT = direct.active FROM school, direct, w
UNION ALL
SELECT 'school.promotions = razryad_history recount', (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT, direct.promotions,
       (school.x -> 'razryad_changes' ->> 'promotions')::BIGINT = direct.promotions FROM school, direct
UNION ALL
SELECT 'school.podium finishes = tournament_results recount', (school.x -> 'podiums' ->> 'finishes')::BIGINT, direct.finishes,
       (school.x -> 'podiums' ->> 'finishes')::BIGINT = direct.finishes FROM school, direct
UNION ALL
SELECT 'school.retention.n = started students − pre-history − undated', (school.x -> 'retention' ->> 'n')::BIGINT, direct.retention_n,
       (school.x -> 'retention' ->> 'n')::BIGINT = direct.retention_n FROM school, direct
UNION ALL
SELECT 'B2: data_notes.excluded_pre_history_leavers', (school.notes ->> 'excluded_pre_history_leavers')::BIGINT, direct.pre_history,
       (school.notes ->> 'excluded_pre_history_leavers')::BIGINT = direct.pre_history FROM school, direct
UNION ALL
SELECT 'B1: cleanup batch_students', (school.notes -> 'cleanup_freeze' ->> 'batch_students')::BIGINT, direct.batch_students,
       (school.notes -> 'cleanup_freeze' ->> 'batch_students')::BIGINT = direct.batch_students FROM school, direct
UNION ALL
SELECT 'B1: cleanup returned', (school.notes -> 'cleanup_freeze' ->> 'returned')::BIGINT, direct.returned,
       (school.notes -> 'cleanup_freeze' ->> 'returned')::BIGINT = direct.returned FROM school, direct
UNION ALL
SELECT 'B1: cleanup_leavers_dated.total', (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_dated' ->> 'total')::BIGINT, direct.dated,
       (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_dated' ->> 'total')::BIGINT = direct.dated FROM school, direct
UNION ALL
SELECT 'B1: cleanup_leavers_dated.in_window', (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_dated' ->> 'in_window')::BIGINT,
       direct.dated_in_window,
       (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_dated' ->> 'in_window')::BIGINT = direct.dated_in_window FROM school, direct
UNION ALL
SELECT 'B1: cleanup_leavers_undated.total', (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_undated' ->> 'total')::BIGINT,
       direct.undated,
       (school.notes -> 'cleanup_freeze' -> 'cleanup_leavers_undated' ->> 'total')::BIGINT = direct.undated FROM school, direct
UNION ALL
SELECT 'B1: left on the cleanup day 2026-10-14 = real lefts + leavers whose last lesson was that day', x.rep, x.exp, x.rep = x.exp
FROM (SELECT (SELECT (coach_report(TIMESTAMPTZ '2026-10-14 00:00:00+05', TIMESTAMPTZ '2026-10-15 00:00:00+05') -> 'school' ->> 'left')::BIGINT) AS rep,
             (SELECT count(*) FROM dedup d
         WHERE d.new_status = 'left' AND d.old_status IS NOT NULL AND d.old_status <> 'left'
           AND d.changed_at >= TIMESTAMPTZ '2026-10-14 00:00:00+05' AND d.changed_at < TIMESTAMPTZ '2026-10-15 00:00:00+05')
       + (SELECT count(*) FROM batch b  -- as of 2026-10-15 00:00 Almaty: nobody can have returned yet
         WHERE b.last_present = DATE '2026-10-14'
           AND NOT EXISTS (SELECT 1 FROM dedup d WHERE d.student_id = b.student_id AND d.new_status IN ('active', 'left')
                             AND d.changed_at > b.batch_at AND d.changed_at < TIMESTAMPTZ '2026-10-15 00:00:00+05')
           AND (SELECT d.new_status FROM dedup d WHERE d.student_id = b.student_id AND d.changed_at < b.batch_at
                 ORDER BY d.changed_at DESC, d.id DESC LIMIT 1) IS DISTINCT FROM 'left'
           AND NOT EXISTS (SELECT 1 FROM dedup d WHERE d.student_id = b.student_id AND d.new_status = 'left'
                             AND d.changed_at >= TIMESTAMPTZ '2026-10-14 00:00:00+05' AND d.changed_at < b.batch_at)) AS exp) x
UNION ALL
SELECT 'B1: no batch freeze reaches 30 days on 2026-11-13 (frozen_30d = non-batch recount)', x.rep, x.exp, x.rep = x.exp
FROM (SELECT (SELECT (coach_report(TIMESTAMPTZ '2026-11-13 00:00:00+05', TIMESTAMPTZ '2026-11-14 00:00:00+05') -> 'school' ->> 'frozen_30d')::BIGINT) AS rep,
             (SELECT count(*) FROM clean_next d
         WHERE d.new_status = 'frozen' AND NOT d.is_backfill AND d.old_status IS DISTINCT FROM 'frozen'
           AND d.changed_at + INTERVAL '30 days' >= TIMESTAMPTZ '2026-11-13 00:00:00+05'
           AND d.changed_at + INTERVAL '30 days' < TIMESTAMPTZ '2026-11-14 00:00:00+05'
           AND d.changed_at + INTERVAL '30 days' <= now()
           AND (d.next_at IS NULL OR d.next_at > d.changed_at + INTERVAL '30 days')) AS exp) x
UNION ALL
SELECT 'S1: Σ 7-day chunks frozen_30d = window', s1.weeks_frozen, s1.win_frozen, s1.weeks_frozen = s1.win_frozen FROM s1
UNION ALL
SELECT 'S1: Σ 7-day chunks non-cleanup left = window', s1.weeks_left, s1.win_left, s1.weeks_left = s1.win_left FROM s1
UNION ALL
SELECT 'S1: Σ months frozen_30d = quarter', s1.months_frozen, s1.q_frozen, s1.months_frozen = s1.q_frozen FROM s1
UNION ALL
SELECT 'S1: Σ months non-cleanup left = quarter', s1.months_left, s1.q_left, s1.months_left = s1.q_left FROM s1
UNION ALL
SELECT 'unattributed.active = active students without coach (running window)',
       (SELECT (x ->> 'active_students')::BIGINT FROM coach_rows WHERE x ->> 'coach_id' IS NULL), direct.active_no_coach,
       w.e < now() OR (SELECT (x ->> 'active_students')::BIGINT FROM coach_rows WHERE x ->> 'coach_id' IS NULL) = direct.active_no_coach
FROM direct, w
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

-- Informational: B1 cleanup batch rows vs distinct students (expect ~326 rows, 162 students).
SELECT count(*) AS batch_rows, count(DISTINCT student_id) AS batch_students
FROM student_status_history
WHERE new_status = 'frozen' AND changed_by IS NULL
  AND changed_at >= TIMESTAMPTZ '2026-10-14 16:00:00+00' AND changed_at < TIMESTAMPTZ '2026-10-14 17:15:00+00';

-- Informational: B1 classification as of now (expect 2026-10-30: 79 leavers = 72 dated + 7 undated, 83 returned).
SELECT outcome, count(*) FROM coach_report_cleanup(now()) GROUP BY outcome ORDER BY outcome;

-- Informational: B2 022 backfill rows by status (expect 734: 637 active, 79 frozen, 18 left).
SELECT new_status, count(*) FROM coach_report_status_events(now()) WHERE source = 'backfill' GROUP BY new_status ORDER BY new_status;

-- Informational: cohort matrix shape (school-wide).
SELECT jsonb_array_length(coach_cohort_matrix() -> 'rows') AS cohorts,
       (coach_cohort_matrix() ->> 'max_months')::INT AS max_months;
