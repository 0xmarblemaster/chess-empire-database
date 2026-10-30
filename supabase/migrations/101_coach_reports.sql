-- Migration 101: coach performance reports (read-only analytics)
--
-- CONTEXT
-- -------
-- PRD_COACH_REPORTS.md: a ranked weekly / monthly / quarterly / half-year /
-- yearly report on every coach. This migration only adds read-only views and
-- functions; it NEVER writes to any table.
--
-- Objects:
--   * v_status_events_dedup — student_status_history without duplicates:
--     an event is dropped when the previous event of the same student has the
--     same old→new transition and is at most 5 minutes earlier (the 2026-10-14
--     double logging: NULL-email + system@ rows).
--   * coach_at(student, ts) — coach who held the student at ts, from the
--     audit_log coach_id timeline (complete since 2026-02-10):
--       last coach_id UPDATE strictly before ts → its new_value;
--       else first UPDATE at/after ts → its old_value (same instant = the OLD
--       coach, like 099); else no UPDATE rows → current students.coach_id.
--     A value that is not an existing coach (deleted / NULL) → NULL, which the
--     report shows as the "Unattributed" row.
--   * v_student_start — start date = first 'present' attendance, else
--     created_at (Asia/Almaty date). left_censored = start ≤ 2025-12-31
--     (attendance only exists from 2025-12-01, so the real start may be earlier).
--   * coach_report(p_start, p_end) — window [p_start, p_end). Per coach +
--     "Unattributed" + school totals:
--       new_students: first activation in window — null→active logged when the
--                     student row was created (not the 022 backfill), or
--                     left→active more than 60 days after the last 'left'.
--       left:         →left in window (credited to coach_at the event).
--       frozen_30d:   a freeze spell that reached 30 days inside the window and
--                     was not ended before p_end (credited to coach_at freeze).
--       churn = left + frozen_30d (D1); net_growth = new_students − left.
--       retention:    start → first 'left' (event) or → min(p_end, now())
--                     (censored); mean / median months and Kaplan–Meier
--                     survival at 3 and 6 months (1 month = 30.4375 days).
--                     Credited to coach_at leaving / censoring time.
--       razryad_snapshot: active students now by students.razryad (current coach).
--       razryad_changes:  razryad_history in window, credited to
--                     trainer_id_at_change (099/100) — promotions and
--                     downgrades by new razryad.
--       participation: active students now (current coach) by number of
--                     tournaments played (one upload = one tournament,
--                     games_played > 0): 0/1/2/3/4+ in window and lifetime.
--       podiums:      rank 1–3 in window, credited to coach_at the tournament
--                     day: distinct students, finishes, by kind, % of the
--                     coach's tournament participants in window.
--   * coach_cohort_matrix(p_coach) — start month × months since start,
--     cumulative % left and % left + frozen 30+ days, plus exits split by
--     current_level and razryad at leaving (audit_log, else current value).
--     Cohort membership = coach_at the start date; NULL p_coach = school-wide.
--
-- Access: functions are EXECUTE for service_role only (analytics-coaches edge
-- function); views are security_invoker and not readable by anon/authenticated.
--
-- Verify with 101_coach_reports_verify.sql (read-only).
-- Idempotent — re-running this migration is safe.

BEGIN;

-- ============================================================
-- 1. DEDUPLICATED STATUS EVENTS
-- ============================================================
CREATE OR REPLACE VIEW v_status_events_dedup WITH (security_invoker = true) AS
SELECT e.id, e.student_id, e.old_status, e.new_status, e.changed_at
FROM (
    SELECT
        h.id, h.student_id, h.old_status, h.new_status, h.changed_at,
        lag(h.old_status) OVER w AS prev_old,
        lag(h.new_status) OVER w AS prev_new,
        lag(h.changed_at) OVER w AS prev_at
    FROM student_status_history h
    WINDOW w AS (PARTITION BY h.student_id ORDER BY h.changed_at, h.id)
) e
WHERE e.prev_at IS NULL
   OR e.prev_old IS DISTINCT FROM e.old_status
   OR e.prev_new IS DISTINCT FROM e.new_status
   OR e.changed_at - e.prev_at > INTERVAL '5 minutes';

COMMENT ON VIEW v_status_events_dedup IS
    'Migration 101: student_status_history minus repeats of the same old→new transition within 5 minutes of the previous event.';

