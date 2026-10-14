/**
 * student_code across the read-only analytics-* functions and tournaments-api.
 *
 *  - resolveStudentParam (shared helper): ?student_id / ?student_code → UUID,
 *    analytics error shape.
 *  - Source-level: every students select / embed that returns a student's
 *    name also returns student_code (allowlisted exception: tournaments-api's
 *    public registration list, which deliberately exposes no student identity),
 *    per-student response objects carry student_code next to student_id, and
 *    every function that filters by ?student_id also accepts ?student_code.
 *
 * Run: node tests/test-student-code-functions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStudentParam } from '../supabase/functions/students-api/students-logic.mjs';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} (got ${a}, expected ${e})`);
}

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const lookup = { async findIdByCode(c) { return c === 'CE-00452' ? A : null; } };

console.log('\n=== resolveStudentParam ===============================================\n');
eq(await resolveStudentParam(lookup, {}), { id: null }, 'neither → id null (filter not applied)');
eq(await resolveStudentParam(lookup, { student_id: null, student_code: null }), { id: null }, 'null params → id null');
eq(await resolveStudentParam(lookup, { student_id: A }), { id: A }, 'student_id passes through');
eq(await resolveStudentParam(lookup, { student_code: ' ce-00452 ' }), { id: A }, 'student_code resolved (normalized)');
eq(await resolveStudentParam(lookup, { student_code: 'CE-00999' }), { status: 404, error: 'Student not found' }, 'unknown code → 404');
eq(await resolveStudentParam(lookup, { student_code: '452' }), { status: 400, error: 'Invalid parameter: student_code' }, 'bad code → 400');
eq(await resolveStudentParam(lookup, { student_id: 'x' }), { status: 400, error: 'Invalid parameter: student_id' }, 'bad uuid → 400');
eq(await resolveStudentParam(lookup, { student_id: B, student_code: 'CE-00452' }), { status: 400, error: 'student_id_code_mismatch' }, 'mismatch → 400');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = (name) => fs.readFileSync(path.join(ROOT, 'supabase', 'functions', name, 'index.ts'), 'utf8');
const FUNCTIONS = ['analytics-students', 'analytics-leaderboards', 'analytics-attendance', 'analytics-status', 'analytics-tournaments', 'tournaments-api'];
const SRC = Object.fromEntries(FUNCTIONS.map((n) => [n, FN(n)]));

console.log('\n=== every name-returning students select includes student_code ========\n');
// The public registration list shows display names only — never student identity.
const ALLOW = new Set(['tournaments-api: students(first_name, last_name)']);
for (const [name, src] of Object.entries(SRC)) {
  const selects = [
    ...[...src.matchAll(/\bstudents(?:!inner)?\(([^)]*)\)/g)].map((m) => m[0]),
    ...[...src.matchAll(/\.from\('students'\)\s*\.select\('([^']*)'/g)].map((m) => m[0]),
  ].filter((s) => /first_name/.test(s));
  for (const s of selects) {
    if (ALLOW.has(`${name}: ${s}`)) continue;
    // select('*, …') returns every column, student_code included.
    assert(/student_code|select\('\*/.test(s), `${name}: ${s.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
}
assert(/student:students\(first_name, last_name\)/.test(SRC['tournaments-api']),
  'tournaments-api public registration list still exposes names only (allowlisted)');

console.log('\n=== ?student_code accepted wherever ?student_id filters ===============\n');
for (const name of ['analytics-students', 'analytics-attendance', 'analytics-status', 'analytics-tournaments', 'analytics-leaderboards']) {
  const src = SRC[name];
  assert(/p\('student_code'\)/.test(src) && /resolveStudentParam\(studentCodeLookup\(supabase\)/.test(src),
    `${name} resolves ?student_code`);
  assert(!/\.eq\('student_id', p\('student_id'\)\)/.test(src), `${name} no longer filters on the raw ?student_id`);
}

console.log('\n=== analytics-students ================================================\n');
const as = SRC['analytics-students'];
assert(/from\('students'\)\.select\('\*, branches\(name\), coaches\(first_name, last_name\)'\)/.test(as),
  'profile selects * → includes student_code (lookup by code returns the same profile)');
assert(/select\('id, student_code, branch_id, status'\)/.test(as) && /student_code: student\.student_code/.test(as), 'ranking returns student_code');
assert(/select\('id, student_code, branch_id, current_level, current_lesson, last_name, first_name'\)/.test(as)
  && /student_code: list\[idx\]\.student_code/.test(as) && /student_code: me \? me\.student_code : null/.test(as),
  'progress_ranking returns student_code (ranked and unranked)');
assert(/'student_id or student_code required'/.test(as), 'missing selector message names both params');

console.log('\n=== analytics-leaderboards ============================================\n');
const lb = SRC['analytics-leaderboards'];
assert(/student_code: s\.student_code, rating: r\.rating/.test(lb), 'ratings rows carry student_code');
assert(/student_code: r\.student_code,\s*score: r\.best_score/.test(lb), 'survival rows carry student_code (RPC column)');
assert(/student_code: s\.student\?\.student_code \?\? null/.test(lb), 'bot_battles rows carry student_code');
assert(!/parseInt\(id\)/.test(lb), 'bot_battles student_id is the UUID (no parseInt)');

console.log('\n=== analytics-attendance ==============================================\n');
const at = SRC['analytics-attendance'];
assert(!/student_id: parseInt\(id\)/.test(at), 'rates / alerts student_id is the UUID (no parseInt)');
assert(/student_code: info\.get\(id\)\?\.student_code \?\? null/.test(at), 'rates rows carry student_code');
assert(/student_code: s \? s\.student_code : null, student_name:/.test(at), 'alerts rows carry student_code + name');
assert(/select\('attendance_date, student_id, students\(student_code\), status/.test(at), 'calendar records embed student_code');

console.log('\n=== analytics-tournaments =============================================\n');
const tr = SRC['analytics-tournaments'];
assert(/student_code: p\.student\?\.student_code \|\| null/.test(tr), 'detail participants carry student_code');
assert(/student_code: s\.studentCode/.test(tr), 'branch_leaderboard rows carry student_code');
assert(/student_code: \(s as any\)\.student_code/.test(tr), 'coach_kpi_summary per-student rows carry student_code');
const drill = tr.slice(tr.indexOf("metric === 'active_players'"));
const drillRows = drill.match(/student_id: (slot|r|e)\.student_id,\s*student_code: s\.student_code \|\| null,/g) || [];
eq(drillRows.length, 4, 'school_student_drilldown: all 4 metrics carry student_code');

console.log('\n=== tournaments-api ===================================================\n');
const ta = SRC['tournaments-api'];
assert(/student_code\.ilike\.\$\{pattern\}/.test(ta), 'student search matches student_code (CE-00452 / 00452)');
assert(/id: s\.id,\s*student_code: s\.student_code,/.test(ta), 'search hits carry student_code');
assert(/parseStudentRef\(body, \{ required: false \}\)/.test(ta) && /resolveStudentRef\(studentCodeLookup\(ctx\.supabase\), ref\.value\)/.test(ta),
  'register accepts student_code (resolved; mismatch → 400)');
assert(/if \(hasStudent === hasName\) return err\('invalid_input', 400\)/.test(ta), 'register keeps "exactly one of student / player_name"');
assert(/const code = parseStudentCode\(idOrCode\)/.test(ta), '/students/{id}/registrations accepts a Student ID in the path');
assert(/'student_id_code_mismatch'/.test(ta.match(/const REASONS = \[[\s\S]*?\]/)[0]), 'REASONS includes student_id_code_mismatch');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
