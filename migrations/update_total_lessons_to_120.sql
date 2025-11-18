-- Migration: Update total_lessons from 105 to 120
-- Date: 2025-11-18
-- Description: Updates all existing students to have total_lessons = 120 instead of 105

-- Step 1: Update the default value for new students
ALTER TABLE students
ALTER COLUMN total_lessons SET DEFAULT 120;

-- Step 2: Update all existing students who have total_lessons = 105
UPDATE students
SET total_lessons = 120
WHERE total_lessons = 105;

-- Step 3: Verification query (uncomment to check results)
-- SELECT
--     COUNT(*) as total_students,
--     COUNT(CASE WHEN total_lessons = 120 THEN 1 END) as with_120_lessons,
--     MIN(total_lessons) as min_lessons,
--     MAX(total_lessons) as max_lessons
-- FROM students;
