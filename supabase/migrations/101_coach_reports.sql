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
--   * coach_report_cleanup_batches() — THE list of bulk "inactive student"
--     cleanups (one row today: cleanup_freeze_2026_10_14, →frozen rows with
--     changed_by NULL between 2026-10-14 16:00 and 17:15 UTC, logged in two
--     waves). A batch freeze is the cleanup date, not when the student left,
--     so it never counts itself as a freeze / churn. coach_report_cleanup(asof)
--     classifies every batch student as of `asof`:
--       returned  — any later →active or a 'present' lesson after the batch:
--                   the batch freeze is ignored entirely;
--       real_left — a real →left after the batch, or already left before it
--                   (status 'left' before the batch / →left after the last
--                   lesson): the real event counts, nothing is added;
--       dated     — cleanup leaver with a last 'present' lesson before the
--                   batch: reported as LEFT on that lesson date (Almaty),
--                   credited to coach_at that date, in left / churn /
--                   retention / cohort matrix; their status events after
--                   that date are dropped (no double churn);
--       undated   — cleanup leaver who never attended: leave date unknown,
--                   counted only in data_notes (cleanup_leavers_undated) and
--                   excluded from left counts, retention and cohort matrix.
--     NOTE: dated cleanup leavers land in PAST windows, so e.g. September's
--     `left` grows after this migration. That is intended — the reports
--     reconstruct the truth.
--   * 022 backfill rows (old_status NULL, changed_by NULL, system@ email,
--     2026-02-04 UTC, at least a day after the student row was created) are
--     INITIAL STATE, not transitions: a backfill →left is never a departure
--     (a student whose first 'left' is a backfill row is excluded from
--     retention / cohort matrix → data_notes.excluded_pre_history_leavers) and
--     a backfill →frozen never starts a freeze spell.
--   * coach_report_status_events(asof) — the cleaned event stream used by
--     every metric: deduped, batch rows removed, backfill rows tagged,
--     dated cleanup leavers replaced by a synthetic →left.
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
--       frozen_30d:   a real freeze spell whose 30th day (start + 30 days) falls
--                     in [p_start, p_end) and that was still unbroken at that
--                     moment — decided only by that date, never by p_end, so
--                     weeks sum to their month and months to their quarter
--                     (credited to coach_at freeze).
--       churn = left + frozen_30d (D1); net_growth = new_students − left.
--       retention:    start → first 'left' (event) or → min(p_end, now())
--                     (censored); mean / median months and Kaplan–Meier
--                     survival at 3 and 6 months (1 month = 30.4375 days).
--                     Credited to coach_at leaving / censoring time.
--       razryad_snapshot: active roster AS OF p_end by razryad at p_end.
--       razryad_changes:  razryad_history in window, credited to
--                     trainer_id_at_change (099/100) — promotions and
--                     downgrades by new razryad.
--       participation: active roster AS OF p_end by number of tournaments
--                     played (one upload = one tournament, games_played > 0):
--                     0/1/2/3/4+ in window and lifetime (up to p_end).
--       podiums:      rank 1–3 in window, credited to coach_at the tournament
--                     day: distinct students, finishes, played entries, by
--                     kind, % of the coach's tournament participants.
--       data_notes:   cleanup batch breakdown (+ dated leavers per coach and
--                     in this window) and excluded_pre_history_leavers.
--     AS OF p_end: when p_end is in the past, the roster (active students,
--     razryad snapshot, participation, small_sample) is reconstructed at
--     p_end from the deduped status history (dated cleanup leavers = left
--     from their leave date) + coach_at(p_end) + razryad at p_end, and
--     cleanup returns are judged on events / attendance before p_end. So the
--     previous period of a report is its own as-of report, not today's
--     roster. Windows that end before a cleanup batch judge it as of now()
--     (the batch is the only source of those departures). A window still
--     running (p_end ≥ now()) uses the live students table. A past window
--     ending at or before the first student_status_history row (the
--     2026-02-04 backfill) has no status to reconstruct: roster_known = false
--     and the roster is empty (never today's statuses); data_notes carries
--     status_history_start so callers can explain the missing comparison.
--   * coach_cohort_matrix(p_coach) — start month × months since start,
--     cumulative % left and % left + frozen 30+ days, plus exits split by
--     current_level and razryad at leaving (audit_log, else current value).
--     Cohort membership = coach_at the start date; NULL p_coach = school-wide.
--     Same event rules as coach_report (as of now()).
--   * coach_cohort_matrix_all() — school matrix + one matrix per coach (and
--     Unattributed) in a single call.
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
SELECT e.id, e.student_id, e.old_status, e.new_status, e.changed_at, e.changed_by, e.changed_by_email
FROM (
    SELECT
        h.id, h.student_id, h.old_status, h.new_status, h.changed_at, h.changed_by, h.changed_by_email,
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
-- 3b. CLEANUP BATCHES, 022 BACKFILL, CLEANED EVENT STREAM
-- ============================================================
-- The ONLY definition of bulk-cleanup freeze batches: →frozen rows with
-- changed_by NULL inside [starts_at, ends_at). Do not add windows without a
-- confirmed cleanup.
CREATE OR REPLACE FUNCTION coach_report_cleanup_batches()
RETURNS TABLE (label TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql IMMUTABLE
AS $$
    VALUES ('cleanup_freeze_2026_10_14'::TEXT,
            TIMESTAMPTZ '2026-10-14 16:00:00+00', TIMESTAMPTZ '2026-10-14 17:15:00+00');
$$;

-- One row per batch student, classified as of p_asof (see header):
-- outcome = returned | real_left | dated | undated.
CREATE OR REPLACE FUNCTION coach_report_cleanup(p_asof TIMESTAMPTZ)
RETURNS TABLE (student_id UUID, label TEXT, batch_at TIMESTAMPTZ, outcome TEXT, leave_date DATE, leave_ts TIMESTAMPTZ)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH
    bs AS (
        SELECT e.student_id, b.label, min(e.changed_at) AS batch_at
        FROM v_status_events_dedup e
        JOIN coach_report_cleanup_batches() b ON e.changed_at >= b.starts_at AND e.changed_at < b.ends_at
        WHERE e.new_status = 'frozen' AND e.changed_by IS NULL
        GROUP BY e.student_id, b.label
    ),
    x AS (
        SELECT
            bs.student_id, bs.label, bs.batch_at, lp.last_present,
            -- last instant of the last lesson day (Almaty)
            (lp.last_present + 1)::TIMESTAMP AT TIME ZONE 'Asia/Almaty' - INTERVAL '1 microsecond' AS last_ts,
            EXISTS (
                SELECT 1 FROM v_status_events_dedup e
                WHERE e.student_id = bs.student_id AND e.new_status = 'active'
                  AND e.changed_at > bs.batch_at AND e.changed_at < p_asof
            ) OR EXISTS (
                SELECT 1 FROM attendance a
                WHERE a.student_id = bs.student_id AND a.status = 'present'
                  AND a.attendance_date > (bs.batch_at AT TIME ZONE 'Asia/Almaty')::DATE
                  AND (a.attendance_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < p_asof
            ) AS returned,
            EXISTS (
                SELECT 1 FROM v_status_events_dedup e
                WHERE e.student_id = bs.student_id AND e.new_status = 'left'
                  AND e.changed_at > bs.batch_at AND e.changed_at < p_asof
            ) AS left_after,
            (
                SELECT e.new_status FROM v_status_events_dedup e
                WHERE e.student_id = bs.student_id AND e.changed_at < bs.batch_at
                ORDER BY e.changed_at DESC, e.id DESC LIMIT 1
            ) AS status_before
        FROM bs
        LEFT JOIN LATERAL (
            SELECT max(a.attendance_date) AS last_present
            FROM attendance a
            WHERE a.student_id = bs.student_id AND a.status = 'present'
              AND a.attendance_date <= (bs.batch_at AT TIME ZONE 'Asia/Almaty')::DATE
        ) lp ON true
        WHERE bs.batch_at < p_asof
    )
    SELECT
        x.student_id, x.label, x.batch_at,
        CASE
            WHEN x.returned THEN 'returned'
            WHEN x.left_after OR x.status_before = 'left' OR EXISTS (
                -- a real →left after the last lesson overrides the lesson date
                SELECT 1 FROM v_status_events_dedup e
                WHERE e.student_id = x.student_id AND e.new_status = 'left'
                  AND e.changed_at >= COALESCE(x.last_present::TIMESTAMP AT TIME ZONE 'Asia/Almaty', '-infinity')
                  AND e.changed_at < x.batch_at
            ) THEN 'real_left'
            WHEN x.last_present IS NULL THEN 'undated'
            ELSE 'dated'
        END,
        x.last_present,
        x.last_ts
    FROM x;
$$;

COMMENT ON FUNCTION coach_report_cleanup(TIMESTAMPTZ) IS
    'Migration 101: batch students of coach_report_cleanup_batches() classified as of p_asof: returned / real_left / dated (leave = last present lesson) / undated.';

-- Cleaned status events as of p_asof: deduped, cleanup batch rows removed,
-- source = event | backfill (022 initial state) | cleanup_left (synthetic
-- →left of a dated cleanup leaver at the last instant of their last lesson
-- day; their real events after that instant are dropped).
CREATE OR REPLACE FUNCTION coach_report_status_events(p_asof TIMESTAMPTZ)
RETURNS TABLE (id UUID, student_id UUID, old_status TEXT, new_status TEXT, changed_at TIMESTAMPTZ, source TEXT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH
    cl AS (
        SELECT c.student_id, c.leave_ts FROM coach_report_cleanup(p_asof) c WHERE c.outcome = 'dated'
    ),
    raw AS (
        SELECT
            e.id, e.student_id, e.old_status, e.new_status, e.changed_at,
            CASE
                WHEN e.old_status IS NULL AND e.changed_by IS NULL
                     AND e.changed_by_email = 'system@chessempire.kz'
                     AND e.changed_at >= TIMESTAMPTZ '2026-02-04 00:00:00+00'
                     AND e.changed_at <  TIMESTAMPTZ '2026-02-05 00:00:00+00'
                     AND e.changed_at >= s.created_at + INTERVAL '1 day'
                THEN 'backfill' ELSE 'event'
            END AS source
        FROM v_status_events_dedup e
        LEFT JOIN students s ON s.id = e.student_id
        WHERE NOT (e.new_status = 'frozen' AND e.changed_by IS NULL AND EXISTS (
            SELECT 1 FROM coach_report_cleanup_batches() b
            WHERE e.changed_at >= b.starts_at AND e.changed_at < b.ends_at
        ))
    )
    SELECT r.id, r.student_id, r.old_status, r.new_status, r.changed_at, r.source
    FROM raw r
    WHERE NOT EXISTS (SELECT 1 FROM cl WHERE cl.student_id = r.student_id AND r.changed_at > cl.leave_ts)
    UNION ALL
    SELECT
        NULL::UUID, cl.student_id,
        COALESCE((
            SELECT r.new_status FROM raw r
            WHERE r.student_id = cl.student_id AND r.changed_at < cl.leave_ts
            ORDER BY r.changed_at DESC, r.id DESC LIMIT 1
        ), 'active'),
        'left', cl.leave_ts, 'cleanup_left'
    FROM cl;
$$;

COMMENT ON FUNCTION coach_report_status_events(TIMESTAMPTZ) IS
    'Migration 101: deduped status events minus cleanup batch rows, 022 backfill rows tagged, dated cleanup leavers as a synthetic →left (as of p_asof).';

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
    v_cl_asof    TIMESTAMPTZ;  -- cleanup batches judged as of this instant
    v_live       BOOLEAN;      -- window still running → live students table
    v_hist_start TIMESTAMPTZ;  -- first status history row
    v_roster_known BOOLEAN;    -- false: past window ending before status history
BEGIN
    IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end THEN
        RAISE EXCEPTION 'coach_report: p_start must be before p_end' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_start_date := (p_start AT TIME ZONE 'Asia/Almaty')::DATE;
    v_end_date   := (p_end AT TIME ZONE 'Asia/Almaty')::DATE;
    v_asof       := LEAST(p_end, now());
    v_live       := p_end >= now();
    v_cl_asof    := CASE WHEN v_asof >= (SELECT max(b.ends_at) FROM coach_report_cleanup_batches() b)
                         THEN v_asof ELSE now() END;
    v_hist_start := (SELECT min(h.changed_at) FROM student_status_history h);
    v_roster_known := v_live OR p_end > v_hist_start;

    RETURN (
    WITH
    cl AS (
        SELECT c.*, CASE c.outcome
                        WHEN 'dated' THEN coach_at(c.student_id, c.leave_ts)
                        WHEN 'undated' THEN coach_at(c.student_id, c.batch_at)
                    END AS coach_id
        FROM coach_report_cleanup(v_cl_asof) c
    ),
    ev AS (
        SELECT
            e.student_id, e.old_status, e.new_status, e.changed_at, e.source,
            lead(e.changed_at) OVER w AS next_at,
            max(e.changed_at) FILTER (WHERE e.new_status = 'left')
                OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_left_at
        FROM coach_report_status_events(v_cl_asof) e
        WINDOW w AS (PARTITION BY e.student_id ORDER BY e.changed_at, e.id)
    ),
    -- 1. new students
    new_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        JOIN students s ON s.id = ev.student_id
        WHERE ev.new_status = 'active' AND ev.source = 'event'
          AND ev.changed_at >= p_start AND ev.changed_at < p_end
          AND (
              (ev.old_status IS NULL AND ev.changed_at < s.created_at + INTERVAL '1 day')
              OR (ev.old_status = 'left' AND ev.changed_at - ev.prev_left_at > INTERVAL '60 days')
          )
    ),
    -- 2. left (real + dated cleanup leavers) / frozen 30+ days
    left_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        WHERE ev.new_status = 'left' AND ev.source <> 'backfill'
          AND ev.old_status IS NOT NULL AND ev.old_status <> 'left'
          AND ev.changed_at >= p_start AND ev.changed_at < p_end
    ),
    frozen_ev AS (
        SELECT coach_at(ev.student_id, ev.changed_at) AS coach_id
        FROM ev
        WHERE ev.new_status = 'frozen' AND ev.source = 'event' AND ev.old_status IS DISTINCT FROM 'frozen'
          AND ev.changed_at + INTERVAL '30 days' >= p_start
          AND ev.changed_at + INTERVAL '30 days' < p_end
          AND ev.changed_at + INTERVAL '30 days' <= now()
          AND (ev.next_at IS NULL OR ev.next_at > ev.changed_at + INTERVAL '30 days')
    ),
    -- 3. retention (as of min(p_end, now()))
    first_left AS (
        SELECT DISTINCT ON (student_id) student_id, changed_at AS left_at, source
        FROM ev WHERE new_status = 'left'
        ORDER BY student_id, changed_at
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
          AND fl.source IS DISTINCT FROM 'backfill'  -- left before history: date unknown
          AND NOT EXISTS (SELECT 1 FROM cl WHERE cl.student_id = st.student_id AND cl.outcome = 'undated')
    ),
    ret AS (
        SELECT
            coach_at(r.student_id, r.end_ts) AS coach_id,
            r.left_censored,
            r.event,
            GREATEST(0, EXTRACT(EPOCH FROM r.end_ts - r.start_ts))::FLOAT8 / 86400 / 30.4375 AS months
        FROM ret_base r
    ),
    -- 4a / 6. active roster as of p_end (live table while the window runs)
    roster AS (
        SELECT s.id AS student_id, c.id AS coach_id, COALESCE(NULLIF(s.razryad, ''), 'none') AS razryad
        FROM students s
        LEFT JOIN coaches c ON c.id = s.coach_id
        WHERE v_live AND s.status = 'active'
        UNION ALL
        SELECT
            s.id,
            coach_at(s.id, p_end),
            COALESCE(NULLIF(coach_report_field_at(s.id, 'razryad', p_end), ''), 'none')
        FROM students s
        LEFT JOIN LATERAL (
            SELECT e.new_status FROM v_status_events_dedup e
            WHERE e.student_id = s.id AND e.changed_at < p_end
            ORDER BY e.changed_at DESC, e.id DESC LIMIT 1
        ) st ON true
        WHERE NOT v_live AND v_roster_known
          AND s.created_at < p_end
          AND COALESCE(st.new_status, s.status) = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM cl WHERE cl.student_id = s.id AND cl.outcome = 'dated' AND cl.leave_ts < p_end
          )
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
            count(*) AS entries,
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
                    'entries', COALESCE(po.entries, 0),
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
    ),
    -- data notes: cleanup batch breakdown, per coach (Unattributed = NULL coach)
    cl_by_coach AS (
        SELECT
            cl.outcome,
            cl.coach_id,
            CASE WHEN c.id IS NULL THEN 'Unattributed' ELSE trim(concat_ws(' ', c.first_name, c.last_name)) END AS coach_name,
            count(*) AS total,
            count(*) FILTER (WHERE cl.leave_ts >= p_start AND cl.leave_ts < p_end) AS in_window
        FROM cl
        LEFT JOIN coaches c ON c.id = cl.coach_id
        WHERE cl.outcome IN ('dated', 'undated')
        GROUP BY cl.outcome, cl.coach_id, c.id, c.first_name, c.last_name
    ),
    notes AS (
        SELECT jsonb_build_object(
            'cleanup_freeze', jsonb_build_object(
                'label', (SELECT string_agg(b.label, ', ' ORDER BY b.starts_at) FROM coach_report_cleanup_batches() b),
                'window', (SELECT jsonb_build_object('start', min(b.starts_at), 'end', max(b.ends_at))
                           FROM coach_report_cleanup_batches() b),
                'evaluated_at', v_cl_asof,
                'batch_students', (SELECT count(*) FROM cl),
                'returned', (SELECT count(*) FROM cl WHERE outcome = 'returned'),
                'real_left', (SELECT count(*) FROM cl WHERE outcome = 'real_left'),
                'cleanup_leavers_dated', jsonb_build_object(
                    'total', (SELECT count(*) FROM cl WHERE outcome = 'dated'),
                    'in_window', (SELECT count(*) FROM cl WHERE outcome = 'dated'
                                    AND leave_ts >= p_start AND leave_ts < p_end),
                    'by_coach', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object('coach_id', coach_id, 'coach_name', coach_name,
                                                            'total', total, 'in_window', in_window)
                                         ORDER BY coach_id IS NULL, coach_name)
                        FROM cl_by_coach WHERE outcome = 'dated'), '[]'::JSONB)
                ),
                'cleanup_leavers_undated', jsonb_build_object(
                    'total', (SELECT count(*) FROM cl WHERE outcome = 'undated'),
                    'by_coach', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object('coach_id', coach_id, 'coach_name', coach_name, 'total', total)
                                         ORDER BY coach_id IS NULL, coach_name)
                        FROM cl_by_coach WHERE outcome = 'undated'), '[]'::JSONB)
                )
            ),
            'excluded_pre_history_leavers', (
                SELECT count(*) FROM first_left fl
                JOIN v_student_start st ON st.student_id = fl.student_id
                WHERE fl.source = 'backfill' AND st.start_date IS NOT NULL
                  AND (st.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') < v_asof
            ),
            'status_history_start', (v_hist_start AT TIME ZONE 'Asia/Almaty')::DATE
        ) AS j
    )
    SELECT jsonb_build_object(
        'period', jsonb_build_object('start', p_start, 'end', p_end),
        'generated_at', now(),
        'as_of', v_asof,
        'roster_known', COALESCE(v_roster_known, false),
        'coaches', COALESCE((SELECT jsonb_agg(j ORDER BY ord, coach_name) FROM out_rows WHERE scope <> 'school'), '[]'::JSONB),
        'school', (SELECT j FROM out_rows WHERE scope = 'school'),
        'data_notes', (SELECT j FROM notes)
    )
    );
