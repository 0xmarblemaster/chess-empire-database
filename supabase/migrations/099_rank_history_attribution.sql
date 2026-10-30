-- Migration 099: rank history attribution (trainer + source per rank change)
--
-- CONTEXT
-- -------
-- razryad_history (036) records every students.razryad change, but every row
-- says source='trigger' and nothing says WHICH trainer held the student when
-- the rank changed. The weekly rank-tracking export (students-api
-- ?action=rank_history, spec by Alexander Tsai 2026-10-30) needs both.
--
-- Rules:
--   * New columns trainer_id_at_change / trainer_attribution / source_derived /
--     evidence. source CHECK widened to admin_ui, coach_ui, api, tournament,
--     system (legacy trigger / manual / import kept).
--   * log_razryad_change(): trainer = OLD.coach_id (the coach who held the
--     student when the rank was earned — a save that changes both coach and
--     rank credits the OLD coach), attribution 'event_time' ('unknown' when the
--     student had no coach). Source: app.rank_source GUC → service_role JWT
--     ('api') → user_roles role of auth.uid() ('admin_ui' / 'coach_ui') →
--     'system'. Still no row when the value is unchanged; changed_at = now()
--     (server time); changed_by = auth.uid().
--   * detect_razryad_from_result(): copied VERBATIM from 040 (latest
--     definition) with ONE change: app.rank_source = 'tournament' around its
--     UPDATE of students (restored afterwards so a later manual save in the
--     same transaction is not mislabelled).
--   * Append-only: a BEFORE UPDATE trigger raises on any UPDATE, except
--       - FK ON DELETE SET NULL of changed_by / trainer_id_at_change (a coach or
--         auth user being deleted), and
--       - the one-time backfill below (GUC app.rank_history_backfill='on', only
--         legacy rows not yet derived, only the 4 new columns + source).
--     The admin FOR ALL policy is narrowed to SELECT. ON DELETE CASCADE from
--     students is kept (a hard-deleted student takes their history along).
--   * One-time idempotent backfill of legacy rows (source='trigger' AND
--     source_derived=false):
--       trainer: audit_log coach_id timeline (entity_type='students') at
--                changed_at → 'derived_audit_log'; no coverage → 'unknown'
--                (current students.coach_id is NEVER used — it may be later).
--       source:  tournament_results.earned_razryad for the same student and
--                rank within 5s → 'tournament'; else role of changed_by →
--                'admin_ui' / 'coach_ui'; else stays 'trigger'.
--       source_derived = true, evidence = how it was derived.
--     NEVER updates students. old/new/changed_at/changed_by are untouched.
--
-- Verify with 099_rank_history_attribution_verify.sql (read-only).
-- Idempotent — re-running this migration is safe.

BEGIN;

-- ============================================================
-- 1. COLUMNS + CHECKS
-- ============================================================
ALTER TABLE razryad_history
    ADD COLUMN IF NOT EXISTS trainer_id_at_change UUID REFERENCES coaches(id) ON DELETE SET NULL;
ALTER TABLE razryad_history ADD COLUMN IF NOT EXISTS trainer_attribution TEXT;
ALTER TABLE razryad_history ADD COLUMN IF NOT EXISTS source_derived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE razryad_history ADD COLUMN IF NOT EXISTS evidence TEXT;

ALTER TABLE razryad_history DROP CONSTRAINT IF EXISTS razryad_history_trainer_attribution_check;
ALTER TABLE razryad_history ADD CONSTRAINT razryad_history_trainer_attribution_check CHECK (
    trainer_attribution IS NULL OR trainer_attribution IN ('event_time', 'derived_audit_log', 'unknown')
);

ALTER TABLE razryad_history DROP CONSTRAINT IF EXISTS razryad_history_source_check;
ALTER TABLE razryad_history ADD CONSTRAINT razryad_history_source_check CHECK (
    source IN ('trigger', 'manual', 'import', 'admin_ui', 'coach_ui', 'api', 'tournament', 'system')
);

CREATE INDEX IF NOT EXISTS idx_razryad_history_changed_at_id ON razryad_history(changed_at, id);

COMMENT ON COLUMN razryad_history.trainer_id_at_change IS
    'Migration 099: coach who held the student when the rank changed (OLD.coach_id). NULL = unknown.';
COMMENT ON COLUMN razryad_history.trainer_attribution IS
    'Migration 099: event_time (captured by the trigger) | derived_audit_log (backfilled from audit_log coach_id timeline) | unknown.';
COMMENT ON COLUMN razryad_history.source_derived IS
    'Migration 099: true when source/trainer were derived after the fact by the 099 backfill (not captured at event time).';
COMMENT ON COLUMN razryad_history.evidence IS
    'Migration 099: how a derived source/trainer was determined (backfill rows only).';