-- ============================================================
-- 2. COACH AT A POINT IN TIME
-- ============================================================
CREATE OR REPLACE FUNCTION coach_at(p_student UUID, p_ts TIMESTAMPTZ)
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v_coach TEXT;
BEGIN
    SELECT al.new_value INTO v_coach
    FROM audit_log al
    WHERE al.entity_type = 'students' AND al.entity_id = p_student
      AND al.field_name = 'coach_id' AND al.action = 'UPDATE'
      AND al.changed_at < p_ts
    ORDER BY al.changed_at DESC, al.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT al.old_value INTO v_coach
        FROM audit_log al
        WHERE al.entity_type = 'students' AND al.entity_id = p_student
          AND al.field_name = 'coach_id' AND al.action = 'UPDATE'
          AND al.changed_at >= p_ts
        ORDER BY al.changed_at ASC, al.id ASC
        LIMIT 1;

        IF NOT FOUND THEN
            SELECT s.coach_id::TEXT INTO v_coach FROM students s WHERE s.id = p_student;
        END IF;
    END IF;

    IF v_coach IS NULL
       OR v_coach !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN NULL;
    END IF;
    RETURN (SELECT c.id FROM coaches c WHERE c.id = v_coach::UUID);
END;
$$;

COMMENT ON FUNCTION coach_at(UUID, TIMESTAMPTZ) IS
    'Migration 101: coach holding the student at p_ts from the audit_log coach_id timeline; no coach_id UPDATE rows → current coach; unknown/deleted coach → NULL.';

