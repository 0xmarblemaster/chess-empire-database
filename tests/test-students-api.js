/**
 * Static-analysis tests for the students write API.
 *
 *  (a) supabase/functions/students-api/index.ts — auth with the NEW
 *      CHESS_EMPIRE_WRITE_KEY (never CHESS_EMPIRE_API_KEY), action routing,
 *      dedup + reactivate, 3-day manual guard, Chesster poke parity, returns
 *      status_history row id, never touches student_time_slot_assignments.
 *  (b) supabase/migrations/091_students_api.sql — amocrm column + partial
 *      unique index, student_status_history actor columns (NOT a redefine of
 *      the pre-existing table), insert RLS, phone-lookup RPC.
 *  (c) supabase-data.js — dashboard updateStudent records a 'manual' row only
 *      on a real status change, non-blocking.
 *
 * Run: node tests/test-students-api.js
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
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'index.ts'), 'utf8');
const MIG = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '091_students_api.sql'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

// Strip comments so "must NOT reference" checks test actual CODE, not prose
// (the files legitimately NAME these symbols in explanatory comments).
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
function stripSqlComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}
const INDEX_CODE = stripJsComments(INDEX);
const MIG_CODE = stripSqlComments(MIG);

// ---------------------------------------------------------------------------
console.log('\n=== (a) students-api/index.ts\n');

assert(/Deno\.env\.get\('CHESS_EMPIRE_WRITE_KEY'\)/.test(INDEX),
  'auth reads CHESS_EMPIRE_WRITE_KEY (the new write key)');
assert(!/CHESS_EMPIRE_API_KEY/.test(INDEX_CODE),
  'code does NOT reference the tournament-only CHESS_EMPIRE_API_KEY');
assert(/function authorized\(req[^)]*\)[\s\S]*WRITE_KEYS\.includes/.test(INDEX),
  'authorized() checks the x-api-key against WRITE_KEYS');
assert(/if \(!authorized\(req\)\) \{[\s\S]*err\('unauthorized', 401\)/.test(INDEX),
  'unauthorized requests get 401');

// Routing on ?action=
['create', 'freeze', 'activate', 'find', 'branches'].forEach((a) => {
  assert(new RegExp(`action === '${a}'`).test(INDEX), `routes action=${a}`);
});
assert(/method === 'GET' && !action[\s\S]*OPENAPI_SPEC/.test(INDEX),
  'GET with no action returns the OpenAPI self-doc');
assert(/method === 'POST' && action === 'create'/.test(INDEX), 'create is POST');
assert(/method === 'GET' && action === 'find'/.test(INDEX), 'find is GET');

// Dedup + reactivate
assert(/eq\('amocrm_customer_id', amo\)/.test(INDEX), 'dedup by amocrm_customer_id');
assert(/rpc\('find_students_by_phone_digits'/.test(INDEX), 'dedup/find by normalized phone via RPC');
assert(/existing[\s\S]*status === 'frozen'[\s\S]*applyStatusChange\(ctx, existing, 'active'\)/.test(INDEX),
  'a frozen dedup-hit is reactivated');
assert(/existing: true/.test(INDEX), 'dedup-hit response carries existing:true');
assert(/ambiguous/.test(INDEX) && /409/.test(INDEX),
  'ambiguous multi-match is a 409');

// Branch validation — never silently default
assert(/from\('branches'\)\.select\('id'\)\.eq\('id', branchId\)/.test(INDEX) && /invalid_branch', 400/.test(INDEX),
  'branch_id is validated against branches → 400 invalid_branch');

// 3-day manual guard
assert(/isManualChangeRecent\(latest, Date\.now\(\)\)/.test(INDEX),
  'guard uses isManualChangeRecent on the latest typed row');
assert(/\.not\('changed_by_type', 'is', null\)/.test(INDEX),
  'guard query ignores NULL-typed trigger rows (typed rows only)');
assert(/refused: true, reason: 'manual_change_recent'/.test(INDEX),
  'guard refuses with reason manual_change_recent');
assert(/res\.refused[\s\S]*err\('manual_change_recent', 409\)/.test(INDEX),
  'freeze/activate returns 409 on manual_change_recent');

// No-op path
assert(/student\.status === target[\s\S]*changed: false/.test(INDEX),
  'no-op when already in target status → changed:false');

// Writes a typed api row and returns its id
assert(/changed_by_type: 'api', source: 'students-api'/.test(INDEX),
  'writes a typed api/students-api status-history row');
assert(/status_history_id/.test(INDEX),
  'responses carry status_history_id for audit');

// Chesster poke parity
assert(/CHESSTER_SYNC_TOKEN/.test(INDEX) && /CHESSTER_SYNC_URL/.test(INDEX),
  'reads CHESSTER_SYNC_URL / CHESSTER_SYNC_TOKEN env vars');
assert(/external_student_id: studentId, status/.test(INDEX),
  'poke body mirrors the dashboard: external_student_id + status');
assert(/'Authorization': 'Bearer ' \+ CHESSTER_SYNC_TOKEN/.test(INDEX),
  'poke sends the Bearer sync token');
assert(/new AbortController\(\)/.test(INDEX) && /controller\.abort\(\)/.test(INDEX),
  'poke uses a short AbortController timeout');
assert(/chesster_poke/.test(INDEX),
  'poke outcome is reported in the response (chesster_poke)');
assert(/catch \(_e\)\s*\{\s*return 'failed'/.test(INDEX),
  'poke never throws — a failure is swallowed to "failed"');

// Must NOT touch slot assignments (migration 081)
assert(!/student_time_slot_assignments/.test(INDEX_CODE),
  'code never references student_time_slot_assignments (migration 081 guard)');
assert(!/manual_slot_move|move_student_slot_manual|logical_slot_id|time_slot_index/.test(INDEX_CODE),
  'code never touches slot-move machinery');

// ---------------------------------------------------------------------------
console.log('\n=== (b) migration 091\n');

assert(/ADD COLUMN IF NOT EXISTS amocrm_customer_id BIGINT/.test(MIG),
  'adds students.amocrm_customer_id BIGINT (idempotent)');
assert(/CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*amocrm_customer_id\)\s*\n?\s*WHERE amocrm_customer_id IS NOT NULL/.test(MIG),
  'partial unique index on amocrm_customer_id WHERE NOT NULL');

// Extends, does NOT redefine, the pre-existing table
assert(!/CREATE TABLE[\s\S]*student_status_history/.test(MIG),
  'does NOT CREATE TABLE student_status_history (it pre-exists — migration 022)');
assert(/ALTER TABLE student_status_history\s*\n?\s*ADD COLUMN IF NOT EXISTS changed_by_type TEXT/.test(MIG),
  'adds changed_by_type TEXT (idempotent)');
assert(/ADD COLUMN IF NOT EXISTS source TEXT/.test(MIG),
  'adds source TEXT (idempotent)');
assert(/CHECK \(changed_by_type IS NULL OR changed_by_type IN \('api', 'manual', 'system'\)\)/.test(MIG),
  'changed_by_type CHECK constraint (api|manual|system)');
assert(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/.test(MIG),
  'CHECK constraint added idempotently via catalog guard');
assert(/CREATE INDEX IF NOT EXISTS idx_status_history_typed_latest/.test(MIG),
  'partial index for latest typed row lookup');

// RLS insert policy for dashboard manual rows
assert(/CREATE POLICY "Dashboard users can insert manual status history"[\s\S]*FOR INSERT/.test(MIG),
  'insert RLS policy for dashboard manual rows');
assert(/changed_by_type = 'manual'\s*\n?\s*AND source = 'dashboard'/.test(MIG),
  'policy pins changed_by_type/source so clients cannot forge api rows');
assert(/DROP POLICY IF EXISTS "Dashboard users can insert manual status history"/.test(MIG),
  'policy drop-before-create keeps it idempotent');

// RPC
assert(/CREATE OR REPLACE FUNCTION find_students_by_phone_digits\(p_digits TEXT\)/.test(MIG),
  'defines find_students_by_phone_digits RPC');
assert(/right\(regexp_replace\(COALESCE\(s\.parent_phone[\s\S]*, 10\)/.test(MIG),
  'matches on last 10 digits of digit-stripped parent_phone');
assert(/SECURITY DEFINER/.test(MIG), 'RPC is SECURITY DEFINER');
assert(/GRANT EXECUTE ON FUNCTION find_students_by_phone_digits\(TEXT\) TO service_role/.test(MIG),
  'RPC execute granted to service_role');
assert(/REVOKE ALL ON FUNCTION find_students_by_phone_digits\(TEXT\) FROM anon/.test(MIG),
  'RPC execute revoked from anon');

assert(/BEGIN;[\s\S]*COMMIT;/.test(MIG), 'wrapped in a transaction');
assert(!/student_time_slot_assignments/.test(MIG_CODE),
  'migration SQL never touches student_time_slot_assignments');

// ---------------------------------------------------------------------------
console.log('\n=== (c) supabase-data.js dashboard wiring\n');

const usStart = DATA.indexOf('async updateStudent(id, studentData)');
assert(usStart >= 0, 'updateStudent still defined');
const usEnd = DATA.indexOf('// Delete student', usStart);
const usBlock = DATA.slice(usStart, usEnd > usStart ? usEnd : usStart + 2600);

assert(/select\('status'\)\.eq\('id', id\)\.single\(\)/.test(usBlock),
  'updateStudent reads prior status before the write');
assert(/if \(priorStatus !== data\.status\) \{\s*\n\s*this\.recordManualStatusChange\(id, priorStatus, data\.status\);/.test(usBlock),
  'records a manual row ONLY when status actually changed');
assert(!/await this\.recordManualStatusChange/.test(usBlock),
  'manual record is fire-and-forget (not awaited)');

const rmStart = DATA.indexOf('async recordManualStatusChange(');
assert(rmStart >= 0, 'recordManualStatusChange helper defined');
const rmBlock = DATA.slice(rmStart, rmStart + 900);
assert(/from\('student_status_history'\)\s*\n?\s*\.insert/.test(rmBlock),
  'helper inserts into student_status_history');
assert(/changed_by_type: 'manual'/.test(rmBlock) && /source: 'dashboard'/.test(rmBlock),
  'helper writes a manual/dashboard typed row (satisfies insert RLS)');
assert(/try \{[\s\S]*\} catch \(e\) \{[\s\S]*console\.warn/.test(rmBlock),
  'helper is non-fatal (try/catch, warns)');

// ---------------------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
