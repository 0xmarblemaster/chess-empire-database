-- Migration 099 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- Run BEFORE applying 099 to capture the baseline fingerprint (section 0),
-- then AFTER and compare: rows / old / new / changed_at / changed_by must be
-- byte-identical; only the 4 new columns + source may differ.

-- 0. Fingerprint of the immutable columns (must match before/after).
SELECT count(*) AS rows,
       count(DISTINCT student_id) AS students,
       min(changed_at) AS first_change,
       max(changed_at) AS last_change,
       md5(string_agg(
           id::TEXT || '|' || student_id::TEXT || '|' || COALESCE(old_razryad, '∅') || '|' ||
           COALESCE(new_razryad, '∅') || '|' || changed_at::TEXT || '|' || COALESCE(changed_by::TEXT, '∅'),
           ',' ORDER BY id)) AS immutable_fingerprint
FROM razryad_history;

-- 1. Counts by source / derived flag.
SELECT source, source_derived, count(*) AS rows
FROM razryad_history
GROUP BY source, source_derived
ORDER BY source, source_derived;

-- 2. Counts by trainer attribution (NULL attribution after 099 = not backfilled → should be 0).
SELECT trainer_attribution, count(*) AS rows, count(trainer_id_at_change) AS with_trainer
FROM razryad_history
GROUP BY trainer_attribution
ORDER BY trainer_attribution NULLS FIRST;

-- 3. Assertions (each must return 0).
SELECT 'legacy rows not backfilled' AS check, count(*) AS violations
FROM razryad_history WHERE source = 'trigger' AND source_derived = false
UNION ALL
SELECT 'derived rows without evidence', count(*)
FROM razryad_history WHERE source_derived AND (evidence IS NULL OR evidence = '')
UNION ALL
SELECT 'derived_audit_log without trainer', count(*)
FROM razryad_history WHERE trainer_attribution IN ('derived_audit_log', 'event_time') AND trainer_id_at_change IS NULL
UNION ALL
SELECT 'unknown attribution with trainer', count(*)
FROM razryad_history WHERE trainer_attribution = 'unknown' AND trainer_id_at_change IS NOT NULL
UNION ALL
SELECT 'post-099 rows without attribution', count(*)
FROM razryad_history WHERE NOT source_derived AND source <> 'trigger' AND trainer_attribution IS NULL
UNION ALL
SELECT 'tournament rows without matching result', count(*)
FROM razryad_history rh
WHERE rh.source = 'tournament' AND rh.source_derived
  AND NOT EXISTS (
      SELECT 1 FROM tournament_results tr
      WHERE tr.student_id = rh.student_id AND tr.earned_razryad IS NOT NULL
        AND tr.created_at BETWEEN rh.changed_at - INTERVAL '5 seconds' AND rh.changed_at + INTERVAL '5 seconds'
  );

-- 4. Duplicates: the same student + transition at the same instant (expect 0 rows).
SELECT student_id, old_razryad, new_razryad, changed_at, count(*) AS dupes
FROM razryad_history
GROUP BY student_id, old_razryad, new_razryad, changed_at
HAVING count(*) > 1;

-- 5. Students whose current rank has no history row ending in it, among
--    students with any history (informational — pre-2026-05-18 ranks have none).
SELECT count(*) AS students_rank_without_matching_last_event
FROM students s
JOIN LATERAL (
    SELECT rh.new_razryad FROM razryad_history rh
    WHERE rh.student_id = s.id ORDER BY rh.changed_at DESC, rh.id DESC LIMIT 1
) last ON true
WHERE last.new_razryad IS DISTINCT FROM s.razryad;

-- 6. Schema objects present.
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'razryad_history'
        AND column_name IN ('trainer_id_at_change', 'trainer_attribution', 'source_derived', 'evidence')) AS new_columns_4,
    (SELECT count(*) FROM pg_trigger
      WHERE tgname = 'trg_razryad_history_append_only' AND NOT tgisinternal) AS append_only_trigger_1,
    (SELECT count(*) FROM pg_policies
      WHERE tablename = 'razryad_history' AND cmd = 'ALL') AS for_all_policies_0;
