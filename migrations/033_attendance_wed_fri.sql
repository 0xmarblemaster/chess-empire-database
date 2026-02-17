-- Migration 033: Add wed_fri to attendance schedule_type constraint + late to status
-- NIS branch uses wed_fri schedule but the CHECK constraint didn't allow it
-- Applied: 2026-02-17

ALTER TABLE attendance DROP CONSTRAINT attendance_schedule_type_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_schedule_type_check 
  CHECK (schedule_type = ANY (ARRAY['mon_wed'::text, 'mon_wed_fri'::text, 'tue_thu'::text, 'wed_fri'::text, 'sat_sun'::text]));

ALTER TABLE attendance DROP CONSTRAINT attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'excused'::text, 'late'::text]));
