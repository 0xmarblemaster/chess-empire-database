-- Migration 081: DB-enforced "students only move via an explicit manual action"
--
-- INCIDENT (2026-09-03) — see specs/no-auto-move-20260903.md
-- ------------------------------------------------------------------
-- Nothing prevented non-manual code paths from re-homing students in
-- student_time_slot_assignments. Migration 079 opened INSERT/UPDATE on this
-- table to any dashboard user, so any buggy client path (e.g. a stale-index
-- re-render writing the wrong slot's id) could silently move students between
-- slots. This migration makes an automatic move IMPOSSIBLE at the database
-- level, independent of which client is talking to it.
--
-- ENFORCEMENT MODEL
-- -----------------
--   1. move_student_slot_manual(...) — the ONE sanctioned write path for a slot
--      reference. SECURITY DEFINER. Moves exactly one student per call, sets the
--      transaction-local sentinel app.manual_slot_move = 'on', hides the student
--      from the source slot (versioned per-slot) and assigns the target slot.
--   2. forbid_auto_student_slot_moves — a BEFORE INSERT OR UPDATE trigger that
--      RAISEs unless the sentinel is set whenever a slot reference
--      (logical_slot_id / time_slot_index) is set (INSERT) or changed (UPDATE).
--      This is the enforcement backbone: BEFORE triggers fire for every
--      non-superuser write, so a direct supabase-js insert/update cannot bypass
--      it (a REST client cannot call set_config, so it can never flip the flag).
--   3. RLS tightening (defense-in-depth) — the permissive migration-079
--      INSERT/UPDATE policy is replaced with policies that additionally require
--      the sentinel, so a direct client write is refused at the RLS layer too.
--      DELETE and SELECT stay open (a removal/unassign is not a move).
--   4. hide_student_versioned is recreated to set the same sentinel — hiding one
--      student from one slot is a genuine, single-student, user-initiated write,
--      and its insert-a-fresh-hidden-row path sets a slot reference. Its body is
--      otherwise identical to migration 077.
--
-- Slot add/edit/delete RPCs (add/edit/delete_time_slot_versioned) are NOT
-- touched and MUST NOT set the sentinel: creating a slot must never write an
-- assignment row.
--
-- Idempotent: CREATE OR REPLACE for functions, DROP ... IF EXISTS before CREATE
-- for the trigger and policies. File only — Alex reviews and applies. Apply
-- AFTER migration 080 (its backfill inserts must land before this guard exists).
-- Read migrations 034 (audit), 076/077 (logical_slot_id + hide), 078, 079.

BEGIN;

-- ============================================================================
-- 1. move_student_slot_manual — the only sanctioned slot-reference write path
-- ============================================================================
-- Mirrors the old client hide-from-source + upsert-to-target flow, but atomic
-- and flag-guarded. p_from_* are NULL for a first-time assignment (the
-- add-to-calendar modal). The target row is written at the 1970-01-01 baseline
-- (applies across all months, same semantic as the prior upsertTimeSlotAssignment);
-- the source hide is versioned from the displayed month (p_effective_from) so
-- past months keep rendering the student where they were.

CREATE OR REPLACE FUNCTION move_student_slot_manual(
  p_student_id UUID,
  p_branch_id UUID,
  p_day_group TEXT,                       -- schedule_type
  p_to_slot_index INT,
  p_to_logical_slot_id UUID DEFAULT NULL, -- NULL for a fallback-mode bucket
  p_from_slot_index INT DEFAULT NULL,     -- NULL for a first-time assignment
  p_from_logical_slot_id UUID DEFAULT NULL,
  p_coach_id UUID DEFAULT NULL,
  p_effective_from DATE DEFAULT NULL      -- displayed month first day (source hide)
) RETURNS student_time_slot_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_month DATE := COALESCE(p_effective_from, date_trunc('month', CURRENT_DATE)::DATE);
  v_new student_time_slot_assignments;
BEGIN
  IF p_student_id IS NULL OR p_branch_id IS NULL OR p_day_group IS NULL
     OR p_to_slot_index IS NULL THEN
    RAISE EXCEPTION 'move_student_slot_manual: p_student_id, p_branch_id, p_day_group and p_to_slot_index are required';
  END IF;

  -- Sanctioned manual path: flip the transaction-local sentinel the guard
  -- trigger and the RLS policies key on. Without this every write below is
  -- rejected. is_local = true -> scoped to this transaction only.
  PERFORM set_config('app.manual_slot_move', 'on', true);

  -- Validate the target slot exists and belongs to this coach/day-group when a
  -- logical id was resolved (DB-mode bucket). Fallback-mode buckets carry no
  -- time_slots rows, so a NULL logical id is keyed positionally and skips this.
  IF p_to_logical_slot_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_slots ts
      WHERE ts.logical_slot_id = p_to_logical_slot_id
        AND ts.branch_id       = p_branch_id
        AND ts.schedule_type   = p_day_group
        AND (p_coach_id IS NULL OR ts.coach_id = p_coach_id)
        AND ts.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'move_student_slot_manual: target slot % not found for this coach/day-group', p_to_logical_slot_id;
    END IF;
  END IF;

  -- 1. Hide from the source slot (versioned per-slot). Skipped for a first-time
  --    assignment (add-to-calendar) where p_from_slot_index is NULL.
  IF p_from_slot_index IS NOT NULL THEN
    PERFORM hide_student_versioned(
      p_student_id, p_branch_id, p_day_group,
      p_from_slot_index, v_month, p_from_logical_slot_id);
  END IF;

  -- 2. Assign to the target slot at the 1970-01-01 baseline. Records the actor
  --    via updated_by (the migration-034 audit trigger also logs the change).
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from,
     hidden, logical_slot_id, updated_by, created_at, updated_at)
  VALUES
    (p_student_id, p_branch_id, p_day_group, p_to_slot_index, DATE '1970-01-01',
     FALSE, p_to_logical_slot_id, v_actor, NOW(), NOW())
  ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from)
  DO UPDATE SET
     hidden          = FALSE,
     logical_slot_id = COALESCE(EXCLUDED.logical_slot_id, student_time_slot_assignments.logical_slot_id),
     updated_by      = v_actor,
     updated_at      = NOW()
  RETURNING * INTO v_new;

  -- 3. Clear any FUTURE per-slot hide rows for the TARGET slot so re-adding a
  --    student does not leave them hidden next month (mirrors the old upsert).
  --    Scoped by the stable logical id when known, else the positional index.
  DELETE FROM student_time_slot_assignments
   WHERE student_id     = p_student_id
     AND branch_id      = p_branch_id
     AND schedule_type  = p_day_group
     AND hidden         = TRUE
     AND effective_from > DATE '1970-01-01'
     AND ( (p_to_logical_slot_id IS NOT NULL AND logical_slot_id = p_to_logical_slot_id)
        OR (p_to_logical_slot_id IS NULL     AND time_slot_index = p_to_slot_index) );

  -- 4. Clear any legacy schedule-wide hide marker (time_slot_index = -1) —
  --    explicitly assigning a slot contradicts "hidden from the whole schedule".
  DELETE FROM student_time_slot_assignments
   WHERE student_id      = p_student_id
     AND branch_id       = p_branch_id
     AND schedule_type   = p_day_group
     AND time_slot_index = -1;

  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION move_student_slot_manual(UUID, UUID, TEXT, INT, UUID, INT, UUID, UUID, DATE) TO authenticated;

