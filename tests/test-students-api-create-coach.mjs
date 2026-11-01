/**
 * students-api: optional coach_id on action=create + action=coaches lookup.
 *
 *  - validateCreate: coach_id optional (absent / null / blank → null), must be
 *    a UUID when given.
 *  - createStudent over a mock adapter: the coach is checked against the
 *    branch before any match / insert, written only on a NEW student, never
 *    on an existing match (amoCRM or phone + name, incl. link + reactivate).
 *  - parseCoachesParams / coachList: action=coaches shape, branch filter,
 *    sort.
 *  - index.ts (static): STUDENT_SELECT / shape() coach fields, coachInBranch
 *    adapter, routing, reasons, OpenAPI.
 *
 * Run: node tests/test-students-api-create-coach.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCreate,
  createStudent,
  parseCoachesParams,
  coachList,
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

const BRANCH = '22222222-2222-4222-8222-222222222222';
const OTHER_BRANCH = '55555555-5555-4555-8555-555555555555';
const COACH = '44444444-4444-4444-8444-444444444444';
const COACH_JUNCTION = '66666666-6666-4666-8666-666666666666';
const COACH_OTHER = '77777777-7777-4777-8777-777777777777';
const COACH_EXISTING = '88888888-8888-4888-8888-888888888888';
const UNKNOWN_COACH = '99999999-9999-4999-8999-999999999999';
const PHONE = '+77001234567';

console.log('\n=== validateCreate: coach_id ==========================================\n');
const base = { full_name: 'Dana Sadykova', phone: PHONE, branch_id: BRANCH };
eq(validateCreate(base).value.coach_id, null, 'absent coach_id → null');
eq(validateCreate({ ...base, coach_id: null }).value.coach_id, null, 'null coach_id → null');
eq(validateCreate({ ...base, coach_id: '' }).value.coach_id, null, 'empty coach_id → null');
eq(validateCreate({ ...base, coach_id: '   ' }).value.coach_id, null, 'blank coach_id → null');
eq(validateCreate({ ...base, coach_id: COACH }).value.coach_id, COACH, 'UUID coach_id passed through');
eq(validateCreate({ ...base, coach_id: 'not-a-uuid' }).field, 'coach_id', 'malformed coach_id → field coach_id');
eq(validateCreate({ ...base, coach_id: 42 }).field, 'coach_id', 'numeric coach_id → field coach_id');
eq(validateCreate({ ...base, branch_id: 'x', coach_id: 'bad' }).field, 'branch_id', 'branch_id still validated first');

console.log('\n=== createStudent: coach_id (mock DB) =================================\n');

// Coach membership: coaches.branch_id OR coach_branches rows.
const COACHES = {
  [COACH]: { branch_id: BRANCH, junction: [] },
  [COACH_JUNCTION]: { branch_id: OTHER_BRANCH, junction: [BRANCH] },
  [COACH_OTHER]: { branch_id: OTHER_BRANCH, junction: [] },
  [COACH_EXISTING]: { branch_id: BRANCH, junction: [] },
};

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function createDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, {
    status: 'active', branch_id: BRANCH, coach_id: null, amocrm_customer_id: null, parent_phone: null, ...r,
  }]));
  const calls = [];
  const view = (r) => ({ ...r });
  return {
    table, calls,
    async branchExists(id) { calls.push(['branchExists', id]); return [BRANCH, OTHER_BRANCH].includes(id); },
    async coachInBranch(coachId, branchId) {
      calls.push(['coachInBranch', coachId, branchId]);
      const c = COACHES[coachId];
      if (!c) return 'not_found';
      return c.branch_id === branchId || c.junction.includes(branchId) ? 'ok' : 'wrong_branch';
    },
    async findByAmocrmId(amo) {
      calls.push(['findByAmocrmId', amo]);
      return [...table.values()].filter((r) => r.amocrm_customer_id === amo).map(view);
    },
    async findByPhone(e164) {
      calls.push(['findByPhone', e164]);
      return [...table.values()].filter((r) => r.parent_phone === e164).map(view);
    },
    async linkIfNull(id, amo) {
      calls.push(['linkIfNull', id, amo]);
      const r = table.get(id);
      if (!r || r.amocrm_customer_id !== null) return { row: null };
      r.amocrm_customer_id = amo;
      return { row: view(r) };
    },
    async insert(row) {
      calls.push(['insert', row]);
      const id = uuid();
      table.set(id, { id, ...row });
      return { row: view(table.get(id)), status_history_id: 'h1' };
    },
    async activate(student) {
      calls.push(['activate', student.id]);
      table.get(student.id).status = 'active';
      return { changed: true, student: view(table.get(student.id)), status_history_id: 'h2', chesster_poke: 'skipped' };
    },
  };
}
const create = (db, body) => {
  const v = validateCreate(body);
  if (!v.value) throw new Error(`invalid test body: ${v.field}`);
  return createStudent(db, v.value);
};
const inserts = (db) => db.calls.filter((c) => c[0] === 'insert');
const writes = (db) => db.calls.filter((c) => ['insert', 'linkIfNull', 'activate'].includes(c[0]));
const snapshot = (db) => JSON.stringify([...db.table.values()]);

{
  const db = createDb();
  const r = await create(db, { ...base, amocrm_customer_id: 1001, coach_id: COACH });
  eq(r.status, 201, 'valid coach → 201');
  eq(inserts(db)[0][1].coach_id, COACH, 'insert row carries coach_id');
  eq(r.body.student.coach_id, COACH, 'created student has the coach');
  eq(db.calls.slice(0, 2).map((c) => c[0]), ['branchExists', 'coachInBranch'], 'coach checked right after the branch check');
}

{
  const db = createDb();
  const r = await create(db, { ...base, coach_id: COACH_JUNCTION });
  eq([r.status, inserts(db)[0][1].coach_id], [201, COACH_JUNCTION], 'coach assigned via coach_branches → 201 with coach_id');
}

{
  const db = createDb();
  const r = await create(db, { ...base, amocrm_customer_id: 1002 });
  eq(r.status, 201, 'no coach → still 201');
  assert('coach_id' in inserts(db)[0][1] && inserts(db)[0][1].coach_id === null, 'no coach → insert row coach_id null');
  eq(db.calls.filter((c) => c[0] === 'coachInBranch').length, 0, 'no coach → coachInBranch not called');
}

{
  const db = createDb([{ id: 'ex', first_name: 'Dana', last_name: 'Sadykova', parent_phone: PHONE }]);
  const before = snapshot(db);
  const r = await create(db, { ...base, coach_id: UNKNOWN_COACH });
  eq([r.status, r.body], [400, { ok: false, reason: 'invalid_coach' }], 'unknown coach → 400 invalid_coach');
  eq(writes(db).length, 0, 'unknown coach → nothing written');
  eq(db.calls.filter((c) => ['findByAmocrmId', 'findByPhone'].includes(c[0])).length, 0, 'unknown coach → rejected before any match');
  eq(snapshot(db), before, 'unknown coach → no record changed');
}

{
  const db = createDb();
  const r = await create(db, { ...base, amocrm_customer_id: 1003, coach_id: COACH_OTHER });
  eq([r.status, r.body], [400, { ok: false, reason: 'coach_branch_mismatch' }], 'coach from another branch → 400 coach_branch_mismatch');
  eq(writes(db).length, 0, 'coach_branch_mismatch → no insert');
}

{
  // Replay by Buyer ID onto a student that already has a different coach.
  const db = createDb([{ id: 'amo', first_name: 'Ali', last_name: 'Sadykov', amocrm_customer_id: 2001, coach_id: COACH_EXISTING }]);
  const before = snapshot(db);
  const r = await create(db, { full_name: 'Ali Sadykov', branch_id: BRANCH, amocrm_customer_id: 2001, coach_id: COACH });
  eq([r.status, r.body.existing, r.body.matched_by], [200, true, 'amocrm_customer_id'], 'amoCRM replay with coach → existing match');
  eq(r.body.student.coach_id, COACH_EXISTING, 'amoCRM replay: existing coach kept in response');
  eq(writes(db).length, 0, 'amoCRM replay: no insert / no write');
  eq(snapshot(db), before, 'amoCRM replay: coach never overwritten');
}

{
  // Phone + name match without a coach yet: coach is NOT written either.
  const db = createDb([{ id: 'pn', first_name: 'Dana', last_name: 'Sadykova', parent_phone: PHONE }]);
  const r = await create(db, { ...base, coach_id: COACH });
  eq([r.status, r.body.matched_by], [200, 'phone_name'], 'phone+name replay with coach → existing match');
  eq(db.table.get('pn').coach_id, null, 'phone+name: empty coach stays empty (no coach write on existing)');
  eq(inserts(db).length, 0, 'phone+name: no insert');
}

{
  // Phone + name match + Buyer ID link + reactivation, existing different coach.
  const db = createDb([{ id: 'fz', first_name: 'Dana', last_name: 'Sadykova', parent_phone: PHONE, status: 'frozen', coach_id: COACH_EXISTING }]);
  const r = await create(db, { ...base, amocrm_customer_id: 3001, coach_id: COACH });
  eq([r.status, r.body.linked, r.body.reactivated], [200, true, true], 'link + reactivate path with coach → 200');
  eq(db.table.get('fz').coach_id, COACH_EXISTING, 'link + reactivate: existing coach not overwritten');
  eq(db.calls.find((c) => c[0] === 'linkIfNull').length, 3, 'link writes only (id, amocrm_customer_id)');
  eq(inserts(db).length, 0, 'link + reactivate: no insert');
}

console.log('\n=== action=coaches helpers ============================================\n');
eq(parseCoachesParams({}).value, { branch_id: null }, 'no branch_id → no filter');
eq(parseCoachesParams({ branch_id: '' }).value, { branch_id: null }, 'empty branch_id → no filter');
eq(parseCoachesParams({ branch_id: BRANCH }).value, { branch_id: BRANCH }, 'UUID branch_id kept');
eq(parseCoachesParams({ branch_id: 'nope' }).field, 'branch_id', 'bad branch_id → field branch_id');

const rows = [
  { id: 'c2', first_name: 'Zarina', last_name: 'Ali', branch_id: BRANCH, coach_branches: [{ branch_id: BRANCH }] },
  { id: 'c1', first_name: 'Aidar', last_name: 'Nurlanov', branch_id: null, coach_branches: [{ branch_id: BRANCH }, { branch_id: OTHER_BRANCH }] },
  { id: 'c3', first_name: 'Bolat', last_name: 'Ermek', branch_id: OTHER_BRANCH, coach_branches: [] },
];
const all = coachList(rows);
eq(all.map((c) => c.id), ['c1', 'c3', 'c2'], 'sorted by name');
eq(all[0], { id: 'c1', name: 'Aidar Nurlanov', first_name: 'Aidar', last_name: 'Nurlanov', branch_ids: [BRANCH, OTHER_BRANCH] },
  'coach shape: id, name, first_name, last_name, branch_ids');
eq(all[2].branch_ids, [BRANCH], 'branch_ids deduped (coaches.branch_id ∪ coach_branches)');
eq(coachList(rows, BRANCH).map((c) => c.id), ['c1', 'c2'], 'branch filter via coach_branches or coaches.branch_id');
eq(coachList(rows, OTHER_BRANCH).map((c) => c.id), ['c1', 'c3'], 'branch filter on the other branch');
eq(coachList(null), [], 'null rows → []');

console.log('\n=== index.ts (static) =================================================\n');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'index.ts'), 'utf8');
const sel = INDEX.match(/const STUDENT_SELECT = '([^']*)'/)[1];
assert(/\bcoach_id\b/.test(sel) && /coach:coaches\(first_name, last_name\)/.test(sel), 'STUDENT_SELECT embeds coach_id + coach:coaches(first_name, last_name)');
const shapeBlock = INDEX.slice(INDEX.indexOf('function shape('), INDEX.indexOf('const PHONE_MESSAGE'));
assert(/coach_id: row\.coach_id \?\? null/.test(shapeBlock) && /coach: row\.coach \?/.test(shapeBlock), 'shape() emits coach_id / coach (null when absent, e.g. RPC rows)');
const cib = INDEX.slice(INDEX.indexOf('async coachInBranch('), INDEX.indexOf('async findByAmocrmId('));
assert(/from\('coaches'\)/.test(cib) && /coach_branches\(branch_id\)/.test(cib) && /'not_found'/.test(cib) && /'wrong_branch'/.test(cib),
  'coachInBranch reads coaches.branch_id + coach_branches → ok / not_found / wrong_branch');
assert(/method === 'GET' && action === 'coaches'[\s\S]*listCoaches\(ctx, url\)/.test(INDEX), 'routes GET action=coaches');
const reasons = INDEX.slice(INDEX.indexOf('const REASONS'), INDEX.indexOf('] as const'));
assert(reasons.includes("'invalid_coach'") && reasons.includes("'coach_branch_mismatch'"), 'invalid_coach / coach_branch_mismatch are declared Reasons');
const oa = INDEX.slice(INDEX.indexOf('const OPENAPI_SPEC'));
const oaCreate = oa.slice(oa.indexOf("'/?action=create'"), oa.indexOf("'/?action=freeze'"));
assert(/coach_id: \{ type: 'string', format: 'uuid'/.test(oaCreate), 'OpenAPI create request documents coach_id');
assert(oaCreate.includes('invalid_coach') && oaCreate.includes('coach_branch_mismatch'), 'OpenAPI create documents invalid_coach / coach_branch_mismatch');
assert(oa.includes("'/?action=coaches'"), 'OpenAPI documents /?action=coaches');
const oaStudent = oa.slice(oa.indexOf('Student: {'), oa.indexOf('paths: {'));
assert(/coach_id:/.test(oaStudent) && /coach:/.test(oaStudent), 'OpenAPI Student schema has coach_id / coach');
assert(/coaches/.test(INDEX.slice(0, 1400)), 'header comment lists coaches');

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