-- Value of a students column at p_ts from audit_log (same rules as coach_at,
-- falling back to the current column value). Used for "level / razryad at leaving".
CREATE OR REPLACE FUNCTION coach_report_field_at(p_student UUID, p_field TEXT, p_ts TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v_value TEXT;
BEGIN
    SELECT al.new_value INTO v_value
    FROM audit_log al
    WHERE al.entity_type = 'students' AND al.entity_id = p_student
      AND al.field_name = p_field AND al.action = 'UPDATE'
      AND al.changed_at < p_ts
    ORDER BY al.changed_at DESC, al.id DESC
    LIMIT 1;
    IF FOUND THEN RETURN v_value; END IF;

    SELECT al.old_value INTO v_value
    FROM audit_log al
    WHERE al.entity_type = 'students' AND al.entity_id = p_student
      AND al.field_name = p_field AND al.action = 'UPDATE'
      AND al.changed_at >= p_ts
    ORDER BY al.changed_at ASC, al.id ASC
    LIMIT 1;
    IF FOUND THEN RETURN v_value; END IF;

    RETURN (SELECT to_jsonb(s) ->> p_field FROM students s WHERE s.id = p_student);
END;
$$;

-- {"count": n, "pct": n / total × 100 (1 dp, NULL when total = 0)}
CREATE OR REPLACE FUNCTION coach_report_share(p_count BIGINT, p_total BIGINT)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
    SELECT jsonb_build_object(
        'count', COALESCE(p_count, 0),
        'pct', round(100.0 * COALESCE(p_count, 0) / NULLIF(p_total, 0), 1)
    );
$$;

-- ============================================================
-- 3. STUDENT START DATE
-- ============================================================
CREATE OR REPLACE VIEW v_student_start WITH (security_invoker = true) AS
SELECT
    s.id AS student_id,
    COALESCE(a.first_present, (s.created_at AT TIME ZONE 'Asia/Almaty')::DATE) AS start_date,
    CASE WHEN a.first_present IS NOT NULL THEN 'attendance' ELSE 'created_at' END AS start_source,
    COALESCE(COALESCE(a.first_present, (s.created_at AT TIME ZONE 'Asia/Almaty')::DATE) <= DATE '2025-12-31', false)
        AS left_censored
FROM students s
LEFT JOIN (
    SELECT student_id, min(attendance_date) AS first_present
    FROM attendance
    WHERE status = 'present'
    GROUP BY student_id
) a ON a.student_id = s.id;

COMMENT ON VIEW v_student_start IS
    'Migration 101: start_date = first present attendance, else created_at (Almaty). left_censored = start ≤ 2025-12-31 (attendance starts 2025-12-01).';

-- ============================================================
-- 4. coach_report(p_start, p_end)
-- ============================================================
CREATE OR REPLACE FUNCTION coach_report(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start_date DATE;
    v_end_date   DATE;  -- exclusive
    v_asof       TIMESTAMPTZ;
BEGIN
    IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end THEN
        RAISE EXCEPTION 'coach_report: p_start must be before p_end' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_start_date := (p_start AT TIME ZONE 'Asia/Almaty')::DATE;
    v_end_date   := (p_end AT TIME ZONE 'Asia/Almaty')::DATE;
    v_asof       := LEAST(p_end, now());

    RETURN (
    WITH
    ev AS (
        SELECT
            e.student_id, e.old_status, e.new_status, e.changed_at,
            lead(e.changed_at) OVER w AS next_at,
            max(e.changed_at) FILTER (WHERE e.new_status = 'left')
                OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_left_at
        FROM v_status_events_dedup e
        WINDOW w AS (PARTITION BY e.student_id ORDER BY e.changed_at, e.id)
    ),
    -- 1. new students
    new_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        JOIN students s ON s.id = ev.student_id
        WHERE ev.new_status = 'active'
          AND ev.changed_at >= p_start AND ev.changed_at < p_end
          AND (
              (ev.old_status IS NULL AND ev.changed_at < s.created_at + INTERVAL '1 day')
              OR (ev.old_status = 'left' AND ev.changed_at - ev.prev_left_at > INTERVAL '60 days')
          )
    ),
    -- 2. left / frozen 30+ days
    left_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        WHERE ev.new_status = 'left' AND ev.old_status IS NOT NULL AND ev.old_status <> 'left'
          AND ev.changed_at >= p_start AND ev.changed_at < p_end
    ),
    frozen_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        WHERE ev.new_status = 'frozen' AND ev.old_status IS DISTINCT FROM 'frozen'
          AND ev.changed_at + INTERVAL '30 days' >= p_start
          AND ev.changed_at + INTERVAL '30 days' < p_end
          AND ev.changed_at + INTERVAL '30 days' <= now()
          AND (ev.next_at IS NULL OR ev.next_at >= p_end)
    ),
    -- 3. retention (as of min(p_end, now()))
    first_left AS (
        SELECT student_id, min(changed_at) AS left_at FROM ev WHERE new_status = 'left' GROUP BY student_id
    ),
    ret_base AS (
        SELECT
            st.student_id,
            st.left_censored,
            st.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty' AS start_ts,
            (fl.left_at IS NOT NULL AND fl.left_at < v_asof) AS event,
            CASE WHEN fl.left_at < v_asof THEN fl.left_at ELSE v_asof END AS end_ts
        FROM v_student_start st
        LEFT JOIN first_left fl ON fl.student_id = st.student_id
        WHERE st.start_date IS NOT NULL
          AND (st.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < v_asof
    ),
    ret AS (
        SELECT
            coach_at(r.student_id, r.end_ts) AS coach_id,
            r.left_censored,
            r.event,
            GREATEST(0, EXTRACT(EPOCH FROM r.end_ts - r.start_ts))::FLOAT8 / 86400 / 30.4375 AS months
        FROM ret_base r
    ),
    -- 4a / 6. current active roster
    roster AS (
        SELECT s.id AS student_id, c.id AS coach_id, COALESCE(NULLIF(s.razryad, ''), 'none') AS razryad
        FROM students s
        LEFT JOIN coaches c ON c.id = s.coach_id
        WHERE s.status = 'active'
    ),
    res AS (
        SELECT tr.student_id, tr.upload_id, tr.rank, tu.kind::TEXT AS kind, tu.tournament_date
        FROM tournament_results tr
        JOIN tournaments_uploads tu ON tu.id = tr.upload_id
        WHERE tr.games_played > 0
          AND tu.tournament_date < v_end_date
    ),
    part AS (
        SELECT
            r.coach_id,
            count(DISTINCT res.upload_id) FILTER (WHERE res.tournament_date >= v_start_date) AS n_period,
            count(DISTINCT res.upload_id) AS n_life
        FROM roster r
        LEFT JOIN res ON res.student_id = r.student_id
        GROUP BY r.student_id, r.coach_id
    ),
    -- 4b. razryad changes
    rz AS (
        SELECT
            c.id AS coach_id,
            COALESCE(NULLIF(rh.new_razryad, ''), 'none') AS new_key,
            sign(razryad_rank(rh.new_razryad) - razryad_rank(rh.old_razryad)) AS dir
        FROM razryad_history rh
        LEFT JOIN coaches c ON c.id = rh.trainer_id_at_change
        WHERE rh.changed_at >= p_start AND rh.changed_at < p_end
    ),
    -- 7. podiums / participants in window, credited to coach on the day
    res_win AS (
        SELECT
            coach_at(res.student_id, res.tournament_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') AS coach_id,
            res.student_id, res.rank, res.kind
        FROM res
        WHERE res.tournament_date >= v_start_date
    ),
    -- scope fan-out: every fact counts for its coach (or 'unattributed') and 'school'
    a_new AS (
        SELECT k.scope, count(*) AS n FROM new_ev x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
        GROUP BY k.scope
    ),
    a_left AS (
        SELECT k.scope, count(*) AS n FROM left_ev x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
        GROUP BY k.scope
    ),
    a_frozen AS (
        SELECT k.scope, count(*) AS n FROM frozen_ev x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
        GROUP BY k.scope
    ),
    ret_s AS (
        SELECT k.scope, x.left_censored, x.event, x.months FROM ret x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
    ),
    km_t AS (
        SELECT scope, months, count(*) AS cnt, count(*) FILTER (WHERE event) AS d
        FROM ret_s GROUP BY scope, months
    ),
    km_n AS (
        SELECT scope, months, d, sum(cnt) OVER (PARTITION BY scope ORDER BY months DESC) AS n
        FROM km_t
    ),
    a_km AS (
        SELECT
            scope,
            CASE
                WHEN bool_or(d = n AND months <= 3) THEN 0
                WHEN max(months) < 3 THEN NULL
                ELSE exp(COALESCE(sum(ln(1 - d::FLOAT8 / n)) FILTER (WHERE d > 0 AND d < n AND months <= 3), 0))
            END AS km_3m,
            CASE
                WHEN bool_or(d = n AND months <= 6) THEN 0
                WHEN max(months) < 6 THEN NULL
                ELSE exp(COALESCE(sum(ln(1 - d::FLOAT8 / n)) FILTER (WHERE d > 0 AND d < n AND months <= 6), 0))
            END AS km_6m
        FROM km_n GROUP BY scope
    ),
    a_ret AS (
        SELECT
            scope,
            count(*) AS n,
            count(*) FILTER (WHERE event) AS events,
            count(*) FILTER (WHERE left_censored) AS left_censored,
            avg(months) AS mean_months,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY months) AS median_months
        FROM ret_s GROUP BY scope
    ),
    a_roster AS (
        SELECT
            k.scope,
            count(*) AS active,
            count(*) FILTER (WHERE x.razryad = 'none') AS r_none,
            count(*) FILTER (WHERE x.razryad = '4th') AS r_4th,
            count(*) FILTER (WHERE x.razryad = '3rd') AS r_3rd,
            count(*) FILTER (WHERE x.razryad = '2nd') AS r_2nd,
            count(*) FILTER (WHERE x.razryad = '1st') AS r_1st,
            count(*) FILTER (WHERE x.razryad NOT IN ('none', '4th', '3rd', '2nd', '1st')) AS r_other
        FROM roster x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
        GROUP BY k.scope
    ),
    a_part AS (
        SELECT
            k.scope,
            count(*) FILTER (WHERE x.n_period = 0) AS p0,
            count(*) FILTER (WHERE x.n_period = 1) AS p1,
            count(*) FILTER (WHERE x.n_period = 2) AS p2,
            count(*) FILTER (WHERE x.n_period = 3) AS p3,
            count(*) FILTER (WHERE x.n_period >= 4) AS p4,
            count(*) FILTER (WHERE x.n_life = 0) AS l0,
            count(*) FILTER (WHERE x.n_life = 1) AS l1,
            count(*) FILTER (WHERE x.n_life = 2) AS l2,
            count(*) FILTER (WHERE x.n_life = 3) AS l3,
            count(*) FILTER (WHERE x.n_life >= 4) AS l4
        FROM part x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
        GROUP BY k.scope
    ),
    rz_s AS (
        SELECT k.scope, x.new_key, x.dir FROM rz x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
    ),
    a_rz AS (
        SELECT
            scope,
            count(*) FILTER (WHERE dir > 0) AS promotions,
            count(*) FILTER (WHERE dir < 0) AS downgrades
        FROM rz_s GROUP BY scope
    ),
    a_rz_by AS (
        SELECT
            scope,
            jsonb_object_agg(new_key, n) FILTER (WHERE dir > 0) AS promotions_by,
            jsonb_object_agg(new_key, n) FILTER (WHERE dir < 0) AS downgrades_by
        FROM (SELECT scope, new_key, dir, count(*) AS n FROM rz_s WHERE dir <> 0 GROUP BY scope, new_key, dir) g
        GROUP BY scope
    ),
    win_s AS (
        SELECT k.scope, x.student_id, x.rank, x.kind FROM res_win x
        CROSS JOIN LATERAL (VALUES (COALESCE(x.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
    ),
    a_pod AS (
        SELECT
            scope,
            count(DISTINCT student_id) AS participants,
            count(DISTINCT student_id) FILTER (WHERE rank BETWEEN 1 AND 3) AS students,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3) AS finishes,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND kind = 'league_c') AS k_league_c,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND kind = 'league_b') AS k_league_b,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND kind = 'razryad_4') AS k_razryad_4,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND kind = 'razryad_3') AS k_razryad_3,
            count(*) FILTER (WHERE rank BETWEEN 1 AND 3 AND kind = 'rated') AS k_rated
        FROM win_s GROUP BY scope
    ),
    scopes AS (
        SELECT c.id::TEXT AS scope, c.id AS coach_id, trim(concat_ws(' ', c.first_name, c.last_name)) AS coach_name, 0 AS ord
        FROM coaches c
        UNION ALL SELECT 'unattributed', NULL, 'Unattributed', 1
        UNION ALL SELECT 'school', NULL, 'School total', 2
    ),
    out_rows AS (
        SELECT
            sc.scope, sc.ord, sc.coach_name,
            jsonb_build_object(
                'coach_id', sc.coach_id,
                'coach_name', sc.coach_name,
                'active_students', COALESCE(ro.active, 0),
                'small_sample', COALESCE(ro.active, 0) < 10,
                'new_students', COALESCE(nw.n, 0),
                'left', COALESCE(lf.n, 0),
                'frozen_30d', COALESCE(fz.n, 0),
                'churn', COALESCE(lf.n, 0) + COALESCE(fz.n, 0),
                'net_growth', COALESCE(nw.n, 0) - COALESCE(lf.n, 0),
                'retention', jsonb_build_object(
                    'n', COALESCE(rt.n, 0),
                    'events', COALESCE(rt.events, 0),
                    'left_censored', COALESCE(rt.left_censored, 0),
                    'mean_months', round(rt.mean_months::NUMERIC, 2),
                    'median_months', round(rt.median_months::NUMERIC, 2),
                    'km_survival_3m', round(km.km_3m::NUMERIC, 4),
                    'km_survival_6m', round(km.km_6m::NUMERIC, 4)
                ),
                'razryad_snapshot', jsonb_build_object(
                    'none', coach_report_share(ro.r_none, ro.active),
                    '4th', coach_report_share(ro.r_4th, ro.active),
                    '3rd', coach_report_share(ro.r_3rd, ro.active),
                    '2nd', coach_report_share(ro.r_2nd, ro.active),
                    '1st', coach_report_share(ro.r_1st, ro.active),
                    'other', coach_report_share(ro.r_other, ro.active)
                ),
                'razryad_changes', jsonb_build_object(
                    'promotions', COALESCE(rz.promotions, 0),
                    'downgrades', COALESCE(rz.downgrades, 0),
                    'promotions_by_razryad', COALESCE(rb.promotions_by, '{}'::JSONB),
                    'downgrades_by_razryad', COALESCE(rb.downgrades_by, '{}'::JSONB)
                ),
                'participation', jsonb_build_object(
                    'period', jsonb_build_object(
                        '0', coach_report_share(pa.p0, ro.active),
                        '1', coach_report_share(pa.p1, ro.active),
                        '2', coach_report_share(pa.p2, ro.active),
                        '3', coach_report_share(pa.p3, ro.active),
                        '4+', coach_report_share(pa.p4, ro.active)
                    ),
                    'lifetime', jsonb_build_object(
                        '0', coach_report_share(pa.l0, ro.active),
                        '1', coach_report_share(pa.l1, ro.active),
                        '2', coach_report_share(pa.l2, ro.active),
                        '3', coach_report_share(pa.l3, ro.active),
                        '4+', coach_report_share(pa.l4, ro.active)
                    )
                ),
                'podiums', jsonb_build_object(
                    'participants', COALESCE(po.participants, 0),
                    'students', COALESCE(po.students, 0),
                    'finishes', COALESCE(po.finishes, 0),
                    'pct_of_participants', round(100.0 * po.students / NULLIF(po.participants, 0), 1),
                    'by_kind', jsonb_build_object(
                        'league_c', COALESCE(po.k_league_c, 0),
                        'league_b', COALESCE(po.k_league_b, 0),
                        'razryad_4', COALESCE(po.k_razryad_4, 0),
                        'razryad_3', COALESCE(po.k_razryad_3, 0),
                        'rated', COALESCE(po.k_rated, 0)
                    )
                )
            ) AS j
        FROM scopes sc
        LEFT JOIN a_new nw    ON nw.scope = sc.scope
        LEFT JOIN a_left lf   ON lf.scope = sc.scope
        LEFT JOIN a_frozen fz ON fz.scope = sc.scope
        LEFT JOIN a_ret rt    ON rt.scope = sc.scope
        LEFT JOIN a_km km     ON km.scope = sc.scope
        LEFT JOIN a_roster ro ON ro.scope = sc.scope
        LEFT JOIN a_part pa   ON pa.scope = sc.scope
        LEFT JOIN a_rz rz     ON rz.scope = sc.scope
        LEFT JOIN a_rz_by rb  ON rb.scope = sc.scope
        LEFT JOIN a_pod po    ON po.scope = sc.scope
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object('start', p_start, 'end', p_end),
        'generated_at', now(),
        'coaches', COALESCE((SELECT jsonb_agg(j ORDER BY ord, coach_name) FROM out_rows WHERE scope <> 'school'), '[]'::JSONB),
        'school', (SELECT j FROM out_rows WHERE scope = 'school')
    )
    );
