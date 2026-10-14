-- Migration 096 verification (READ-ONLY). Run after applying 096_student_code.sql.

-- Expect 0.
SELECT COUNT(*) AS null_codes FROM students WHERE student_code IS NULL;

-- Expect 0.
SELECT COUNT(*) AS duplicate_codes
FROM (SELECT student_code FROM students GROUP BY student_code HAVING COUNT(*) > 1) d;

-- Expect min CE-00001 and max = total students on the first apply.
SELECT
    COUNT(*) AS students,
    format_student_code(MIN(substring(student_code FROM 4)::BIGINT)) AS min_code,
    format_student_code(MAX(substring(student_code FROM 4)::BIGINT)) AS max_code,
    (SELECT last_value FROM student_code_seq) AS seq_last_value
FROM students;

-- Oldest 5 should hold the lowest codes.
SELECT student_code, first_name, last_name, created_at
FROM students
ORDER BY created_at ASC NULLS FIRST, id ASC
LIMIT 5;

-- Both triggers present and enabled ('O').
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'students'::regclass
  AND tgname IN ('trg_students_student_code_insert', 'trg_students_student_code_immutable',
                 'audit_students_changes', 'update_students_updated_at');