COMMENT ON FUNCTION move_student_slot_manual IS
  'Migration 081: the ONLY sanctioned path that may set/change a slot reference in student_time_slot_assignments. Moves exactly one student: sets the app.manual_slot_move sentinel, validates the target slot belongs to the coach/day-group, hides the student from the source slot (versioned per-slot; p_from_* NULL = a first-time assignment) and assigns the target slot at the 1970-01-01 baseline. SECURITY DEFINER. Every other insert/update of a slot reference is rejected by forbid_auto_student_slot_moves.';

-- ============================================================================
-- 2. hide_student_versioned — recreated to set the sentinel
-- ============================================================================
-- Body identical to migration 077, plus a single PERFORM set_config so the
-- standalone hide flow (delete-from-calendar, drag-out) still works under the
-- guard trigger + tightened RLS. Hiding one student from one slot is a genuine
-- user-initiated, single-student write.

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
  -- Migration 081: a hide is a sanctioned single-student write. Flip the
  -- transaction-local sentinel so the no-auto-move guard + RLS permit the
  -- insert-a-fresh-hidden-row path (which sets a slot reference).
  PERFORM set_config('app.manual_slot_move', 'on', true);

  -- Resolution (migration 077): prefer the STABLE logical_slot_id. Match the
  -- latest row for THIS (student, branch, schedule, logical slot) on/before
  -- p_effective_from. Renumber/tombstone-safe.
  IF p_logical_slot_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND logical_slot_id = p_logical_slot_id
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- Fallback (legacy): no logical id given, or no row carries it yet. Match by
  -- positional time_slot_index, but only rows with NO logical identity when a
  -- logical id was requested — never hijack a different slot's logical row.
  IF v_existing.id IS NULL THEN
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND time_slot_index = p_time_slot_index
      AND (p_logical_slot_id IS NULL OR logical_slot_id IS NULL)
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- Migration 054 behavior: no prior version — student renders via
  -- attendance-history inference. Insert a fresh hidden row instead of raising.
  IF v_existing.id IS NULL THEN
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

  -- Later-month edit: insert a new version carrying the same slot identity with
  -- hidden=TRUE. Past months still resolve to the pre-existing row.
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

COMMENT ON FUNCTION hide_student_versioned IS
  'Per-slot versioned hide for student_time_slot_assignments (migrations 061 + 076 + 077 + 081). Resolves the row by the stable logical_slot_id (falling back to positional time_slot_index for legacy NULL rows), updates in place at the same month else inserts a new hidden version, and inserts a fresh hidden row when no prior version exists. Migration 081: sets the app.manual_slot_move sentinel so the no-auto-move guard + RLS permit its slot-reference insert.';

