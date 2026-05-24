-- Migration 038: student_league_events + AFTER-INSERT trigger on student_ratings
-- Logs promotion (C→B, C→A, B→A) and demotion (A→B, A→C, B→C) events whenever
-- a new student_ratings row crosses a league threshold. Powers the
-- Coach Performance KPI dashboard's "promotions in window" metric.
-- League thresholds (mirror student_current_ratings view):
--   rating <  450        → C
--   rating >= 450 && <= 800 → B
--   rating >  800        → A
-- NOTE: No historical backfill — going-forward-only by product decision.

-- ============================================================
-- 1. HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION calc_league_from_rating(p_rating INTEGER)
RETURNS TEXT AS $$
BEGIN
    IF p_rating IS NULL THEN RETURN NULL; END IF;
    IF p_rating > 800 THEN RETURN 'A'; END IF;
    IF p_rating >= 450 THEN RETURN 'B'; END IF;
    RETURN 'C';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calc_league_from_rating(INTEGER) IS
    'Maps a numeric rating to its league bucket (A/B/C). Thresholds match the student_current_ratings view.';

-- ============================================================
-- 2. TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS student_league_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN ('promotion', 'demotion')),
    from_league     TEXT NOT NULL CHECK (from_league IN ('A', 'B', 'C')),
    to_league       TEXT NOT NULL CHECK (to_league IN ('A', 'B', 'C')),
    rating_at_event INTEGER,
    tournament_id   UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sle_student_occurred ON student_league_events(student_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sle_occurred ON student_league_events(occurred_at DESC);

COMMENT ON TABLE student_league_events IS
    'Append-only log of league promotions/demotions inferred from consecutive student_ratings rows.';

-- ============================================================
-- 3. TRIGGER FUNCTION (AFTER INSERT on student_ratings)
-- ============================================================
CREATE OR REPLACE FUNCTION log_student_league_event()
RETURNS TRIGGER AS $$
DECLARE
    v_prev_rating INTEGER;
    v_prev_league TEXT;
    v_new_league  TEXT;
    v_event_type  TEXT;
BEGIN
    v_new_league := calc_league_from_rating(NEW.rating);
    IF v_new_league IS NULL THEN RETURN NEW; END IF;

    -- Look up the most recent prior rating for this student.
    SELECT rating INTO v_prev_rating
    FROM student_ratings
    WHERE student_id = NEW.student_id
      AND id <> NEW.id
      AND (rating_date < NEW.rating_date
           OR (rating_date = NEW.rating_date AND created_at < NEW.created_at))
    ORDER BY rating_date DESC, created_at DESC
    LIMIT 1;

    IF v_prev_rating IS NULL THEN
        -- No prior rating → no transition to record.
        RETURN NEW;
    END IF;

    v_prev_league := calc_league_from_rating(v_prev_rating);
    IF v_prev_league = v_new_league THEN
        RETURN NEW;
    END IF;

    -- A > B > C — promotion means moving to a "higher" league.
    IF (v_prev_league = 'C' AND v_new_league IN ('A', 'B'))
       OR (v_prev_league = 'B' AND v_new_league = 'A') THEN
        v_event_type := 'promotion';
    ELSE
        v_event_type := 'demotion';
    END IF;

    INSERT INTO student_league_events
        (student_id, event_type, from_league, to_league, rating_at_event, tournament_id)
    VALUES
        (NEW.student_id, v_event_type, v_prev_league, v_new_league, NEW.rating, NEW.tournament_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_student_league_event ON student_ratings;
CREATE TRIGGER trg_log_student_league_event
    AFTER INSERT ON student_ratings
    FOR EACH ROW EXECUTE FUNCTION log_student_league_event();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE student_league_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage student_league_events" ON student_league_events;
CREATE POLICY "Admins manage student_league_events"
    ON student_league_events FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Coaches read student_league_events for their students" ON student_league_events;
CREATE POLICY "Coaches read student_league_events for their students"
    ON student_league_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM students s
            JOIN user_roles ur ON ur.coach_id = s.coach_id
            WHERE s.id = student_league_events.student_id
            AND ur.user_id = auth.uid()
            AND ur.role = 'coach'
        )
    );
