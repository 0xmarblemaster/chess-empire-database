-- Migration 039: tournaments_uploads + tournament_results
-- Phase 2 of Coach KPI. Stores Swiss-Manager exports the admin uploads for
-- each of the 4 internal tournament kinds (League C / League B / 4th razryad
-- qual / 3rd razryad qual) and per-student results within each upload.
--
-- Razryad-detection trigger on tournament_results:
--   razryad_4 + score >= 6  → earned_razryad = '4'
--   razryad_3 + score >= 7  → earned_razryad = '3'
-- and forwards the upgrade to students.razryad (only when the new razryad is
-- higher than the current — no downgrades, no double-awards). The existing
-- 036 razryad_history trigger then logs the transition.

-- ============================================================
-- 1. ENUM tournament_kind
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_kind') THEN
        CREATE TYPE tournament_kind AS ENUM ('league_c', 'league_b', 'razryad_4', 'razryad_3');
    END IF;
END $$;

-- ============================================================
-- 2. tournaments_uploads
-- ============================================================
CREATE TABLE IF NOT EXISTS tournaments_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            tournament_kind NOT NULL,
    tournament_date DATE NOT NULL,
    rounds          SMALLINT NOT NULL,
    source_filename TEXT,
    uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tu_rounds_match_kind CHECK (
        (kind = 'league_c'  AND rounds = 6)  OR
        (kind = 'league_b'  AND rounds = 6)  OR
        (kind = 'razryad_4' AND rounds = 10) OR
        (kind = 'razryad_3' AND rounds = 9)
    )
);

CREATE INDEX IF NOT EXISTS tu_kind_date_idx
    ON tournaments_uploads(kind, tournament_date);

COMMENT ON TABLE tournaments_uploads IS
    'One row per Swiss-Manager export uploaded by an admin. Powers the Coach KPI Phase 2 leaderboard.';

-- ============================================================
-- 3. tournament_results
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID NOT NULL REFERENCES tournaments_uploads(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    rank            SMALLINT NOT NULL,
    score           NUMERIC(3,1) NOT NULL,
    games_played    SMALLINT NOT NULL,
    avg_opp_rating  INTEGER,
    rating_before   INTEGER NOT NULL,
    rating_delta    INTEGER NOT NULL,
    earned_razryad  TEXT CHECK (earned_razryad IS NULL OR earned_razryad IN ('3', '4')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tr_student_date_idx
    ON tournament_results(student_id, created_at);
CREATE INDEX IF NOT EXISTS tr_upload_idx
    ON tournament_results(upload_id);

COMMENT ON TABLE tournament_results IS
    'Per-student result row inside a tournaments_uploads batch. Phase 2 KPI math reads from here.';

-- ============================================================
-- 4. Razryad-detection trigger (BEFORE INSERT on tournament_results)
-- ============================================================
-- Razryad ordinal ranking: kms (highest) > 1st > 2nd > 3rd > 4th > none/null.
-- We only upgrade students.razryad when the newly-earned razryad strictly
-- outranks the current value.
CREATE OR REPLACE FUNCTION razryad_rank(p_razryad TEXT)
RETURNS INTEGER AS $$
BEGIN
    IF p_razryad IS NULL THEN RETURN 0; END IF;
    CASE lower(p_razryad)
        WHEN 'kms'  THEN RETURN 5;
        WHEN '1st'  THEN RETURN 4;
        WHEN '1'    THEN RETURN 4;
        WHEN '2nd'  THEN RETURN 3;
        WHEN '2'    THEN RETURN 3;
        WHEN '3rd'  THEN RETURN 2;
        WHEN '3'    THEN RETURN 2;
        WHEN '4th'  THEN RETURN 1;
        WHEN '4'    THEN RETURN 1;
        ELSE RETURN 0;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION razryad_rank(TEXT) IS
    'Numeric rank of a razryad label so trigger code can compare current vs newly-earned.';

CREATE OR REPLACE FUNCTION detect_razryad_from_result()
RETURNS TRIGGER AS $$
DECLARE
    v_kind          tournament_kind;
    v_earned        TEXT;
    v_current       TEXT;
BEGIN
    SELECT kind INTO v_kind FROM tournaments_uploads WHERE id = NEW.upload_id;
    IF v_kind IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_kind = 'razryad_4' AND NEW.score >= 6 THEN
        v_earned := '4';
    ELSIF v_kind = 'razryad_3' AND NEW.score >= 7 THEN
        v_earned := '3';
    ELSE
        v_earned := NULL;
    END IF;

    NEW.earned_razryad := v_earned;

    IF v_earned IS NOT NULL THEN
        SELECT razryad INTO v_current FROM students WHERE id = NEW.student_id;
        -- Only upgrade if the newly-earned razryad outranks the current one.
        IF razryad_rank(v_earned) > razryad_rank(v_current) THEN
            UPDATE students SET razryad = v_earned WHERE id = NEW.student_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_detect_razryad_from_result ON tournament_results;
CREATE TRIGGER trg_detect_razryad_from_result
    BEFORE INSERT ON tournament_results
    FOR EACH ROW EXECUTE FUNCTION detect_razryad_from_result();

-- ============================================================
-- 5. Row Level Security
-- ============================================================
ALTER TABLE tournaments_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tournaments_uploads" ON tournaments_uploads;
CREATE POLICY "Admins manage tournaments_uploads"
    ON tournaments_uploads FOR ALL
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

DROP POLICY IF EXISTS "Coaches read tournaments_uploads" ON tournaments_uploads;
CREATE POLICY "Coaches read tournaments_uploads"
    ON tournaments_uploads FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND user_roles.role = 'coach'
        )
    );

DROP POLICY IF EXISTS "Admins manage tournament_results" ON tournament_results;
CREATE POLICY "Admins manage tournament_results"
    ON tournament_results FOR ALL
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

DROP POLICY IF EXISTS "Coaches read tournament_results for their students" ON tournament_results;
CREATE POLICY "Coaches read tournament_results for their students"
    ON tournament_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM students s
            JOIN user_roles ur ON ur.coach_id = s.coach_id
            WHERE s.id = tournament_results.student_id
              AND ur.user_id = auth.uid()
              AND ur.role = 'coach'
        )
    );
