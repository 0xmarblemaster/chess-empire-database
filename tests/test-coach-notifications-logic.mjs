/**
 * Coach notifications (new student + reactivation) — students-logic.mjs +
 * index.ts wiring.
 *
 *  - notificationRecipients: coach set → that coach only; no coach → every
 *    coach of the branch (coaches.branch_id ∪ coach_branches), deduped.
 *  - notificationRows: snapshot columns + event (kind / previous_status /
 *    status_history_id) from the shaped student.
 *  - shouldNotifyReactivation: only frozen / left → active.
 *  - notifyCoaches: fan-out over a mock adapter; failures (branch lookup or
 *    insert) are swallowed and reported, never thrown.
 *  - index.ts (static): new-student fan-out in the insert() path, reactivation
 *    fan-out in applyStatusChange, upsert on (recipient, status_history_id),
 *    response shapes unchanged, OpenAPI mentions both.
 *
 * Run: node tests/test-coach-notifications-logic.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  notificationRecipients,
  notificationRows,
  notifyCoaches,
  shouldNotifyReactivation,
  NOTIFICATION_KIND_NEW_STUDENT,
  NOTIFICATION_KIND_REACTIVATED,
  REACTIVATION_FROM,
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
const COACH_BOTH = '88888888-8888-4888-8888-888888888888';

const COACH_ROWS = [
  { id: COACH, first_name: 'Askhat', last_name: 'Serikov', branch_id: BRANCH, coach_branches: [] },
  { id: COACH_JUNCTION, first_name: 'Dana', last_name: 'Ali', branch_id: OTHER_BRANCH, coach_branches: [{ branch_id: BRANCH }] },
  { id: COACH_OTHER, first_name: 'Other', last_name: 'Coach', branch_id: OTHER_BRANCH, coach_branches: [] },
  // Both columns point at BRANCH → must appear once.
  { id: COACH_BOTH, first_name: 'Both', last_name: 'Ways', branch_id: BRANCH, coach_branches: [{ branch_id: BRANCH }] },
];

const student = (extra = {}) => ({
  id: '00000000-0000-4000-8000-00000000000b',
  student_code: 'CE-00812',
  name: 'Aisulu Nurlanova',
  first_name: 'Aisulu',
  last_name: 'Nurlanova',
  status: 'active',
  branch_id: BRANCH,
  branch: 'Gagarin Park',
  amocrm_customer_id: 1002,
  phone: '+77001234567',
  coach_id: null,
  coach: null,
  ...extra,
});

console.log('\n=== notificationRecipients ============================================\n');
eq(notificationRecipients(student({ coach_id: COACH, coach: 'Askhat Serikov' }), COACH_ROWS), [COACH],
  'coach assigned → that coach only (branch coaches ignored)');
const branchWide = notificationRecipients(student(), COACH_ROWS);
eq([...branchWide].sort(), [COACH, COACH_JUNCTION, COACH_BOTH].sort(),
  'no coach → coaches.branch_id + coach_branches coaches of the branch');
assert(!branchWide.includes(COACH_OTHER), 'coach of another branch is not notified');
eq(branchWide.length, new Set(branchWide).size, 'recipients deduped');
eq(notificationRecipients(student(), []), [], 'no coaches in branch → nobody');
eq(notificationRecipients(student(), [COACH_ROWS[0], COACH_ROWS[0]]), [COACH], 'duplicate coach rows → one recipient');

console.log('\n=== notificationRows ==================================================\n');
const s1 = student({ coach_id: COACH, coach: 'Askhat Serikov' });
const HIST = '99999999-9999-4999-8999-999999999999';
const rows = notificationRows(s1, [COACH], { kind: NOTIFICATION_KIND_NEW_STUDENT, status_history_id: HIST });
eq(rows, [{
  recipient_coach_id: COACH,
  kind: 'new_student',
  previous_status: null,
  status_history_id: HIST,
  student_id: s1.id,
  student_name: 'Aisulu Nurlanova',
  student_code: 'CE-00812',
  assigned_coach_id: COACH,
  assigned_coach_name: 'Askhat Serikov',
  branch_id: BRANCH,
  branch_name: 'Gagarin Park',
  source: 'amocrm',
}], 'one snapshot row per recipient');
eq(NOTIFICATION_KIND_NEW_STUDENT, 'new_student', 'kind constant');
eq(NOTIFICATION_KIND_REACTIVATED, 'reactivated', 'reactivated kind constant');
eq(REACTIVATION_FROM, ['frozen', 'left'], 'reactivation source statuses');
const re = notificationRows(s1, [COACH], { kind: NOTIFICATION_KIND_REACTIVATED, previous_status: 'frozen', status_history_id: HIST })[0];
eq([re.kind, re.previous_status, re.status_history_id], ['reactivated', 'frozen', HIST], 'reactivated row carries kind / previous_status / status_history_id');
eq([re.student_name, re.assigned_coach_name, re.branch_name], ['Aisulu Nurlanova', 'Askhat Serikov', 'Gagarin Park'], 'reactivated row keeps the snapshots');
eq(notificationRows(s1, [COACH])[0].kind, 'new_student', 'kind defaults to new_student');

console.log('\n=== shouldNotifyReactivation ==========================================\n');
for (const [prev, target, want] of [
  ['frozen', 'active', true], ['left', 'active', true],
  ['active', 'active', false], [null, 'active', false], [undefined, 'active', false],
  ['active', 'frozen', false], ['frozen', 'frozen', false], ['left', 'frozen', false],
]) {
  eq(shouldNotifyReactivation(prev, target), want, `${prev} → ${target}`);
}
const r2 = notificationRows(student({ student_code: undefined, branch: null }), [COACH, COACH_JUNCTION]);
eq(r2.map((r) => r.recipient_coach_id), [COACH, COACH_JUNCTION], 'rows follow recipient order');
eq([r2[0].student_code, r2[0].assigned_coach_id, r2[0].assigned_coach_name, r2[0].branch_name], [null, null, null, null],
  'missing snapshot values → null');
eq(notificationRows(s1, []), [], 'no recipients → no rows');

console.log('\n=== notifyCoaches (mock adapter) ======================================\n');
function mockDb({ coaches = COACH_ROWS, failCoaches = false, failInsert = false } = {}) {
  const calls = { branchCoaches: [], insert: [] };
  return {
    calls,
    async branchCoaches(branchId) {
      calls.branchCoaches.push(branchId);
      if (failCoaches) throw new Error('coaches down');
      return coaches;
    },
    async insertNotifications(r) {
      calls.insert.push(r);
      if (failInsert) throw new Error('table missing');
    },
  };
}

// Silence the expected console.error from the failure cases.
const origError = console.error;
const errors = [];
const quiet = async (fn) => {
  console.error = (...a) => errors.push(a);
  try { return await fn(); } finally { console.error = origError; }
};

{
  const db = mockDb();
  const r = await notifyCoaches(db, s1);
  eq(r, { sent: 1 }, 'coach assigned → 1 notification');
  eq(db.calls.branchCoaches.length, 0, 'coach assigned → branch coaches not queried');
  eq(db.calls.insert[0].map((x) => x.recipient_coach_id), [COACH], 'inserted for the assigned coach');
}
{
  const db = mockDb();
  const r = await notifyCoaches(db, student());
  eq(r, { sent: 3 }, 'no coach → 3 branch coaches');
  eq(db.calls.branchCoaches, [BRANCH], 'branch coaches queried with the student branch');
  eq(db.calls.insert.length, 1, 'one batched insert');
}
{
  const db = mockDb({ coaches: [COACH_ROWS[2]] });
  const r = await notifyCoaches(db, student());
  eq(r, { sent: 0 }, 'no coach in branch → 0 sent');
  eq(db.calls.insert.length, 0, 'no insert call for zero rows');
}
{
  const db = mockDb({ failInsert: true });
  let threw = false;
  let r;
  try { r = await quiet(() => notifyCoaches(db, s1)); } catch { threw = true; }
  assert(!threw, 'insert failure does not throw');
  eq(r, { sent: 0, error: 'table missing' }, 'insert failure reported');
}
{
  const db = mockDb({ failCoaches: true });
  let threw = false;
  let r;
  try { r = await quiet(() => notifyCoaches(db, student())); } catch { threw = true; }
  assert(!threw, 'branch lookup failure does not throw');
  eq(r.sent, 0, 'branch lookup failure → sent 0');
}
{
  let threw = false;
  try { await quiet(() => notifyCoaches({}, student())); } catch { threw = true; }
  assert(!threw, 'broken adapter does not throw');
}
{
  const db = mockDb();
  const r = await notifyCoaches(db, student(), { kind: 'reactivated', previous_status: 'left', status_history_id: HIST });
  eq(r, { sent: 3 }, 'reactivation without coach → same branch-coach rule');
  assert(db.calls.insert[0].every((x) => x.kind === 'reactivated' && x.previous_status === 'left' && x.status_history_id === HIST),
    'reactivation rows carry the event');
}
{
  const db = mockDb({ failInsert: true });
  let threw = false;
  try { await quiet(() => notifyCoaches(db, s1, { kind: 'reactivated', previous_status: 'frozen', status_history_id: HIST })); } catch { threw = true; }
  assert(!threw, 'reactivation insert failure does not throw');
}
assert(errors.length === 4, `each failure logged with console.error (${errors.length})`);

console.log('\n=== index.ts wiring (static) ==========================================\n');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase/functions/students-api/index.ts'), 'utf8');
const insertBlock = INDEX.slice(INDEX.indexOf('async insert(row'), INDEX.indexOf('activate: (student'));
const applyBlock = INDEX.slice(INDEX.indexOf('async function applyStatusChange('), INDEX.indexOf('// ─── Handlers'));
const adapter = INDEX.slice(INDEX.indexOf('function notificationDb('), INDEX.indexOf('async function applyStatusChange('));
const imports = INDEX.slice(0, INDEX.indexOf("from './students-logic.mjs'"));
assert(/\bnotifyCoaches,/.test(imports) && /\bshouldNotifyReactivation,/.test(imports), 'notifyCoaches + shouldNotifyReactivation imported');
assert(!/notifyNewStudent/.test(INDEX), 'old notifyNewStudent no longer used');
eq((INDEX.match(/await notifyCoaches\(/g) || []).length, 2, 'fan-out called in exactly two places');
assert(/await notifyCoaches\(notificationDb\(ctx\), student, \{\s*kind: NOTIFICATION_KIND_NEW_STUDENT, status_history_id: hist\.id,\s*\}\)/.test(insertBlock),
  'new-student fan-out lives in the insert() path with status_history_id');
assert(insertBlock.indexOf('student_status_history') < insertBlock.indexOf('notifyCoaches('),
  'new-student fan-out runs after the student + status history writes succeeded');
assert(/if \(shouldNotifyReactivation\(prev, target\)\) \{\s*await notifyCoaches\(notificationDb\(ctx\), updated, \{\s*kind: NOTIFICATION_KIND_REACTIVATED, previous_status: prev, status_history_id: row\.id,/.test(applyBlock),
  'applyStatusChange notifies on reactivation with prev + history row id');
assert(applyBlock.indexOf("from('student_status_history')\n    .insert") < applyBlock.indexOf('shouldNotifyReactivation('),
  'reactivation fan-out runs after the status update + history insert');
assert(applyBlock.indexOf('refused: true') < applyBlock.indexOf('shouldNotifyReactivation(')
  && applyBlock.indexOf('changed: false') < applyBlock.indexOf('shouldNotifyReactivation('),
  'refused / no-op paths return before any notification');
assert(/const updated = shape\(upd\)/.test(applyBlock), 'reactivation snapshots the UPDATED student');
assert(/return \{ changed: true, student: updated, status_history_id: row\.id, chesster_poke: poke \}/.test(applyBlock),
  'applyStatusChange response shape unchanged');
assert(/from\('coach_notifications'\)\s*\.upsert\(rows, \{ onConflict: 'recipient_coach_id,status_history_id', ignoreDuplicates: true \}\)/.test(adapter),
  'upsert on (recipient_coach_id, status_history_id), duplicates ignored');
assert(!/recipient_coach_id,student_id,kind/.test(INDEX), 'old onConflict key gone');
assert(/coach_branches\(branch_id\)/.test(adapter), 'branch coaches include coach_branches');
assert(/return \{ row: student, status_history_id: hist\.id \}/.test(insertBlock), 'insert() still returns { row, status_history_id }');
assert(/A NEW student \(201 only\) — and a matched frozen student reactivated here — also notifies coaches/.test(INDEX),
  'OpenAPI create summary mentions both notifications');
assert(/Activate \(unfreeze\) a student\.[^']*notifies coaches in the dashboard bell/.test(INDEX), 'OpenAPI activate summary mentions the notification');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