-- ============================================================================
-- 3. forbid_auto_student_slot_moves — the guard trigger (enforcement backbone)
-- ============================================================================

CREATE OR REPLACE FUNCTION forbid_auto_student_slot_moves()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Sanctioned paths (move_student_slot_manual, hide_student_versioned) set the
  -- transaction-local sentinel before writing. A REST client cannot call
  -- set_config, so it can never flip this — direct table writes are refused.
  IF current_setting('app.manual_slot_move', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A new assignment row sets a slot reference. Only a sanctioned path may.
    IF NEW.time_slot_index IS NOT NULL OR NEW.logical_slot_id IS NOT NULL THEN
      RAISE EXCEPTION 'automatic student slot moves are forbidden; use move_student_slot_manual'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Updates that leave the slot reference alone (hide flags, updated_at, …)
    -- pass; only a change to time_slot_index / logical_slot_id is a move.
    IF NEW.time_slot_index IS DISTINCT FROM OLD.time_slot_index
       OR NEW.logical_slot_id IS DISTINCT FROM OLD.logical_slot_id THEN
      RAISE EXCEPTION 'automatic student slot moves are forbidden; use move_student_slot_manual'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END
$$;

-- DELETEs are intentionally NOT guarded: removing a row is not a move (drag-out
-- / unassign flows delete). Unassign that goes through UPDATE flips hidden=TRUE
-- only (no slot-ref change) and passes; a real re-home via UPDATE is blocked.
DROP TRIGGER IF EXISTS trg_forbid_auto_student_slot_moves ON student_time_slot_assignments;
CREATE TRIGGER trg_forbid_auto_student_slot_moves
  BEFORE INSERT OR UPDATE ON student_time_slot_assignments
  FOR EACH ROW EXECUTE FUNCTION forbid_auto_student_slot_moves();

COMMENT ON FUNCTION forbid_auto_student_slot_moves IS
  'Migration 081: BEFORE INSERT OR UPDATE guard on student_time_slot_assignments. Rejects any write that sets (INSERT) or changes (UPDATE) a slot reference (time_slot_index / logical_slot_id) unless the transaction-local app.manual_slot_move sentinel is on (set only by move_student_slot_manual / hide_student_versioned). Slot-reference-preserving updates and all DELETEs pass. This is the enforcement backbone — fires for every non-superuser write, so a direct supabase-js write cannot bypass it.';

-- ============================================================================
-- 4. RLS tightening (defense-in-depth over migration 079)
-- ============================================================================
-- Replace the permissive FOR ALL policy with narrower ones: SELECT stays via
-- the untouched "Anyone can read time slot assignments" policy; DELETE stays
-- open to any dashboard user; INSERT/UPDATE additionally require the sentinel,
-- so a direct client write (which cannot set it) is refused at the RLS layer
-- too. The sanctioned RPCs still work: hide_student_versioned (INVOKER) sets
-- the sentinel before writing; move_student_slot_manual is SECURITY DEFINER.

DROP POLICY IF EXISTS "Dashboard users manage time slot assignments" ON student_time_slot_assignments;

DROP POLICY IF EXISTS "Dashboard users delete time slot assignments" ON student_time_slot_assignments;
CREATE POLICY "Dashboard users delete time slot assignments"
    ON student_time_slot_assignments FOR DELETE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Manual slot assignment inserts" ON student_time_slot_assignments;
CREATE POLICY "Manual slot assignment inserts"
    ON student_time_slot_assignments FOR INSERT
    TO authenticated
    WITH CHECK (
        current_setting('app.manual_slot_move', true) = 'on'
        AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Manual slot assignment updates" ON student_time_slot_assignments;
CREATE POLICY "Manual slot assignment updates"
    ON student_time_slot_assignments FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
    )
    WITH CHECK (
        current_setting('app.manual_slot_move', true) = 'on'
        AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
    );

COMMENT ON POLICY "Manual slot assignment inserts" ON student_time_slot_assignments IS
    'Migration 081: an authenticated dashboard user may INSERT a row only within a transaction that set app.manual_slot_move = ''on'' (i.e. via move_student_slot_manual / hide_student_versioned). A direct supabase-js insert cannot set it, so it is refused here and by the forbid_auto_student_slot_moves trigger. Replaces the permissive migration-079 FOR ALL policy.';

COMMENT ON POLICY "Manual slot assignment updates" ON student_time_slot_assignments IS
    'Migration 081: an authenticated dashboard user may UPDATE a row only within a manual-move transaction (sentinel set). Defense-in-depth over the forbid_auto_student_slot_moves trigger. Replaces the permissive migration-079 FOR ALL policy.';

COMMENT ON POLICY "Dashboard users delete time slot assignments" ON student_time_slot_assignments IS
    'Migration 081: any authenticated user with a user_roles row may DELETE a time slot assignment (a removal/unassign is not a move). Split out from the permissive migration-079 FOR ALL policy.';

COMMIT;
