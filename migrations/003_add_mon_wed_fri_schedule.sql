-- Migration: Add 'mon_wed_fri' schedule type for Debut branch
-- This allows Monday-Wednesday-Friday schedule in addition to the original Monday-Wednesday

-- Update attendance table CHECK constraint
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS attendance_schedule_type_check;

ALTER TABLE attendance
ADD CONSTRAINT attendance_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun'));

-- Update student_time_slot_assignments table CHECK constraint
ALTER TABLE student_time_slot_assignments
DROP CONSTRAINT IF EXISTS student_time_slot_assignments_schedule_type_check;

ALTER TABLE student_time_slot_assignments
ADD CONSTRAINT student_time_slot_assignments_schedule_type_check
CHECK (schedule_type IN ('mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun'));

-- Verify the constraints
SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname LIKE '%schedule_type%'
ORDER BY table_name, constraint_name;
