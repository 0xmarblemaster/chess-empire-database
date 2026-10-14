/**
 * Unit tests for the students-api pure helpers (shared, runtime-agnostic
 * module imported by the edge function itself — no re-implementation).
 *
 *  - normalizePhone: KZ/RU normalization to +7XXXXXXXXXX (8→+7, bare 10-digit
 *    promotion, junk rejected).
 *  - isManualChangeRecent: the 3-day "coaches win over automation" guard.
 *  - splitFullName / phoneDigits helpers.
 *  - link_amocrm: input validation, outcome classification and the full link
 *    flow over an in-memory mock DB (writes only amocrm_customer_id).
 *  - update_contact: input validation and the overwrite flow over an in-memory
 *    mock DB (writes only parent_phone / amocrm_customer_id).
 *
 * Run: node tests/test-students-api-logic.mjs
 */
import {
  normalizePhone,
  phoneDigits,
  splitFullName,
  isManualChangeRecent,
  MANUAL_GUARD_DAYS,
  parseAmocrmId,
  validateLinkAmocrm,
  classifyLink,
  linkAmocrm,
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
  assert(actual === expected, `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

console.log('\n=== normalizePhone ====================================================\n');
eq(normalizePhone('+7 777 123 45 67'), '+77771234567', 'spaces stripped, +7 kept');
eq(normalizePhone('8 (777) 123-45-67'), '+77771234567', 'leading 8 → +7, parens/dashes stripped');
eq(normalizePhone('87771234567'), '+77771234567', 'bare 8XXXXXXXXXX → +7');
eq(normalizePhone('77771234567'), '+77771234567', 'bare 7XXXXXXXXXX → +7');
eq(normalizePhone('7771234567'), '+77771234567', 'bare 10-digit local → +7 prepended');
eq(normalizePhone('+7-777-123-45-67'), '+77771234567', 'dashes stripped');
eq(normalizePhone('7.777.123.45.67'), '+77771234567', 'dots stripped');
eq(normalizePhone(''), null, 'empty → null');
eq(normalizePhone('   '), null, 'whitespace → null');
eq(normalizePhone('123'), null, 'too short → null');
eq(normalizePhone('+1 212 555 0100'), null, 'non-+7 11-digit (leading 1) → null');
eq(normalizePhone('abc'), null, 'letters → null');
eq(normalizePhone(null), null, 'null input → null');
eq(normalizePhone(77771234567), null, 'non-string input → null');
// idempotent
eq(normalizePhone(normalizePhone('87771234567')), '+77771234567', 'idempotent on already-normalized');

console.log('\n=== phoneDigits =======================================================\n');
eq(phoneDigits('+77771234567'), '7771234567', 'last 10 digits of normalized');
eq(phoneDigits('+7 777 123 45 67'), '7771234567', 'strips non-digits then last 10');
eq(phoneDigits(null), '', 'null → empty');

console.log('\n=== splitFullName =====================================================\n');
assert(JSON.stringify(splitFullName('Askar Zhumabek')) === JSON.stringify({ first_name: 'Askar', last_name: 'Zhumabek' }), 'two tokens');
assert(JSON.stringify(splitFullName('  Askar   Zhumabek  Uly ')) === JSON.stringify({ first_name: 'Askar', last_name: 'Zhumabek Uly' }), 'extra spaces + 3 tokens');
assert(JSON.stringify(splitFullName('Madonna')) === JSON.stringify({ first_name: 'Madonna', last_name: '' }), 'single token → empty last_name');
eq(splitFullName(''), null, 'empty → null');
eq(splitFullName('   '), null, 'whitespace → null');
eq(splitFullName(null), null, 'null → null');

console.log('\n=== isManualChangeRecent (3-day guard) ================================\n');
eq(MANUAL_GUARD_DAYS, 3, 'guard window is 3 days');
const NOW = Date.parse('2026-10-08T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(1) }, NOW), true,
  'manual change 1h ago → blocked');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(71) }, NOW), true,
  'manual change 71h ago (< 72h) → blocked');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: hoursAgo(73) }, NOW), false,
  'manual change 73h ago (> 72h) → allowed');
eq(isManualChangeRecent({ changed_by_type: 'api', created_at: hoursAgo(1) }, NOW), false,
  'recent API change → not a manual block');
eq(isManualChangeRecent({ changed_by_type: 'system', created_at: hoursAgo(1) }, NOW), false,
  'recent system change → not a manual block');
eq(isManualChangeRecent(null, NOW), false, 'no typed row → allowed');
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: 'not-a-date' }, NOW), false,
  'unparseable timestamp → allowed (fail open, not a false block)');
// exact boundary: exactly 3 days is NOT younger-than-3-days
eq(isManualChangeRecent({ changed_by_type: 'manual', created_at: new Date(NOW - 3 * 86400 * 1000).toISOString() }, NOW), false,
  'exactly 3 days old → allowed (strict <)');

console.log('\n=== parseAmocrmId / validateLinkAmocrm ==========================\n');
eq(parseAmocrmId(123456), 123456, 'positive integer number');
eq(parseAmocrmId('123456'), 123456, 'numeric string');
eq(parseAmocrmId(' 42 '), 42, 'numeric string with surrounding spaces');
eq(parseAmocrmId(0), null, '0 rejected');
eq(parseAmocrmId('0'), null, '"0" rejected');
eq(parseAmocrmId(-5), null, 'negative rejected');
eq(parseAmocrmId('-5'), null, 'negative string rejected');
eq(parseAmocrmId(1.5), null, 'float rejected');
eq(parseAmocrmId('1.5'), null, 'float string rejected');
eq(parseAmocrmId('12abc'), null, 'junk rejected');
eq(parseAmocrmId(''), null, 'empty string rejected');
eq(parseAmocrmId(null), null, 'null rejected');
eq(parseAmocrmId(undefined), null, 'undefined rejected');
eq(parseAmocrmId(true), null, 'boolean rejected');
eq(parseAmocrmId(Number.MAX_SAFE_INTEGER + 2), null, 'unsafe integer rejected');
eq(parseAmocrmId('1e5'), null, 'exponent notation rejected');

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const S3 = '33333333-3333-4333-8333-333333333333';
eq(validateLinkAmocrm({ student_id: 'not-a-uuid', amocrm_customer_id: 1 }).field, 'student_id', 'bad uuid → field student_id');
eq(validateLinkAmocrm({ amocrm_customer_id: 1 }).field, 'student_id', 'missing student_id → field student_id');
eq(validateLinkAmocrm({ student_id: S1, amocrm_customer_id: 0 }).field, 'amocrm_customer_id', 'amo 0 → field amocrm_customer_id');
eq(validateLinkAmocrm({ student_id: S1 }).field, 'amocrm_customer_id', 'missing amo → field amocrm_customer_id');
eq(validateLinkAmocrm(null).field, 'student_id', 'null body → field student_id');
assert(JSON.stringify(validateLinkAmocrm({ student_id: S1, amocrm_customer_id: '77' }).value)
  === JSON.stringify({ student_id: S1, amocrm_customer_id: 77 }), 'valid body normalized (string id → number)');

console.log('\n=== classifyLink ======================================================\n');
eq(classifyLink(null, 5), 'link', 'empty → link');
eq(classifyLink(undefined, 5), 'link', 'undefined → link');
eq(classifyLink(5, 5), 'same', 'same → same');
eq(classifyLink('5', 5), 'same', 'same (bigint returned as string) → same');
eq(classifyLink(6, 5), 'conflict', 'different → conflict');

console.log('\n=== linkAmocrm (mock DB) ==============================================\n');

// In-memory students table that records every call. Rows carry status /
// branch / coach so we can assert they are never touched.
function mockDb(rows, { beforeSet } = {}) {
  const table = new Map(rows.map((r) => [r.id, { status: 'frozen', branch_id: 'b1', coach_id: 'c1', ...r }]));
  const calls = [];
  const db = {
    table, calls,
    async getStudent(id) {
      calls.push(['getStudent', id]);
      const r = table.get(id);
      return r ? { id: r.id, amocrm_customer_id: r.amocrm_customer_id } : null;
    },
    async findOwnerId(amo) {
      calls.push(['findOwnerId', amo]);
      for (const r of table.values()) if (r.amocrm_customer_id === amo) return r.id;
      return null;
    },
    async setIfNull(id, amo) {
      calls.push(['setIfNull', id, amo]);
      if (beforeSet) beforeSet(table);
      for (const r of table.values()) if (r.amocrm_customer_id === amo && r.id !== id) return { uniqueViolation: true };
      const r = table.get(id);
      if (!r || r.amocrm_customer_id !== null) return { row: null };
      r.amocrm_customer_id = amo;
      return { row: { id: r.id, amocrm_customer_id: amo } };
    },
  };
  return db;
}
const snapshot = (db) => JSON.stringify([...db.table.values()]);
const writes = (db) => db.calls.filter((c) => c[0] === 'setIfNull').length;

{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }]);
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 123456 });
  eq(r.status, 200, 'fresh link → 200');
  assert(JSON.stringify(r.body) === JSON.stringify({ ok: true, changed: true, student: { id: S1, amocrm_customer_id: 123456 } }),
    'fresh link body {ok, changed:true, student:{id, amocrm_customer_id}}');
  eq(db.table.get(S1).amocrm_customer_id, 123456, 'fresh link: value persisted (control read)');
  const row = db.table.get(S1);
  assert(row.status === 'frozen' && row.branch_id === 'b1' && row.coach_id === 'c1',
    'fresh link: status / branch / coach unchanged (frozen stays frozen)');
  eq(db.table.size, 1, 'fresh link: no student created');
  assert(db.calls.every((c) => ['getStudent', 'findOwnerId', 'setIfNull'].includes(c[0])),
    'handler only uses the adapter (no other DB effects)');

  // Repeat the same pair
  const before = snapshot(db);
  db.calls.length = 0;
  const r2 = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 123456 });
  eq(r2.status, 200, 'repeat → 200');
  eq(r2.body.changed, false, 'repeat → changed:false');
  eq(r2.body.student.amocrm_customer_id, 123456, 'repeat → returns the linked id');
  eq(writes(db), 0, 'repeat → no write issued');
  eq(snapshot(db), before, 'repeat → data unchanged, no duplicate');
}

{
  const db = mockDb([{ id: S1, amocrm_customer_id: 111 }]);
  const before = snapshot(db);
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 222 });
  eq(r.status, 409, 'different existing id → 409');
  eq(r.body.reason, 'amocrm_customer_id_conflict', 'different existing id → reason amocrm_customer_id_conflict');
  eq(r.body.ok, false, 'different existing id → ok:false');
  eq(writes(db), 0, 'different existing id → no write issued');
  eq(snapshot(db), before, 'different existing id → original value kept');
}

{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }, { id: S2, amocrm_customer_id: 555 }]);
  const before = snapshot(db);
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 555 });
  eq(r.status, 409, 'id owned by another student → 409');
  eq(r.body.reason, 'amocrm_customer_id_conflict', 'id owned by another → reason conflict');
  eq(r.body.conflict_student_id, S2, 'id owned by another → conflict_student_id reported');
  eq(writes(db), 0, 'id owned by another → no write issued');
  eq(snapshot(db), before, 'id owned by another → both records unchanged');
}

{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }]);
  const r = await linkAmocrm(db, { student_id: S3, amocrm_customer_id: 1 });
  eq(r.status, 404, 'unknown uuid → 404');
  eq(r.body.reason, 'not_found', 'unknown uuid → reason not_found');
  eq(writes(db), 0, 'unknown uuid → no write issued');
}

// Race: another request links a DIFFERENT student to the same id between the
// pre-checks and the write → unique index fires (23505) → 409, nothing changed.
{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }, { id: S2, amocrm_customer_id: null }], {
    beforeSet: (t) => { t.get(S2).amocrm_customer_id = 900; },
  });
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 900 });
  eq(r.status, 409, 'race: unique violation → 409');
  eq(r.body.conflict_student_id, S2, 'race: unique violation → conflict_student_id from re-read');
  eq(db.table.get(S1).amocrm_customer_id, null, 'race: our student unchanged');
}

// Race: a concurrent request sets the SAME id on our student first → 0 rows
// → re-read → idempotent changed:false.
{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }], {
    beforeSet: (t) => { t.get(S1).amocrm_customer_id = 700; },
  });
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 700 });
  eq(r.status, 200, 'race: same id won concurrently → 200');
  eq(r.body.changed, false, 'race: same id won concurrently → changed:false');
}

// Race: a concurrent request sets a DIFFERENT id on our student first → 409.
{
  const db = mockDb([{ id: S1, amocrm_customer_id: null }], {
    beforeSet: (t) => { t.get(S1).amocrm_customer_id = 701; },
  });
  const r = await linkAmocrm(db, { student_id: S1, amocrm_customer_id: 700 });
  eq(r.status, 409, 'race: different id won concurrently → 409');
  eq(db.table.get(S1).amocrm_customer_id, 701, 'race: concurrent winner value kept');
}

console.log('\n=== validateUpdateContact ==============================================\n');
eq(validateUpdateContact({ student_id: 'nope', phone: '87011234567' }).field, 'student_id', 'bad uuid → field student_id');
eq(validateUpdateContact(null).field, 'student_id', 'null body → field student_id');
eq(validateUpdateContact({ student_id: S1 }).field, 'body', 'neither phone nor amo → field body');
eq(validateUpdateContact({ student_id: S1, phone: '123' }).field, 'phone', 'bad phone → field phone');
eq(validateUpdateContact({ student_id: S1, phone: null }).field, 'phone', 'phone null (clear) → field phone');
eq(validateUpdateContact({ student_id: S1, amocrm_customer_id: 0 }).field, 'amocrm_customer_id', 'amo 0 → field amocrm_customer_id');
eq(validateUpdateContact({ student_id: S1, amocrm_customer_id: null }).field, 'amocrm_customer_id', 'amo null (clear) → field amocrm_customer_id');
eq(validateUpdateContact({ student_id: S1, phone: '+77011234567', amocrm_customer_id: 'x' }).field, 'amocrm_customer_id',
  'valid phone + bad amo → field amocrm_customer_id');
eq(JSON.stringify(validateUpdateContact({ student_id: S1, phone: '8 (701) 123-45-67' }).value),
  JSON.stringify({ student_id: S1, phone: '+77011234567' }), 'phone only: normalized, amo key absent');
eq(JSON.stringify(validateUpdateContact({ student_id: S1, amocrm_customer_id: '42' }).value),
  JSON.stringify({ student_id: S1, amocrm_customer_id: 42 }), 'amo only: parsed, phone key absent');

console.log('\n=== updateContact (mock DB) ===========================================\n');

// In-memory students table holding raw columns; getStudent/update return the
// shaped student like the edge-function adapter does.
function contactDb(rows, { beforeUpdate } = {}) {
  const table = new Map(rows.map((r) => [r.id, {
    status: 'frozen', branch_id: 'b1', coach_id: 'c1', first_name: 'A', last_name: 'B',
    parent_phone: null, amocrm_customer_id: null, ...r,
  }]));
  const view = (r) => ({ id: r.id, status: r.status, branch_id: r.branch_id, phone: r.parent_phone, amocrm_customer_id: r.amocrm_customer_id });
  const calls = [];
  return {
    table, calls,
    async getStudent(id) {
      calls.push(['getStudent', id]);
      const r = table.get(id);
      return r ? view(r) : null;
    },
    async findOwnerId(amo) {
      calls.push(['findOwnerId', amo]);
      for (const r of table.values()) if (r.amocrm_customer_id === amo) return r.id;
      return null;
    },
    async update(id, patch) {
      calls.push(['update', id, patch]);
      if (beforeUpdate) beforeUpdate(table);
      if (patch.amocrm_customer_id !== undefined) {
        for (const r of table.values()) if (r.amocrm_customer_id === patch.amocrm_customer_id && r.id !== id) return { uniqueViolation: true };
      }
      const r = table.get(id);
      if (!r) return { row: null };
      Object.assign(r, patch);
      return { row: view(r) };
    },
  };
}
const updates = (db) => db.calls.filter((c) => c[0] === 'update');
const ONLY_CONTACT_COLS = (db) => updates(db).every((c) => Object.keys(c[2]).every((k) => ['parent_phone', 'amocrm_customer_id'].includes(k)));

{
  const db = contactDb([{ id: S1, parent_phone: '+77010000000', amocrm_customer_id: 5 }]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567' });
  eq(r.status, 200, 'phone only → 200');
  eq(r.body.changed, true, 'phone only → changed:true');
  eq(JSON.stringify(r.body.updated_fields), '["phone"]', 'phone only → updated_fields [phone]');
  eq(JSON.stringify(r.body.previous), JSON.stringify({ phone: '+77010000000', amocrm_customer_id: 5 }), 'phone only → previous values');
  eq(r.body.student.phone, '+77011234567', 'phone only → student shows new phone');
  eq(JSON.stringify(updates(db).map((c) => c[2])), JSON.stringify([{ parent_phone: '+77011234567' }]), 'phone only → single UPDATE of parent_phone only');
  eq(db.calls.filter((c) => c[0] === 'findOwnerId').length, 0, 'phone only → no amo conflict lookup (phone is not unique)');
  eq(db.table.get(S1).amocrm_customer_id, 5, 'phone only → amo untouched');
}

{
  // Sibling already has this phone — not a conflict.
  const db = contactDb([{ id: S1, parent_phone: '+77010000000' }, { id: S2, parent_phone: '+77011234567' }]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567' });
  eq(r.status, 200, 'phone shared with sibling → 200 (no uniqueness on phone)');
}

{
  const db = contactDb([{ id: S1, parent_phone: '+77010000000', amocrm_customer_id: null }]);
  const r = await updateContact(db, { student_id: S1, amocrm_customer_id: 321 });
  eq(r.status, 200, 'amo only → 200');
  eq(JSON.stringify(r.body.updated_fields), '["amocrm_customer_id"]', 'amo only → updated_fields [amocrm_customer_id]');
  eq(JSON.stringify(updates(db).map((c) => c[2])), JSON.stringify([{ amocrm_customer_id: 321 }]), 'amo only → UPDATE of amocrm_customer_id only');
  eq(db.table.get(S1).parent_phone, '+77010000000', 'amo only → phone untouched');
}

{
  const db = contactDb([{ id: S1, parent_phone: '+77010000000', amocrm_customer_id: 111 }]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567', amocrm_customer_id: 222 });
  eq(r.status, 200, 'both → 200');
  eq(JSON.stringify(r.body.updated_fields), '["phone","amocrm_customer_id"]', 'both → both fields updated');
  eq(JSON.stringify(r.body.previous), JSON.stringify({ phone: '+77010000000', amocrm_customer_id: 111 }), 'both → previous values');
  eq(updates(db).length, 1, 'both → exactly one UPDATE');
  const row = db.table.get(S1);
  assert(row.parent_phone === '+77011234567' && row.amocrm_customer_id === 222, 'both → both persisted');
  assert(row.status === 'frozen' && row.branch_id === 'b1' && row.coach_id === 'c1' && row.first_name === 'A',
    'both → status / branch / coach / name unchanged');
  assert(ONLY_CONTACT_COLS(db), 'only parent_phone / amocrm_customer_id ever written');
  assert(db.calls.every((c) => ['getStudent', 'findOwnerId', 'update'].includes(c[0])), 'only the adapter is used');
}

{
  // Overwrite an existing different amo id (link_amocrm would 409 here).
  const db = contactDb([{ id: S1, parent_phone: '+77011234567', amocrm_customer_id: 111 }]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567', amocrm_customer_id: 999 });
  eq(r.status, 200, 'overwrite different amo → 200');
  eq(r.body.changed, true, 'overwrite different amo → changed:true');
  eq(JSON.stringify(r.body.updated_fields), '["amocrm_customer_id"]', 'overwrite: unchanged phone not in updated_fields');
  eq(r.body.previous.amocrm_customer_id, 111, 'overwrite → previous amo reported');
  eq(JSON.stringify(updates(db).map((c) => c[2])), JSON.stringify([{ amocrm_customer_id: 999 }]), 'overwrite → unchanged phone not written');
  eq(db.table.get(S1).amocrm_customer_id, 999, 'overwrite → new amo persisted');
}

{
  const db = contactDb([{ id: S1, parent_phone: '+77011234567', amocrm_customer_id: '777' }]);
  const before = JSON.stringify([...db.table.values()]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567', amocrm_customer_id: 777 });
  eq(r.status, 200, 'same values → 200');
  eq(r.body.changed, false, 'same values → changed:false (bigint-as-string amo compared numerically)');
  eq(r.body.student.id, S1, 'same values → student returned');
  assert(!('updated_fields' in r.body) && !('previous' in r.body), 'same values → no updated_fields / previous');
  eq(updates(db).length, 0, 'same values → no write');
  eq(JSON.stringify([...db.table.values()]), before, 'same values → data unchanged');
}

{
  const db = contactDb([{ id: S1, amocrm_customer_id: null }, { id: S2, amocrm_customer_id: 555 }]);
  const before = JSON.stringify([...db.table.values()]);
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567', amocrm_customer_id: 555 });
  eq(r.status, 409, 'amo owned by other → 409');
  eq(r.body.reason, 'amocrm_customer_id_conflict', 'amo owned by other → reason');
  eq(r.body.conflict_student_id, S2, 'amo owned by other → conflict_student_id');
  eq(updates(db).length, 0, 'amo owned by other → nothing written (not even phone)');
  eq(JSON.stringify([...db.table.values()]), before, 'amo owned by other → data unchanged');
}

{
  // Race: another student grabs the id between pre-check and write → 23505.
  const db = contactDb([{ id: S1, amocrm_customer_id: null }, { id: S2, amocrm_customer_id: null }], {
    beforeUpdate: (t) => { t.get(S2).amocrm_customer_id = 900; },
  });
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567', amocrm_customer_id: 900 });
  eq(r.status, 409, 'race: 23505 → 409');
  eq(r.body.conflict_student_id, S2, 'race: 23505 → conflict_student_id from re-read');
  eq(db.table.get(S1).parent_phone, null, 'race: 23505 → phone not written either');
}

{
  const db = contactDb([{ id: S1 }]);
  const r = await updateContact(db, { student_id: S3, phone: '+77011234567' });
  eq(r.status, 404, 'unknown uuid → 404');
  eq(r.body.reason, 'not_found', 'unknown uuid → not_found');
  eq(updates(db).length, 0, 'unknown uuid → no write');
}

{
  // Race: student deleted between read and write → 0 rows → 404.
  const db = contactDb([{ id: S1 }], { beforeUpdate: (t) => { t.delete(S1); } });
  const r = await updateContact(db, { student_id: S1, phone: '+77011234567' });
  eq(r.status, 404, 'race: student deleted before write → 404');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