-- ============================================================
-- 2. log_razryad_change(): capture trainer + source at event time
-- ============================================================
CREATE OR REPLACE FUNCTION log_razryad_change()
RETURNS TRIGGER AS $$
DECLARE
    v_source TEXT;
    v_role   TEXT;
BEGIN
    IF OLD.razryad IS DISTINCT FROM NEW.razryad THEN
        v_source := NULLIF(current_setting('app.rank_source', true), '');
        IF v_source IS NOT NULL
           AND v_source NOT IN ('admin_ui', 'coach_ui', 'api', 'tournament', 'system') THEN
            v_source := NULL;
        END IF;

        IF v_source IS NULL AND auth.role() = 'service_role' THEN
            v_source := 'api';
        END IF;

        IF v_source IS NULL AND auth.uid() IS NOT NULL THEN
            SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid();
            v_source := CASE v_role WHEN 'admin' THEN 'admin_ui' WHEN 'coach' THEN 'coach_ui' END;
        END IF;

        INSERT INTO razryad_history (
            student_id, old_razryad, new_razryad, changed_by, source,
            trainer_id_at_change, trainer_attribution
        )
        VALUES (
            NEW.id, OLD.razryad, NEW.razryad, auth.uid(), COALESCE(v_source, 'system'),
            OLD.coach_id, CASE WHEN OLD.coach_id IS NULL THEN 'unknown' ELSE 'event_time' END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_razryad_change() IS
    'Migration 099: logs razryad changes with trainer_id_at_change = OLD.coach_id and source from app.rank_source / service_role / user_roles / system.';

-- ============================================================
-- 3. detect_razryad_from_result(): mark its UPDATE as 'tournament'
-- ============================================================
CREATE OR REPLACE FUNCTION detect_razryad_from_result()
RETURNS TRIGGER AS $$
DECLARE
    v_kind               tournament_kind;
    v_earned             TEXT;
    v_earned_for_student TEXT;
    v_current            TEXT;
    v_prev_source        TEXT;
BEGIN
    SELECT kind INTO v_kind FROM tournaments_uploads WHERE id = NEW.upload_id;
    IF v_kind IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_kind = 'razryad_4' AND NEW.score >= 6 THEN
        v_earned := '4';
        v_earned_for_student := '4th';
    ELSIF v_kind = 'razryad_3' AND NEW.score >= 7 THEN
        v_earned := '3';
        v_earned_for_student := '3rd';
    ELSE
        v_earned := NULL;
        v_earned_for_student := NULL;
    END IF;

    NEW.earned_razryad := v_earned;

    IF v_earned IS NOT NULL THEN
        SELECT razryad INTO v_current FROM students WHERE id = NEW.student_id;
        IF razryad_rank(v_earned) > razryad_rank(v_current) THEN
            v_prev_source := current_setting('app.rank_source', true);
            PERFORM set_config('app.rank_source', 'tournament', true);
            UPDATE students SET razryad = v_earned_for_student WHERE id = NEW.student_id;
            PERFORM set_config('app.rank_source', COALESCE(v_prev_source, ''), true);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION detect_razryad_from_result() IS
    'Migration 099 (from 040): writes earned_razryad as ''3''/''4'' and updates students.razryad as ''3rd''/''4th'' with app.rank_source=tournament.';

-- ============================================================
-- 4. APPEND-ONLY GUARD + RLS
-- ============================================================
CREATE OR REPLACE FUNCTION razryad_history_append_only()
RETURNS TRIGGER AS $$
DECLARE
    v_backfill_cols CONSTANT TEXT[] := ARRAY['trainer_id_at_change', 'trainer_attribution', 'source_derived', 'evidence', 'source'];
    v_ref_cols      CONSTANT TEXT[] := ARRAY['changed_by', 'trainer_id_at_change'];
BEGIN
    -- FK ON DELETE SET NULL: a referenced coach / auth user was deleted.
    IF (to_jsonb(NEW) - v_ref_cols) = (to_jsonb(OLD) - v_ref_cols)
       AND (NEW.changed_by IS NOT DISTINCT FROM OLD.changed_by OR NEW.changed_by IS NULL)
       AND (NEW.trainer_id_at_change IS NOT DISTINCT FROM OLD.trainer_id_at_change OR NEW.trainer_id_at_change IS NULL) THEN
        RETURN NEW;
    END IF;

    -- One-time 099 backfill of legacy rows (attribution columns only).
    IF current_setting('app.rank_history_backfill', true) = 'on'
       AND OLD.source = 'trigger' AND OLD.source_derived = false
       AND (to_jsonb(NEW) - v_backfill_cols) = (to_jsonb(OLD) - v_backfill_cols) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'razryad_history is append-only (row %)', OLD.id
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_razryad_history_append_only ON razryad_history;
CREATE TRIGGER trg_razryad_history_append_only
    BEFORE UPDATE ON razryad_history
    FOR EACH ROW EXECUTE FUNCTION razryad_history_append_only();

DROP POLICY IF EXISTS "Admins manage razryad_history" ON razryad_history;
DROP POLICY IF EXISTS "Admins read razryad_history" ON razryad_history;
CREATE POLICY "Admins read razryad_history"
    ON razryad_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
    );

