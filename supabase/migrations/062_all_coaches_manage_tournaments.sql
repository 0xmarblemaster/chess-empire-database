-- Migration 062: Grant tournament-management permission to every coach
-- ====================================================================
-- Decision (Alex, 2026-06-20): the Tournament Management dashboard
-- should be available to every coach by default, not gated behind a
-- per-coach can_manage_tournaments flip.
--
-- Background:
--   * Migration 035 added user_roles.can_manage_tournaments BOOLEAN
--     DEFAULT FALSE and the RLS policies that accept it on
--     tournaments / tournament_participants writes.
--   * admin-v2.js:233 gates the Tournament Management menu on
--     userRole.can_manage_tournaments === true.
--   * Migration 060 installed default_coach_ratings_permission_trg
--     which auto-grants BOTH can_manage_ratings AND
--     can_manage_tournaments on coach INSERT and role->coach UPDATE.
--   * As of 2026-06-20, 15 of 17 coach rows in prod still have
--     can_manage_tournaments = false — they predate the 060 trigger
--     and the 060 backfill (which only touched can_manage_ratings)
--     did not run, or ran before these rows existed.
--
-- This migration:
--   1. Backfills can_manage_tournaments = true on every coach row.
--   2. Re-applies (idempotent CREATE OR REPLACE) the default-grant
--      trigger from migration 060 as belt-and-suspenders so future
--      coaches keep getting the flag even if 060 ran out of order.
--   3. Verification block — raises if any coach row is left behind.
-- ====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Backfill — every coach gets can_manage_tournaments = true
-- ------------------------------------------------------------
UPDATE user_roles
SET can_manage_tournaments = true,
    updated_at = NOW()
WHERE role = 'coach'
  AND COALESCE(can_manage_tournaments, false) = false;

-- ------------------------------------------------------------
-- 2. Default-grant trigger (idempotent)
-- ------------------------------------------------------------
-- Mirrors migration 060's trigger. Safe to re-run: CREATE OR REPLACE
-- updates the function in place; DROP IF EXISTS + CREATE TRIGGER
-- re-binds it.
CREATE OR REPLACE FUNCTION default_coach_ratings_permission()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'coach' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.can_manage_ratings := true;
            NEW.can_manage_tournaments := true;
        ELSIF TG_OP = 'UPDATE'
              AND NEW.role IS DISTINCT FROM OLD.role THEN
            NEW.can_manage_ratings := true;
            NEW.can_manage_tournaments := true;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS default_coach_ratings_permission_trg ON user_roles;
CREATE TRIGGER default_coach_ratings_permission_trg
    BEFORE INSERT OR UPDATE OF role
    ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION default_coach_ratings_permission();

-- ------------------------------------------------------------
-- 3. Verification — no coach left behind
-- ------------------------------------------------------------
DO $$
DECLARE v_missing INT;
BEGIN
    SELECT COUNT(*) INTO v_missing
    FROM user_roles
    WHERE role = 'coach'
      AND COALESCE(can_manage_tournaments, false) = false;
    IF v_missing <> 0 THEN
        RAISE EXCEPTION
            'backfill failed: % coach rows still missing can_manage_tournaments',
            v_missing;
    END IF;
END$$;

COMMIT;
