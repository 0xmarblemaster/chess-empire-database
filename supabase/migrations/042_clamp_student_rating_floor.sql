-- Migration 042: Enforce minimum student rating floor of 51
--
-- Bug: tournament uploads write rating_before + rating_delta without
-- clamping the sum, so 20 rows in student_ratings have rating < 51
-- (lowest: -27). The UI shows the latest row by rating_date per student,
-- which surfaces these negative ratings (e.g. Baydildaev Kuanysh = -26).
--
-- This migration:
--   1) Backs up the offending rows to student_ratings_backup_2026_05_26_floor_fix
--   2) Clamps the existing rating < 51 rows to 51 and appends a note
--   3) Installs a BEFORE INSERT/UPDATE trigger that enforces the floor
--      going forward, so future tournament/manual writes can never
--      produce rating < 51 again.

-- ============================================================
-- 1. Backup table
-- ============================================================
CREATE TABLE student_ratings_backup_2026_05_26_floor_fix AS
SELECT * FROM student_ratings WHERE rating < 51;

-- ============================================================
-- 2. Clamp existing offending rows to the floor
-- ============================================================
UPDATE student_ratings
   SET rating = 51,
       notes  = COALESCE(notes || ' | ', '') ||
                'Floor correction 2026-05-26: was ' || rating::text
 WHERE rating < 51;

-- ============================================================
-- 3. Trigger to enforce the floor on all future writes
-- ============================================================
CREATE OR REPLACE FUNCTION clamp_student_rating_floor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating < 51 THEN
    NEW.rating := 51;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clamp_student_rating ON student_ratings;

CREATE TRIGGER trg_clamp_student_rating
BEFORE INSERT OR UPDATE ON student_ratings
FOR EACH ROW EXECUTE FUNCTION clamp_student_rating_floor();