END;
$$;

COMMENT ON FUNCTION coach_report(TIMESTAMPTZ, TIMESTAMPTZ) IS
    'Migration 101: per-coach + Unattributed + school metrics 1–7 of PRD_COACH_REPORTS for [p_start, p_end). Read-only.';

-- ============================================================
-- 5. COHORT MATRIX (school + every coach in one pass)
-- ============================================================
-- One row per scope ('school', coach id, 'unattributed') with its matrix.
-- Same event rules as coach_report, as of now(): dated cleanup leavers exit
-- on their last lesson; students whose first 'left' is a 022 backfill row
-- (leave date before history) and undated cleanup leavers are excluded from
-- the cohorts and only counted.
CREATE OR REPLACE FUNCTION coach_report_cohort_scopes()
RETURNS TABLE (scope TEXT, coach_id UUID, coach_name TEXT, matrix JSONB)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH
    ev AS (
        SELECT
            e.id, e.student_id, e.old_status, e.new_status, e.changed_at, e.source,
            lead(e.changed_at) OVER (PARTITION BY e.student_id ORDER BY e.changed_at, e.id) AS next_at
        FROM coach_report_status_events(now()) e
    ),
    undated AS (
        SELECT c.student_id FROM coach_report_cleanup(now()) c WHERE c.outcome = 'undated'
    ),
    first_left AS (
        SELECT DISTINCT ON (student_id) student_id, changed_at AS left_at, source
        FROM ev WHERE new_status = 'left'
        ORDER BY student_id, changed_at, id
    ),
    first_frozen_30d AS (
        SELECT student_id, min(changed_at + INTERVAL '30 days') AS frozen_at
        FROM ev
        WHERE new_status = 'frozen' AND source = 'event' AND old_status IS DISTINCT FROM 'frozen'
          AND (next_at IS NULL OR next_at > changed_at + INTERVAL '30 days')
          AND changed_at + INTERVAL '30 days' <= now()
        GROUP BY student_id
    ),
    st AS (
        SELECT
            v.student_id, v.start_date, v.left_censored,
            v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty' AS start_ts,
            fl.left_at, fl.source AS left_source, fz.frozen_at,
            u.student_id IS NOT NULL AS undated,
            coach_at(v.student_id, v.start_date::TIMESTAMP AT TIME ZONE 'Asia/Almaty') AS coach_id
        FROM v_student_start v
        LEFT JOIN first_left fl ON fl.student_id = v.student_id
        LEFT JOIN first_frozen_30d fz ON fz.student_id = v.student_id
        LEFT JOIN undated u ON u.student_id = v.student_id
        WHERE v.start_date IS NOT NULL
    ),
    st_s AS (
        SELECT k.scope, st.*
        FROM st
        CROSS JOIN LATERAL (VALUES (COALESCE(st.coach_id::TEXT, 'unattributed')), ('school')) k(scope)
    ),
    excluded AS (
        SELECT
            scope,
            count(*) FILTER (WHERE left_source = 'backfill') AS pre_history,
            count(*) FILTER (WHERE undated AND left_source IS DISTINCT FROM 'backfill') AS undated
        FROM st_s GROUP BY scope
    ),
    b AS (
        SELECT
            st_s.scope,
            st_s.student_id,
            date_trunc('month', st_s.start_date)::DATE AS cohort,
            st_s.left_censored,
            st_s.left_at,
            LEAST(st_s.left_at, st_s.frozen_at) AS churn_at,
            -- GREATEST ignores NULLs, so a student without an exit must stay NULL explicitly
            CASE WHEN st_s.left_at IS NOT NULL THEN
                floor(GREATEST(0, EXTRACT(EPOCH FROM st_s.left_at - st_s.start_ts)) / 86400 / 30.4375)::INT
            END AS left_k,
            CASE WHEN COALESCE(st_s.left_at, st_s.frozen_at) IS NOT NULL THEN
                floor(GREATEST(0, EXTRACT(EPOCH FROM LEAST(st_s.left_at, st_s.frozen_at) - st_s.start_ts)) / 86400 / 30.4375)::INT
            END AS churn_k
        FROM st_s
        WHERE st_s.left_source IS DISTINCT FROM 'backfill' AND NOT st_s.undated
    ),
    cohorts AS (
        SELECT
            scope,
            cohort,
            count(*) AS size,
            bool_or(left_censored) AS left_censored,
            GREATEST(0, (
                (EXTRACT(YEAR FROM date_trunc('month', now() AT TIME ZONE 'Asia/Almaty')) - EXTRACT(YEAR FROM cohort)) * 12
                + EXTRACT(MONTH FROM date_trunc('month', now() AT TIME ZONE 'Asia/Almaty')) - EXTRACT(MONTH FROM cohort)
            )::INT) AS max_k
        FROM b GROUP BY scope, cohort
    ),
    cells AS (
        SELECT
            c.scope, c.cohort, k.k,
            round(100.0 * count(*) FILTER (WHERE b.left_k <= k.k) / c.size, 1) AS left_pct,
            round(100.0 * count(*) FILTER (WHERE b.churn_k <= k.k) / c.size, 1) AS churn_pct
        FROM cohorts c
        CROSS JOIN LATERAL generate_series(0, c.max_k) k(k)
        JOIN b ON b.scope = c.scope AND b.cohort = c.cohort
        GROUP BY c.scope, c.cohort, c.size, k.k
    ),
    exits AS (
        SELECT scope, 'left' AS kind, student_id, left_at AS at FROM b WHERE left_at IS NOT NULL
        UNION ALL
        SELECT scope, 'churn', student_id, churn_at FROM b WHERE churn_at IS NOT NULL
    ),
    exit_vals AS (
        SELECT
            student_id, at,
            COALESCE(NULLIF(coach_report_field_at(student_id, 'current_level', at), ''), 'unknown') AS level,
            COALESCE(NULLIF(coach_report_field_at(student_id, 'razryad', at), ''), 'none') AS razryad
        FROM (SELECT DISTINCT student_id, at FROM exits) d
    ),
    ex AS (
        SELECT x.scope, x.kind, v.level, v.razryad
        FROM exits x JOIN exit_vals v ON v.student_id = x.student_id AND v.at = x.at
    ),
    scopes AS (
        SELECT c.id::TEXT AS scope, c.id AS coach_id, trim(concat_ws(' ', c.first_name, c.last_name)) AS coach_name
        FROM coaches c
        UNION ALL SELECT 'unattributed', NULL, 'Unattributed'
        UNION ALL SELECT 'school', NULL, 'School total'
    )
    SELECT
        sc.scope, sc.coach_id, sc.coach_name,
        jsonb_build_object(
            'coach_id', sc.coach_id,
            'generated_at', now(),
            'max_months', COALESCE((SELECT max(max_k) FROM cohorts c WHERE c.scope = sc.scope), 0),
            'rows', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'start_month', to_char(c.cohort, 'YYYY-MM'),
                    'cohort_size', c.size,
                    'left_censored', c.left_censored,
                    'left_pct', (SELECT jsonb_agg(x.left_pct ORDER BY x.k) FROM cells x
                                 WHERE x.scope = c.scope AND x.cohort = c.cohort),
                    'churn_pct', (SELECT jsonb_agg(x.churn_pct ORDER BY x.k) FROM cells x
                                  WHERE x.scope = c.scope AND x.cohort = c.cohort)
                ) ORDER BY c.cohort)
                FROM cohorts c WHERE c.scope = sc.scope
            ), '[]'::JSONB),
            'by_level_at_leaving', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('level', level, 'left', n_left, 'churn', n_churn)
                                 ORDER BY length(level), level)
                FROM (
                    SELECT level,
                           count(*) FILTER (WHERE kind = 'left') AS n_left,
                           count(*) FILTER (WHERE kind = 'churn') AS n_churn
                    FROM ex WHERE ex.scope = sc.scope GROUP BY level
                ) g
            ), '[]'::JSONB),
            'by_razryad_at_leaving', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('razryad', razryad, 'left', n_left, 'churn', n_churn)
                                 ORDER BY razryad_rank(razryad), razryad)
                FROM (
                    SELECT razryad,
                           count(*) FILTER (WHERE kind = 'left') AS n_left,
                           count(*) FILTER (WHERE kind = 'churn') AS n_churn
                    FROM ex WHERE ex.scope = sc.scope GROUP BY razryad
                ) g
            ), '[]'::JSONB),
            'excluded_pre_history_leavers', COALESCE(e.pre_history, 0),
            'cleanup_leavers_undated', COALESCE(e.undated, 0)
        )
    FROM scopes sc
    LEFT JOIN excluded e ON e.scope = sc.scope;
