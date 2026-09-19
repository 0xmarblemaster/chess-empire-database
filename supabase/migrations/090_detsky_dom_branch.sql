-- Migration 090: add "Детский Дом" branch (coach_optional flag)
--
-- CONTEXT (DETSKY_DOM_BRANCH_SPEC.md)
-- --------------------------------------
-- Add a new school branch «Детский Дом» where assigning a Coach is optional in
-- both the Add and Edit student forms. All other branches keep the
-- coach-required behavior unchanged.
--
-- Mirrors the "Online" branch precedent (migration 082_online_branch.sql): a
-- new `branches.coach_optional BOOLEAN NOT NULL DEFAULT FALSE` flag that the
-- app keys on generically, plus a seeded branch row. NO students schema change
-- is needed — students.coach_id is already nullable, so the coach requirement
-- is purely frontend and driven by this flag.
--
-- The branches.location column is NOT NULL, so the row is seeded here
-- (location='Almaty') rather than via the branch form UI. This migration seeds
-- NO time_slots and NO coach_branches rows.
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Flag column
ALTER TABLE branches ADD COLUMN IF NOT EXISTS coach_optional BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Детский Дом branch row (location is NOT NULL → 'Almaty')
INSERT INTO branches (name, location, coach_optional)
VALUES ('Детский Дом', 'Almaty', TRUE)
ON CONFLICT (name) DO UPDATE SET coach_optional = TRUE;

COMMIT;

-- ============================================
-- Verification
-- ============================================
DO $$
DECLARE
    v_branch_id UUID;
    v_coach_optional BOOLEAN;
    v_slot_count INTEGER;
BEGIN
    SELECT id, coach_optional INTO v_branch_id, v_coach_optional
    FROM branches WHERE name = 'Детский Дом';

    SELECT COUNT(*) INTO v_slot_count FROM time_slots WHERE branch_id = v_branch_id;

    RAISE NOTICE 'Migration 090: Детский Дом branch %, coach_optional %, time_slots % (expect present, true, 0)',
        CASE WHEN v_branch_id IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END,
        v_coach_optional, v_slot_count;
END $$;
