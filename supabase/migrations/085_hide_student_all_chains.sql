-- Migration 085: hide_student_versioned hides EVERY chain rendering a student
-- in a slot, and backfill logical_slot_id on assignment INSERT
--
-- INCIDENT (2026-09-16, confirmed against prod)
-- ---------------------------------------------------------------------------
-- Student assignment rows come in two identities:
--   * MODERN rows carry a stable logical_slot_id. The read-path dedupe/shadow
--     key is `student|logical_slot_id`.
--   * LEGACY rows have logical_slot_id = NULL (minted when a write hit a cache
--     miss and wrote without a logical id). The read-path shadow key is
--     `student|idx:N` (physical slot index).
--
-- Deletes are soft: a "hidden" version row must shadow the visible row at read
-- time. Since migration 077 the delete path hides ONLY ONE chain — the
-- logical-id chain when a logical id is passed, else a legacy chain by index.
-- When the row actually RENDERING the student is a legacy NULL row keyed idx:N
-- but the delete resolved a logical id, the hide is written against the logical
-- chain, never shadows the idx:N legacy row, and the student resurrects on
-- every refresh.
--
-- Concrete case: "Sabit Alimansur", Halyk branch, mon_wed — slot 4 modern row
-- (logical_slot_id set) and slot 5 legacy NULL row (created Sep 7). The delete
-- wrote a hide keyed to slot 5's logical id, which never shadows the idx:5
-- legacy row.
--
-- Also: migration 077's legacy fallback guard `(p_logical_slot_id IS NULL OR
-- logical_slot_id IS NULL)` is vacuous when p_logical_slot_id IS NULL — it
-- matches ANY row at that index (including modern logical rows and already
-- hidden rows) instead of the legacy row that is actually visible.
--
-- WHAT THIS DOES
-- --------------
--   1. hide_student_chain(...) — private helper that versioned-hides ONE chain
--      (identified by a real logical_slot_id, or NULL + physical index for a
--      legacy chain), preserving that chain's own identity so its hide always
--      shadows its target at read time. p_insert_if_missing controls whether a
--      fresh hidden row is inserted when the chain has no prior version
--      (migration 054 behavior) — used only for the PRIMARY chain.
--   2. hide_student_versioned(...) — same 6-arg signature. Now hides the
--      logical-id chain AND any legacy NULL-logical chain at the physical index
--      in one call, so neither identity can keep the student visible. The
--      legacy-chain lookup is STRICTLY logical_slot_id IS NULL (fixes the
--      vacuous 077 guard).
--   3. A BEFORE INSERT trigger on student_time_slot_assignments that backfills
--      logical_slot_id from the matching time_slots chain (student's coach +
--      schedule + slot_index) when a row is inserted with NULL — so the write
--      path stops minting new legacy rows even if a client forgets to resolve
--      the id.
--
-- All migration 076/077 semantics are preserved: versioned-hide dating,
-- insert-a-fresh-hidden-row when no prior version (054), carry logical_slot_id
-- via COALESCE (never null it), updated_by = auth.uid().
--
-- SECURITY INVOKER (RLS unchanged). Do NOT apply to production — Alex reviews
-- and applies. See migrations 051/054/061/076/077 and the attendance-delete
-- fix task.

BEGIN;

-- ============================================================================
-- 1. Private helper: versioned-hide ONE chain, preserving its identity
-- ============================================================================

CREATE OR REPLACE FUNCTION hide_student_chain(
  p_student_id UUID,
  p_branch_id UUID,
  p_schedule_type TEXT,
  p_time_slot_index INT,
  p_effective_from DATE,
  p_logical_slot_id UUID,
  p_insert_if_missing BOOLEAN
) RETURNS student_time_slot_assignments
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing student_time_slot_assignments;
  v_new student_time_slot_assignments;
  v_empty student_time_slot_assignments;
BEGIN
  -- Migration 081: a hide is a sanctioned single-student write. Flip the
  -- transaction-local sentinel so the no-auto-move guard trigger + tightened
  -- RLS permit the insert/update paths below (they set a slot reference).
  PERFORM set_config('app.manual_slot_move', 'on', true);

  -- Resolve the chain's latest version on/before p_effective_from.
  IF p_logical_slot_id IS NOT NULL THEN
    -- Modern chain: match by the STABLE logical_slot_id (renumber/tombstone
    -- safe). The caller resolved the display position to this logical id.
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND logical_slot_id = p_logical_slot_id
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  ELSE
    -- Legacy chain: STRICTLY logical_slot_id IS NULL at this physical index.
    -- No OR-clause that could match a modern logical row (fixes migration
    -- 077's vacuous fallback guard).
    SELECT * INTO v_existing
    FROM student_time_slot_assignments
    WHERE student_id      = p_student_id
      AND branch_id       = p_branch_id
      AND schedule_type   = p_schedule_type
      AND logical_slot_id IS NULL
      AND time_slot_index = p_time_slot_index
      AND effective_from <= p_effective_from
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- No prior version for this chain.
  IF v_existing.id IS NULL THEN
    -- Only the PRIMARY chain inserts a fresh hidden row (migration 054): a
    -- student may render via attendance-history inference with no assignment
    -- row at all. Secondary/legacy shadow chains never fabricate a row.
    IF NOT p_insert_if_missing THEN
      RETURN v_empty;   -- id IS NULL — nothing to hide for this chain
    END IF;

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

  -- Same-month edit: update in place, carrying this chain's identity.
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

  -- Later-month edit: insert a new version carrying the SAME slot identity
  -- (same logical_slot_id for modern, same NULL + index for legacy) with
  -- hidden=TRUE. Past months still resolve to the pre-existing row.
  -- The version key (student, branch, schedule, index, month) is shared across
  -- chains — another chain may already own this month's row at the same index
  -- (e.g. the modern chain's hide when shadowing a legacy chain). Converge on
  -- that row: mark it hidden and keep its identity (backfilling a legacy NULL
  -- from ours if we have one); the 086 exclusion filter is the render backstop.
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index, effective_from,
     hidden, logical_slot_id, updated_by, created_at, updated_at)
  VALUES
    (v_existing.student_id, v_existing.branch_id, v_existing.schedule_type,
     v_existing.time_slot_index, p_effective_from, TRUE,
     COALESCE(p_logical_slot_id, v_existing.logical_slot_id), auth.uid(),
     v_existing.created_at, NOW())
  ON CONFLICT (student_id, branch_id, schedule_type, time_slot_index, effective_from) DO UPDATE
    SET hidden          = TRUE,
        logical_slot_id = COALESCE(student_time_slot_assignments.logical_slot_id, EXCLUDED.logical_slot_id),
        updated_by      = auth.uid(),
        updated_at      = NOW()
  RETURNING * INTO v_new;
  RETURN v_new;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_chain(UUID, UUID, TEXT, INT, DATE, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- 2. hide_student_versioned — hide ALL chains rendering the student in the slot
-- ============================================================================

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
  v_primary student_time_slot_assignments;
  v_legacy student_time_slot_assignments;
BEGIN
  -- Migration 081 sentinel (transaction-local): sanctioned user-initiated hide.
  PERFORM set_config('app.manual_slot_move', 'on', true);

  IF p_logical_slot_id IS NOT NULL THEN
    -- Primary chain: the logical-id chain. Insert a fresh hidden row if it has
    -- no prior version (migration 054).
    v_primary := hide_student_chain(
      p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
      p_effective_from, p_logical_slot_id, TRUE);

    -- ALSO shadow any pre-existing legacy NULL-logical row at this physical
    -- index. This is the fix: a stale legacy idx:N row renders the student
    -- independently of the logical chain and must be hidden too. Never insert
    -- a fresh legacy row (p_insert_if_missing = FALSE) — only shadow one that
    -- already exists.
    v_legacy := hide_student_chain(
      p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
      p_effective_from, NULL, FALSE);

    -- Return the primary chain's row (guaranteed non-null here); fall back to
    -- the legacy row if somehow the primary produced nothing.
    IF v_primary.id IS NOT NULL THEN
      RETURN v_primary;
    END IF;
    RETURN v_legacy;
  END IF;

  -- No logical id given — pure legacy delete. Hide the legacy chain at the
  -- physical index, inserting a fresh hidden row if none exists (054).
  v_legacy := hide_student_chain(
    p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
    p_effective_from, NULL, TRUE);
  RETURN v_legacy;
END
$$;

GRANT EXECUTE ON FUNCTION hide_student_versioned(UUID, UUID, TEXT, INT, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION hide_student_chain IS
  'Migration 085 helper: versioned-hide ONE assignment chain, preserving its identity (a real logical_slot_id, or NULL + physical index for a legacy chain). p_insert_if_missing inserts a fresh hidden row when the chain has no prior version (migration 054); pass FALSE for secondary shadow chains so they never fabricate a row.';

COMMENT ON FUNCTION hide_student_versioned IS
  'Per-slot versioned hide (migrations 061 + 076 + 077 + 085). Hides EVERY chain that renders the student in the slot: the logical-id chain (when p_logical_slot_id is given) AND any legacy NULL-logical row at the physical index. The legacy lookup is STRICTLY logical_slot_id IS NULL (fixes 077''s vacuous fallback guard). Preserves each chain''s identity so its hide always shadows its target at read time; carries logical_slot_id via COALESCE; updated_by = auth.uid().';

-- ============================================================================
-- 3. Backfill logical_slot_id on assignment INSERT (write path never mints
--    new legacy rows)
-- ============================================================================
-- When a row is inserted with logical_slot_id NULL and a real slot index,
-- resolve the matching time_slots chain (student's coach + schedule + index)
-- and fill logical_slot_id. Mirrors the migration 076 backfill, at write time.
-- Legacy -1 schedule-wide hides (time_slot_index < 0) carry no slot identity
-- and are left untouched. A row that resolves to no slot stays NULL (no error).

CREATE OR REPLACE FUNCTION backfill_assignment_logical_slot_id()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_lsid UUID;
BEGIN
  IF NEW.logical_slot_id IS NULL AND NEW.time_slot_index >= 0 THEN
    SELECT ts.logical_slot_id INTO v_lsid
    FROM time_slots ts
    JOIN students s ON s.id = NEW.student_id
    WHERE ts.branch_id     = NEW.branch_id
      AND ts.coach_id      = s.coach_id
      AND ts.schedule_type = NEW.schedule_type
      AND ts.slot_index    = NEW.time_slot_index
    ORDER BY ts.effective_from DESC
    LIMIT 1;

    IF v_lsid IS NOT NULL THEN
      NEW.logical_slot_id := v_lsid;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_backfill_assignment_logical_slot_id ON student_time_slot_assignments;

CREATE TRIGGER trg_backfill_assignment_logical_slot_id
  BEFORE INSERT ON student_time_slot_assignments
  FOR EACH ROW
  EXECUTE FUNCTION backfill_assignment_logical_slot_id();

COMMENT ON FUNCTION backfill_assignment_logical_slot_id IS
  'Migration 085: BEFORE INSERT trigger fn — backfills student_time_slot_assignments.logical_slot_id from the matching time_slots chain (student coach + schedule + slot_index) when a row is inserted with NULL and a real slot index. Stops the write path from minting new legacy NULL-logical rows. Rows that resolve to no slot stay NULL (no error); legacy -1 hides are untouched.';

COMMIT;
