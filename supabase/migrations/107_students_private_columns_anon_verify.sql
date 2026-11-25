-- Migration 107 verification — READ-ONLY (SELECTs only, safe to run anytime).
--
-- anon can SELECT each public students column and none of the private ones;
-- authenticated still has SELECT on every column. Every row must have ok = true.

WITH public_cols(col) AS (
    VALUES ('id'), ('first_name'), ('last_name'), ('age'), ('date_of_birth'),
           ('gender'), ('photo_url'), ('branch_id'), ('coach_id'), ('razryad'),
           ('status'), ('current_level'), ('current_lesson'), ('total_lessons'),
           ('created_at'), ('updated_at'), ('chesster_registered_at'), ('student_code')
),
private_cols(col) AS (
    VALUES ('parent_name'), ('parent_phone'), ('parent_email'),
           ('chesster_email'), ('amocrm_customer_id')
),
checks AS (
    SELECT 'anon can SELECT ' || col AS check_name,
           has_column_privilege('anon', 'public.students', col, 'SELECT') AS ok
    FROM public_cols
    UNION ALL
    SELECT 'anon cannot SELECT ' || col,
           NOT has_column_privilege('anon', 'public.students', col, 'SELECT')
    FROM private_cols
    UNION ALL
    SELECT 'anon has no table-level SELECT',
           NOT has_table_privilege('anon', 'public.students', 'SELECT')
    UNION ALL
    SELECT 'authenticated can SELECT ' || col,
           has_column_privilege('authenticated', 'public.students', col, 'SELECT')
    FROM (SELECT col FROM public_cols UNION ALL SELECT col FROM private_cols) all_cols
)
SELECT check_name, ok FROM checks;
