-- Migration 045: attendance.time_slot_id — FK to time_slots(id)
--
-- Adds a proper foreign-key column linking attendance rows to the
-- per-coach time_slots row that defined the slot. The existing
-- attendance.time_slot TEXT column is retained as a back-compat safety
-- net; reads continue to use it until a later phase switches over.
--
-- The column is NULLABLE — historical rows that fail to match a slot
-- definition (e.g. orphaned strings after a slot edit) stay NULL.
-- ON DELETE SET NULL ensures deleting a slot definition does NOT
-- cascade-delete the attendance history.
--
-- Backfill of existing rows is performed in migration 046.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS time_slot_id UUID NULL REFERENCES time_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_time_slot_id_idx ON attendance(time_slot_id);
