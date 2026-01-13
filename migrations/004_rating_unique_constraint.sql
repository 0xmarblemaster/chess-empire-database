-- ============================================
-- STUDENT RATINGS UNIQUE CONSTRAINT MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Purpose: Prevent multiple ratings per student per day
-- This allows the app to use UPSERT for rating updates

-- Step 1: Remove any same-day duplicates (keep the latest by id)
-- This ensures no constraint violations when adding the unique constraint
DELETE FROM student_ratings a
USING student_ratings b
WHERE a.student_id = b.student_id
  AND a.rating_date = b.rating_date
  AND a.id < b.id;

-- Step 2: Add unique constraint on (student_id, rating_date)
-- This enables the UPSERT functionality in the app
ALTER TABLE student_ratings
ADD CONSTRAINT unique_student_rating_per_day
UNIQUE (student_id, rating_date);

-- Success message
SELECT 'Unique constraint added successfully! Students can now have one rating per day.' as result;
