-- ============================================
-- MIGRATION 068: Backfill coach_branches from legacy coaches.branch_id
-- Created: 2026-08-23
-- Root cause: "Manage Coaches" (supabaseData.addCoach / updateCoach) wrote only
--   the legacy coaches.branch_id column and never created a coach_branches
--   junction row. The attendance calendar coach dropdown resolves branch
--   assignments exclusively from coach_branches (getCoaches → coach.branchIds),
--   so coaches added that way (e.g. Emir Maksatovich, Almaty-1) were invisible
--   in the attendance coach filter.
-- Companion code fix: addCoach/updateCoach now maintain coach_branches directly.
--   This migration repairs historic rows and is safe to re-run (idempotent).
-- Note: the migration-026 trigger fires on these inserts and re-derives
--   coaches.branch_id from the junction row — a no-op since values already match.
-- ============================================

INSERT INTO coach_branches (coach_id, branch_id)
SELECT c.id, c.branch_id
FROM coaches c
WHERE c.branch_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM coach_branches cb
      WHERE cb.coach_id = c.id
        AND cb.branch_id = c.branch_id
  );

-- ============================================
-- Verification: coaches with a branch_id but no junction row should be zero
-- ============================================
DO $$
DECLARE
    v_orphans INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_orphans
    FROM coaches c
    WHERE c.branch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM coach_branches cb WHERE cb.coach_id = c.id);

    RAISE NOTICE 'Migration 068: % coaches still missing junction rows (expect 0)', v_orphans;
END $$;
