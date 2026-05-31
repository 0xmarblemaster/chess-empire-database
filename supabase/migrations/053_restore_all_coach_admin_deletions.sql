-- Migration 053: restore historical visibility/attendance for all non-Berik
-- coach and admin deletions.
--
-- This is the universal follow-up to migration 052 (Berik-only). Migration
-- 051's `effective_from` versioning and `hide_student_versioned()` RPC plus
-- the (student_id, branch_id, schedule_type, effective_from) UNIQUE
-- constraint are the schema this migration depends on.
--
-- Pre-fix behaviour: `deleteStudentFromCalendar` in admin-v2.js wiped
-- attendance globally and flipped `student_time_slot_assignments.time_slot_index`
-- to -1 in place. Every click retroactively scrubbed past months. Every
-- changer who used the action hit students in months prior to the click
-- month — that is the bucket this migration restores.
--
-- Scope (excluding Berik, restored by 052):
--   Block A  Reverse hide events still currently at slot=-1
--            68 events / 68 distinct (student, branch, schedule) tuples.
--            Manually-reassigned (8) and assignment-row-deleted (4) cases
--            are no-ops by construction (UPDATE filter + ON CONFLICT).
--
--   Block B  Restore knock-on attendance rows for students still in DB.
--            693 rows. (branch, schedule_type) derived from each student's
--            surviving attendance within +/-90 days; falls back to the
--            student's overall dominant pairing, then to their current
--            student_time_slot_assignments row, then to (students.branch_id,
--            DOW-derived schedule). All restored rows carry
--            notes = 'restored from audit_log on 2026-05-31 - coach/admin knock-on'.
--
--   Block C  Create ghost students for hard-deleted orphans whose
--            attendance was wiped pre-June. 33 students (Alseit Malik is
--            skipped: their primary deleter has no coach record, so we
--            cannot resolve a branch). Ghost ids are md5(name)::uuid so
--            re-runs are idempotent. status='left',
--            parent_name='[ghost: restored from audit_log 2026-05-31]'.
--
--   Block D  Restore 352 orphan knock-on attendance rows pointing at the
--            ghosts created in Block C. 11 rows (Alseit Malik) are skipped.
--            branch_id = primary changer's coach.branch_id.
--            schedule_type = DOW-derived (sat_sun / mon_wed / tue_thu).
--            notes = 'restored from audit_log on 2026-05-31 - orphan ghost'.
--
-- Idempotency:
--   * Block A UPDATE is gated on (effective_from='1970-01-01' AND time_slot_index=-1);
--     re-runs no-op. Block A INSERT is gated on the migration 051 UNIQUE.
--   * Blocks B and D use ON CONFLICT DO NOTHING (covers (id) and the
--     unique (student_id, attendance_date, schedule_type, time_slot)).
--   * Block C uses ON CONFLICT (id) DO NOTHING with deterministic md5 ids.
--
-- Reversibility:
--   DELETE FROM attendance
--     WHERE notes IN (
--       'restored from audit_log on 2026-05-31 - coach/admin knock-on',
--       'restored from audit_log on 2026-05-31 - orphan ghost');
--   DELETE FROM students
--     WHERE parent_name = '[ghost: restored from audit_log 2026-05-31]';
--   (Block A is reversed by undoing 052's pattern but scoped to the
--   non-Berik audit_log rows; see ops/coach-admin-restoration-20260531.md.)
--
-- See ops/coach-admin-restoration-20260531.md for the full per-changer table.

BEGIN;

-- ============================================================
-- Block A: 68 non-Berik hide reversals (still currently slot=-1)
-- ============================================================
--
-- UPDATE must precede INSERT to free the unique-constraint slot at
-- effective_from='1970-01-01' for the new baseline row.

WITH hide_events AS (
  SELECT
    al.entity_id,
    regexp_replace(al.old_value, '^.* \| slot ', '')::INT AS prior_slot,
    date_trunc('month', al.changed_at)::DATE             AS click_month
  FROM audit_log al
  WHERE al.entity_type = 'time_slots'
    AND al.field_name  = 'time_slot_index'
    AND al.new_value LIKE '% | slot -1'
    AND al.changed_by  <> 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
)
UPDATE student_time_slot_assignments s
SET effective_from = e.click_month,
    updated_at     = NOW()
