/**
 * students-api: optional date_of_birth on action=create.
 *
 *  - validateCreate: date_of_birth optional (absent / null / blank → null),
 *    otherwise a real YYYY-MM-DD calendar date, year >= 1900, not in the
 *    future (Asia/Almaty); returned unchanged.
 *  - createStudent over a mock adapter: written only on a NEW student, never
 *    on an existing match (amoCRM replay, phone + name, link, reactivation).
 *  - Timezone independence: validation under extreme TZs keeps the string.
 *  - index.ts / OpenAPI / student.js (static).
 *
 * Run: node tests/test-students-api-dob.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateCreate,
  createStudent,
  isValidDateOfBirth,
  almatyToday,
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC = path.join(ROOT, 'supabase', 'functions', 'students-api', 'students-logic.mjs');
const BRANCH = '22222222-2222-4222-8222-222222222222';
const PHONE = '+77001234567';
const TODAY = '2026-11-25';
const base = { full_name: 'Ivan Ivanov', phone: PHONE, branch_id: BRANCH };

console.log('\n=== validateCreate: date_of_birth =====================================\n');
const dob = (v) => validateCreate({ ...base, date_of_birth: v }, { today: TODAY });
eq(validateCreate(base, { today: TODAY }).value.date_of_birth, null, 'absent → null');
eq(dob(null).value.date_of_birth, null, 'null → null');
eq(dob('').value.date_of_birth, null, '"" → null');
eq(dob('   ').value.date_of_birth, null, 'blank → null');
eq(dob('2016-05-20').value.date_of_birth, '2016-05-20', 'valid date returned unchanged');
eq(dob('2016-02-29').value.date_of_birth, '2016-02-29', 'leap day 2016-02-29 accepted');
eq(dob('2000-02-29').value.date_of_birth, '2000-02-29', 'leap day 2000-02-29 accepted (÷400)');
eq(dob('1900-01-01').value.date_of_birth, '1900-01-01', 'year 1900 accepted');
eq(dob(TODAY).value.date_of_birth, TODAY, 'today accepted');
for (const bad of ['2016-13-01', '2016-00-10', '2016-05-00', '2016-02-30', '2015-02-29', '1900-02-29', '2016-04-31',
  '20.05.2016', '2016-5-20', ' 2016-05-20', '2016-05-20T00:00:00Z', 20160520, { y: 2016 }, ['2016-05-20'], true,
  '2026-11-26', '2099-01-01', '1899-12-31']) {
  const r = dob(bad);
  eq([r.value, r.field], [undefined, 'date_of_birth'], `invalid ${JSON.stringify(bad)} → field date_of_birth`);
}
eq(validateCreate({ ...base, branch_id: 'x', date_of_birth: 'bad' }, { today: TODAY }).field, 'branch_id', 'existing fields validated first');
eq(validateCreate({ ...base, coach_id: 'bad', date_of_birth: 'bad' }, { today: TODAY }).field, 'coach_id', 'coach_id validated before date_of_birth');
assert(/^\d{4}-\d{2}-\d{2}$/.test(almatyToday()), 'almatyToday() is YYYY-MM-DD');
// 2026-11-25T20:00Z is already 2026-11-26 in Almaty (UTC+5).
eq(almatyToday(Date.UTC(2026, 10, 25, 20, 0)), '2026-11-26', 'almatyToday uses Asia/Almaty, not UTC');
eq(isValidDateOfBirth('2026-11-26', '2026-11-25'), false, 'tomorrow rejected');

console.log('\n=== createStudent: date_of_birth (mock DB) ============================\n');

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
function createDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, {
    status: 'active', branch_id: BRANCH, coach_id: null, amocrm_customer_id: null, parent_phone: null, date_of_birth: null, ...r,
  }]));
  const calls = [];
  const view = (r) => ({ ...r });
  return {
    table, calls,
    async branchExists(id) { calls.push(['branchExists', id]); return id === BRANCH; },
    async coachInBranch() { calls.push(['coachInBranch']); return 'ok'; },
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
      calls.push(['activate', student]);
      table.get(student.id).status = 'active';
      return { changed: true, student: view(table.get(student.id)), status_history_id: 'h2', chesster_poke: 'skipped' };
    },
  };
}
const WRITES = ['insert', 'linkIfNull', 'activate'];
const writes = (db) => db.calls.filter((c) => WRITES.includes(c[0]));
const inserts = (db) => db.calls.filter((c) => c[0] === 'insert');
// The only writes allowed on an existing match: linkIfNull(id, amo) and
// activate(stored student) — neither can carry a new date_of_birth.
const noDobWrite = (db) => writes(db).every((c) =>
  (c[0] === 'linkIfNull' && c.length === 3) || (c[0] === 'activate' && c[1].date_of_birth === null));
// Mirrors the index.ts handler: validate, 400 on failure, else the flow.
async function handle(db, body) {
  const v = validateCreate(body, { today: TODAY });
  if (!v.value) return { status: 400, body: { ok: false, reason: 'invalid_input', field: v.field } };
  return createStudent(db, v.value);
}

{
  const db = createDb();
  const r = await handle(db, { full_name: 'Ivan Ivanov', branch_id: BRANCH, amocrm_customer_id: 123456, date_of_birth: '2016-05-20' });
  eq(r.status, 201, 'create with 2016-05-20 → 201');
  eq(inserts(db)[0][1].date_of_birth, '2016-05-20', 'insert row date_of_birth = "2016-05-20"');
  eq(r.body.student.date_of_birth, '2016-05-20', 'response student carries date_of_birth');
}

for (const [label, extra] of [['absent', {}], ['null', { date_of_birth: null }], ['""', { date_of_birth: '' }]]) {
  const db = createDb();
  const r = await handle(db, { ...base, ...extra });
  eq(r.status, 201, `create with date_of_birth ${label} → 201`);
  const row = inserts(db)[0][1];
  assert('date_of_birth' in row && row.date_of_birth === null, `date_of_birth ${label} → insert row date_of_birth null`);
}

{
  const db = createDb();
  const r = await handle(db, { ...base, date_of_birth: '2016-02-29' });
  eq([r.status, inserts(db)[0][1].date_of_birth], [201, '2016-02-29'], 'leap day 2016-02-29 → 201 stored as-is');
}

for (const bad of ['2016-13-01', '2016-02-30', '2015-02-29', '20.05.2016', '2016-5-20', 20160520, '2026-11-26', '1899-12-31']) {
  const db = createDb([{ id: 'ex', first_name: 'Ivan', last_name: 'Ivanov', parent_phone: PHONE }]);
  const r = await handle(db, { ...base, amocrm_customer_id: 777, date_of_birth: bad });
  eq([r.status, r.body.field], [400, 'date_of_birth'], `invalid ${JSON.stringify(bad)} → 400 field date_of_birth`);
  eq(db.calls.length, 0, `invalid ${JSON.stringify(bad)} → no db call at all`);
}

{
  // amoCRM replay with a different date.
  const db = createDb([{ id: 'amo', first_name: 'Ivan', last_name: 'Ivanov', amocrm_customer_id: 123456, date_of_birth: '2015-01-01' }]);
  const r = await handle(db, { full_name: 'Ivan Ivanov', branch_id: BRANCH, amocrm_customer_id: 123456, date_of_birth: '2016-05-20' });
  eq([r.status, r.body.existing, r.body.matched_by], [200, true, 'amocrm_customer_id'], 'amoCRM replay → 200 existing');
  eq(r.body.student.date_of_birth, '2015-01-01', 'amoCRM replay: existing date kept');
  eq(writes(db).length, 0, 'amoCRM replay: no write');
}

{
  // amoCRM replay onto a frozen student with no date → reactivated, date still not written.
  const db = createDb([{ id: 'fz', first_name: 'Ivan', last_name: 'Ivanov', amocrm_customer_id: 123456, status: 'frozen' }]);
  const r = await handle(db, { full_name: 'Ivan Ivanov', branch_id: BRANCH, amocrm_customer_id: 123456, date_of_birth: '2016-05-20' });
  eq([r.status, r.body.reactivated], [200, true], 'frozen replay → reactivated');
  eq(db.table.get('fz').date_of_birth, null, 'frozen replay: empty date stays empty');
  eq(inserts(db).length, 0, 'frozen replay: no insert');
  eq(db.calls.find((c) => c[0] === 'activate')[1].date_of_birth, null, 'activate payload is the stored student (no new date)');
  assert(noDobWrite(db), 'frozen replay: no date_of_birth in any write');
}

{
  // Phone + name match, no Buyer ID → existing, nothing written.
  const db = createDb([{ id: 'pn', first_name: 'Ivan', last_name: 'Ivanov', parent_phone: PHONE }]);
  const r = await handle(db, { ...base, date_of_birth: '2016-05-20' });
  eq([r.status, r.body.matched_by], [200, 'phone_name'], 'phone+name match → 200');
  eq(db.table.get('pn').date_of_birth, null, 'phone+name: empty date stays empty');
  eq(writes(db).length, 0, 'phone+name: no write');
}

{
  // Phone + name match + link + reactivation.
  const db = createDb([{ id: 'lk', first_name: 'Ivan', last_name: 'Ivanov', parent_phone: PHONE, status: 'left' }]);
  const r = await handle(db, { ...base, amocrm_customer_id: 555, date_of_birth: '2016-05-20' });
  eq([r.status, r.body.linked, r.body.reactivated], [200, true, true], 'link + reactivate → 200');
  eq(db.table.get('lk').date_of_birth, null, 'link + reactivate: date not written');
  eq(db.calls.find((c) => c[0] === 'linkIfNull'), ['linkIfNull', 'lk', 555], 'linkIfNull payload is only (id, amocrm_customer_id)');
  eq(inserts(db).length, 0, 'link + reactivate: no insert');
  assert(noDobWrite(db), 'link + reactivate: no date_of_birth in any write');
}

console.log('\n=== timezone independence =============================================\n');
for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
  const script = `import('${LOGIC.replace(/\\/g, '/')}').then((m) => {
    const v = m.validateCreate({ full_name: 'Ivan Ivanov', phone: '${PHONE}', branch_id: '${BRANCH}', date_of_birth: '2016-05-20' }, { today: '${TODAY}' });
    process.stdout.write(JSON.stringify([v.value && v.value.date_of_birth, m.isValidDateOfBirth('2016-02-29', '${TODAY}'), m.isValidDateOfBirth('2016-02-30', '${TODAY}')]));
  });`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz } }).toString();
  eq(JSON.parse(out), ['2016-05-20', true, false], `TZ=${tz}: '2016-05-20' stays '2016-05-20'`);
}

console.log('\n=== index.ts (static) =================================================\n');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'index.ts'), 'utf8');
const sel = INDEX.match(/const STUDENT_SELECT = '([^']*)'/)[1];
assert(/\bdate_of_birth\b/.test(sel), 'STUDENT_SELECT contains date_of_birth');
const shapeBlock = INDEX.slice(INDEX.indexOf('function shape('), INDEX.indexOf('const PHONE_MESSAGE'));
assert(/date_of_birth: row\.date_of_birth \?\? null/.test(shapeBlock), 'shape() passes date_of_birth through (null when absent)');
assert(!/new Date|Date\.parse/.test(shapeBlock), 'shape() never parses dates');
const fbp = INDEX.slice(INDEX.indexOf('async function findByPhone('), INDEX.indexOf('// Adapter for resolveStudentRef'));
assert(/\.select\('[^']*\bdate_of_birth\b[^']*'\)/.test(fbp), 'findByPhone second select fetches date_of_birth');
assert(/date_of_birth: c\?\.date_of_birth \?\? null/.test(fbp), 'findByPhone merges date_of_birth');
assert(/const DATE_OF_BIRTH_MESSAGE = 'date_of_birth must be a real calendar date in YYYY-MM-DD format \(e\.g\. 2016-05-20\), not in the future'/.test(INDEX),
  'DATE_OF_BIRTH_MESSAGE declared with the exact text');
assert(/v\.field === 'date_of_birth' \? DATE_OF_BIRTH_MESSAGE/.test(INDEX), 'create handler maps field date_of_birth → message');
const oa = INDEX.slice(INDEX.indexOf('const OPENAPI_SPEC'));
const oaStudent = oa.slice(oa.indexOf('Student: {'), oa.indexOf('paths: {'));
assert(/date_of_birth: \{ type: 'string', format: 'date', nullable: true, example: '2016-05-20'/.test(oaStudent), 'inline OpenAPI Student schema has date_of_birth');
const oaCreate = oa.slice(oa.indexOf("'/?action=create'"), oa.indexOf("'/?action=freeze'"));
assert(/date_of_birth: \{ type: 'string', format: 'date'/.test(oaCreate) && /NEW student/.test(oaCreate), 'inline OpenAPI create request documents date_of_birth');
assert(oaCreate.includes('with_date_of_birth') && oaCreate.includes('invalid_date_of_birth'), 'inline OpenAPI create has with_date_of_birth / invalid_date_of_birth examples');
assert(/amocrm_customer_id, coach_id, date_of_birth\)/.test(oaCreate), 'inline OpenAPI 400 field list includes date_of_birth');
const oaFind = oa.slice(oa.indexOf("'/?action=find'"), oa.indexOf("'/?action=list'"));
assert(oaFind.includes("date_of_birth: '2016-05-20'"), 'inline OpenAPI find example shows date_of_birth');

const YAML = fs.readFileSync(path.join(ROOT, 'docs', 'openapi', 'students-api.yaml'), 'utf8');
const yStudent = YAML.slice(YAML.indexOf('    Student:'), YAML.indexOf('    StudentSelector:'));
assert(/date_of_birth:\s+type: \[string, 'null'\]\s+format: date/.test(yStudent), 'yaml Student schema has date_of_birth');
const yCreate = YAML.slice(YAML.indexOf('/?action=create:'), YAML.indexOf('/?action=freeze:'));
assert(/date_of_birth:\s+type: \[string, 'null'\]\s+format: date/.test(yCreate) && /NEW student/.test(yCreate), 'yaml create request documents date_of_birth');
assert(yCreate.includes('with_date_of_birth') && yCreate.includes('invalid_date_of_birth') && /coach_id, date_of_birth\)/.test(yCreate),
  'yaml create has examples + 400 field list');
const yFind = YAML.slice(YAML.indexOf('/?action=find:'), YAML.indexOf('/?action=list:'));
assert(yFind.includes("date_of_birth: '2016-05-20'"), 'yaml find example shows date_of_birth');

console.log('\n=== student.js card ===================================================\n');
const STUDENT_SRC = fs.readFileSync(path.join(ROOT, 'student.js'), 'utf8');
const start = STUDENT_SRC.indexOf('function formatDateOfBirth(');
const end = STUDENT_SRC.indexOf('\n}\n', start) + 2;
const ctx = vm.createContext({});
vm.runInContext(STUDENT_SRC.slice(start, end), ctx);
eq(ctx.formatDateOfBirth('2016-05-20'), '20.05.2016', 'formatDateOfBirth → DD.MM.YYYY');
eq(ctx.formatDateOfBirth(null), null, 'formatDateOfBirth(null) → null');
eq(ctx.formatDateOfBirth('bad'), null, 'formatDateOfBirth(garbage) → null');
assert(!/new Date/.test(STUDENT_SRC.slice(start, end)), 'formatDateOfBirth never uses Date');
assert(/t\('student\.dateOfBirth'\)\}: \$\{formatDateOfBirth\(student\.dateOfBirth\)\}/.test(STUDENT_SRC), 'profile card renders the student.dateOfBirth row');

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
