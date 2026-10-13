/**
 * Unit tests for the Puzzle Rush (survival) pure helpers in students-logic.mjs
 * (imported by the students-api and analytics-leaderboards edge functions).
 *
 *  - isValidSurvivalScore / validateSurvivalPush: score 0..SURVIVAL_SCORE_MAX,
 *    external_ref required, achieved_at optional ISO.
 *  - parseLeaderboardParams: scope/period/limit validation, branch_id → branch.
 *  - almatyWindowStart: Monday 00:00 / 1st 00:00 in Asia/Almaty.
 *
 * Run: node tests/test-puzzle-rush-logic.mjs
 */
import {
  SURVIVAL_SCORE_MAX,
  isValidSurvivalScore,
  validateSurvivalPush,
  parseLeaderboardParams,
  almatyWindowStart,
} from '../supabase/functions/students-api/students-logic.mjs';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function eq(actual, expected, msg) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

const SID = '11111111-2222-3333-4444-555555555555';
const BID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

console.log('\n=== isValidSurvivalScore ==============================================\n');
eq(SURVIVAL_SCORE_MAX, 200, 'score cap is 200');
eq(isValidSurvivalScore(0), true, '0 ok');
eq(isValidSurvivalScore(37), true, '37 ok');
eq(isValidSurvivalScore(200), true, '200 (cap) ok');
eq(isValidSurvivalScore(201), false, '201 rejected');
eq(isValidSurvivalScore(-1), false, 'negative rejected');
eq(isValidSurvivalScore(12.5), false, 'non-integer rejected');
eq(isValidSurvivalScore('12'), false, 'numeric string rejected');
eq(isValidSurvivalScore(null), false, 'null rejected');

console.log('\n=== validateSurvivalPush ==============================================\n');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: ' run-1 ' }),
  { value: { student_id: SID, score: 25, external_ref: 'run-1', achieved_at: null } },
  'valid push, external_ref trimmed, achieved_at defaults to null');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: 'r', achieved_at: '2026-10-12T10:00:00+05:00' }).value.achieved_at,
  '2026-10-12T05:00:00.000Z', 'achieved_at normalized to ISO UTC');
eq(validateSurvivalPush({ student_id: 'nope', score: 25, external_ref: 'r' }), { field: 'student_id' }, 'bad student_id');
eq(validateSurvivalPush({ student_id: SID, score: 201, external_ref: 'r' }), { field: 'score' }, 'score above cap');
eq(validateSurvivalPush({ student_id: SID, score: 25 }), { field: 'external_ref' }, 'missing external_ref');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: '   ' }), { field: 'external_ref' }, 'blank external_ref');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: 7 }), { field: 'external_ref' }, 'non-string external_ref');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: 'x'.repeat(201) }), { field: 'external_ref' }, 'over-long external_ref');
eq(validateSurvivalPush({ student_id: SID, score: 25, external_ref: 'r', achieved_at: 'yesterday' }), { field: 'achieved_at' }, 'unparseable achieved_at');
eq(validateSurvivalPush(null), { field: 'student_id' }, 'null body');

console.log('\n=== parseLeaderboardParams ============================================\n');
eq(parseLeaderboardParams({}), { value: { scope: 'school', period: 'all', branch_id: null, student_id: null, limit: 50 } },
  'defaults: school / all / limit 50');
eq(parseLeaderboardParams({}, 20).value.limit, 20, 'caller default limit (analytics uses 20)');
eq(parseLeaderboardParams({ branch_id: BID }).value.scope, 'branch', 'branch_id alone implies scope branch');
eq(parseLeaderboardParams({ scope: 'branch', branch_id: BID, period: 'week', student_id: SID, limit: '10' }),
  { value: { scope: 'branch', period: 'week', branch_id: BID, student_id: SID, limit: 10 } }, 'full branch query');
eq(parseLeaderboardParams({ scope: 'school', branch_id: BID }).value.branch_id, null, 'explicit school scope ignores branch_id');
eq(parseLeaderboardParams({ scope: 'branch' }), { field: 'branch_id' }, 'scope branch without branch_id rejected');
eq(parseLeaderboardParams({ scope: 'city' }), { field: 'scope' }, 'unknown scope rejected');
eq(parseLeaderboardParams({ period: 'year' }), { field: 'period' }, 'unknown period rejected');
eq(parseLeaderboardParams({ period: 'month' }).value.period, 'month', 'month period accepted');
eq(parseLeaderboardParams({ branch_id: '1' }), { field: 'branch_id' }, 'non-uuid branch_id rejected');
eq(parseLeaderboardParams({ student_id: 'x' }), { field: 'student_id' }, 'non-uuid student_id rejected');
eq(parseLeaderboardParams({ limit: '0' }), { field: 'limit' }, 'limit 0 rejected');
eq(parseLeaderboardParams({ limit: '501' }), { field: 'limit' }, 'limit above 500 rejected');
eq(parseLeaderboardParams({ limit: 'abc' }), { field: 'limit' }, 'non-numeric limit rejected');

console.log('\n=== almatyWindowStart (Asia/Almaty, UTC+5) ============================\n');
const iso = (d) => (d ? d.toISOString() : null);
// Sunday 2026-10-11 23:30 Almaty = 18:30Z → week started Mon 2026-10-05 00:00 Almaty (= 10-04 19:00Z)
eq(iso(almatyWindowStart('week', Date.parse('2026-10-11T18:30:00Z'))), '2026-10-04T19:00:00.000Z',
  'Sunday 23:30 Almaty is still the previous week');
// Monday 2026-10-12 00:10 Almaty = 2026-10-11 19:10Z → new week Mon 2026-10-12 00:00 Almaty
eq(iso(almatyWindowStart('week', Date.parse('2026-10-11T19:10:00Z'))), '2026-10-11T19:00:00.000Z',
  'Monday 00:10 Almaty starts the new week (even though UTC is still Sunday)');
eq(iso(almatyWindowStart('week', Date.parse('2026-10-11T19:00:00Z'))), '2026-10-11T19:00:00.000Z',
  'exactly Monday 00:00 Almaty is the window start');
eq(iso(almatyWindowStart('week', Date.parse('2026-10-14T09:00:00Z'))), '2026-10-11T19:00:00.000Z',
  'mid-week Wednesday → this Monday');
// Month rollover: 2026-10-31 23:59 Almaty (18:59Z) → October; 2026-11-01 00:05 Almaty (10-31 19:05Z) → November
eq(iso(almatyWindowStart('month', Date.parse('2026-10-31T18:59:00Z'))), '2026-09-30T19:00:00.000Z',
  'Oct 31 23:59 Almaty → October window');
eq(iso(almatyWindowStart('month', Date.parse('2026-10-31T19:05:00Z'))), '2026-10-31T19:00:00.000Z',
  'Nov 1 00:05 Almaty → November window (UTC still Oct 31)');
eq(iso(almatyWindowStart('month', Date.parse('2026-12-31T19:30:00Z'))), '2026-12-31T19:00:00.000Z',
  'year rollover: Jan 1 00:30 Almaty → January window');
eq(iso(almatyWindowStart('week', Date.parse('2026-03-01T19:30:00Z'))), '2026-03-01T19:00:00.000Z',
  'week crossing a month boundary (Mon 2026-03-02 00:30 Almaty)');
eq(almatyWindowStart('all', Date.now()), null, "'all' → null (no window)");

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
