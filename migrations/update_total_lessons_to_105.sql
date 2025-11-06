-- Migration: Update total_lessons from 40 to 105
-- Date: 2025-01-06
-- Description: Updates all existing students to have total_lessons = 105 instead of 40
--              This allows the course to accommodate the full 105 lessons.

-- Step 1: Update the default value for new students
ALTER TABLE students
ALTER COLUMN total_lessons SET DEFAULT 105;

-- Step 2: Update all existing students who have total_lessons = 40
UPDATE students
SET total_lessons = 105
WHERE total_lessons = 40;

-- Verification query (run separately to check results)
-- SELECT
--     COUNT(*) as total_students,
--     COUNT(CASE WHEN total_lessons = 105 THEN 1 END) as with_105_lessons,
--     MIN(total_lessons) as min_lessons,
--     MAX(total_lessons) as max_lessons
-- FROM students;
