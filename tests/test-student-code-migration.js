/**
 * Static tests for migration 096 (students.student_code, CE-00001).
 *
 * Parses supabase/migrations/096_student_code.sql (+ the read-only verify
 * file) and asserts: sequence (NO CYCLE), column, formatter that never
 * truncates (> 99999), backfill ordered by (created_at, id), sequence moved
 * past the max without going backwards, BEFORE INSERT trigger that always
 * overrides the client value, BEFORE UPDATE trigger that blocks changes,
 * NOT NULL + UNIQUE, and the API RPCs returning student_code with their
 * original grants.
 *
 * Run: node tests/test-student-code-migration.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const RAW = fs.readFileSync(path.join(MIG_DIR, '096_student_code.sql'), 'utf8');
const SQL = RAW.replace(/--[^\n]*/g, '');
const VERIFY = fs.readFileSync(path.join(MIG_DIR, '096_student_code_verify.sql'), 'utf8')
  .replace(/--[^\n]*/g, '');

// Body of a CREATE [OR REPLACE] FUNCTION name(...) … $$ … $$ block.
function fnBlock(name) {
  const m = SQL.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$`));
  return m ? m[0] : '';
}

console.log('\n=== transaction + sequence + column\n');
assert(/^\s*BEGIN;/m.test(SQL) && /^\s*COMMIT;/m.test(SQL), 'wrapped in BEGIN / COMMIT');
assert(/CREATE SEQUENCE IF NOT EXISTS student_code_seq[\s\S]*?NO CYCLE/.test(SQL), 'student_code_seq created with NO CYCLE');
assert(/ALTER TABLE students\s+ADD COLUMN IF NOT EXISTS student_code TEXT/.test(SQL), 'students.student_code TEXT added');

console.log('\n=== format_student_code\n');
const fmt = fnBlock('format_student_code');
assert(/IMMUTABLE/.test(fmt), 'formatter is IMMUTABLE');
assert(/WHEN n < 100000 THEN lpad\(n::text, 5, '0'\) ELSE n::text END/.test(fmt),
  'lpad only below 100000 — larger numbers printed in full (no truncation)');
// Mirror the SQL formatter and check the boundaries.
const fmtJs = (n) => 'CE-' + (n < 100000 ? String(n).padStart(5, '0') : String(n));
assert(fmtJs(1) === 'CE-00001' && fmtJs(99999) === 'CE-99999' && fmtJs(100000) === 'CE-100000' && fmtJs(1234567) === 'CE-1234567',
  'formatter semantics: CE-00001 / CE-99999 / CE-100000 / CE-1234567');

console.log('\n=== backfill\n');
assert(/ROW_NUMBER\(\) OVER \(ORDER BY created_at ASC NULLS FIRST, id ASC\)/.test(SQL), 'backfill ordered by created_at, id');
assert(/WHERE student_code IS NULL/.test(SQL), 'backfill only touches rows without a code (re-runnable)');
assert(/setval\('student_code_seq'/.test(SQL), 'sequence setval past the max code');
assert(/GREATEST\(v_max, CASE WHEN v_called THEN v_last ELSE v_last - 1 END\)/.test(SQL),
  'setval never moves the sequence backwards (retired codes are never reused)');
assert(/DISABLE TRIGGER audit_students_changes[\s\S]*UPDATE students s[\s\S]*ENABLE TRIGGER audit_students_changes/.test(SQL),
  'audit trigger disabled only around the backfill');
assert(/DISABLE TRIGGER update_students_updated_at[\s\S]*ENABLE TRIGGER update_students_updated_at/.test(SQL),
  'updated_at trigger disabled only around the backfill');
const backfillAt = SQL.indexOf('UPDATE students s');
const insertTrgAt = SQL.indexOf('CREATE TRIGGER trg_students_student_code_insert');
const updTrgAt = SQL.indexOf('CREATE TRIGGER trg_students_student_code_immutable');
const notNullAt = SQL.indexOf('ALTER COLUMN student_code SET NOT NULL');
assert(backfillAt > 0 && backfillAt < updTrgAt, 'immutability trigger created after the backfill');
assert(SQL.indexOf('DROP TRIGGER IF EXISTS trg_students_student_code_immutable') < backfillAt,
  'immutability trigger dropped before the backfill on re-run');
assert(backfillAt < notNullAt, 'NOT NULL set after the backfill');

console.log('\n=== insert / update triggers\n');
const assign = fnBlock('assign_student_code');
assert(/NEW\.student_code := format_student_code\(nextval\('student_code_seq'\)\)/.test(assign),
  'insert trigger assigns from the sequence');
assert(!/IF[^;]*NEW\.student_code IS NULL/.test(assign), 'insert trigger ALWAYS overrides (no "only if NULL" branch)');
assert(/SECURITY DEFINER/.test(assign), 'insert trigger is SECURITY DEFINER (anon / authenticated inserts need no sequence grant)');
assert(insertTrgAt > 0 && /BEFORE INSERT ON students\s+FOR EACH ROW EXECUTE FUNCTION assign_student_code\(\)/.test(SQL),
  'BEFORE INSERT trigger wired');
const guard = fnBlock('prevent_student_code_change');
assert(/NEW\.student_code IS DISTINCT FROM OLD\.student_code[\s\S]*RAISE EXCEPTION/.test(guard), 'update trigger raises on any change');
assert(/BEFORE UPDATE ON students\s+FOR EACH ROW EXECUTE FUNCTION prevent_student_code_change\(\)/.test(SQL),
  'BEFORE UPDATE trigger wired');

console.log('\n=== constraints\n');
assert(notNullAt > 0, 'student_code SET NOT NULL');
assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_students_student_code ON students\(student_code\)/.test(SQL), 'UNIQUE index on student_code');
assert(/CHECK \(student_code ~ '\^CE-\[0-9\]\{5,\}\$'\)/.test(SQL), 'format CHECK ^CE-[0-9]{5,}$');
assert(/GRANT SELECT \(student_code\) ON students TO anon/.test(SQL), 'code stays anon-readable under column-level grants');

console.log('\n=== RPCs return student_code\n');
const phone = fnBlock('find_students_by_phone_digits');
assert(/DROP FUNCTION IF EXISTS find_students_by_phone_digits\(TEXT\)/.test(SQL), 'find_students_by_phone_digits dropped (return type changes)');
assert(/RETURNS TABLE \([\s\S]*student_code TEXT/.test(phone) && /s\.student_code/.test(phone), 'find_students_by_phone_digits returns student_code');
assert(/GRANT EXECUTE ON FUNCTION find_students_by_phone_digits\(TEXT\) TO service_role;/.test(SQL)
  && /REVOKE ALL ON FUNCTION find_students_by_phone_digits\(TEXT\) FROM anon;/.test(SQL),
  'find_students_by_phone_digits keeps service_role-only execute');
const lb = fnBlock('get_puzzle_rush_leaderboard');
assert(/DROP FUNCTION IF EXISTS get_puzzle_rush_leaderboard\(TEXT, TEXT, UUID, UUID, INT\)/.test(SQL), 'get_puzzle_rush_leaderboard dropped (return type changes)');
assert(/RETURNS TABLE \([\s\S]*student_code TEXT/.test(lb) && /s\.student_code/.test(lb), 'get_puzzle_rush_leaderboard returns student_code');
assert(/GRANT EXECUTE ON FUNCTION get_puzzle_rush_leaderboard\(TEXT, TEXT, UUID, UUID, INT\) TO anon, authenticated, service_role;/.test(SQL),
  'get_puzzle_rush_leaderboard keeps its 093 grants');
// Same RETURNS TABLE column count in SELECT list (12 output columns).
const outCols = (lb.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/) || [, ''])[1].split(',').length;
assert(outCols === 12, `leaderboard RETURNS TABLE has 12 columns (got ${outCols})`);

console.log('\n=== verify file is read-only\n');
assert(/student_code IS NULL/.test(VERIFY) && /HAVING COUNT\(\*\) > 1/.test(VERIFY), 'verify: NULL count + duplicate count');
assert(/MIN\(/.test(VERIFY) && /MAX\(/.test(VERIFY) && /LIMIT 5/.test(VERIFY), 'verify: min/max + 5 oldest');
assert(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE|TRUNCATE)\b/i.test(VERIFY), 'verify file has no writes');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
