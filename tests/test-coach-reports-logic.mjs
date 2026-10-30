/**
 * analytics-coaches pure helpers (coach-reports-logic.mjs):
 *  - period windows in Asia/Almaty (week Mon–Sun, month, quarter, half, year),
 *    previous period, default date = yesterday in Almaty, param validation
 *  - Kaplan–Meier math (same fixture as tests/test_coach_reports_db.py)
 *  - sub-scores, composite score (weights 30/20/20/15/15), per-metric ranks,
 *    competition ranking ties, small sample / unranked coaches, movers
 *  - static checks on index.ts: read-only, both actions, auth gate
 *
 * Run: node tests/test-coach-reports-logic.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALMATY_OFFSET,
  PERIODS,
  PODIUM_PRIOR_ENTRIES,
  REPORT_WEIGHTS,
  addDays,
  almatyDate,
  buildReport,
  competitionRanks,
  compositeScore,
  defaultReportDate,
  isRanked,
  kaplanMeier,
  movers,
  parseCohortParams,
  parseReportParams,
  podiumScore,
  previousPeriod,
  rankCoaches,
  resolvePeriod,
  subScores,
  top3FinishRate,
} from '../supabase/functions/analytics-coaches/coach-reports-logic.mjs';

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
const near = (a, b, msg) => assert(a != null && Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);

console.log('\n=== period windows (Asia/Almaty) =======================================\n');
eq(ALMATY_OFFSET, '+05:00', 'Almaty is UTC+5');
eq(PERIODS, ['week', 'month', 'quarter', 'half', 'year'], 'periods');
eq(resolvePeriod('week', '2026-10-28'), {
  period: 'week', start_date: '2026-10-26', end_date: '2026-11-01',
  start: '2026-10-26T00:00:00+05:00', end: '2026-11-02T00:00:00+05:00',
}, 'week of Wed 2026-10-28 = Mon 26 Oct – Sun 1 Nov, end exclusive');
eq(resolvePeriod('week', '2026-10-26').start_date, '2026-10-26', 'Monday starts its own week');
eq(resolvePeriod('week', '2026-11-01').start_date, '2026-10-26', 'Sunday belongs to the week before');
eq(resolvePeriod('week', '2026-12-30').end_date, '2027-01-03', 'week across a year boundary');
eq(resolvePeriod('month', '2026-02-15'), {
  period: 'month', start_date: '2026-02-01', end_date: '2026-02-28',
  start: '2026-02-01T00:00:00+05:00', end: '2026-03-01T00:00:00+05:00',
}, 'month: February 2026');
eq(resolvePeriod('month', '2028-02-10').end_date, '2028-02-29', 'leap February');
eq([resolvePeriod('quarter', '2026-11-05').start_date, resolvePeriod('quarter', '2026-11-05').end_date],
  ['2026-10-01', '2026-12-31'], 'quarter: Q4');
eq(resolvePeriod('quarter', '2026-03-31').start_date, '2026-01-01', 'quarter: Q1 last day');
eq(resolvePeriod('quarter', '2026-12-31').end, '2027-01-01T00:00:00+05:00', 'Q4 ends at next Jan 1 Almaty');
eq([resolvePeriod('half', '2026-06-30').start_date, resolvePeriod('half', '2026-06-30').end_date],
  ['2026-01-01', '2026-06-30'], 'half: H1');
eq(resolvePeriod('half', '2026-07-01').start_date, '2026-07-01', 'half: H2');
eq([resolvePeriod('year', '2026-05-13').start_date, resolvePeriod('year', '2026-05-13').end_date],
  ['2026-01-01', '2026-12-31'], 'year');
eq(resolvePeriod('day', '2026-05-13'), null, 'unknown period → null');
eq(resolvePeriod('month', '2026-02-30'), null, 'impossible date → null');

eq(previousPeriod(resolvePeriod('week', '2026-10-28')).start_date, '2026-10-19', 'previous week');
eq(previousPeriod(resolvePeriod('month', '2026-01-10')).start_date, '2025-12-01', 'previous month across year');
eq(previousPeriod(resolvePeriod('quarter', '2026-02-01')).start_date, '2025-10-01', 'previous quarter');
eq(previousPeriod(resolvePeriod('half', '2026-08-01')).start_date, '2026-01-01', 'previous half');
eq(previousPeriod(resolvePeriod('year', '2026-08-01')).end_date, '2025-12-31', 'previous year');

eq(addDays('2026-03-01', -1), '2026-02-28', 'addDays');
const MON_0900_ALMATY = Date.parse('2026-11-02T04:00:00Z');
eq(almatyDate(Date.parse('2026-10-31T19:30:00Z')), '2026-11-01', '19:30 UTC is already the next day in Almaty');
eq(defaultReportDate(MON_0900_ALMATY), '2026-11-01', 'default date = yesterday in Almaty');
eq(resolvePeriod('week', defaultReportDate(MON_0900_ALMATY)).start_date, '2026-10-26',
  'Monday 09:00 cron → the week that just ended');
eq(resolvePeriod('month', defaultReportDate(Date.parse('2026-11-01T04:00:00Z'))).start_date, '2026-10-01',
  '1st of month cron → previous month');

console.log('\n=== params ==============================================================\n');
eq(parseReportParams({ period: 'month', date: '2026-10-05' }, 0), { value: { period: 'month', date: '2026-10-05' } }, 'valid params');
eq(parseReportParams({ period: 'week' }, MON_0900_ALMATY).value.date, '2026-11-01', 'missing date → default');
assert(parseReportParams({ period: 'daily' }, 0).error, 'bad period → error');
assert(parseReportParams({}, 0).error, 'missing period → error');
assert(parseReportParams({ period: 'week', date: '2026-13-01' }, 0).error, 'bad date → error');
assert(parseReportParams({ period: 'week', date: '2026-10-05T00:00' }, 0).error, 'date with time → error');
eq(parseCohortParams({}), { value: { coach_id: null } }, 'cohort: no coach → school-wide');
eq(parseCohortParams({ coach_id: 'aaaaaaaa-0000-4000-8000-000000000001' }).value.coach_id,
  'aaaaaaaa-0000-4000-8000-000000000001', 'cohort: coach uuid');
assert(parseCohortParams({ coach_id: 'nope' }).error, 'cohort: bad coach_id → error');
eq(parseCohortParams({ coach_id: 'all' }), { value: { coach_id: 'all' } }, "cohort: coach_id=all → every coach in one call");

console.log('\n=== Kaplan–Meier =========================================================\n');
// Same 7 students as tests/test_coach_reports_db.py (SQL got 0.8333 / 0.6667).
const KM = [
  { months: 0.82, event: false }, { months: 6.36, event: true }, { months: 8.67, event: false },
  { months: 6.0, event: false }, { months: 10.7, event: false }, { months: 3.48, event: true },
  { months: 2.64, event: true },
];
near(kaplanMeier(KM, 3), 1 - 1 / 6, 'S(3): event at 2.64 with 6 at risk → 5/6');
near(kaplanMeier(KM, 6), (5 / 6) * (4 / 5), 'S(6): × (1 − 1/5) for the event at 3.48 → 2/3');
near(kaplanMeier(KM, 10), (5 / 6) * (4 / 5) * (2 / 3), 'S(10): × (1 − 1/3) at 6.36 (censored at 6.0 not at risk)');
near(kaplanMeier([{ months: 1, event: false }, { months: 4, event: false }], 3), 1, 'no events → 1');
near(kaplanMeier([{ months: 1, event: true }, { months: 2, event: true }], 3), 0, 'everyone left → 0 (even before t)');
eq(kaplanMeier([{ months: 1, event: true }, { months: 2, event: false }], 3), null, 'follow-up ends before t → null');
eq(kaplanMeier(KM, 12), null, 'S(12) beyond the longest follow-up (10.7) → null');
eq(kaplanMeier([], 3), null, 'no subjects → null');
near(kaplanMeier([{ months: 2, event: true }, { months: 2, event: false }, { months: 5, event: false }], 3), 2 / 3,
  'censored at the event time stays at risk');

console.log('\n=== scores + ranks =======================================================\n');
eq(Object.values(REPORT_WEIGHTS).reduce((a, b) => a + b, 0), 100, 'weights sum to 100');
eq(REPORT_WEIGHTS, { retention: 30, net_growth: 20, razryad_promotions: 20, tournament_participation: 15, podiums: 15 },
  'default weights');

function row(id, name, o = {}) {
  const active = o.active ?? 20;
  return {
    coach_id: id,
    coach_name: name,
    active_students: active,
    small_sample: active < 10,
    new_students: o.new ?? 0,
    left: o.left ?? 0,
    frozen_30d: o.frozen ?? 0,
    net_growth: (o.new ?? 0) - (o.left ?? 0),
    retention: { km_survival_3m: o.km3 ?? null, km_survival_6m: o.km6 ?? null },
    razryad_changes: { promotions: o.promotions ?? 0 },
    participation: { period: { 0: { count: active - (o.players ?? 0) } } },
    podiums: { finishes: o.fin ?? 0, entries: o.ent ?? 0 },
  };
}

const perfect = subScores(row('p', 'P', { km6: 1, new: 2, promotions: 5, players: 20, fin: 30, ent: 30 }), 1);
eq(perfect, { retention: 1, net_growth: 1, razryad_promotions: 1, tournament_participation: 1, podiums: 1 }, 'perfect sub-scores');
eq(compositeScore(perfect), 100, 'perfect → 100');
eq(compositeScore(subScores(row('z', 'Z', { km6: 0, left: 2, players: 0 }))), 0, 'worst → 0');
const mid = subScores(row('m', 'M', { km3: 0.8, new: 1, left: 1, promotions: 1, players: 5, fin: 4, ent: 10 }), 0.4);
eq(mid, { retention: 0.8, net_growth: 0.5, razryad_promotions: 0.2, tournament_participation: 0.25, podiums: 0.4 },
  'sub-scores: KM 3m fallback, net 0 → 0.5, promotions 1/20×4, 5/20 played, podium (4 + 10×0.4) / (10 + 10)');
eq(compositeScore(mid), 47.8, 'composite = Σ weight × sub-score = 24 + 10 + 4 + 3.75 + 6 → 47.8 (1 dp)');
eq(subScores(row('n', 'N', {})).retention, 0.5, 'unknown retention → neutral 0.5');
eq(subScores(row('e', 'E', { active: 0 })).net_growth, 0.5, 'empty roster → neutral net growth');
eq(compositeScore({ retention: 0.333, net_growth: 0, razryad_promotions: 0, tournament_participation: 0, podiums: 0 }), 10,
  'score rounded to 1 dp');
eq(compositeScore(perfect, { retention: 100 }), 100, 'weights are configurable');

const items = [{ v: 5 }, { v: 9 }, { v: 5 }, { v: 1 }];
const r = competitionRanks(items, (x) => x.v);
eq(items.map((x) => r.get(x)), [2, 1, 2, 4], 'ties share a rank (1, 2, 2, 4)');

assert(!isRanked(row(null, 'Unattributed')), 'Unattributed is never ranked');
assert(!isRanked(row('x', 'X', { active: 0 })), 'coach with no roster and no movement is not ranked');
assert(isRanked(row('x', 'X', { active: 0, left: 1 })), 'coach with leavers but no roster is ranked');

const CUR = [
  row('a', 'Анна', { km6: 0.9, new: 2, promotions: 2, players: 10, fin: 5, ent: 10 }),
  row('b', 'Борис', { km6: 0.9, new: 2, promotions: 2, players: 10, fin: 5, ent: 10 }),
  row('c', 'Вера', { km6: 0.5, left: 3, players: 2, active: 8 }),
  row('d', 'Глеб', { active: 0 }),
  row(null, 'Unattributed', { active: 4 }),
];
const ranked = rankCoaches(CUR);
eq(ranked.map((x) => [x.coach_name, x.rank]), [['Анна', 1], ['Борис', 1], ['Вера', 3], ['Глеб', null]],
  'overall rank by score, ties share rank, unranked last, Unattributed excluded');
eq(ranked[0].ranks, { retention: 1, net_growth: 1, razryad_promotions: 1, tournament_participation: 1, podiums: 1 },
  'per-metric ranks');
eq(ranked[2].small_sample, true, 'small_sample passed through (8 active)');

const PREV = rankCoaches([
  row('a', 'Анна', { km6: 0.5, players: 2 }),
  row('b', 'Борис', { km6: 0.95, new: 3, promotions: 4, players: 15, fin: 8, ent: 10 }),
  row('c', 'Вера', { km6: 0.5, left: 3, players: 2, active: 8 }),
]);
const mv = movers(ranked, PREV);
eq(mv.up.map((x) => x.coach_name), ['Анна'], 'movers up: biggest score gain');
eq(mv.down.map((x) => x.coach_name), ['Борис'], 'movers down: biggest score drop');
assert(mv.up[0].score_delta > 0 && mv.up[0].rank_delta === PREV.find((x) => x.coach_id === 'a').rank - 1,
  'mover carries score_delta and rank_delta');
assert(!mv.up.concat(mv.down).some((x) => x.coach_name === 'Вера'), 'unchanged score is not a mover');
eq(movers(ranked, []).up, [], 'no previous period → no movers');

console.log('\n=== podium score = Coach KPI top-3 rate (S4) ==========================\n');
// The exact expression from analytics-tournaments coach_leaderboard, evaluated.
const KPI_SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions',
  'analytics-tournaments', 'index.ts'), 'utf8');
const kpiExpr = /const top3_finish_rate = (r\.internalEntries > 0\s*\?\s*r\.top3Count \/ r\.internalEntries\s*:\s*0)/.exec(KPI_SRC);
assert(kpiExpr, 'Coach KPI top3_finish_rate expression found in analytics-tournaments');
assert(/r\.games_played >= 1[\s\S]{0,600}r\.rank <= 3\) top3Count\+\+/.test(KPI_SRC),
  'KPI counts podiums (rank ≤ 3) among played entries (games_played ≥ 1) — same as podiums.entries / finishes');
const kpiRate = new Function('r', `return ${kpiExpr[1]}`);
const cases = [[0, 0], [1, 1], [3, 10], [12, 30], [0, 7], [5, 5]];
assert(cases.every(([t, e]) => top3FinishRate(t, e) === kpiRate({ top3Count: t, internalEntries: e })),
  'top3FinishRate ≡ Coach KPI formula on every case');
eq(podiumScore(0, 0, 0.4), 0, 'no entries → 0 (as the KPI)');
assert(Math.abs(podiumScore(120, 300, 0.13) - top3FinishRate(120, 300)) < 0.01, 'large samples converge to the KPI rate');
eq(PODIUM_PRIOR_ENTRIES, 10, 'prior worth 10 entries');

// Fixture: one participant, one entry, one podium vs a big coach with a 40 % rate.
const SCHOOL = { podiums: { finishes: 449, entries: 3430 } };  // live 2026 school rate ≈ 13 %
const single = row('s', 'Single', { km6: 0.9, new: 1, promotions: 1, players: 1, active: 1, fin: 1, ent: 1 });
const big = row('g', 'Big', { km6: 0.9, new: 1, promotions: 1, players: 15, active: 20, fin: 12, ent: 30 });
const sRanked = rankCoaches([single, big], REPORT_WEIGHTS, SCHOOL);
const sOne = sRanked.find((x) => x.coach_id === 's');
assert(sOne.sub_scores.podiums < 0.25, `single podium from one entry is not full marks (${sOne.sub_scores.podiums.toFixed(3)})`);
assert(sOne.ranks.podiums === 2 && sRanked.find((x) => x.coach_id === 'g').ranks.podiums === 1,
  'the 12/30 coach out-ranks the 1/1 coach on podiums');

const WIN = resolvePeriod('month', '2026-10-05');
const rep = buildReport({
  window: WIN, previousWindow: previousPeriod(WIN),
  current: { generated_at: 'x', coaches: CUR, school: { active_students: 52 }, data_notes: { excluded_pre_history_leavers: 3 } },
  previous: { coaches: [], school: null },
});
eq(rep.period.start_date, '2026-10-01', 'report carries the period window');
eq(rep.previous_period.start_date, '2026-09-01', 'and the previous period window');
eq(rep.unattributed.coach_name, 'Unattributed', 'Unattributed row returned separately');
eq(rep.coaches.length, 4, 'coaches exclude Unattributed');
eq(rep.school.active_students, 52, 'school totals passed through');
eq(rep.weights, REPORT_WEIGHTS, 'weights echoed');
eq(rep.data_notes, { excluded_pre_history_leavers: 3 }, 'data_notes passed through');

console.log('\n=== index.ts static checks ==============================================\n');
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '..', 'supabase', 'functions', 'analytics-coaches', 'index.ts'), 'utf8');
assert(/from '\.\/coach-reports-logic\.mjs'/.test(SRC), 'imports the tested pure helpers');
assert(/action === 'report'/.test(SRC) && /action === 'cohort_matrix'/.test(SRC), 'report + cohort_matrix actions');
assert(/rpc\('coach_report'/.test(SRC) && /rpc\('coach_cohort_matrix'/.test(SRC), 'calls the migration 101 RPCs');
assert(/coach_id === 'all'[\s\S]{0,80}rpc\('coach_cohort_matrix_all'\)/.test(SRC), "coach_id=all → coach_cohort_matrix_all (one RPC)");
assert(!/\.(insert|update|upsert|delete)\(/.test(SRC), 'read-only (no insert/update/upsert/delete)');
assert(/req\.method !== 'GET'/.test(SRC), 'GET only');
assert(/validBearer\(header\)\) return 200/.test(SRC), 'service key Bearer accepted (cron)');
assert(/API_KEYS\.includes\(req\.headers\.get\('x-api-key'\)/.test(SRC), 'x-api-key gate as analytics-tournaments');
assert(/auth\.getUser\(token\)/.test(SRC) && /role\?\.role === 'admin'/.test(SRC), 'session must belong to an admin');
const CONFIG = fs.readFileSync(path.join(here, '..', 'supabase', 'config.toml'), 'utf8');
assert(/\[functions\.analytics-coaches\]\s*(#[^\n]*\n\s*)*verify_jwt = false/.test(CONFIG), 'config.toml: verify_jwt = false (auth in function)');

console.log(`\n  passed: ${passed}\n  failed: ${failed}`);
process.exit(failed ? 1 : 0);
