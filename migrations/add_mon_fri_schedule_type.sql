-- ============================================
-- MIGRATION: Add mon_fri Schedule Type (Halyk Arena — Aleksandr Olegovich)
-- Purpose: Extend the schedule_type CHECK constraint on both attendance tables
--          to allow the new 'mon_fri' (Mon–Fri) pattern.
-- Priority: MEDIUM — required before mon_fri attendance/assignments can be saved.
--
-- ⚠️  RUN THIS MANUALLY IN THE SUPABASE SQL EDITOR.
--     It is NOT auto-applied. No data migration is needed — attendance is
--     per-date and nothing retroactive is created.
-- ============================================

-- STEP 1: attendance.schedule_type
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS attendance_schedule_type_check;

ALTER TABLE attendance
ADD CONSTRAINT attendance_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'wed_fri', 'sat_sun', 'mon_fri'));

-- STEP 2: student_time_slot_assignments.schedule_type
ALTER TABLE student_time_slot_assignments
DROP CONSTRAINT IF EXISTS student_time_slot_assignments_schedule_type_check;

ALTER TABLE student_time_slot_assignments
ADD CONSTRAINT student_time_slot_assignments_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'wed_fri', 'sat_sun', 'mon_fri'));

-- STEP 3: Verification
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ mon_fri added to schedule_type constraints';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '   attendance.schedule_type + student_time_slot_assignments.schedule_type';
    RAISE NOTICE '   allowed: mon_wed, mon_wed_fri, tue_thu, wed_fri, sat_sun, mon_fri';
    RAISE NOTICE '';
END $$;

-- ============================================
-- ROLLBACK (if needed) — restore the pre-mon_fri constraint set:
-- ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_schedule_type_check;
-- ALTER TABLE attendance ADD CONSTRAINT attendance_schedule_type_check
--   CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'wed_fri', 'sat_sun'));
-- ALTER TABLE student_time_slot_assignments DROP CONSTRAINT IF EXISTS student_time_slot_assignments_schedule_type_check;
-- ALTER TABLE student_time_slot_assignments ADD CONSTRAINT student_time_slot_assignments_schedule_type_check
--   CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'wed_fri', 'sat_sun'));
-- ============================================
