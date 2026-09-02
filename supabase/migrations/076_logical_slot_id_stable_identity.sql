-- Migration 076: stable logical slot identity for assignments & attendance
--
-- INCIDENT (2026-09-02)
-- ---------------------
-- `student_time_slot_assignments` references slots by positional
-- `time_slot_index`, and `attendance` references them by time string
-- (`time_slot` like '11:00-12:00'). Both are unstable: the versioned
-- `time_slots` RPCs (migrations 049/065) insert a NEW row (new `id`) per
-- month-version, and a schedule restructure renumbers/re-times/tombstones
-- slots. When that happens, existing assignments silently point at the
-- wrong or a nonexistent slot. On 2026-09-02 a restructure of Zhandosova
-- mon_wed orphaned 22 assignments (indexes 0/2/3 tombstoned, index 7 never
-- existed) and detached an attendance mark from its group. The data was
-- repaired separately; this migration is the STRUCTURAL fix.
--
-- KEY CONSTRAINT
-- --------------
-- `time_slots.id` is per-version, NOT stable — you cannot key assignments to
-- it. This migration introduces a `logical_slot_id` that is stable across the
-- version chain of a (branch_id, coach_id, schedule_type, slot_index) slot.
--
-- WHAT THIS DOES
-- --------------
--   1. time_slots.logical_slot_id UUID — one value per version chain.
--      Backfilled so every existing version of the same
--      (branch, coach, schedule, slot_index) chain shares one UUID; a
--      DEFAULT gen_random_uuid() mints a fresh id for future slot CREATION
--      (seed migrations), while the edit/delete RPCs explicitly carry the
--      existing chain's id onto the new version rows they insert.
--   2. edit_time_slot_versioned / delete_time_slot_versioned — carry
--      logical_slot_id onto inserted versions and set updated_by = auth.uid()
--      (attribution — see the Rules in PRD_SLOT_STABLE_ID.md).
--   3. student_time_slot_assignments.logical_slot_id UUID (nullable) —
--      backfilled by resolving (branch_id, schedule_type, time_slot_index)
--      plus the student's coach to the matching time_slots chain. Rows that
--      resolve to nothing (e.g. Zhandosova mon_wed idx 7, or legacy -1
--      schedule-wide hides) stay NULL and are logged as NOTICEs, never
--      deleted. Also adds updated_by for attribution.
--   4. hide_student_versioned — accepts/carries p_logical_slot_id and sets
--      updated_by = auth.uid().
--   5. attendance.time_slot_id — was an FK to time_slots(id); the FK is
--      dropped so the column can hold the STABLE logical_slot_id instead.
--      The frontend starts populating it with logical_slot_id on new marks
--      while continuing to write the legacy time_slot string. Existing rows
--      are left as-is (Alex reviews before applying; no attendance backfill).
--
-- RLS is not touched: the versioned RPCs are SECURITY INVOKER and the
-- existing time_slots / student_time_slot_assignments policies key on
-- coach/admin role, which is invariant across versions. New columns are
-- covered by the existing row-level policies (no column-level RLS in use).
--
-- Read migrations 049, 051, 054, 061, 065 for the versioning semantics this
-- migration preserves. Do NOT apply to production — Alex reviews and applies.

BEGIN;

-- ============================================================================
-- 1. time_slots.logical_slot_id — stable identity across the version chain
-- ============================================================================

ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS logical_slot_id UUID;

-- Backfill: every version row of the same (branch, coach, schedule,
-- slot_index) chain gets ONE freshly minted UUID. Minting per-chain (not
-- per-row) is what makes the id stable across effective_from versions. Only
-- fills rows that are still NULL, so re-running is a no-op.
WITH chains AS (
  SELECT DISTINCT branch_id, coach_id, schedule_type, slot_index
  FROM time_slots
),
minted AS (
  SELECT branch_id, coach_id, schedule_type, slot_index, gen_random_uuid() AS lsid
  FROM chains
)
UPDATE time_slots ts
SET logical_slot_id = m.lsid
FROM minted m
WHERE ts.branch_id     = m.branch_id
  AND ts.coach_id      = m.coach_id
  AND ts.schedule_type = m.schedule_type
  AND ts.slot_index    = m.slot_index
  AND ts.logical_slot_id IS NULL;

-- Future slot CREATION (seed migrations / any direct INSERT that does not
-- specify logical_slot_id) mints a fresh chain id automatically. The
-- edit/delete RPCs below always pass the existing chain id explicitly, so the
-- default never fires for a new version of an existing slot.
ALTER TABLE time_slots
  ALTER COLUMN logical_slot_id SET DEFAULT gen_random_uuid();

-- Backfill covered every row (each row matches its own chain), so this is
-- safe. Enforcing NOT NULL guarantees every slot always carries an identity.
ALTER TABLE time_slots
  ALTER COLUMN logical_slot_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_time_slots_logical_slot_id
  ON time_slots (logical_slot_id);

-- ============================================================================
-- 2. edit_time_slot_versioned / delete_time_slot_versioned — carry the id
-- ============================================================================

