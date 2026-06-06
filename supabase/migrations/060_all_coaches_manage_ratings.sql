-- Migration 060: Grant ratings/tournament-upload permission to every coach
-- ========================================================================
-- Decision (Alex, 2026-06-06 11:37 UTC): the Ratings Management menu and
-- tournament/rating upload tooling should be available to every coach by
-- default, not gated behind a per-coach can_manage_ratings flip.
--
-- Background:
--   * Migration 058 already taught tournaments_uploads / tournament_results
--     / rating_uploads RLS to accept can_manage_ratings = true (or
--     can_manage_tournaments = true) on top of role = 'admin'.
--   * Migration 058 also installed sync_ratings_tournaments_permissions_trg
--     which keeps can_manage_ratings and can_manage_tournaments in lockstep
--     on any INSERT / UPDATE of either flag.
--   * admin-v2.js gates the Ratings Management menu on can_manage_ratings.
--
-- Together that means: flipping can_manage_ratings to true on every coach
-- row is sufficient to unlock the full upload flow — the sync trigger
-- mirrors the flag to can_manage_tournaments, and the unchanged RLS from
-- 058 accepts the resulting row.
--
-- This migration:
--   1. Backfills can_manage_ratings = true for every existing coach row
--      that doesn't already have it. role = 'student' and role = 'admin'
--      rows are untouched.
--   2. Adds a BEFORE INSERT OR UPDATE OF role trigger that auto-grants
--      can_manage_ratings (and via the sync trigger, can_manage_tournaments)
--      whenever a row is created or promoted to role = 'coach'. Future new
--      coaches and student->coach role flips get the permission by default.
--   3. Verifies post-migration that zero coach rows are missing the flag.
-- ========================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Backfill — every coach gets can_manage_ratings = true
-- ------------------------------------------------------------
-- The sync_ratings_tournaments_permissions_trg from migration 058 fires on
-- UPDATE OF can_manage_ratings and mirrors the new value to
-- can_manage_tournaments, so we only need to write one column here.
UPDATE user_roles
SET can_manage_ratings = true,
    updated_at = NOW()
WHERE role = 'coach'
  AND COALESCE(can_manage_ratings, false) = false;

-- ------------------------------------------------------------
-- 2. Default-grant trigger — coaches get the flag automatically
-- ------------------------------------------------------------
-- Fires BEFORE the alphabetically-later sync trigger from 058, so on INSERT
-- this sets can_manage_ratings = true and the sync trigger then mirrors
-- can_manage_tournaments. On UPDATE OF role the sync trigger does NOT fire
-- (role is not in its column list), so we set both flags directly here.
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
      AND COALESCE(can_manage_ratings, false) = false;
    IF v_missing <> 0 THEN
        RAISE EXCEPTION
            'backfill failed: % coach rows still missing can_manage_ratings',
            v_missing;
    END IF;
END$$;

COMMIT;