FROM hide_events e
WHERE s.id = e.entity_id
  AND s.effective_from   = DATE '1970-01-01'
  AND s.time_slot_index  = -1;

INSERT INTO student_time_slot_assignments
  (student_id, branch_id, schedule_type, time_slot_index, effective_from, created_at, updated_at)
SELECT
  s.student_id, s.branch_id, s.schedule_type,
  regexp_replace(al.old_value, '^.* \| slot ', '')::INT,
  DATE '1970-01-01',
  s.created_at, NOW()
FROM audit_log al
JOIN student_time_slot_assignments s ON s.id = al.entity_id
WHERE al.entity_type = 'time_slots'
  AND al.field_name  = 'time_slot_index'
  AND al.new_value LIKE '% | slot -1'
  AND al.changed_by  <> 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
ON CONFLICT (student_id, branch_id, schedule_type, effective_from) DO NOTHING;

-- ============================================================
-- Block B: restore knock-on attendance for students still in DB
-- ============================================================

WITH knockon_with_name AS (
  SELECT
    al.entity_id AS att_id,
    al.changed_by,
    al.changed_at,
    COALESCE(
      NULLIF(split_part(al.old_value, ' | ', 1), ''),
      (SELECT split_part(al2.new_value, ' | ', 1)
       FROM audit_log al2
       WHERE al2.entity_type = 'attendance'
         AND al2.action      = 'CREATE'
         AND al2.entity_id   = al.entity_id
       LIMIT 1)
    )                                                 AS student_name,
    split_part(al.old_value, ' | ', 2)                AS status,
    NULLIF(split_part(al.old_value, ' | ', 3), '')::date AS att_date
  FROM audit_log al
  WHERE al.entity_type = 'attendance'
    AND al.action      = 'DELETE'
    AND al.changed_by  <> 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
),
filtered AS (
  SELECT k.*, s.id AS student_id, s.branch_id AS student_branch
  FROM knockon_with_name k
  JOIN students s ON (s.first_name || ' ' || s.last_name) = k.student_name
  WHERE k.att_date IS NOT NULL
    AND k.att_date < date_trunc('month', k.changed_at)::date
    AND k.student_name IS NOT NULL
),
resolved AS (
  SELECT
    f.*,
    COALESCE(
      (SELECT (att.branch_id::text || '|' || att.schedule_type)
         FROM attendance att
         WHERE att.student_id = f.student_id
           AND att.attendance_date BETWEEN f.att_date - 90 AND f.att_date + 90
         GROUP BY att.branch_id, att.schedule_type
         ORDER BY COUNT(*) DESC LIMIT 1),
      (SELECT (att.branch_id::text || '|' || att.schedule_type)
         FROM attendance att
         WHERE att.student_id = f.student_id
         GROUP BY att.branch_id, att.schedule_type
         ORDER BY COUNT(*) DESC LIMIT 1),
      (SELECT (sta.branch_id::text || '|' || sta.schedule_type)
         FROM student_time_slot_assignments sta
         WHERE sta.student_id = f.student_id
           AND sta.effective_from <= f.att_date
         ORDER BY sta.effective_from DESC LIMIT 1),
      (SELECT (sta.branch_id::text || '|' || sta.schedule_type)
         FROM student_time_slot_assignments sta
         WHERE sta.student_id = f.student_id
         ORDER BY sta.effective_from DESC LIMIT 1),
      CASE
        WHEN f.student_branch IS NOT NULL THEN
          (f.student_branch::text || '|' ||
           CASE EXTRACT(DOW FROM f.att_date)::int
             WHEN 0 THEN 'sat_sun' WHEN 6 THEN 'sat_sun'
             WHEN 1 THEN 'mon_wed' WHEN 3 THEN 'mon_wed'
             WHEN 2 THEN 'tue_thu' WHEN 4 THEN 'tue_thu'
             ELSE NULL
           END)
      END
    ) AS resolved_pair
  FROM filtered f
)
INSERT INTO attendance
  (id, student_id, branch_id, attendance_date, schedule_type, status, notes)
SELECT
  r.att_id,
  r.student_id,
  split_part(r.resolved_pair, '|', 1)::uuid,
  r.att_date,
  split_part(r.resolved_pair, '|', 2),
  r.status,
  'restored from audit_log on 2026-05-31 - coach/admin knock-on'
