-- Migration: Add no_homework status to attendance
-- Date: 2026-03-30
-- Description: Adds "no_homework" as a valid attendance status

-- Drop existing constraint
ALTER TABLE attendance
DROP CONSTRAINT IF EXISTS attendance_status_check;

-- Add new constraint with no_homework status
ALTER TABLE attendance
ADD CONSTRAINT attendance_status_check
CHECK (status IN ('present', 'absent', 'late', 'excused', 'no_homework'));
