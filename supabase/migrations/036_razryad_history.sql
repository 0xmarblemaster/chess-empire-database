-- Migration 036: razryad_history table + trigger
-- Records every change to students.razryad so the Coach Performance KPI
-- dashboard can count "new razryads earned in window" without relying on
-- the single mutable students.razryad column.
-- NOTE: No backfill — going-forward-only by product decision.

-- ============================================================
-- 1. TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS razryad_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    old_razryad     TEXT,
    new_razryad     TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    source          TEXT NOT NULL DEFAULT 'trigger' CHECK (source IN ('trigger', 'manual', 'import')),
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_razryad_history_student_changed ON razryad_history(student_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_razryad_history_changed_at ON razryad_history(changed_at DESC);

COMMENT ON TABLE razryad_history IS 'Append-only log of razryad transitions per student. Powers KPI: "new razryads earned in window".';

-- ============================================================
-- 2. TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION log_razryad_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.razryad IS DISTINCT FROM NEW.razryad THEN
        INSERT INTO razryad_history (student_id, old_razryad, new_razryad, changed_by, source)
        VALUES (NEW.id, OLD.razryad, NEW.razryad, auth.uid(), 'trigger');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_razryad_change ON students;
CREATE TRIGGER trg_log_razryad_change
    AFTER UPDATE OF razryad ON students
    FOR EACH ROW EXECUTE FUNCTION log_razryad_change();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE razryad_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage razryad_history" ON razryad_history;
CREATE POLICY "Admins manage razryad_history"
    ON razryad_history FOR ALL
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

DROP POLICY IF EXISTS "Coaches read razryad_history for their students" ON razryad_history;
CREATE POLICY "Coaches read razryad_history for their students"
    ON razryad_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM students s
            JOIN user_roles ur ON ur.coach_id = s.coach_id
            WHERE s.id = razryad_history.student_id
            AND ur.user_id = auth.uid()
            AND ur.role = 'coach'
        )
    );