FROM resolved r
WHERE r.resolved_pair IS NOT NULL
  AND split_part(r.resolved_pair, '|', 2) IS NOT NULL
  AND split_part(r.resolved_pair, '|', 2) <> ''
ON CONFLICT DO NOTHING;

-- ============================================================
-- Block C: create ghost students for hard-deleted orphans
-- ============================================================
--
-- 33 orphan students. Alseit Malik is excluded (primary deleter
-- kazakhstan.chess.school@gmail.com has no coaches row -> no branch).

INSERT INTO students
  (id, first_name, last_name, status, branch_id, parent_name)
SELECT
  md5(name)::uuid,
  split_part(name, ' ', 1),
  trim(substring(name FROM position(' ' IN name) + 1)),
  'left',
  branch_id,
  '[ghost: restored from audit_log 2026-05-31]'
FROM (
  VALUES
    ('Abilmansur Marat',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid), -- Kenzhebekov / Almaty Arena
    ('Adilet Amankeldi',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Aibek Seidilda',       'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid), -- Nail / Debut
    ('Alima Arystan',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Alinur Nursultan',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Amanzhol Dias',        'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Amire Talaptan',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Anvarov Danial',       'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Armanov Arystan',      'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Arsen kaldibay',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Aruzhan Nurlan',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Ayim Erlan',           'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Baibolat Arman',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Bekbolat Tanirbergen', 'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Beksultan Bahtybai',   'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Bekzhan Nursultanuly', 'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Danial Talgat',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Dinmuhamed Seitzhan',  'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Elkhan Ashken',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Elnur Tralbek',        'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Kausar Bekmuhamet',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Magzhan Isa',          'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Malika Sayfutdinova',  'b146c01e-4a37-440e-84e7-4540358a21b9'::uuid), -- Alex / Halyk Arena
    ('Mansur Aselov',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Mansur Assilov',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Margulan Tuligazi',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Medet Toktarbek',      'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Nurzhan Amankeldi',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Ramazan Nurdaulet',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Rayimbek Sayfutdinov', 'b146c01e-4a37-440e-84e7-4540358a21b9'::uuid),
    ('Samatov Alikhan',      'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Sergazy Dinmukhammed', '93bbd1be-8c11-4623-943f-d283894b2f91'::uuid), -- Vasily / Gagarin Park
    ('Yasmin Maksat',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid)
) AS ghost(name, branch_id)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Block D: restore orphan attendance rows pointing at ghosts
-- ============================================================
--
-- Only restores rows for the 33 ghosts above. Alseit Malik's 11 rows
-- are skipped via the implicit JOIN to the ghost set.

WITH ghost_set AS (
  SELECT * FROM (VALUES
    ('Abilmansur Marat',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Adilet Amankeldi',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Aibek Seidilda',       'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Alima Arystan',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Alinur Nursultan',     'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Amanzhol Dias',        'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Amire Talaptan',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Anvarov Danial',       'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Armanov Arystan',      'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Arsen kaldibay',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Aruzhan Nurlan',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Ayim Erlan',           'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Baibolat Arman',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Bekbolat Tanirbergen', 'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Beksultan Bahtybai',   'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Bekzhan Nursultanuly', 'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Danial Talgat',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Dinmuhamed Seitzhan',  'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Elkhan Ashken',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Elnur Tralbek',        'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Kausar Bekmuhamet',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Magzhan Isa',          'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Malika Sayfutdinova',  'b146c01e-4a37-440e-84e7-4540358a21b9'::uuid),
    ('Mansur Aselov',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Mansur Assilov',       'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Margulan Tuligazi',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Medet Toktarbek',      'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Nurzhan Amankeldi',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Ramazan Nurdaulet',    'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid),
    ('Rayimbek Sayfutdinov', 'b146c01e-4a37-440e-84e7-4540358a21b9'::uuid),
    ('Samatov Alikhan',      'efe3df27-257f-4205-beae-b40d5c2b3fa4'::uuid),
    ('Sergazy Dinmukhammed', '93bbd1be-8c11-4623-943f-d283894b2f91'::uuid),
    ('Yasmin Maksat',        'b183c2b5-e4ca-4456-8633-5f690490af82'::uuid)
  ) AS g(student_name, branch_id)
),
knockon_with_name AS (
  SELECT
    al.entity_id AS att_id,
    al.changed_by,
    al.changed_at,
    COALESCE(
      NULLIF(split_part(al.old_value, ' | ', 1), ''),
      (SELECT split_part(al2.new_value, ' | ', 1)
       FROM audit_log al2
       WHERE al2.entity_type = 'attendance'
         AND al2.action      = 'CREATE'
         AND al2.entity_id   = al.entity_id
       LIMIT 1)
    )                                                 AS student_name,
    split_part(al.old_value, ' | ', 2)                AS status,
    NULLIF(split_part(al.old_value, ' | ', 3), '')::date AS att_date
  FROM audit_log al
  WHERE al.entity_type = 'attendance'
    AND al.action      = 'DELETE'
    AND al.changed_by  <> 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
)
INSERT INTO attendance
  (id, student_id, branch_id, attendance_date, schedule_type, status, notes)
SELECT
  k.att_id,
  md5(k.student_name)::uuid,
  g.branch_id,
  k.att_date,
  CASE EXTRACT(DOW FROM k.att_date)::int
    WHEN 0 THEN 'sat_sun' WHEN 6 THEN 'sat_sun'
    WHEN 1 THEN 'mon_wed' WHEN 3 THEN 'mon_wed'
    WHEN 2 THEN 'tue_thu' WHEN 4 THEN 'tue_thu'
    ELSE 'tue_thu'  -- Friday fallback (no Friday rows in current dataset)
  END,
  k.status,
  'restored from audit_log on 2026-05-31 - orphan ghost'
FROM knockon_with_name k
JOIN ghost_set g ON g.student_name = k.student_name
WHERE k.att_date IS NOT NULL
  AND k.att_date < date_trunc('month', k.changed_at)::date
  AND k.status IS NOT NULL AND k.status <> ''
ON CONFLICT DO NOTHING;

-- ============================================================
-- Verification
-- ============================================================

DO $$
DECLARE
  v_block_a_baseline  INT;
  v_block_b_restored  INT;
  v_block_c_ghosts    INT;
  v_block_d_restored  INT;
BEGIN
  SELECT COUNT(DISTINCT al.entity_id)
  INTO v_block_a_baseline
  FROM audit_log al
  WHERE al.entity_type = 'time_slots'
    AND al.field_name  = 'time_slot_index'
    AND al.new_value LIKE '% | slot -1'
    AND al.changed_by  <> 'ada27d52-28ff-4b70-b78b-caa27a3cfd69'
    AND EXISTS (
      SELECT 1 FROM student_time_slot_assignments orig
      JOIN student_time_slot_assignments base
        ON  base.student_id    = orig.student_id
        AND base.branch_id     = orig.branch_id
        AND base.schedule_type = orig.schedule_type
        AND base.effective_from = DATE '1970-01-01'
        AND base.time_slot_index >= 0
      WHERE orig.id = al.entity_id
    );

  IF v_block_a_baseline < 60 THEN
    RAISE EXCEPTION 'Block A verification: expected >= 60 reversed hide tuples, got %', v_block_a_baseline;
  END IF;

  SELECT COUNT(*) INTO v_block_b_restored
  FROM attendance
  WHERE notes = 'restored from audit_log on 2026-05-31 - coach/admin knock-on';

  IF v_block_b_restored < 600 OR v_block_b_restored > 700 THEN
    RAISE EXCEPTION 'Block B verification: restored knock-on rows out of expected range (600-700), got %', v_block_b_restored;
  END IF;

  SELECT COUNT(*) INTO v_block_c_ghosts
  FROM students
  WHERE parent_name = '[ghost: restored from audit_log 2026-05-31]';

  IF v_block_c_ghosts <> 33 THEN
    RAISE EXCEPTION 'Block C verification: expected 33 ghost students, got %', v_block_c_ghosts;
  END IF;

  SELECT COUNT(*) INTO v_block_d_restored
  FROM attendance
  WHERE notes = 'restored from audit_log on 2026-05-31 - orphan ghost';

  IF v_block_d_restored < 320 OR v_block_d_restored > 360 THEN
    RAISE EXCEPTION 'Block D verification: orphan rows out of expected range (320-360), got %', v_block_d_restored;
  END IF;

  RAISE NOTICE 'Migration 053 verified: A=% B=% C=% D=%',
    v_block_a_baseline, v_block_b_restored, v_block_c_ghosts, v_block_d_restored;
END
$$;

COMMIT;
