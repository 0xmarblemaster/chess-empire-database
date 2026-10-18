-- Migration 097: exact E.164 phone lookup for the students write API
-- ============================================================================
-- find_students_by_phone_digits() (091/096) matches on the LAST 10 digits, so
-- once international numbers are accepted +44 7911123456 would match
-- +7 7911123456. This adds find_students_by_phone_e164(), which compares the
-- full digit string, plus the legacy unprefixed KZ formats only for +7 input:
--   stored 8XXXXXXXXXX (11 digits) → matches +7XXXXXXXXXX
--   stored XXXXXXXXXX  (10 digits) → matches +7XXXXXXXXXX
-- Phones are NOT unique (siblings share a parent's phone) — every match is
-- returned. find_students_by_phone_digits() is kept unchanged for any old
-- deployed code. No data is rewritten; parent_phone gets no constraint.
--
-- Idempotent: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS.

BEGIN;

-- Non-unique expression index on the digit-stripped phone; the lookup below
-- uses the identical expression, so each branch of its OR is an index probe.
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_digits
    ON students ((regexp_replace(COALESCE(parent_phone, ''), '[^0-9]', '', 'g')));

-- Same SECURITY DEFINER + service_role-only pattern as 091 §4; same columns as
-- find_students_by_phone_digits (incl. student_code from 096).
CREATE OR REPLACE FUNCTION find_students_by_phone_e164(p_e164 TEXT)
RETURNS TABLE (
    id UUID,
    student_code TEXT,
    first_name TEXT,
    last_name TEXT,
    status TEXT,
    branch_id UUID,
    branch_name TEXT,
    amocrm_customer_id BIGINT,
    parent_phone TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH q AS (
        SELECT substr(p_e164, 2) AS d
        WHERE COALESCE(p_e164, '') ~ '^\+[1-9][0-9]{6,14}$'
    )
    SELECT
        s.id, s.student_code, s.first_name, s.last_name, s.status, s.branch_id,
        b.name AS branch_name, s.amocrm_customer_id, s.parent_phone
    FROM q
    JOIN students s
      ON regexp_replace(COALESCE(s.parent_phone, ''), '[^0-9]', '', 'g') = q.d
      OR (q.d ~ '^7[0-9]{10}$'
          AND regexp_replace(COALESCE(s.parent_phone, ''), '[^0-9]', '', 'g')
              IN ('8' || substr(q.d, 2), substr(q.d, 2)))
    LEFT JOIN branches b ON b.id = s.branch_id;
$$;

REVOKE ALL ON FUNCTION find_students_by_phone_e164(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_students_by_phone_e164(TEXT) FROM anon;
REVOKE ALL ON FUNCTION find_students_by_phone_e164(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION find_students_by_phone_e164(TEXT) TO service_role;

COMMIT;
