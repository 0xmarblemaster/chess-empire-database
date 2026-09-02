-- ============================================
-- MIGRATION 074: Sync coach_branches from coaches.branch_id (reverse of 026)
-- Created: 2026-09-02
-- Root cause: The attendance calendar coach dropdown resolves branch
--   assignments exclusively from the coach_branches junction table
--   (getCoaches → coach.branchIds / attendance-role-lock branchNames).
--   Migration 026 syncs junction → coaches.branch_id, and the app's
--   addCoach/updateCoach maintain the junction directly — but a coach row
--   inserted/updated OUTSIDE the app (SQL console, REST, scripts) with only
--   branch_id set gets no junction row and is invisible in the attendance
--   coach filter. This has happened twice (migration 068 backfill on
--   2026-08-23; Azamat Alemkhanovich on 2026-09-01).
-- Fix: trigger on coaches that inserts the missing junction row whenever
--   branch_id is set. Recursion with the 026 trigger terminates: our insert
--   fires sync_coach_branch_id, which may rewrite coaches.branch_id to the
--   primary (oldest) junction branch; that update re-fires this trigger,
--   which finds the junction row already present and no-ops.
-- ============================================

CREATE OR REPLACE FUNCTION sync_coach_branches_from_branch_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.branch_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM coach_branches cb
           WHERE cb.coach_id = NEW.id
             AND cb.branch_id = NEW.branch_id
       ) THEN
        INSERT INTO coach_branches (coach_id, branch_id)
        VALUES (NEW.id, NEW.branch_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_coach_branches_on_coach_change ON coaches;
CREATE TRIGGER sync_coach_branches_on_coach_change
    AFTER INSERT OR UPDATE OF branch_id ON coaches
    FOR EACH ROW EXECUTE FUNCTION sync_coach_branches_from_branch_id();

-- Idempotent backfill (same as 068) in case any orphans appeared since.
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
-- Verification
-- ============================================
DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_orphans INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'sync_coach_branches_on_coach_change'
          AND tgenabled = 'O'
    ) INTO v_trigger_exists;

    SELECT COUNT(*) INTO v_orphans
    FROM coaches c
    WHERE c.branch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM coach_branches cb WHERE cb.coach_id = c.id);

    RAISE NOTICE 'Migration 074: trigger %, % orphaned coaches (expect 0)',
        CASE WHEN v_trigger_exists THEN 'ACTIVE' ELSE 'MISSING' END, v_orphans;
END $$;
