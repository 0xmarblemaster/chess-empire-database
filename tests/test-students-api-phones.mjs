/**
 * Shared family phones + international (E.164) phones in the students-api.
 *
 *  - normalizePhone: E.164 via libphonenumber "max" metadata (+7, +351, +44,
 *    +420, +90 kept; legacy KZ inputs → +7; invalid / incomplete codes → null).
 *  - normalizeName: the secondary-match name key.
 *  - validateCreate: phone optional with a Buyer ID, invalid phone rejected.
 *  - createStudent flow over an in-memory mock DB (Buyer ID first, then
 *    phone + name; ambiguity / conflicts write nothing).
 *  - update_contact keeps international numbers; status / branch untouched.
 *
 * Phone numbers are libphonenumber example numbers, not customer data.
 *
 * Run: node tests/test-students-api-phones.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExampleNumber } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';
import {
  normalizePhone,
  normalizeName,
  validateCreate,
  createStudent,
  validateUpdateContact,
  updateContact,
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

const EX = Object.fromEntries(['KZ', 'PT', 'GB', 'CZ', 'TR'].map((c) => [c, getExampleNumber(c, examples)]));
const BRANCH = '22222222-2222-4222-8222-222222222222';
const SHARED = '+77001234567';

console.log('\n=== normalizePhone (E.164) ============================================\n');
for (const [c, ex] of Object.entries(EX)) {
  eq(normalizePhone(ex.formatInternational()), ex.number, `${c} ${ex.formatInternational()} → ${ex.number}`);
  eq(normalizePhone(ex.number), ex.number, `${c} idempotent on E.164`);
}
eq(normalizePhone('+351 912 345 678'), '+351912345678', '+351 Portugal kept');
eq(normalizePhone('+44 7400 123456'), '+447400123456', '+44 UK kept');
eq(normalizePhone('+420 601-123-456'), '+420601123456', '+420 Czechia kept (dashes)');
eq(normalizePhone('+90 501 234 56 78'), '+905012345678', '+90 Türkiye kept');
eq(normalizePhone('00351 912 345 678'), '+351912345678', '00 prefix read as +');
eq(normalizePhone('+7 700 123 45 67'), SHARED, '+7 KZ kept');
eq(normalizePhone('8 700 123 45 67'), SHARED, 'legacy 8XXXXXXXXXX → +7');
eq(normalizePhone('87001234567'), SHARED, 'legacy bare 8… → +7');
eq(normalizePhone('7001234567'), SHARED, 'legacy bare 10 digits → +7');
eq(normalizePhone('+3'), null, '+3 alone (incomplete country code) → null');
eq(normalizePhone('+3 912 345 678'), null, '+3 + digits (no such country code) → null, never rewritten');
eq(normalizePhone('+44 123'), null, 'too short UK → null (never padded/guessed)');
eq(normalizePhone('+351 912 345 678 999'), null, 'too long PT → null (never truncated)');
eq(normalizePhone('+7 7911123456'), null, '+7 with impossible national number → null');
eq(normalizePhone('351912345678'), null, 'unprefixed international → null (country code not guessed)');
eq(normalizePhone('+44 7911 12345a'), null, 'letters → null');
eq(normalizePhone('++447400123456'), null, 'double plus → null');

console.log('\n=== normalizeName =====================================================\n');
eq(normalizeName('  Алёна   ИВАНОВА '), 'алена иванова', 'trim + collapse + lowercase + ё→е');
eq(normalizeName('Ali\tSadykov'), 'ali sadykov', 'tabs collapse');
eq(normalizeName('Алё̈на'.replace('ё̈', 'ё')), 'алена', 'decomposed ё (е + U+0308) → е');
eq(normalizeName(null), '', 'null → empty');

console.log('\n=== validateCreate ====================================================\n');
eq(validateCreate({ full_name: '', phone: SHARED, branch_id: BRANCH }).field, 'full_name', 'no name → full_name');
eq(validateCreate({ full_name: 'Ali Sadykov', branch_id: BRANCH }).field, 'phone', 'no phone, no Buyer ID → phone required');
eq(validateCreate({ full_name: 'Ali Sadykov', phone: '  ', branch_id: BRANCH }).field, 'phone', 'blank phone, no Buyer ID → phone required');
eq(validateCreate({ full_name: 'Ali Sadykov', phone: '+3 12345', branch_id: BRANCH, amocrm_customer_id: 1 }).field, 'phone',
  'present-but-invalid phone with Buyer ID → phone (never silently dropped)');
eq(validateCreate({ full_name: 'Ali Sadykov', phone: 77001234567, branch_id: BRANCH, amocrm_customer_id: 1 }).field, 'phone',
  'non-string phone → phone');
eq(validateCreate({ full_name: 'Ali Sadykov', phone: SHARED, branch_id: 'x' }).field, 'branch_id', 'bad branch → branch_id');
eq(validateCreate({ full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 0 }).field, 'amocrm_customer_id', 'amo 0 → amocrm_customer_id');
eq(validateCreate({ full_name: 'Timur Akhmetov', branch_id: BRANCH, amocrm_customer_id: '1004' }).value,
  { first_name: 'Timur', last_name: 'Akhmetov', full_name: 'Timur Akhmetov', phone: null, branch_id: BRANCH, amocrm_customer_id: 1004 },
  'no phone + Buyer ID → valid, phone null');
eq(validateCreate({ full_name: 'Timur Akhmetov', phone: '', branch_id: BRANCH, amocrm_customer_id: 1004 }).value.phone, null,
  'empty phone + Buyer ID → phone null');
eq(validateCreate({ full_name: 'Maria Silva', phone: '+351 912 345 678', branch_id: BRANCH }).value.phone, '+351912345678',
  'international phone normalized to E.164');

console.log('\n=== createStudent (mock DB) ===========================================\n');

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const digits = (p) => String(p || '').replace(/[^0-9]/g, '');

// In-memory students table mirroring the adapter contract. findByPhone mirrors
// SQL find_students_by_phone_e164: exact digits, legacy unprefixed only for +7.
function createDb(rows = [], { branches = [BRANCH], beforeInsert, beforeLink, activateRefused = false } = {}) {
  const table = new Map(rows.map((r) => {
    const id = r.id || uuid();
    return [id, { id, status: 'active', branch_id: BRANCH, coach_id: 'c1', amocrm_customer_id: null, parent_phone: null, ...r }];
  }));
  const history = [];
  const calls = [];
  const view = (r) => ({ ...r });
  const db = {
    table, history, calls,
    async branchExists(id) { calls.push(['branchExists']); return branches.includes(id); },
    async findByAmocrmId(amo) {
      calls.push(['findByAmocrmId', amo]);
      return [...table.values()].filter((r) => r.amocrm_customer_id === amo).map(view);
    },
    async findByPhone(e164) {
      calls.push(['findByPhone', e164]);
      const d = e164.slice(1);
      return [...table.values()].filter((r) => {
        const s = digits(r.parent_phone);
        return s === d || (/^7[0-9]{10}$/.test(d) && (s === '8' + d.slice(1) || s === d.slice(1)));
      }).map(view);
    },
    async linkIfNull(id, amo) {
      calls.push(['linkIfNull', id, amo]);
      if (beforeLink) beforeLink(table);
      if ([...table.values()].some((r) => r.amocrm_customer_id === amo && r.id !== id)) return { uniqueViolation: true };
      const r = table.get(id);
      if (!r || r.amocrm_customer_id !== null) return { row: null };
      r.amocrm_customer_id = amo;
      return { row: view(r) };
    },
    async insert(row) {
      calls.push(['insert', row]);
      if (beforeInsert) beforeInsert(table);
      if (row.amocrm_customer_id !== null && [...table.values()].some((r) => r.amocrm_customer_id === row.amocrm_customer_id)) {
        return { uniqueViolation: true };
      }
      const id = uuid();
      table.set(id, { id, ...row });
      history.push({ student_id: id, new_status: 'active' });
      return { row: view(table.get(id)), status_history_id: `h${history.length}` };
    },
    async activate(student) {
      calls.push(['activate', student.id]);
      if (activateRefused) return { refused: true, reason: 'manual_change_recent' };
      table.get(student.id).status = 'active';
      history.push({ student_id: student.id, new_status: 'active' });
      return { changed: true, student: view(table.get(student.id)), status_history_id: `h${history.length}`, chesster_poke: 'skipped' };
    },
  };
  return db;
}
const writes = (db) => db.calls.filter((c) => ['insert', 'linkIfNull', 'activate'].includes(c[0]));
const create = (db, body) => {
  const v = validateCreate(body);
  if (!v.value) throw new Error(`invalid test body: ${v.field}`);
  return createStudent(db, v.value);
};
const snapshot = (db) => JSON.stringify([...db.table.values()]);

{
  // Acceptance 1 + 2 + 3: two Buyer IDs, one phone; replay is idempotent.
  const db = createDb();
  const a = await create(db, { full_name: 'Ali Sadykov', phone: '+7 700 123 45 67', branch_id: BRANCH, amocrm_customer_id: 1001 });
  const b = await create(db, { full_name: 'Aru Sadykova', phone: '87001234567', branch_id: BRANCH, amocrm_customer_id: 1002 });
  eq([a.status, b.status], [201, 201], 'AC1: two Buyer IDs with one phone → two 201 creates');
  assert(a.body.student.id !== b.body.student.id, 'AC1: two distinct UUIDs');
  eq([a.body.student.amocrm_customer_id, b.body.student.amocrm_customer_id], [1001, 1002], 'AC1: each keeps its own Buyer ID');
  eq([a.body.student.parent_phone, b.body.student.parent_phone], [SHARED, SHARED], 'AC1: both store the same E.164 phone');

  const before = snapshot(db);
  const inserts = db.calls.filter((c) => c[0] === 'insert').length;
  const replay = await create(db, { full_name: 'Aru Sadykova', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 1002 });
  eq(replay.status, 200, 'AC2: replay of Buyer ID B → 200');
  eq(replay.body.student.id, b.body.student.id, 'AC2: replay returns the same UUID');
  eq(replay.body.matched_by, 'amocrm_customer_id', 'AC2: matched by Buyer ID');
  eq(db.calls.filter((c) => c[0] === 'insert').length, inserts, 'AC2: no third insert');
  eq(snapshot(db), before, 'AC2: nothing changed');
  eq(db.table.size, 2, 'AC2: still exactly two students');

  const found = await db.findByPhone(normalizePhone('+7 (700) 123-45-67'));
  eq(found.map((s) => s.id).sort(), [a.body.student.id, b.body.student.id].sort(), 'AC3: phone lookup returns both siblings');
}

{
  // Acceptance 4: name selects the right sibling; Buyer ID linked onto it.
  const db = createDb([
    { id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: '+7 700 123 45 67' },
    { id: 'aru', first_name: 'Aru', last_name: 'Sadykova', parent_phone: '87001234567', status: 'frozen' },
  ]);
  const r = await create(db, { full_name: '  ARU   sadykova ', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 2002 });
  eq(r.status, 200, 'AC4: phone + name match → 200');
  eq(r.body.student.id, 'aru', 'AC4: selects the name-matched sibling, not the other one');
  eq([r.body.matched_by, r.body.linked, r.body.reactivated], ['phone_name', true, true], 'AC4: matched_by phone_name, Buyer ID linked, frozen reactivated');
  eq(db.table.get('aru').amocrm_customer_id, 2002, 'AC4: Buyer ID written onto the match');
  eq([db.table.get('ali').amocrm_customer_id, db.table.get('ali').status], [null, 'active'], 'AC4: other sibling untouched');
  eq(db.calls.filter((c) => c[0] === 'insert').length, 0, 'AC4: no insert');
}

{
  // Ё/е + no Buyer ID: existing match returned, nothing linked or written.
  const db = createDb([{ id: 'alena', first_name: 'Алёна', last_name: 'Иванова', parent_phone: SHARED }]);
  const r = await create(db, { full_name: 'Алена Иванова', phone: SHARED, branch_id: BRANCH });
  eq([r.status, r.body.student.id, r.body.existing], [200, 'alena', true], 'no Buyer ID: ё/е-insensitive name match → existing');
  eq(writes(db).length, 0, 'no Buyer ID: active match → no writes');
}

{
  // Acceptance 5: no name match → new sibling with the same phone.
  const db = createDb([{ id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED, status: 'frozen' }]);
  const r = await create(db, { full_name: 'Dana Sadykova', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 3003 });
  eq(r.status, 201, 'AC5: no name match → 201 new student');
  assert(r.body.student.id !== 'ali', 'AC5: not the differently named sibling');
  eq([r.body.student.parent_phone, r.body.student.amocrm_customer_id], [SHARED, 3003], 'AC5: same phone + new Buyer ID');
  eq([db.table.get('ali').status, db.table.get('ali').amocrm_customer_id], ['frozen', null], 'AC5: sibling not activated or linked');
  eq(db.calls.filter((c) => c[0] === 'activate').length, 0, 'AC5: no activation');
}

{
  // No Buyer ID path: a phone hit with a different name is no longer a duplicate.
  const db = createDb([{ id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED }]);
  const r = await create(db, { full_name: 'Dana Sadykova', phone: SHARED, branch_id: BRANCH });
  eq([r.status, r.body.student.amocrm_customer_id], [201, null], 'no Buyer ID + no name match → new student');
}

{
  // Acceptance 6: duplicate same-name siblings → ambiguous, nothing written.
  const db = createDb([
    { id: 'a1', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED },
    { id: 'a2', first_name: 'ALI', last_name: 'Sadykov ', parent_phone: '87001234567', status: 'frozen' },
    { id: 'x', first_name: 'Aru', last_name: 'Sadykova', parent_phone: SHARED },
  ]);
  const before = snapshot(db);
  const r = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 4004 });
  eq([r.status, r.body.ok, r.body.reason], [409, false, 'ambiguous'], 'AC6: two same-name siblings → 409 ambiguous');
  eq(r.body.candidates.map((c) => c.id).sort(), ['a1', 'a2'], 'AC6: candidates are exactly the name matches');
  eq(writes(db).length, 0, 'AC6: no write');
  eq(snapshot(db), before, 'AC6: no record changed');
  const r2 = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH });
  eq(r2.body.reason, 'ambiguous', 'AC6: same without Buyer ID → ambiguous');
}

{
  // Acceptance 7 (create): each country code preserved.
  const db = createDb();
  let amo = 5000;
  for (const [c, ex] of Object.entries(EX)) {
    const r = await create(db, { full_name: `Test ${c}`, phone: ex.formatInternational(), branch_id: BRANCH, amocrm_customer_id: ++amo });
    eq([r.status, r.body.student.parent_phone], [201, ex.number], `AC7: create stores ${c} as ${ex.number}`);
  }
}

{
  // Acceptance 8: no phone → stored null, no placeholder, phone never matched.
  const db = createDb([{ id: 'nophone', first_name: 'Timur', last_name: 'Akhmetov', parent_phone: null }]);
  const r = await create(db, { full_name: 'Timur Akhmetov', branch_id: BRANCH, amocrm_customer_id: 6006 });
  eq(r.status, 201, 'AC8: Buyer ID + name + branch, no phone → 201');
  eq(r.body.student.parent_phone, null, 'AC8: phone stored as null');
  eq(db.calls.filter((c) => c[0] === 'insert')[0][1].parent_phone, null, 'AC8: insert row has parent_phone null (no placeholder)');
  eq(db.calls.filter((c) => c[0] === 'findByPhone').length, 0, 'AC8: no phone → no phone matching');
  eq(db.table.get('nophone').amocrm_customer_id, null, 'AC8: null-phone namesake not matched/linked');
}

{
  // Acceptance 9: invalid international phone → 400 before any DB call.
  const v = validateCreate({ full_name: 'Maria Silva', phone: '+3 912 345 678', branch_id: BRANCH, amocrm_customer_id: 7007 });
  eq(v, { field: 'phone' }, 'AC9: invalid international → field phone (handler returns 400, flow never runs)');
}

{
  // Acceptance 10: phone+name match already holds a DIFFERENT Buyer ID → 409.
  const db = createDb([{ id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED, amocrm_customer_id: 1001, status: 'frozen' }]);
  const before = snapshot(db);
  const r = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 9999 });
  eq([r.status, r.body.reason, r.body.conflict_student_id], [409, 'amocrm_customer_id_conflict', 'ali'], 'AC10: different Buyer ID on match → 409');
  eq(writes(db).length, 0, 'AC10: nothing written');
  eq(snapshot(db), before, 'AC10: records unchanged');
}

{
  // Race: Buyer ID inserted concurrently → 23505 → 409 with the owner.
  const db = createDb([], { beforeInsert: (t) => t.set('racer', { id: 'racer', amocrm_customer_id: 8008, parent_phone: null }) });
  const r = await create(db, { full_name: 'Late Request', branch_id: BRANCH, amocrm_customer_id: 8008 });
  eq([r.status, r.body.reason, r.body.conflict_student_id], [409, 'amocrm_customer_id_conflict', 'racer'], 'race: 23505 on insert → 409');
}

{
  // Race: Buyer ID linked to another student between read and link → 409.
  const db = createDb([{ id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED }], {
    beforeLink: (t) => t.set('other', { id: 'other', amocrm_customer_id: 8100 }),
  });
  const r = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 8100 });
  eq([r.status, r.body.conflict_student_id], [409, 'other'], 'race: 23505 on link → 409');
  eq(db.table.get('ali').amocrm_customer_id, null, 'race: match not linked');
}

{
  // Race: an identical concurrent request linked the same id first → idempotent.
  const db = createDb([{ id: 'ali', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED }], {
    beforeLink: (t) => { t.get('ali').amocrm_customer_id = 8200; },
  });
  const r = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 8200 });
  eq([r.status, r.body.student.id], [200, 'ali'], 'race: same id linked concurrently → 200 same student');
}

{
  // Buyer ID owner wins over phone; a frozen phone match is never touched.
  const db = createDb([
    { id: 'owner', first_name: 'Ali', last_name: 'Sadykov', parent_phone: '+447400123456', amocrm_customer_id: 1111 },
    { id: 'phone', first_name: 'Ali', last_name: 'Sadykov', parent_phone: SHARED, status: 'frozen' },
  ]);
  const r = await create(db, { full_name: 'Ali Sadykov', phone: SHARED, branch_id: BRANCH, amocrm_customer_id: 1111 });
  eq([r.status, r.body.student.id], [200, 'owner'], 'Buyer ID owner returned even when another student matches the phone');
  eq(db.table.get('phone').status, 'frozen', 'phone-matched sibling not reactivated');
  eq(writes(db).length, 0, 'no write');
}

{
  // Frozen Buyer-ID owner: reactivation refused by the 3-day guard is reported.
  const db = createDb([{ id: 'own', first_name: 'A', last_name: 'B', amocrm_customer_id: 1212, status: 'frozen' }], { activateRefused: true });
  const r = await create(db, { full_name: 'A B', branch_id: BRANCH, amocrm_customer_id: 1212 });
  eq([r.status, r.body.reactivated, r.body.reason], [200, false, 'manual_change_recent'], 'frozen owner + manual guard → reactivated:false');
}

{
  // +44 never matches a +7 number with the same last 10 digits.
  const db = createDb([{ id: 'kz', first_name: 'Ali', last_name: 'Sadykov', parent_phone: '+77400123456' }]);
  const r = await create(db, { full_name: 'Ali Sadykov', phone: '+44 7400 123456', branch_id: BRANCH, amocrm_customer_id: 1313 });
  eq(r.status, 201, '+44 7400123456 does not match +7 7400123456 → new student');
  eq(db.table.get('kz').amocrm_customer_id, null, '+7 student not linked');
}

{
  const db = createDb([], { branches: [] });
  const r = await create(db, { full_name: 'A B', phone: SHARED, branch_id: BRANCH });
  eq([r.status, r.body.reason], [400, 'invalid_branch'], 'unknown branch → 400 invalid_branch');
  eq(writes(db).length, 0, 'unknown branch → no write');
}

console.log('\n=== update_contact keeps E.164 / leaves status alone ==================\n');
{
  const row = { id: 's1', status: 'frozen', branch_id: BRANCH, coach_id: 'c1', parent_phone: SHARED, amocrm_customer_id: 1 };
  const db = {
    async getStudent() { return { id: row.id, phone: row.parent_phone, amocrm_customer_id: row.amocrm_customer_id, status: row.status }; },
    async findOwnerId() { return null; },
    async update(_id, patch) { Object.assign(row, patch); return { row: { id: row.id, phone: row.parent_phone } }; },
  };
  for (const [c, ex] of Object.entries(EX)) {
    const v = validateUpdateContact({ student_id: '00000000-0000-4000-8000-000000000001', phone: ex.formatInternational() });
    const r = await updateContact(db, { ...v.value, student_id: 's1' });
    eq([r.status, row.parent_phone], [200, ex.number], `AC7: update_contact stores ${c} as ${ex.number}`);
  }
  eq([row.status, row.branch_id, row.coach_id, row.amocrm_customer_id], ['frozen', BRANCH, 'c1', 1], 'AC11: status / branch / coach / amo untouched');
  eq(validateUpdateContact({ student_id: '00000000-0000-4000-8000-000000000001', phone: '+3 912 345 678' }).field, 'phone',
    'AC9: update_contact rejects an invalid international phone');
  eq('phone' in validateUpdateContact({ student_id: '00000000-0000-4000-8000-000000000001', amocrm_customer_id: 5 }).value, false,
    'omitted phone is not part of the update (preserved)');
}

console.log('\n=== Deno import map for every importer of students-logic.mjs ==========\n');
{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fnDir = path.join(root, 'supabase', 'functions');
  const pinned = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies['libphonenumber-js'];
  assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pinned), `package.json pins libphonenumber-js exactly (${pinned})`);
  const importers = fs.readdirSync(fnDir).filter((f) => {
    const idx = path.join(fnDir, f, 'index.ts');
    return fs.existsSync(idx) && /students-logic\.mjs/.test(fs.readFileSync(idx, 'utf8'));
  });
  assert(importers.length >= 7, `found ${importers.length} functions importing students-logic.mjs`);
  for (const f of importers) {
    const p = path.join(fnDir, f, 'deno.json');
    const map = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).imports || {} : {};
    eq(map['libphonenumber-js/max'], `npm:libphonenumber-js@${pinned}/max`, `${f}/deno.json maps libphonenumber-js/max to the pinned npm version`);
  }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
