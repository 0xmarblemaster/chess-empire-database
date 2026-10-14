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

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
