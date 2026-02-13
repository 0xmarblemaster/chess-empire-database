-- Migration 033: Remove duplicate attendance audit trigger from migration 024
-- Migration 031 added a better one (audit_attendance_changes) that includes student names

-- Drop the old generic trigger (from migration 024)
DROP TRIGGER IF EXISTS trg_audit_attendance_changes ON attendance;
DROP FUNCTION IF EXISTS audit_attendance_trigger();

-- Clean up the duplicate test entries
DELETE FROM audit_log 
WHERE entity_type = 'attendance' 
  AND field_name IS NULL 
  AND created_at >= '2026-02-13T16:40:00+00:00';