END;
$$;

COMMENT ON FUNCTION coach_report(TIMESTAMPTZ, TIMESTAMPTZ) IS
    'Migration 101: per-coach + Unattributed + school metrics 1–7 of PRD_COACH_REPORTS for [p_start, p_end). Read-only.';

-- ============================================================
-- 5. coach_cohort_matrix(p_coach)
-- ============================================================
CREATE OR REPLACE FUNCTION coach_cohort_matrix(p_coach UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
    WITH
    ev AS (
        SELECT
            e.student_id, e.old_status, e.new_status, e.changed_at,
            lead(e.changed_at) OVER (PARTITION BY e.student_id ORDER BY e.changed_at, e.id) AS next_at
        FROM v_status_events_dedup e
    ),
    first_left AS (
        SELECT student_id, min(changed_at) AS left_at FROM ev WHERE new_status = 'left' GROUP BY student_id
    ),
    first_frozen_30d AS (
        SELECT student_id, min(changed_at + INTERVAL '30 days') AS frozen_at
        FROM ev
        WHERE new_status = 'frozen' AND old_status IS DISTINCT FROM 'frozen'
          AND (next_at IS NULL OR next_at > changed_at + INTERVAL '30 days')
          AND changed_at + INTERVAL '30 days' <= now()
        GROUP BY student_id
    ),
    st AS (
        SELECT v.student_id, v.start_date, v.left_censored,
               v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty' AS start_ts
        FROM v_student_start v
        WHERE v.start_date IS NOT NULL
    ),
    b AS (
        SELECT
            st.student_id,
            date_trunc('month', st.start_date)::DATE AS cohort,
            st.left_censored,
            fl.left_at,
            LEAST(fl.left_at, fz.frozen_at) AS churn_at,
            floor(GREATEST(0, EXTRACT(EPOCH FROM fl.left_at - st.start_ts)) / 86400 / 30.4375)::INT AS left_k,
            floor(GREATEST(0, EXTRACT(EPOCH FROM LEAST(fl.left_at, fz.frozen_at) - st.start_ts)) / 86400 / 30.4375)::INT AS churn_k
        FROM st
        LEFT JOIN first_left fl ON fl.student_id = st.student_id
        LEFT JOIN first_frozen_30d fz ON fz.student_id = st.student_id
        WHERE p_coach IS NULL OR coach_at(st.student_id, st.start_ts) = p_coach
    ),
    cohorts AS (
        SELECT
            cohort,
            count(*) AS size,
            bool_or(left_censored) AS left_censored,
            GREATEST(0, (
                (EXTRACT(YEAR FROM date_trunc('month', now() AT TIME ZONE 'Asia/Almaty')) - EXTRACT(YEAR FROM cohort)) * 12
                + EXTRACT(MONTH FROM date_trunc('month', now() AT TIME ZONE 'Asia/Almaty')) - EXTRACT(MONTH FROM cohort)
            )::INT) AS max_k
        FROM b GROUP BY cohort
    ),
    cells AS (
        SELECT
            c.cohort, k.k,
            round(100.0 * count(*) FILTER (WHERE b.left_k <= k.k) / c.size, 1) AS left_pct,
            round(100.0 * count(*) FILTER (WHERE b.churn_k <= k.k) / c.size, 1) AS churn_pct
        FROM cohorts c
        CROSS JOIN LATERAL generate_series(0, c.max_k) k(k)
        JOIN b ON b.cohort = c.cohort
        GROUP BY c.cohort, c.size, k.k
    ),
    exits AS (
        SELECT 'left' AS kind, student_id, left_at AS at FROM b WHERE left_at IS NOT NULL
        UNION ALL
        SELECT 'churn', student_id, churn_at FROM b WHERE churn_at IS NOT NULL
    ),
    ex AS (
        SELECT
            kind,
            COALESCE(NULLIF(coach_report_field_at(student_id, 'current_level', at), ''), 'unknown') AS level,
            COALESCE(NULLIF(coach_report_field_at(student_id, 'razryad', at), ''), 'none') AS razryad
        FROM exits
    )
    SELECT jsonb_build_object(
        'coach_id', p_coach,
        'generated_at', now(),
        'max_months', COALESCE((SELECT max(max_k) FROM cohorts), 0),
        'rows', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'start_month', to_char(c.cohort, 'YYYY-MM'),
                'cohort_size', c.size,
                'left_censored', c.left_censored,
                'left_pct', (SELECT jsonb_agg(x.left_pct ORDER BY x.k) FROM cells x WHERE x.cohort = c.cohort),
                'churn_pct', (SELECT jsonb_agg(x.churn_pct ORDER BY x.k) FROM cells x WHERE x.cohort = c.cohort)
            ) ORDER BY c.cohort)
            FROM cohorts c
        ), '[]'::JSONB),
        'by_level_at_leaving', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('level', level, 'left', n_left, 'churn', n_churn)
                             ORDER BY length(level), level)
            FROM (
                SELECT level,
                       count(*) FILTER (WHERE kind = 'left') AS n_left,
                       count(*) FILTER (WHERE kind = 'churn') AS n_churn
                FROM ex GROUP BY level
            ) g
        ), '[]'::JSONB),
        'by_razryad_at_leaving', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('razryad', razryad, 'left', n_left, 'churn', n_churn)
                             ORDER BY razryad_rank(razryad), razryad)
            FROM (
                SELECT razryad,
                       count(*) FILTER (WHERE kind = 'left') AS n_left,
                       count(*) FILTER (WHERE kind = 'churn') AS n_churn
                FROM ex GROUP BY razryad
            ) g
        ), '[]'::JSONB)
    )
    );
END;
$$;

COMMENT ON FUNCTION coach_cohort_matrix(UUID) IS
    'Migration 101: start month × months since start cumulative % left and % left + frozen 30+ (cohort = coach_at start; NULL = school), plus exits by level / razryad at leaving. Read-only.';

-- ============================================================
-- 6. ACCESS: service_role only
-- ============================================================
REVOKE ALL ON v_status_events_dedup, v_student_start FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_status_events_dedup, v_student_start TO service_role;

REVOKE ALL ON FUNCTION coach_at(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_field_at(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_share(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_cohort_matrix(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION coach_at(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_field_at(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_share(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_cohort_matrix(UUID) TO service_role;

COMMIT;