CREATE OR REPLACE FUNCTION edit_time_slot_versioned(
  p_slot_id UUID,
  p_start TIME,
  p_end TIME,
  p_label TEXT,
  p_effective_from DATE
) RETURNS time_slots
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing time_slots;
  v_new time_slots;
BEGIN
  SELECT * INTO v_existing FROM time_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_slot % not found', p_slot_id;
  END IF;

  IF v_existing.effective_from = p_effective_from THEN
    UPDATE time_slots
    SET start_time = p_start,
        end_time   = p_end,
        label      = p_label,
        updated_at = NOW(),
        updated_by = auth.uid()
    WHERE id = p_slot_id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- New month version — carry the SAME logical_slot_id so assignments and
  -- attendance keyed to it survive the re-timing.
  INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                          start_time, end_time, label, effective_from,
                          logical_slot_id, updated_by)
  VALUES (v_existing.branch_id, v_existing.coach_id, v_existing.schedule_type,
          v_existing.slot_index, p_start, p_end, p_label, p_effective_from,
          v_existing.logical_slot_id, auth.uid())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION edit_time_slot_versioned(UUID, TIME, TIME, TEXT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION delete_time_slot_versioned(
  p_slot_id UUID,
  p_effective_from DATE
) RETURNS time_slots
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing time_slots;
  v_new time_slots;
BEGIN
  SELECT * INTO v_existing FROM time_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'time_slot % not found', p_slot_id;
  END IF;

  IF v_existing.effective_from = p_effective_from THEN
    UPDATE time_slots
    SET deleted_at = NOW(),
        updated_at = NOW(),
        updated_by = auth.uid()
    WHERE id = p_slot_id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Tombstone version — carry the SAME logical_slot_id so the chain's
  -- identity is preserved even while it is soft-deleted for this month.
  INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
                          start_time, end_time, label, effective_from,
                          deleted_at, logical_slot_id, updated_by)
  VALUES (v_existing.branch_id, v_existing.coach_id, v_existing.schedule_type,
          v_existing.slot_index, v_existing.start_time, v_existing.end_time,
          v_existing.label, p_effective_from, NOW(),
          v_existing.logical_slot_id, auth.uid())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION delete_time_slot_versioned(UUID, DATE) TO authenticated;

-- ============================================================================
-- 3. student_time_slot_assignments.logical_slot_id + updated_by
-- ============================================================================

ALTER TABLE student_time_slot_assignments
  ADD COLUMN IF NOT EXISTS logical_slot_id UUID;

ALTER TABLE student_time_slot_assignments
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Backfill: resolve each assignment's (branch_id, schedule_type,
-- time_slot_index) plus the student's coach to the matching time_slots chain
-- and copy its logical_slot_id. All versions of a chain share one
-- logical_slot_id, so any matching time_slots row yields the same value.
--
-- students.coach_id is the coach link (same linkage migration 046 used for
-- attendance). Legacy -1 schedule-wide hide rows carry no slot identity and
-- are intentionally excluded (time_slot_index >= 0), staying NULL.
UPDATE student_time_slot_assignments a
SET logical_slot_id = ts.logical_slot_id
FROM students s, time_slots ts
WHERE a.student_id      = s.id
  AND a.branch_id       = ts.branch_id
  AND s.coach_id        = ts.coach_id
  AND a.schedule_type   = ts.schedule_type
  AND a.time_slot_index = ts.slot_index
  AND a.time_slot_index >= 0
  AND a.logical_slot_id IS NULL;

-- Log (do NOT delete) assignment rows that could not be resolved to a slot —
-- e.g. Zhandosova mon_wed idx 7 which never had a matching time_slots chain.
-- Legacy -1 hide rows are reported separately so the real orphans stand out.
DO $$
DECLARE
  v_orphans INT;
  v_legacy_hides INT;
BEGIN
  SELECT COUNT(*) INTO v_orphans
  FROM student_time_slot_assignments
  WHERE time_slot_index >= 0 AND logical_slot_id IS NULL;

  SELECT COUNT(*) INTO v_legacy_hides
  FROM student_time_slot_assignments
  WHERE time_slot_index = -1;

  RAISE NOTICE '[076] % assignment row(s) with a real slot index did not resolve to a time_slots chain (left NULL, not deleted).', v_orphans;
  RAISE NOTICE '[076] % legacy schedule-wide hide row(s) (time_slot_index = -1) intentionally left with NULL logical_slot_id.', v_legacy_hides;
END
$$;

CREATE INDEX IF NOT EXISTS idx_student_time_slot_assignments_logical_slot_id
  ON student_time_slot_assignments (logical_slot_id);

-- ============================================================================
-- 4. hide_student_versioned — accept/carry logical_slot_id + updated_by
-- ============================================================================
-- Drop the migration-061 5-arg version first so exactly one overload exists;
-- the new 6-arg version defaults p_logical_slot_id to NULL so any caller that
-- has not been updated yet still works (row keeps its backfilled value).

DROP FUNCTION IF EXISTS hide_student_versioned(UUID, UUID, TEXT, INT, DATE);

