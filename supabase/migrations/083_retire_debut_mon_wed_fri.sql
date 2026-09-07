-- Migration 083: retire the mon_wed_fri (Pn-Sr-Pt / Mon-Wed-Fri) schedule at Debut
--
-- CONTEXT
-- -------
-- The mon_wed_fri schedule option has been removed from the generic Debut
-- schedule dropdown in admin-v2.js (desktop filter, mobile filter, and the
-- add-student modal). This migration retires the matching time_slots rows so
-- the data layer agrees with the UI: no new students can be routed to a
-- mon_wed_fri slot, and the existing mon_wed_fri slots stop rendering.
--
-- Expected scope: 18 time_slots rows across two Debut coaches. The Azamat
-- coach-specific list (tue_thu + sat_sun) is unaffected — he has no
-- mon_wed_fri slots — so this does not touch his schedule.
--
-- SOFT DELETE ONLY
-- ----------------
-- Uses the same tombstone convention as migration 065: set deleted_at = NOW()
-- on the matching rows. No hard deletes. Fully revertible (see below). Only
-- touches time_slots — attendance records and student rows are left alone.
--
-- The UPDATE is guarded with `deleted_at IS NULL` so it only flips currently
-- active rows and is idempotent (re-running it matches nothing).
--
-- NOTE ON APPLICATION: applied via the service-role key (same pattern as the
-- other recent seed/retire migrations). Kept here as the versioned artifact.
-- File only — Alex reviews and applies.
--
-- REVERT
-- ------
--   UPDATE time_slots ts
--   SET deleted_at = NULL
--   FROM branches b
--   WHERE ts.branch_id = b.id
--     AND (b.name ILIKE '%debut%' OR b.name ILIKE '%дебют%')
--     AND ts.schedule_type = 'mon_wed_fri';

BEGIN;

UPDATE time_slots ts
SET deleted_at = NOW()
FROM branches b
WHERE ts.branch_id = b.id
  AND (b.name ILIKE '%debut%' OR b.name ILIKE '%дебют%')
  AND ts.schedule_type = 'mon_wed_fri'
  AND ts.deleted_at IS NULL;

COMMIT;
