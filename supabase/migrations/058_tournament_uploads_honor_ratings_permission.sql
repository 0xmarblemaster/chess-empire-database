-- Migration 058: Tournament uploads honor can_manage_ratings permission
-- ====================================================================
-- Problem: tournaments_uploads / tournament_results / rating_uploads RLS
-- requires user_roles.role = 'admin' for INSERT. Coaches granted
-- can_manage_ratings = true (the flag that gates the Ratings Management
-- menu in admin-v2.js) see the UI but hit "violates row-level security
-- policy" when they try to commit any upload.
--
-- Fix: Treat can_manage_ratings and can_manage_tournaments as a single
-- "Ratings Management" permission everywhere.
--   1. Backfill: any row with one of the flags true gets both set true.
--   2. Trigger: future inserts/updates keep the two flags in sync.
--   3. RLS: tournaments_uploads / tournament_results / rating_uploads
--      accept admin OR can_manage_ratings OR can_manage_tournaments.
--
-- The two flags exist for historical reasons (035 added the tournaments
-- flag, later work consolidated the dashboard into Ratings Management).
-- This migration unifies them without dropping either column, so older
-- queries that reference can_manage_tournaments stay working.
-- ====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Backfill — make the two flags equal where either is true
-- ------------------------------------------------------------
UPDATE user_roles
SET can_manage_tournaments = true,
    updated_at = NOW()
WHERE can_manage_ratings = true
  AND COALESCE(can_manage_tournaments, false) = false;

UPDATE user_roles
SET can_manage_ratings = true,
    updated_at = NOW()
WHERE can_manage_tournaments = true
  AND COALESCE(can_manage_ratings, false) = false;

-- ------------------------------------------------------------
-- 2. Sync trigger — keep flags equal on future writes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_ratings_tournaments_permissions()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.can_manage_ratings, false)
           OR COALESCE(NEW.can_manage_tournaments, false) THEN
            NEW.can_manage_ratings := true;
            NEW.can_manage_tournaments := true;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.can_manage_ratings IS DISTINCT FROM OLD.can_manage_ratings THEN
            NEW.can_manage_tournaments := NEW.can_manage_ratings;
        ELSIF NEW.can_manage_tournaments IS DISTINCT FROM OLD.can_manage_tournaments THEN
            NEW.can_manage_ratings := NEW.can_manage_tournaments;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_ratings_tournaments_permissions_trg ON user_roles;
CREATE TRIGGER sync_ratings_tournaments_permissions_trg
    BEFORE INSERT OR UPDATE OF can_manage_ratings, can_manage_tournaments
    ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION sync_ratings_tournaments_permissions();

-- ------------------------------------------------------------
-- 3. RLS expansion — tournaments_uploads
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage tournaments_uploads" ON tournaments_uploads;
DROP POLICY IF EXISTS "Authorized users manage tournaments_uploads" ON tournaments_uploads;
CREATE POLICY "Authorized users manage tournaments_uploads"
    ON tournaments_uploads FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    );

-- ------------------------------------------------------------
-- 4. RLS expansion — tournament_results
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage tournament_results" ON tournament_results;
DROP POLICY IF EXISTS "Authorized users manage tournament_results" ON tournament_results;
CREATE POLICY "Authorized users manage tournament_results"
    ON tournament_results FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    );

-- ------------------------------------------------------------
-- 5. RLS expansion — rating_uploads
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage rating_uploads" ON rating_uploads;
DROP POLICY IF EXISTS "Authorized users manage rating_uploads" ON rating_uploads;
CREATE POLICY "Authorized users manage rating_uploads"
    ON rating_uploads FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
              AND (user_roles.role = 'admin'
                   OR user_roles.can_manage_ratings = true
                   OR user_roles.can_manage_tournaments = true)
        )
    );

-- ------------------------------------------------------------
-- 6. Verification — flags must be in sync, RLS predicates must include both
-- ------------------------------------------------------------
DO $$
DECLARE v_drift INT;
BEGIN
    SELECT COUNT(*) INTO v_drift
    FROM user_roles
    WHERE COALESCE(can_manage_ratings, false) <> COALESCE(can_manage_tournaments, false);
    IF v_drift <> 0 THEN
        RAISE EXCEPTION 'sync failed: % user_roles rows have mismatched flags', v_drift;
    END IF;
END$$;

COMMIT;
