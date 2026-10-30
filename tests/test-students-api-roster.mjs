/**
 * students-api weekly rank-tracking export: ?action=roster + ?action=rank_history.
 *
 *  - Pure helpers (shared module imported by the edge function itself):
 *    param validation, pagination (offset / keyset after_id), row mapping
 *    (explicit 'none' rank, «Ступень N», ISO timestamps), strict ISO date-range
 *    validation, changed_by name resolution.
 *  - Static checks on index.ts: both actions routed as GET behind the same
 *    x-api-key gate, read-only (no writes), ordered by id / changed_at,id, in
 *    the GET / self-doc — and every pre-existing action still routed.
 *
 * Run: node tests/test-students-api-roster.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRosterParams,
  rosterRow,
  stageName,
  nextAfterId,
  parseIsoInstant,
  parseRankHistoryParams,
  rankHistoryRow,
  nameMap,
  userNameMap,
  EXPORT_MAX_LIMIT,
  EXPORT_DEFAULT_LIMIT,
  RANK_NONE,
  ROSTER_STATUSES,
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

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const COACH = '33333333-3333-4333-8333-333333333333';
const BRANCH = '44444444-4444-4444-8444-444444444444';

console.log('\n=== parseRosterParams ==================================================\n');
eq(parseRosterParams({}), { value: { limit: EXPORT_DEFAULT_LIMIT, offset: 0, after_id: null, status: 'active' } }, 'defaults: status active, limit 1000, offset 0');
eq(EXPORT_MAX_LIMIT, 1000, 'max limit is 1000');
eq(parseRosterParams({ status: 'all' }).value.status, 'all', "status 'all' allowed");
eq(ROSTER_STATUSES, ['active', 'frozen', 'left', 'all'], 'roster statuses');
['frozen', 'left'].forEach((s) => eq(parseRosterParams({ status: s }).value.status, s, `status ${s} allowed`));
eq(parseRosterParams({ status: 'ACTIVE' }), { field: 'status' }, 'unknown status → field status');
eq(parseRosterParams({ limit: '1000' }).value.limit, 1000, 'limit 1000 ok');
eq(parseRosterParams({ limit: '1001' }), { field: 'limit' }, 'limit 1001 → 400');
eq(parseRosterParams({ limit: '0' }), { field: 'limit' }, 'limit 0 → 400');
eq(parseRosterParams({ limit: '2.5' }), { field: 'limit' }, 'fractional limit → 400');
eq(parseRosterParams({ limit: 'abc' }), { field: 'limit' }, 'junk limit → 400');
eq(parseRosterParams({ offset: '-1' }), { field: 'offset' }, 'negative offset → 400');
eq(parseRosterParams({ offset: '200' }).value.offset, 200, 'offset parsed');
eq(parseRosterParams({ after_id: UUID_A }).value.after_id, UUID_A, 'after_id keyset cursor parsed');
eq(parseRosterParams({ after_id: 'nope' }), { field: 'after_id' }, 'non-uuid after_id → 400');
eq(parseRosterParams({ after_id: UUID_A, offset: '10' }), { field: 'after_id' }, 'after_id + offset together → 400');
eq(parseRosterParams({ after_id: UUID_A, offset: '0' }).value.after_id, UUID_A, 'after_id with offset=0 ok');
eq(parseRosterParams(null).value.status, 'active', 'null params → defaults');

console.log('\n=== rosterRow / stageName ==============================================\n');
eq(stageName(3), 'Ступень 3', 'stage name «Ступень N»');
eq(stageName(null), null, 'no level → null stage name');
eq(stageName(undefined), null, 'undefined level → null');
const lookups = { branchNames: { [BRANCH]: 'Халык' }, coachNames: { [COACH]: 'Ivan Petrov' } };
const full = rosterRow({
  id: UUID_A, student_code: 'CE-00042', first_name: 'Askar', last_name: 'Zhumabek', status: 'active',
  branch_id: BRANCH, coach_id: COACH, current_level: 4, razryad: '3rd', created_at: '2025-11-03T10:00:00+00:00',
}, lookups);
eq(full, {
  student_id: UUID_A, student_code: 'CE-00042', full_name: 'Askar Zhumabek', status: 'active',
  branch_id: BRANCH, branch_name: 'Халык', trainer_id: COACH, trainer_name: 'Ivan Petrov',
  stage_id: 4, stage_name: 'Ступень 4', current_rank: '3rd', student_created_at: '2025-11-03T10:00:00.000Z',
}, 'full row mapping (exact field set)');
const sparse = rosterRow({ id: UUID_B, first_name: 'Solo', last_name: null, status: 'frozen', branch_id: null, coach_id: null, current_level: null, razryad: null, created_at: null }, lookups);
eq(sparse.current_rank, RANK_NONE, "NULL razryad → explicit 'none'");
eq(rosterRow({ id: UUID_B, razryad: '' }).current_rank, 'none', "empty razryad → 'none'");
eq(rosterRow({ id: UUID_B, razryad: 'none' }).current_rank, 'none', "'none' stays 'none'");
eq(sparse.trainer_id, null, 'no coach → trainer_id null');
eq(sparse.trainer_name, null, 'no coach → trainer_name null');
eq(sparse.branch_name, null, 'no branch → branch_name null');
eq(sparse.stage_id, null, 'no level → stage_id null');
eq(sparse.student_code, null, 'missing student_code → null');
eq(sparse.full_name, 'Solo', 'name trimmed when last name missing');
eq(sparse.student_created_at, null, 'no created_at → null');
eq(rosterRow({ id: UUID_A, coach_id: 'deleted-coach' }, lookups).trainer_name, null, 'unknown coach id → trainer_name null');
eq(rosterRow({ id: UUID_A, created_at: '2026-10-30T04:00:00.123456+05:00' }).student_created_at, '2026-10-29T23:00:00.123Z', 'created_at normalized to ISO UTC');

console.log('\n=== nextAfterId (keyset pagination) ====================================\n');
eq(nextAfterId([{ id: UUID_A }, { id: UUID_B }], 2), UUID_B, 'full page → last id is the cursor');
eq(nextAfterId([{ id: UUID_A }], 2), null, 'short page → no next cursor');
eq(nextAfterId([], 5), null, 'empty page → null');

console.log('\n=== parseIsoInstant ====================================================\n');
eq(parseIsoInstant('2026-05-18'), '2026-05-18T00:00:00.000Z', 'date-only = 00:00 UTC');
eq(parseIsoInstant('2026-05-18T10:00:00Z'), '2026-05-18T10:00:00.000Z', 'Z date-time');
eq(parseIsoInstant('2026-05-18T10:00:00+05:00'), '2026-05-18T05:00:00.000Z', 'offset date-time → UTC');
eq(parseIsoInstant('2026-05-18T10:00+0500'), '2026-05-18T05:00:00.000Z', 'compact offset, no seconds');
eq(parseIsoInstant('2026-05-18T10:00:00.5Z'), '2026-05-18T10:00:00.500Z', 'fractional seconds');
eq(parseIsoInstant('2026-05-18T10:00:00'), null, 'zone-less date-time rejected (ambiguous)');
eq(parseIsoInstant('2026-02-30'), null, 'impossible date rejected');
eq(parseIsoInstant('2026-13-01'), null, 'month 13 rejected');
eq(parseIsoInstant('18.05.2026'), null, 'non-ISO format rejected');
eq(parseIsoInstant('yesterday'), null, 'junk rejected');
eq(parseIsoInstant('1716000000'), null, 'epoch number rejected');
eq(parseIsoInstant(''), null, 'empty rejected');
eq(parseIsoInstant(null), null, 'null rejected');

console.log('\n=== parseRankHistoryParams =============================================\n');
eq(parseRankHistoryParams({}), { value: { from: null, to: null, limit: 1000, offset: 0 } }, 'no filters → defaults');
eq(parseRankHistoryParams({ student_id: UUID_A }).value.student_id, UUID_A, 'student_id filter');
eq(parseRankHistoryParams({ student_code: 'ce-00042' }).value.student_code, 'CE-00042', 'student_code filter normalized');
eq(parseRankHistoryParams({ student_id: 'x' }), { field: 'student_id' }, 'bad student_id → 400');
eq(parseRankHistoryParams({ student_code: 'CE-1' }), { field: 'student_code' }, 'bad student_code → 400');
const range = parseRankHistoryParams({ from: '2026-10-19', to: '2026-10-26T00:00:00+05:00' }).value;
eq([range.from, range.to], ['2026-10-19T00:00:00.000Z', '2026-10-25T19:00:00.000Z'], 'from/to normalized to UTC ISO');
eq(parseRankHistoryParams({ from: 'last week' }), { field: 'from' }, 'bad from → 400');
eq(parseRankHistoryParams({ to: '2026-10-26T00:00' }), { field: 'to' }, 'zone-less to → 400');
eq(parseRankHistoryParams({ from: '2026-10-26', to: '2026-10-19' }), { field: 'to' }, 'to before from → 400');
eq(parseRankHistoryParams({ from: '2026-10-26', to: '2026-10-26' }), { field: 'to' }, 'empty window (to == from) → 400');
eq(parseRankHistoryParams({ from: '2026-10-26' }).value.to, null, 'open-ended to');
eq(parseRankHistoryParams({ limit: '1001' }), { field: 'limit' }, 'limit > 1000 → 400');
eq(parseRankHistoryParams({ offset: 'x' }), { field: 'offset' }, 'bad offset → 400');
eq(parseRankHistoryParams({ after_id: UUID_A }), { field: 'after_id' }, 'after_id not supported on rank_history → 400');

console.log('\n=== rankHistoryRow =====================================================\n');
const hist = rankHistoryRow({
  id: UUID_B, student_id: UUID_A, old_razryad: null, new_razryad: '4th',
  changed_at: '2026-10-27T06:12:00+00:00', changed_by: 'u-coach', source: 'coach_ui', source_derived: false,
  trainer_id_at_change: COACH, trainer_attribution: 'event_time',
}, { studentCodes: { [UUID_A]: 'CE-00042' }, coachNames: { [COACH]: 'Ivan Petrov' }, userNames: { 'u-coach': 'Ivan Petrov' } });
eq(hist, {
  rank_change_id: UUID_B, student_id: UUID_A, student_code: 'CE-00042', previous_rank: 'none', new_rank: '4th',
  changed_at: '2026-10-27T06:12:00.000Z', changed_by_id: 'u-coach', changed_by_name: 'Ivan Petrov',
  source: 'coach_ui', source_derived: false, trainer_id_at_change: COACH, trainer_name_at_change: 'Ivan Petrov',
  trainer_attribution: 'event_time',
}, 'full history row mapping (exact field set), NULL old rank → none');
const legacy = rankHistoryRow({ id: UUID_B, student_id: UUID_A, old_razryad: '3rd', new_razryad: 'none', changed_at: '2026-06-01T00:00:00Z', changed_by: 'gone', source: 'trigger', source_derived: true, trainer_id_at_change: null, trainer_attribution: 'unknown' });
eq(legacy.new_rank, 'none', 'downgrade to none kept (not filtered)');
eq(legacy.changed_by_name, null, 'unknown user → changed_by_name null');
eq(legacy.trainer_name_at_change, null, 'unknown trainer → name null');
eq(legacy.source_derived, true, 'source_derived passed through');
eq(legacy.student_code, null, 'missing student code → null');
eq(rankHistoryRow({ id: UUID_B, changed_by: null }).changed_by_id, null, 'null changed_by → null id');
eq(rankHistoryRow({ id: UUID_B, trainer_attribution: null }).trainer_attribution, 'unknown', 'missing attribution → unknown');

console.log('\n=== nameMap / userNameMap ==============================================\n');
eq(nameMap([{ id: COACH, first_name: 'Ivan', last_name: 'Petrov' }, { id: 'c2', first_name: '', last_name: '' }]), { [COACH]: 'Ivan Petrov', c2: null }, 'coach names, blank → null');
eq(nameMap(null), {}, 'null rows → {}');
eq(userNameMap(
  [{ user_id: 'u1', coach_id: COACH }, { user_id: 'u2', coach_id: null }, { user_id: 'u3', coach_id: 'missing' }],
  { [COACH]: 'Ivan Petrov' },
  { u2: 'admin@chessempire.kz', u3: 'ex@x.kz' },
), { u2: 'admin@chessempire.kz', u3: 'ex@x.kz', u1: 'Ivan Petrov' }, 'coach account → coach name; staff → email; coach name wins');

console.log('\n=== index.ts wiring (static) ===========================================\n');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'students-api', 'index.ts'), 'utf8');
const block = (name) => {
  const start = INDEX.indexOf(`async function ${name}(`);
  const next = INDEX.indexOf('\nasync function ', start + 1);
  return INDEX.slice(start, next === -1 ? undefined : next);
};
const roster = block('getRoster');
const history = block('getRankHistory');
const users = block('userNames');
assert(/method === 'GET' && action === 'roster'[\s\S]*getRoster\(ctx, url\)/.test(INDEX), 'GET ?action=roster routed');
assert(/method === 'GET' && action === 'rank_history'[\s\S]*getRankHistory\(ctx, url\)/.test(INDEX), 'GET ?action=rank_history routed');
assert(INDEX.indexOf("if (!authorized(req))") < INDEX.indexOf("action === 'roster'"), 'roster behind the x-api-key gate');
assert(INDEX.indexOf("if (!authorized(req))") < INDEX.indexOf("action === 'rank_history'"), 'rank_history behind the x-api-key gate');
for (const [label, src] of [['roster', roster], ['rank_history', history], ['userNames', users]]) {
  assert(src.length > 0 && !/\.(insert|update|upsert|delete|rpc)\(/.test(src), `${label}: read-only (no insert/update/upsert/delete/rpc)`);
}
assert(/\.order\('id', \{ ascending: true \}\)/.test(roster), 'roster ordered by id');
assert(/\.gt\('id', p\.after_id\)/.test(roster), 'roster keyset: id > after_id');
assert(/count: 'exact', head: true/.test(roster), 'roster total from an exact count independent of the page');
assert(/p\.status !== 'all'/.test(roster), "roster status 'all' skips the filter");
assert(/as_of/.test(roster) && /next_after_id: nextAfterId\(data, p\.limit\)/.test(roster), 'roster returns as_of + next_after_id');
assert(/from\('razryad_history'\)/.test(history), 'rank_history reads razryad_history');
assert(/\.order\('changed_at', \{ ascending: true \}\)\.order\('id', \{ ascending: true \}\)/.test(history), 'rank_history ordered by changed_at, id');
assert(/gte\('changed_at', p\.from\)/.test(history) && /lt\('changed_at', p\.to\)/.test(history), 'from inclusive, to exclusive');
assert(/count: 'exact'/.test(history), 'rank_history returns exact total');
assert(/'\/\?action=roster'/.test(INDEX) && /'\/\?action=rank_history'/.test(INDEX), 'both actions in the GET / self-doc');
['create', 'freeze', 'activate', 'link_amocrm', 'update_contact', 'find', 'list', 'branches', 'survival-score', 'survival-best', 'survival-leaderboard'].forEach((a) => {
  assert(new RegExp(`action === '${a}'\\)`).test(INDEX), `existing action=${a} still routed`);
});
assert(/\.order\('student_code', \{ ascending: true \}\)/.test(block('listStudents')), 'list still ordered by student_code (unchanged)');

console.log('\n=== docs/openapi/students-api.yaml (no drift) ==========================\n');
const YAML = fs.readFileSync(path.join(ROOT, 'docs', 'openapi', 'students-api.yaml'), 'utf8');
const schemaRequired = (name) => {
  const m = YAML.match(new RegExp(`\\n    ${name}:\\n      type: object\\n      required: \\[([^\\]]*)\\]`));
  return m ? m[1].split(',').map((s) => s.trim()).sort() : [];
};
eq(schemaRequired('RosterRow'), Object.keys(full).sort(), 'RosterRow schema lists exactly the roster fields');
eq(schemaRequired('RankChange'), Object.keys(hist).sort(), 'RankChange schema lists exactly the rank_history fields');
assert(/^openapi: 3\.1\.0$/m.test(YAML), 'OpenAPI 3.1');
['create', 'freeze', 'activate', 'link_amocrm', 'update_contact', 'find', 'list', 'branches', 'roster', 'rank_history', 'survival-score', 'survival-best', 'survival-leaderboard'].forEach((a) => {
  assert(YAML.includes(`\n  /?action=${a}:\n`), `yaml documents action=${a}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
