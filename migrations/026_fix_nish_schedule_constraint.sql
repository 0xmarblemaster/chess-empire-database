-- ============================================
-- MIGRATION 026: Fix НИШ Branch Schedule Types
-- Created: 2026-02-11
-- Purpose: 
--   1. Add 'wed_fri' to schedule_type check constraints
--   2. Reassign Assylbek's НИШ students from mon_wed to wed_fri
--      (Arman's students keep mon_wed)
-- Priority: HIGH - Students missing from attendance
-- ============================================

-- STEP 1: Update attendance table CHECK constraint to allow wed_fri
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS attendance_schedule_type_check;

ALTER TABLE attendance
ADD CONSTRAINT attendance_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun', 'wed_fri'));

-- STEP 2: Update student_time_slot_assignments CHECK constraint to allow wed_fri
ALTER TABLE student_time_slot_assignments
DROP CONSTRAINT IF EXISTS student_time_slot_assignments_schedule_type_check;

ALTER TABLE student_time_slot_assignments
ADD CONSTRAINT student_time_slot_assignments_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun', 'wed_fri'));

-- STEP 3: Reassign ONLY Assylbek's НИШ students from mon_wed to wed_fri
-- Assylbek coach_id: 570f7cf9-927f-40f4-9609-1c1ce9e376a9
-- НИШ branch_id: 7a3902d9-ef8c-4807-bcac-36f1ffec00d1
-- Arman's students remain on mon_wed (unchanged)

UPDATE student_time_slot_assignments
SET schedule_type = 'wed_fri', updated_at = NOW()
WHERE schedule_type = 'mon_wed'
AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
AND student_id IN (
    SELECT id FROM students
    WHERE coach_id = '570f7cf9-927f-40f4-9609-1c1ce9e376a9'
    AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
);

-- STEP 4: Verification
DO $$
DECLARE
    v_assylbek_wed_fri INT;
    v_assylbek_mon_wed INT;
    v_arman_mon_wed INT;
BEGIN
    -- Count Assylbek's НИШ students with wed_fri
    SELECT COUNT(*) INTO v_assylbek_wed_fri
    FROM student_time_slot_assignments
    WHERE schedule_type = 'wed_fri'
    AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
    AND student_id IN (
        SELECT id FROM students
        WHERE coach_id = '570f7cf9-927f-40f4-9609-1c1ce9e376a9'
        AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
    );

    -- Count Assylbek's remaining mon_wed (should be 0)
    SELECT COUNT(*) INTO v_assylbek_mon_wed
    FROM student_time_slot_assignments
    WHERE schedule_type = 'mon_wed'
    AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
    AND student_id IN (
        SELECT id FROM students
        WHERE coach_id = '570f7cf9-927f-40f4-9609-1c1ce9e376a9'
        AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
    );

    -- Count Arman's mon_wed (should be unchanged)
    SELECT COUNT(*) INTO v_arman_mon_wed
    FROM student_time_slot_assignments
    WHERE schedule_type = 'mon_wed'
    AND branch_id = '7a3902d9-ef8c-4807-bcac-36f1ffec00d1'
    AND student_id NOT IN (
        SELECT id FROM students
        WHERE coach_id = '570f7cf9-927f-40f4-9609-1c1ce9e376a9'
    );

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 026 Complete: Fix НИШ Schedules';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Assylbek wed_fri assignments: %', v_assylbek_wed_fri;
    RAISE NOTICE '📊 Assylbek remaining mon_wed: % (should be 0)', v_assylbek_mon_wed;
    RAISE NOTICE '📊 Arman mon_wed assignments (unchanged): %', v_arman_mon_wed;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