CREATE OR REPLACE FUNCTION hide_student_versioned(
  p_student_id UUID,
  p_branch_id UUID,
  p_schedule_type TEXT,
  p_time_slot_index INT,
  p_effective_from DATE,
  p_logical_slot_id UUID DEFAULT NULL
) RETURNS student_time_slot_assignments
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing student_time_slot_assignments;
  v_new student_time_slot_assignments;
BEGIN
  -- Per-slot resolution (migration 061): latest row for THIS
  -- (student, branch, schedule, slot) tuple on/before p_effective_from.
  SELECT * INTO v_existing
  FROM student_time_slot_assignments
  WHERE student_id      = p_student_id
    AND branch_id       = p_branch_id
    AND schedule_type   = p_schedule_type
    AND time_slot_index = p_time_slot_index
    AND effective_from <= p_effective_from
  ORDER BY effective_from DESC
  LIMIT 1;

  -- Migration 054 behavior: no prior version — student renders via
  -- attendance-history inference. Insert a fresh hidden row instead of raising.
  IF NOT FOUND THEN
    INSERT INTO student_time_slot_assignments
      (student_id, branch_id, schedule_type, time_slot_index, effective_from,
       hidden, logical_slot_id, updated_by, created_at, updated_at)
    VALUES
      (p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from,
       TRUE, p_logical_slot_id, auth.uid(), NOW(), NOW())
    ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO UPDATE
      SET hidden          = TRUE,
          logical_slot_id = COALESCE(EXCLUDED.logical_slot_id, student_time_slot_assignments.logical_slot_id),
          updated_by      = auth.uid(),
          updated_at      = NOW()
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Same-month edit: update in place.
  IF v_existing.effective_from = p_effective_from THEN
    UPDATE student_time_slot_assignments
    SET hidden          = TRUE,
        logical_slot_id = COALESCE(p_logical_slot_id, logical_slot_id),
        updated_by      = auth.uid(),
        updated_at      = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
    RETURN v_new;
  END IF;

  -- Later-month edit: insert a new version carrying the same slot identity
  -- with hidden=TRUE. Past months still resolve to the pre-existing row.
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from,
     hidden, logical_slot_id, updated_by, created_at, updated_at)
  VALUES
    (v_existing.student_id, v_existing.branch_id, v_existing.schedule_type,
     v_existing.time_slot_index, p_effective_from, TRUE,
     COALESCE(p_logical_slot_id, v_existing.logical_slot_id), auth.uid(),
     v_existing.created_at, NOW())
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_versioned(UUID, UUID, TEXT, INT, DATE, UUID) TO authenticated;

-- ============================================================================
-- 5. attendance.time_slot_id — repurpose to hold the stable logical_slot_id
-- ============================================================================
-- Was: FK to time_slots(id) (migration 045). time_slots(id) is per-version,
-- so it is the wrong thing to key an attendance mark to. Drop the FK so the
-- column can hold logical_slot_id, which is stable across versions.
-- logical_slot_id is not unique on time_slots (one value per version chain),
-- so no replacement FK is possible; the column becomes a plain stable pointer.
-- Existing values are left as-is; the frontend writes logical_slot_id on new
-- marks going forward (keeping the legacy time_slot string in parallel).

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_time_slot_id_fkey;

-- ============================================================================
-- Column / function documentation
-- ============================================================================

COMMENT ON COLUMN time_slots.logical_slot_id IS
  'Stable identity for a slot across its effective_from version chain. All versions of the same (branch, coach, schedule, slot_index) chain share one value; slot creation mints a fresh one (column DEFAULT); edit/delete_time_slot_versioned carry the existing one onto new versions. Assignments and attendance key to this instead of the per-version id or the positional slot_index (migration 076).';

COMMENT ON COLUMN student_time_slot_assignments.logical_slot_id IS
  'Stable pointer to the time_slots chain this assignment belongs to (migration 076). Backfilled from (branch, student.coach, schedule, time_slot_index); NULL for rows that resolved to no slot and for legacy time_slot_index = -1 schedule-wide hides. The read path prefers this over the positional time_slot_index so renumbering/re-timing slots does not re-home students; time_slot_index remains as display-order fallback for NULL rows.';

COMMENT ON COLUMN student_time_slot_assignments.updated_by IS
  'auth.uid() of the actor who last wrote this row via hide_student_versioned. Added in migration 076 for incident attribution.';

COMMENT ON COLUMN attendance.time_slot_id IS
  'Stable logical_slot_id of the slot this mark belongs to (migration 076). No longer an FK to time_slots(id) — that id is per-version. Populated on new marks alongside the legacy time_slot string.';

COMMENT ON FUNCTION hide_student_versioned IS
  'Per-slot versioned hide for student_time_slot_assignments (migrations 061 + 076). Resolves the current row for (student, branch, schedule, slot=p_time_slot_index) on p_effective_from; updates in place at the same month, else inserts a new version carrying the same slot identity with hidden=TRUE. Now also carries p_logical_slot_id (stable slot identity) and sets updated_by = auth.uid(). p_logical_slot_id defaults NULL so pre-076 callers keep working.';

COMMIT;
