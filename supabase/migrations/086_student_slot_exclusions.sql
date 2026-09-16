-- Migration 086: student_slot_exclusions — a hard, final exclusion filter
--
-- WHY
-- ---
-- The soft-hide/shadow scheme (migrations 051/054/061/076/077/085) resolves a
-- delete by writing a "hidden" version row that must shadow the exact row
-- rendering the student. That coupling is fragile: any stale/garbage/duplicate
-- assignment row whose identity the hide did not anticipate can keep a deleted
-- student visible (the resurrection bug). Migration 085 hardens the RPC to hide
-- every known chain, but we want a scheme that CANNOT resurrect a student
-- regardless of what rows exist.
--
-- WHAT
-- ----
-- A dedicated exclusion table. Deleting a student from a slot writes an
-- exclusion row (carrying BOTH the logical id and the physical index). The read
-- path applies exclusions as the FINAL filter, after all dedupe/shadow logic:
-- an excluded student can NEVER render in that slot, no matter what other rows
-- exist. Explicitly re-adding the student to that slot deactivates the row.
--
-- The read path (getTimeSlotAssignments) and the write paths
-- (deleteStudentFromCalendar / re-add) are updated in the same change. Clients
-- FAIL OPEN if this table does not exist yet (they catch the error and skip
-- exclusion handling) so the frontend can deploy before this migration is
-- applied to prod.
--
-- RLS mirrors migration 079: any authenticated user with a user_roles row (the
-- Attendance Dashboard is a shared tool) may read/write exclusions.
--
-- Do NOT apply to production — Alex reviews and applies.

BEGIN;

CREATE TABLE IF NOT EXISTS student_slot_exclusions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL,
  schedule_type   TEXT NOT NULL,
  -- logical_slot_id is the stable slot identity; NULLABLE because legacy rows
  -- and cache-miss deletes may not resolve one. time_slot_index is the physical
  -- slot index. The read path excludes a student from a slot if EITHER matches.
  logical_slot_id UUID,
  time_slot_index INT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID DEFAULT auth.uid()
);

-- One exclusion row per (student, branch, schedule, physical slot). Re-deleting
-- reactivates/refreshes the same row via upsert; re-adding flips active=FALSE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_slot_exclusions_slot
  ON student_slot_exclusions (student_id, branch_id, schedule_type, time_slot_index);

-- Read-path lookup: all active exclusions for a branch+schedule.
CREATE INDEX IF NOT EXISTS idx_student_slot_exclusions_lookup
  ON student_slot_exclusions (branch_id, schedule_type, active);

CREATE INDEX IF NOT EXISTS idx_student_slot_exclusions_logical
  ON student_slot_exclusions (logical_slot_id);

-- ---------------------------------------------------------------------------
-- RLS — mirror migration 079 (any dashboard user may manage exclusions)
-- ---------------------------------------------------------------------------
ALTER TABLE student_slot_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read student slot exclusions" ON student_slot_exclusions;
CREATE POLICY "Anyone can read student slot exclusions"
  ON student_slot_exclusions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Dashboard users manage student slot exclusions" ON student_slot_exclusions;
CREATE POLICY "Dashboard users manage student slot exclusions"
  ON student_slot_exclusions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
  );

COMMENT ON TABLE student_slot_exclusions IS
  'Migration 086: hard exclusion filter for the attendance calendar. A row (active=TRUE) means the student must NEVER render in that (branch, schedule, slot) — applied by getTimeSlotAssignments as the FINAL filter after all dedupe/shadow logic. Deleting a student from a slot writes one (both logical_slot_id and time_slot_index); explicitly re-adding flips active=FALSE. Clients fail open if this table is absent.';

COMMENT ON COLUMN student_slot_exclusions.logical_slot_id IS
  'Stable slot identity of the excluded slot; NULLABLE (legacy / cache-miss deletes). The read path excludes when EITHER this or time_slot_index matches a rendered assignment.';

COMMIT;
