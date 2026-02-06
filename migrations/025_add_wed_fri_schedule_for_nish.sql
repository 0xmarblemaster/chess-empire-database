-- ============================================
-- MIGRATION 025: Add Wed-Fri Schedule for НИШ Branch
-- Created: 2026-02-06
-- Purpose: Replace Mon-Wed with Wed-Fri schedule for НИШ branch
-- Priority: MEDIUM - Schedule change for specific branch
-- ============================================

-- STEP 1: Create backup tables
CREATE TABLE IF NOT EXISTS attendance_backup AS
SELECT * FROM attendance;

CREATE TABLE IF NOT EXISTS student_time_slot_assignments_backup AS
SELECT * FROM student_time_slot_assignments;

-- STEP 2: Update attendance table CHECK constraint
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS attendance_schedule_type_check;

ALTER TABLE attendance
ADD CONSTRAINT attendance_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun', 'wed_fri'));

-- STEP 3: Update student_time_slot_assignments CHECK constraint
ALTER TABLE student_time_slot_assignments
DROP CONSTRAINT IF EXISTS student_time_slot_assignments_schedule_type_check;

ALTER TABLE student_time_slot_assignments
ADD CONSTRAINT student_time_slot_assignments_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun', 'wed_fri'));

-- STEP 4: Migrate НИШ branch attendance records from mon_wed to wed_fri
UPDATE attendance
SET schedule_type = 'wed_fri', updated_at = NOW()
WHERE schedule_type = 'mon_wed'
AND branch_id IN (
    SELECT id FROM branches
    WHERE name ILIKE '%НИШ%' OR name ILIKE '%NISH%'
);

-- STEP 5: Migrate НИШ branch student time slot assignments from mon_wed to wed_fri
UPDATE student_time_slot_assignments
SET schedule_type = 'wed_fri', updated_at = NOW()
WHERE schedule_type = 'mon_wed'
AND branch_id IN (
    SELECT id FROM branches
    WHERE name ILIKE '%НИШ%' OR name ILIKE '%NISH%'
);

-- STEP 6: Verification
DO $$
DECLARE
    v_nish_branch_id UUID;
    v_attendance_migrated INT;
    v_assignments_migrated INT;
    v_backup_attendance_count INT;
    v_backup_assignments_count INT;
BEGIN
    -- Get НИШ branch ID
    SELECT id INTO v_nish_branch_id
    FROM branches
    WHERE name ILIKE '%НИШ%' OR name ILIKE '%NISH%'
    LIMIT 1;

    -- Count migrated records
    SELECT COUNT(*) INTO v_attendance_migrated
    FROM attendance
    WHERE schedule_type = 'wed_fri'
    AND branch_id = v_nish_branch_id;

    SELECT COUNT(*) INTO v_assignments_migrated
    FROM student_time_slot_assignments
    WHERE schedule_type = 'wed_fri'
    AND branch_id = v_nish_branch_id;

    -- Count backup records
    SELECT COUNT(*) INTO v_backup_attendance_count FROM attendance_backup;
    SELECT COUNT(*) INTO v_backup_assignments_count FROM student_time_slot_assignments_backup;

    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Migration 025 Complete: Wed-Fri Schedule for НИШ';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 НИШ branch ID: %', v_nish_branch_id;
    RAISE NOTICE '📊 Attendance records migrated to wed_fri: %', v_attendance_migrated;
    RAISE NOTICE '📊 Time slot assignments migrated to wed_fri: %', v_assignments_migrated;
    RAISE NOTICE '📊 Backup: attendance_backup (% records)', v_backup_attendance_count;
    RAISE NOTICE '📊 Backup: student_time_slot_assignments_backup (% records)', v_backup_assignments_count;
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Changes:';
    RAISE NOTICE '   - Added wed_fri to schedule type constraints';
    RAISE NOTICE '   - Migrated НИШ branch mon_wed → wed_fri';
    RAISE NOTICE '   - Created backup tables for safety';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 Next steps:';
    RAISE NOTICE '   1. Update frontend dropdown logic (admin.js)';
    RAISE NOTICE '   2. Add wed_fri translations (i18n.js)';
    RAISE NOTICE '   3. Test НИШ branch attendance page';
    RAISE NOTICE '   4. Verify other branches unchanged';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '';

    IF v_nish_branch_id IS NULL THEN
        RAISE WARNING 'НИШ branch not found! Check branch name in database.';
    END IF;
END $$;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- To revert changes:
-- UPDATE attendance
-- SET schedule_type = 'mon_wed', updated_at = NOW()
-- WHERE schedule_type = 'wed_fri'
-- AND branch_id IN (SELECT id FROM branches WHERE name ILIKE '%НИШ%');

-- UPDATE student_time_slot_assignments
-- SET schedule_type = 'mon_wed', updated_at = NOW()
-- WHERE schedule_type = 'wed_fri'
-- AND branch_id IN (SELECT id FROM branches WHERE name ILIKE '%НИШ%');

-- DROP TABLE IF EXISTS attendance_backup;
-- DROP TABLE IF EXISTS student_time_slot_assignments_backup;