$$;

COMMENT ON FUNCTION coach_report_cohort_scopes() IS
    'Migration 101: cohort matrix per scope (school, each coach, unattributed). Read-only.';

CREATE OR REPLACE FUNCTION coach_cohort_matrix(p_coach UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT x.matrix FROM coach_report_cohort_scopes() x WHERE x.scope = COALESCE(p_coach::TEXT, 'school')),
        jsonb_build_object('coach_id', p_coach, 'generated_at', now(), 'max_months', 0, 'rows', '[]'::JSONB,
                           'by_level_at_leaving', '[]'::JSONB, 'by_razryad_at_leaving', '[]'::JSONB,
                           'excluded_pre_history_leavers', 0, 'cleanup_leavers_undated', 0)
    );
$$;

COMMENT ON FUNCTION coach_cohort_matrix(UUID) IS
    'Migration 101: start month × months since start cumulative % left and % left + frozen 30+ (cohort = coach_at start; NULL = school), plus exits by level / razryad at leaving. Read-only.';

-- School matrix + one matrix per coach (with members) and Unattributed.
CREATE OR REPLACE FUNCTION coach_cohort_matrix_all()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    WITH m AS (SELECT * FROM coach_report_cohort_scopes())
    SELECT jsonb_build_object(
        'generated_at', now(),
        'school', (SELECT matrix FROM m WHERE scope = 'school'),
        'coaches', COALESCE((
            SELECT jsonb_agg(m.matrix || jsonb_build_object('coach_name', m.coach_name)
                             ORDER BY m.coach_id IS NULL, m.coach_name)
            FROM m
            WHERE m.scope <> 'school' AND jsonb_array_length(m.matrix -> 'rows') > 0
        ), '[]'::JSONB)
    );
$$;

COMMENT ON FUNCTION coach_cohort_matrix_all() IS
    'Migration 101: {school, coaches[]} cohort matrices in one call (analytics-coaches cohort_matrix&coach_id=all). Read-only.';

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
REVOKE ALL ON FUNCTION coach_cohort_matrix_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_cohort_scopes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_cleanup_batches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_cleanup(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION coach_report_status_events(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION coach_at(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_field_at(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_share(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_cohort_matrix(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION coach_cohort_matrix_all() TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_cohort_scopes() TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_cleanup_batches() TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_cleanup(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION coach_report_status_events(TIMESTAMPTZ) TO service_role;

COMMIT;
