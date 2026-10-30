/**
 * students-api: student_code (CE-00001) support.
 *
 *  - parseStudentCode / parseStudentRef / resolveStudentRef (mock DB):
 *    normalization, invalid → field 'student_code', unknown → 404,
 *    student_id + student_code naming different students → 400 mismatch.
 *  - parseListParams: limit/offset bounds, branch_id + status validation.
 *  - link_amocrm / update_contact / survival push / leaderboard validators
 *    accept student_code instead of student_id; the resolve → flow composition
 *    used by the handlers writes to the resolved student.
 *  - index.ts (source-level): STUDENT_SELECT + shape() carry student_code,
 *    find precedence, action=list (count exact, ordered by student_code),
 *    every body-taking action resolves student_code, inserts never send it.
 *
 * Run: node tests/test-student-code-api.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseStudentCode,
  parseStudentRef,
  resolveStudentRef,
  parseListParams,
  LIST_MAX_LIMIT,
  STUDENT_STATUSES,
  validateLinkAmocrm,
  linkAmocrm,
  validateUpdateContact,
  updateContact,
  validateSurvivalPush,
  parseLeaderboardParams,
} from '../supabase/functions/students-api/students-logic.mjs';

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
const codes = { 'CE-00452': A, 'CE-00453': B };
const lookup = { async findIdByCode(c) { return codes[c] || null; } };

console.log('\n=== parseStudentCode ==================================================\n');
eq(parseStudentCode('CE-00452'), 'CE-00452', 'canonical code');
eq(parseStudentCode('  ce-00452 '), 'CE-00452', 'trimmed + uppercased');
eq(parseStudentCode('CE-123456'), 'CE-123456', '6+ digits allowed (> 99999)');
eq(parseStudentCode('ce-452'), null, 'short form is NOT padded → invalid');
eq(parseStudentCode('00452'), null, 'missing prefix → invalid');
eq(parseStudentCode('CE-0045a'), null, 'non-digit → invalid');
eq(parseStudentCode('CE-00452 x'), null, 'trailing junk → invalid');
eq(parseStudentCode(452), null, 'non-string → invalid');
eq(parseStudentCode(null), null, 'null → invalid');

console.log('\n=== parseStudentRef ===================================================\n');
eq(parseStudentRef({ student_id: A }), { value: { student_id: A } }, 'id only');
eq(parseStudentRef({ student_code: 'ce-00452' }), { value: { student_code: 'CE-00452' } }, 'code only, normalized');
eq(parseStudentRef({ student_id: A, student_code: 'CE-00452' }), { value: { student_id: A, student_code: 'CE-00452' } }, 'both');
eq(parseStudentRef({}), { field: 'student_id' }, 'neither → field student_id');
eq(parseStudentRef({}, { required: false }), { value: {} }, 'neither, optional → empty');
eq(parseStudentRef({ student_id: 'nope' }), { field: 'student_id' }, 'bad uuid');
eq(parseStudentRef({ student_code: 'CE-1' }), { field: 'student_code' }, 'bad code');
eq(parseStudentRef({ student_id: A, student_code: 'x' }), { field: 'student_code' }, 'valid id + bad code → student_code');

console.log('\n=== resolveStudentRef =================================================\n');
eq(await resolveStudentRef(lookup, { student_id: A }), { id: A }, 'id passes through without a read');
eq(await resolveStudentRef(lookup, { student_code: 'CE-00452' }), { id: A }, 'code → id');
eq(await resolveStudentRef(lookup, { student_code: 'CE-99999' }),
  { error: { status: 404, body: { ok: false, reason: 'not_found' } } }, 'unknown code → 404');
eq(await resolveStudentRef(lookup, { student_id: A, student_code: 'CE-00452' }), { id: A }, 'matching pair ok');
eq(await resolveStudentRef(lookup, { student_id: A.toUpperCase(), student_code: 'CE-00452' }), { id: A }, 'uuid compare is case-insensitive');
eq(await resolveStudentRef(lookup, { student_id: B, student_code: 'CE-00452' }),
  { error: { status: 400, body: { ok: false, reason: 'student_id_code_mismatch' } } }, 'different students → 400 mismatch');

console.log('\n=== parseListParams ===================================================\n');
eq(parseListParams({}), { value: { limit: 100, offset: 0, branch_id: null, status: null } }, 'defaults limit 100 / offset 0');
eq(parseListParams({ limit: null, offset: '' }).value.limit, 100, 'null/empty → defaults');
eq(LIST_MAX_LIMIT, 500, 'max limit 500');
eq(parseListParams({ limit: '500' }).value.limit, 500, 'limit 500 ok');
eq(parseListParams({ limit: '501' }), { field: 'limit' }, 'limit 501 → 400');
eq(parseListParams({ limit: '0' }), { field: 'limit' }, 'limit 0 → 400');
eq(parseListParams({ limit: '1.5' }), { field: 'limit' }, 'fractional limit → 400');
eq(parseListParams({ limit: 'abc' }), { field: 'limit' }, 'junk limit → 400');
eq(parseListParams({ offset: '-1' }), { field: 'offset' }, 'negative offset → 400');
eq(parseListParams({ offset: '200' }).value.offset, 200, 'offset parsed');
eq(parseListParams({ branch_id: 'x' }), { field: 'branch_id' }, 'bad branch_id → 400');
eq(parseListParams({ branch_id: A }).value.branch_id, A, 'branch filter');
eq(STUDENT_STATUSES, ['active', 'frozen', 'left'], 'statuses match the DB CHECK');
STUDENT_STATUSES.forEach((s) => eq(parseListParams({ status: s }).value.status, s, `status=${s} ok`));
eq(parseListParams({ status: 'deleted' }), { field: 'status' }, 'unknown status → 400');

console.log('\n=== validators accept student_code ====================================\n');
eq(validateLinkAmocrm({ student_code: 'ce-00452', amocrm_customer_id: 7 }),
  { value: { student_code: 'CE-00452', amocrm_customer_id: 7 } }, 'link_amocrm by code');
eq(validateLinkAmocrm({ student_id: A, amocrm_customer_id: 7 }),
  { value: { student_id: A, amocrm_customer_id: 7 } }, 'link_amocrm by id unchanged');
eq(validateLinkAmocrm({ student_code: 'bad', amocrm_customer_id: 7 }), { field: 'student_code' }, 'link_amocrm bad code');
eq(validateLinkAmocrm({ amocrm_customer_id: 7 }), { field: 'student_id' }, 'link_amocrm no selector');
eq(validateUpdateContact({ student_code: 'CE-00452', phone: '87011234567' }),
  { value: { student_code: 'CE-00452', phone: '+77011234567' } }, 'update_contact by code');
eq(validateUpdateContact({ student_code: 'CE-00452' }), { field: 'body' }, 'update_contact still needs a field');
eq(validateUpdateContact({ student_code: '452', phone: '87011234567' }), { field: 'student_code' }, 'update_contact bad code');
eq(validateSurvivalPush({ student_code: 'CE-00452', score: 10, external_ref: 'r' }),
  { value: { student_code: 'CE-00452', score: 10, external_ref: 'r', achieved_at: null } }, 'survival push by code');
eq(validateSurvivalPush({ student_code: 'x', score: 10, external_ref: 'r' }), { field: 'student_code' }, 'survival push bad code');
eq(parseLeaderboardParams({ student_code: 'ce-00452' }).value.student_code, 'CE-00452', 'leaderboard accepts student_code');
eq(parseLeaderboardParams({ student_code: 'nope' }), { field: 'student_code' }, 'leaderboard bad code');
eq(parseLeaderboardParams({}).value.student_code, undefined, 'leaderboard without code unchanged');

console.log('\n=== handler composition: resolve → flow ===============================\n');
// Mirrors linkAmocrmId / updateStudentContact: validate → resolveStudentRef →
// flow({ ...value, student_id: resolved }).
function mockStudents() {
  const rows = {
    [A]: { id: A, student_code: 'CE-00452', amocrm_customer_id: null, phone: '+77011234567' },
    [B]: { id: B, student_code: 'CE-00453', amocrm_customer_id: null, phone: '+77017654321' },
  };
  const writes = [];
  return {
    rows, writes,
    async getStudent(id) { return rows[id] ? { ...rows[id] } : null; },
    async findOwnerId(amo) { return Object.values(rows).find((r) => r.amocrm_customer_id === amo)?.id || null; },
    async setIfNull(id, amo) {
      writes.push({ id, amocrm_customer_id: amo });
      if (!rows[id] || rows[id].amocrm_customer_id !== null) return { row: null };
      rows[id].amocrm_customer_id = amo;
      return { row: { id, amocrm_customer_id: amo } };
    },
    async update(id, patch) {
      writes.push({ id, ...patch });
      if (!rows[id]) return { row: null };
      if (patch.parent_phone) rows[id].phone = patch.parent_phone;
      if (patch.amocrm_customer_id !== undefined) rows[id].amocrm_customer_id = patch.amocrm_customer_id;
      return { row: { ...rows[id] } };
    },
  };
}
async function viaCode(flow, validate, body, db) {
  const v = validate(body);
  if (!v.value) return { status: 400, body: { ok: false, reason: 'invalid_input', field: v.field } };
  const ref = await resolveStudentRef(lookup, v.value);
  if (ref.error) return ref.error;
  return flow(db, { ...v.value, student_id: ref.id });
}
{
  const db = mockStudents();
  const r = await viaCode(linkAmocrm, validateLinkAmocrm, { student_code: 'CE-00453', amocrm_customer_id: 99 }, db);
  eq(r.status, 200, 'link_amocrm by code → 200');
  eq(db.writes, [{ id: B, amocrm_customer_id: 99 }], 'wrote to the student the code names');
  const miss = await viaCode(linkAmocrm, validateLinkAmocrm, { student_code: 'CE-01000', amocrm_customer_id: 99 }, db);
  eq(miss.status, 404, 'link_amocrm unknown code → 404');
  const mm = await viaCode(linkAmocrm, validateLinkAmocrm, { student_id: A, student_code: 'CE-00453', amocrm_customer_id: 5 }, db);
  eq([mm.status, mm.body.reason], [400, 'student_id_code_mismatch'], 'link_amocrm mismatch → 400');
  eq(db.writes.length, 1, 'no write on 404 / mismatch');
}
{
  const db = mockStudents();
  const r = await viaCode(updateContact, validateUpdateContact, { student_code: 'ce-00452', phone: '+77019998877' }, db);
  eq([r.status, r.body.student.student_code, r.body.student.phone], [200, 'CE-00452', '+77019998877'], 'update_contact by code → 200, student carries student_code');
  const mm = await viaCode(updateContact, validateUpdateContact, { student_id: B, student_code: 'CE-00452', phone: '+77019998877' }, db);
  eq([mm.status, mm.body.reason], [400, 'student_id_code_mismatch'], 'update_contact mismatch → 400');
}

console.log('\n=== index.ts (source) =================================================\n');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'index.ts'), 'utf8');

const sel = (INDEX.match(/const STUDENT_SELECT = '([^']+)'/) || [, ''])[1];
assert(/\bstudent_code\b/.test(sel), 'STUDENT_SELECT includes student_code');

// Evaluate shape() itself (strip the TS annotation) — every student payload goes through it.
const shapeSrc = (INDEX.match(/function shape\(row: any\) \{[\s\S]*?\n\}/) || [''])[0].replace('row: any', 'row');
const shape = new Function(`${shapeSrc}; return shape;`)();
const shaped = shape({ id: A, student_code: 'CE-00452', first_name: 'A', last_name: 'B', branch: { name: 'X' } });
eq(shaped.student_code, 'CE-00452', 'shape() returns student_code (direct select row)');
eq(shape({ id: A, student_code: 'CE-00001', branch_name: 'X' }).student_code, 'CE-00001', 'shape() returns student_code (RPC row)');
eq(Object.keys(shaped).slice(0, 2), ['id', 'student_code'], 'student_code sits next to id');

// Every students select that reaches a client response uses STUDENT_SELECT.
const studentSelects = INDEX.match(/\.from\('students'\)\.select\(([^)]*)\)/g) || [];
const nonShaped = studentSelects.filter((s) => !/STUDENT_SELECT|ROSTER_SELECT/.test(s));
assert(nonShaped.every((s) => /select\('id(, (status|amocrm_customer_id))?'(, \{ count: 'exact', head: true \})?\)/.test(s)),
  `non-STUDENT_SELECT student reads are internal id/status lookups only (${nonShaped.join(' | ')})`);
assert(/const ROSTER_SELECT = 'id, student_code,/.test(INDEX), 'roster export select carries student_code');
assert(/\.update\(patch\)\.eq\('id', id\)\s*\.select\(STUDENT_SELECT\)/.test(INDEX), 'update_contact returns STUDENT_SELECT row');

assert(/action === 'list'/.test(INDEX) && /listStudents\(ctx, url\)/.test(INDEX), 'routes GET action=list');
const list = (INDEX.match(/async function listStudents[\s\S]*?\n\}/) || [''])[0];
assert(/select\(STUDENT_SELECT, \{ count: 'exact' \}\)/.test(list), 'list uses count exact');
assert(/\.order\('student_code', \{ ascending: true \}\)/.test(list), 'list ordered by student_code');
assert(/\.range\(p\.offset, p\.offset \+ p\.limit - 1\)/.test(list), 'list paginates with range(offset, offset+limit-1)');
assert(/ok\(\{ total: count \?\? 0, limit: p\.limit, offset: p\.offset, students:/.test(list), 'list response {ok,total,limit,offset,students}');

const find = (INDEX.match(/async function findStudents[\s\S]*?\n\}/) || [''])[0];
const iCode = find.indexOf("get('student_code')");
const iAmo = find.indexOf("get('amocrm_customer_id')");
const iPhone = find.indexOf("get('phone')");
assert(iCode > 0 && iCode < iAmo && iAmo < iPhone, 'find precedence: student_code > amocrm_customer_id > phone');
assert(/err\('invalid_input', 400, \{ field: 'student_code' \}\)/.test(find), 'find: invalid code → 400 field student_code');

['linkAmocrmId', 'updateStudentContact', 'pushSurvivalScore'].forEach((fn) => {
  const body = (INDEX.match(new RegExp(`async function ${fn}[\\s\\S]*?\\n\\}`)) || [''])[0];
  assert(/resolveStudentRef\(codeLookup\(ctx\)/.test(body), `${fn} resolves student_code`);
});
const resolve = (INDEX.match(/async function resolveStudent\([\s\S]*?\n\}/) || [''])[0];
const iResCode = resolve.indexOf('body.student_code');
assert(iResCode > 0 && iResCode < resolve.indexOf("typeof body.student_id === 'string'"),
  'freeze/activate resolve student_code first');
assert(/'student_id_code_mismatch'/.test(INDEX.match(/const REASONS = \[[\s\S]*?\]/)[0]), 'REASONS includes student_id_code_mismatch');

// The create row is built in students-logic.mjs createStudent() and passed
// through verbatim by the index.ts adapter.
const LOGIC = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'students-logic.mjs'), 'utf8');
const inserts = LOGIC.match(/db\.insert\(\{[\s\S]*?\}\)/g) || [];
assert(inserts.length === 1 && !/student_code/.test(inserts[0]), 'create never sends student_code (DB assigns it)');
assert((INDEX.match(/\.from\('students'\)\.insert\(/g) || []).length === 1 && /\.from\('students'\)\.insert\(\[row\]\)/.test(INDEX),
  'index.ts inserts exactly the row built by createStudent()');

assert(/StudentCode:/.test(INDEX) && /student_code: \{ \$ref: '#\/components\/schemas\/StudentCode' \}/.test(INDEX), 'OpenAPI documents student_code');
assert(/'\/\?action=list'/.test(INDEX), 'OpenAPI documents action=list');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
