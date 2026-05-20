-- ============================================================
-- Migration 040 — Fix razryad trigger to write students.razryad
-- in the format that table's CHECK constraint allows
-- ============================================================
-- Problem:
--   detect_razryad_from_result() (introduced in 039) writes raw
--   '3'/'4' into students.razryad, but students.razryad has a
--   CHECK constraint (from update_razryad_constraint.sql) that
--   only accepts ('none','4th','3rd','2nd','1st','kms').
--   When a student scores high enough in a razryad_3/razryad_4
--   tournament to earn the razryad, the trigger fires an UPDATE
--   that violates the constraint and the entire INSERT into
--   tournament_results fails with 23514 (-> HTTP 400).
--
-- Fix:
--   tournament_results.earned_razryad keeps '3'/'4' (matches its
--   own CHECK), but the UPDATE to students.razryad uses the
--   suffixed form '3rd'/'4th'. razryad_rank() already accepts
--   both formats so the > comparison still works.
-- ============================================================

CREATE OR REPLACE FUNCTION detect_razryad_from_result()
RETURNS TRIGGER AS $$
DECLARE
    v_kind               tournament_kind;
    v_earned             TEXT;
    v_earned_for_student TEXT;
    v_current            TEXT;
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
            UPDATE students SET razryad = v_earned_for_student WHERE id = NEW.student_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION detect_razryad_from_result() IS
    'Migration 040: writes earned_razryad as ''3''/''4'' (column CHECK) and updates students.razryad as ''3rd''/''4th'' (column CHECK).';
