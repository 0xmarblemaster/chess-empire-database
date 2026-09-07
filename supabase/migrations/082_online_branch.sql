-- Migration 082: add virtual "Online" branch (is_online flag)
--
-- CONTEXT (PRD_ONLINE_BRANCH.md, Phase 1)
-- --------------------------------------
-- Introduce a single global "Online" option beside the physical branches so
-- admins can assign online-only students (and offline→online transfers).
-- Chosen architecture: a virtual `branches` row + a new
-- `branches.is_online BOOLEAN NOT NULL DEFAULT FALSE` flag. ~90% of the app
-- keys generically on branch_id/name and works automatically; the flag is the
-- clean hook for attendance exclusion and card cosmetics.
--
-- Online students have NO schedule and are NOT tracked in attendance, so this
-- migration seeds NO time_slots for Online. The branches.location column is
-- NOT NULL, so the row is seeded here (location='Online') rather than via the
-- branch form UI, which requires location/phone/email.
--
-- Add Student hard-fails without a coach assigned to the selected branch, so
-- Aleksandr Olegovich (the only online coach at launch) is seeded into the
-- Online branch via the coach_branches junction (migration 019). He may keep
-- his physical Halyk Arena assignment simultaneously.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Flag column
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Virtual Online branch row (location is NOT NULL → 'Online')
INSERT INTO branches (name, location, is_online)
VALUES ('Online', 'Online', TRUE)
ON CONFLICT (name) DO UPDATE SET is_online = TRUE, location = 'Online';

-- 3. Seed Aleksandr Olegovich into the Online branch via coach_branches.
--    Ids looked up by name at migration time. No-op if the coach is absent.
INSERT INTO coach_branches (coach_id, branch_id)
SELECT c.id, b.id
FROM (SELECT id FROM coaches
      WHERE first_name ILIKE '%aleksandr%' AND last_name ILIKE '%olegovich%'
      LIMIT 1) c
CROSS JOIN (SELECT id FROM branches WHERE name = 'Online' LIMIT 1) b
ON CONFLICT (coach_id, branch_id) DO NOTHING;

COMMIT;

-- ============================================
-- Verification
-- ============================================
DO $$
DECLARE
    v_online_id UUID;
    v_coach_linked BOOLEAN;
    v_slot_count INTEGER;
BEGIN
    SELECT id INTO v_online_id FROM branches WHERE name = 'Online' AND is_online = TRUE;

    SELECT EXISTS (
        SELECT 1 FROM coach_branches cb
        JOIN coaches c ON c.id = cb.coach_id
        WHERE cb.branch_id = v_online_id
          AND c.first_name ILIKE '%aleksandr%' AND c.last_name ILIKE '%olegovich%'
    ) INTO v_coach_linked;

    SELECT COUNT(*) INTO v_slot_count FROM time_slots WHERE branch_id = v_online_id;

    RAISE NOTICE 'Migration 082: Online branch %, Aleksandr linked %, time_slots % (expect present, true, 0)',
        CASE WHEN v_online_id IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END,
        v_coach_linked, v_slot_count;
END $$;