-- ============================================================
-- 5. ONE-TIME BACKFILL OF LEGACY ROWS (never touches students)
-- ============================================================
SELECT set_config('app.rank_history_backfill', 'on', true);

WITH legacy AS (
    SELECT rh.id, rh.student_id, rh.new_razryad, rh.changed_at, rh.changed_by
    FROM razryad_history rh
    WHERE rh.source = 'trigger' AND rh.source_derived = false
),
derived AS (
    SELECT
        l.id,
        -- Coach at changed_at: the last coach_id change strictly before it
        -- (its new_value), else the first change at/after it (its old_value —
        -- equal timestamps = same save, which credits the OLD coach).
        CASE WHEN b.changed_at IS NOT NULL THEN b.new_value ELSE a.old_value END AS coach_text,
        CASE
            WHEN b.changed_at IS NOT NULL THEN 'audit_log coach_id change before event at ' || b.changed_at::TEXT || ' (new_value)'
            WHEN a.changed_at IS NOT NULL THEN 'audit_log coach_id change at/after event at ' || a.changed_at::TEXT || ' (old_value)'
        END AS trainer_evidence,
        t.id AS tournament_result_id,
        t.delta_s,
        ur.role AS changer_role
    FROM legacy l
    LEFT JOIN LATERAL (
        SELECT al.new_value, al.changed_at
        FROM audit_log al
        WHERE al.entity_type = 'students' AND al.entity_id = l.student_id
          AND al.field_name = 'coach_id' AND al.action = 'UPDATE'
          AND al.changed_at < l.changed_at
        ORDER BY al.changed_at DESC, al.id DESC
        LIMIT 1
    ) b ON true
    LEFT JOIN LATERAL (
        SELECT al.old_value, al.changed_at
        FROM audit_log al
        WHERE al.entity_type = 'students' AND al.entity_id = l.student_id
          AND al.field_name = 'coach_id' AND al.action = 'UPDATE'
          AND al.changed_at >= l.changed_at
        ORDER BY al.changed_at ASC, al.id ASC
        LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
        SELECT tr.id, abs(extract(epoch FROM tr.created_at - l.changed_at)) AS delta_s
        FROM tournament_results tr
        WHERE tr.student_id = l.student_id
          AND tr.earned_razryad IS NOT NULL
          AND l.new_razryad = CASE tr.earned_razryad WHEN '3' THEN '3rd' WHEN '4' THEN '4th' END
          AND tr.created_at BETWEEN l.changed_at - INTERVAL '5 seconds' AND l.changed_at + INTERVAL '5 seconds'
        ORDER BY abs(extract(epoch FROM tr.created_at - l.changed_at)), tr.id
        LIMIT 1
    ) t ON true
    LEFT JOIN user_roles ur ON ur.user_id = l.changed_by
),
resolved AS (
    SELECT
        d.*,
        c.id AS coach_id
    FROM derived d
    LEFT JOIN coaches c
        ON d.coach_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND c.id = d.coach_text::UUID
)
UPDATE razryad_history rh
SET
    trainer_id_at_change = r.coach_id,
    trainer_attribution  = CASE WHEN r.coach_id IS NOT NULL THEN 'derived_audit_log' ELSE 'unknown' END,
    source = CASE
        WHEN r.tournament_result_id IS NOT NULL THEN 'tournament'
        WHEN r.changer_role = 'admin' THEN 'admin_ui'
        WHEN r.changer_role = 'coach' THEN 'coach_ui'
        ELSE 'trigger'
    END,
    source_derived = true,
    evidence = concat_ws('; ',
        'backfill 099',
        'trainer: ' || CASE
            WHEN r.coach_id IS NOT NULL THEN r.trainer_evidence
            WHEN r.trainer_evidence IS NOT NULL THEN r.trainer_evidence || ' but no existing coach'
            ELSE 'no audit_log coach_id coverage'
        END,
        'source: ' || CASE
            WHEN r.tournament_result_id IS NOT NULL THEN 'tournament_results ' || r.tournament_result_id::TEXT
                 || ' earned_razryad within ' || round(r.delta_s::NUMERIC, 3)::TEXT || 's'
            WHEN r.changer_role IN ('admin', 'coach') THEN 'user_roles.role=' || r.changer_role || ' of changed_by'
            ELSE 'unresolved (changed_by has no admin/coach role)'
        END
    )
FROM resolved r
WHERE rh.id = r.id
  AND rh.source = 'trigger' AND rh.source_derived = false;

SELECT set_config('app.rank_history_backfill', 'off', true);

COMMIT;
