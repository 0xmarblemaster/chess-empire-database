/**
 * Tests for the 5 pure UI helpers from coach-kpi.js Task 3:
 *
 *   - computeScoreBadgeColor(score)     → 'red' / 'amber' / 'green' bucket
 *   - formatPercent(num)                → '42%' style
 *   - formatRatingDelta(num)            → '+12' / '-5' / '0' with sign
 *   - isStudentInactive(last, asOfDate) → 90-day inactivity predicate
 *   - sortLeaderboard(rows, key, dir)   → stable sort with nulls-last
 *
 * Edge cases required by PRD §Task 4:
 *   - score exactly 40 → amber
 *   - score exactly 70 → amber
 *   - empty rows in sort
 *   - null last-tournament date in isStudentInactive
 *
 * Run: node tests/test-coach-kpi-ui.js
 */

const kpi = require('../coach-kpi.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const DAY_MS = 86400000;

console.log('\n=== smoke: API surface (5 PRD helpers exported) =======================\n');
for (const name of [
    'computeScoreBadgeColor',
    'formatPercent',
    'formatRatingDelta',
    'isStudentInactive',
    'sortLeaderboard',
]) {
    assert(typeof kpi[name] === 'function', `${name} exported`);
}

console.log('\n=== computeScoreBadgeColor (PRD §4 thresholds) ========================\n');
// PRD: red <40, amber 40–70, green >70.
assertEqual(kpi.computeScoreBadgeColor(0),    'red',   '0 → red');
assertEqual(kpi.computeScoreBadgeColor(20),   'red',   '20 → red');
assertEqual(kpi.computeScoreBadgeColor(39),   'red',   '39 → red (just below 40)');
assertEqual(kpi.computeScoreBadgeColor(39.999), 'red', '39.999 → red');
// PRD §Task 4 edge case: exactly 40 → amber (lower inclusive bound).
assertEqual(kpi.computeScoreBadgeColor(40),   'amber', 'EDGE: 40 → amber (lower bound inclusive)');
assertEqual(kpi.computeScoreBadgeColor(40.0001), 'amber', '40.0001 → amber');
assertEqual(kpi.computeScoreBadgeColor(55),   'amber', '55 → amber');
assertEqual(kpi.computeScoreBadgeColor(69.999), 'amber', '69.999 → amber');
// PRD §Task 4 edge case: exactly 70 → amber (upper inclusive bound).
assertEqual(kpi.computeScoreBadgeColor(70),   'amber', 'EDGE: 70 → amber (upper bound inclusive)');
assertEqual(kpi.computeScoreBadgeColor(70.0001), 'green', '70.0001 → green (just above 70)');
assertEqual(kpi.computeScoreBadgeColor(85),   'green', '85 → green');
assertEqual(kpi.computeScoreBadgeColor(100),  'green', '100 → green');
// Defensive: bad inputs never read as success.
assertEqual(kpi.computeScoreBadgeColor(NaN),       'red', 'NaN → red');
assertEqual(kpi.computeScoreBadgeColor(Infinity),  'red', 'Infinity → red (not a finite score)');
assertEqual(kpi.computeScoreBadgeColor(-Infinity), 'red', '-Infinity → red');
assertEqual(kpi.computeScoreBadgeColor(null),      'red', 'null → red');
assertEqual(kpi.computeScoreBadgeColor(undefined), 'red', 'undefined → red');
assertEqual(kpi.computeScoreBadgeColor('70'),      'red', 'numeric string → red (no implicit coercion)');
assertEqual(kpi.computeScoreBadgeColor({}),        'red', 'object → red');
// Parity with the lower-level `scoreColor` helper — alias contract.
assertEqual(kpi.computeScoreBadgeColor(55), kpi.scoreColor(55),
    'computeScoreBadgeColor delegates to scoreColor (parity check)');

console.log('\n=== formatPercent =====================================================\n');
assertEqual(kpi.formatPercent(0),    '0%',   '0 → "0%"');
assertEqual(kpi.formatPercent(42),   '42%',  '42 → "42%" (matches PRD example)');
assertEqual(kpi.formatPercent(100),  '100%', '100 → "100%"');
assertEqual(kpi.formatPercent(42.4), '42%',  '42.4 → "42%" (rounded down to integer)');
assertEqual(kpi.formatPercent(42.5), '43%',  '42.5 → "43%" (rounded up — bankers/standard rounding)');
assertEqual(kpi.formatPercent(42.7), '43%',  '42.7 → "43%" (rounded up)');
assertEqual(kpi.formatPercent(-5),   '-5%',  'negative → "-5%" (allowed for delta percentages)');
assertEqual(kpi.formatPercent(150),  '150%', 'over 100 not clamped (the helper is generic)');
assertEqual(kpi.formatPercent(null),      '—', 'null → em-dash');
assertEqual(kpi.formatPercent(undefined), '—', 'undefined → em-dash');
assertEqual(kpi.formatPercent(NaN),       '—', 'NaN → em-dash');
assertEqual(kpi.formatPercent(Infinity),  '—', 'Infinity → em-dash');
assertEqual(kpi.formatPercent('42'),      '—', 'string → em-dash (no implicit coercion)');

console.log('\n=== formatRatingDelta =================================================\n');
assertEqual(kpi.formatRatingDelta(12),    '+12', '+12 (matches PRD example)');
assertEqual(kpi.formatRatingDelta(1),     '+1',  '+1');
assertEqual(kpi.formatRatingDelta(120),   '+120', 'larger positive');
assertEqual(kpi.formatRatingDelta(-5),    '-5',  '-5 (matches PRD example, native minus sign)');
assertEqual(kpi.formatRatingDelta(-1),    '-1',  '-1');
assertEqual(kpi.formatRatingDelta(-40),   '-40', 'larger negative');
assertEqual(kpi.formatRatingDelta(0),     '0',   '0 has no sign (neither + nor -)');
assertEqual(kpi.formatRatingDelta(0.4),   '0',   '0.4 rounds to 0 (no spurious +)');
assertEqual(kpi.formatRatingDelta(0.5),   '+1',  '0.5 rounds to +1');
assertEqual(kpi.formatRatingDelta(-0.4),  '0',   '-0.4 rounds to 0 (no spurious -)');
assertEqual(kpi.formatRatingDelta(12.7),  '+13', '12.7 → +13 (rounded)');
assertEqual(kpi.formatRatingDelta(-12.7), '-13', '-12.7 → -13 (rounded)');
assertEqual(kpi.formatRatingDelta(null),       '—', 'null → em-dash');
assertEqual(kpi.formatRatingDelta(undefined),  '—', 'undefined → em-dash');
assertEqual(kpi.formatRatingDelta(NaN),        '—', 'NaN → em-dash');
assertEqual(kpi.formatRatingDelta(Infinity),   '—', 'Infinity → em-dash');
assertEqual(kpi.formatRatingDelta('+12'),      '—', 'string → em-dash');

console.log('\n=== isStudentInactive (90-day rule) ===================================\n');
// Pin "as of" to a fixed UTC moment so the math is deterministic across runs.
const AS_OF = new Date(Date.UTC(2026, 4, 14, 12, 0, 0)); // 2026-05-14 12:00 UTC
const daysAgo = (n) => new Date(AS_OF.getTime() - n * DAY_MS);

// PRD §Task 4 edge case: null last-tournament date.
assertEqual(kpi.isStudentInactive(null, AS_OF), true,
    'EDGE: null last-tournament date → inactive (cannot prove activity)');
assertEqual(kpi.isStudentInactive(undefined, AS_OF), true,
    'undefined last-tournament date → inactive');
assertEqual(kpi.isStudentInactive('', AS_OF), true,
    'empty-string last-tournament date → inactive');
assertEqual(kpi.isStudentInactive('not-a-date', AS_OF), true,
    'unparseable date string → inactive (defensive)');
assertEqual(kpi.isStudentInactive(NaN, AS_OF), true,
    'NaN → inactive');

// Boundary: exactly 90 days old → still active (last tournament was within 90d).
assertEqual(kpi.isStudentInactive(daysAgo(90), AS_OF), false,
    '90 days ago → ACTIVE (boundary: within the 90-day window)');
assertEqual(kpi.isStudentInactive(daysAgo(89), AS_OF), false,
    '89 days ago → active');
assertEqual(kpi.isStudentInactive(daysAgo(1), AS_OF), false,
    '1 day ago → active');
assertEqual(kpi.isStudentInactive(AS_OF, AS_OF), false,
    'same instant → active');

// Just past the 90-day threshold → inactive.
assertEqual(kpi.isStudentInactive(daysAgo(91), AS_OF), true,
    '91 days ago → INACTIVE (past the 90-day threshold)');
assertEqual(kpi.isStudentInactive(daysAgo(180), AS_OF), true,
    '6 months ago → inactive');
assertEqual(kpi.isStudentInactive(daysAgo(365 * 2), AS_OF), true,
    '2 years ago → inactive');

// Accepts ISO strings, Date objects, and millisecond timestamps interchangeably.
assertEqual(kpi.isStudentInactive('2026-05-01T00:00:00Z', AS_OF), false,
    'ISO string within window → active');
assertEqual(kpi.isStudentInactive('2025-01-01T00:00:00Z', AS_OF), true,
    'ISO string outside window → inactive');
assertEqual(kpi.isStudentInactive(daysAgo(30).getTime(), AS_OF), false,
    'epoch-ms input within window → active');
assertEqual(kpi.isStudentInactive(daysAgo(120).getTime(), AS_OF.getTime()), true,
    'epoch-ms input + epoch-ms asOfDate → inactive');

// Future "last tournament" dates (clock skew / data error) — treat as active
// because (now - future) is negative, which is ≤ 90 days.
assertEqual(kpi.isStudentInactive(new Date(AS_OF.getTime() + 7 * DAY_MS), AS_OF), false,
    'future last-tournament date → active (negative delta is within window)');

// Default `asOfDate` falls back to Date.now() — verify that the function reads
// the wall clock when no explicit asOfDate is passed.
(function testDefaultAsOf() {
    const realNow = Date.now;
    try {
        Date.now = () => AS_OF.getTime();
        assertEqual(kpi.isStudentInactive(daysAgo(30)), false,
            'default asOfDate (Date.now()) — 30d ago → active');
        assertEqual(kpi.isStudentInactive(daysAgo(120)), true,
            'default asOfDate (Date.now()) — 120d ago → inactive');
    } finally {
        Date.now = realNow;
    }
})();

console.log('\n=== sortLeaderboard ===================================================\n');
// The leaderboard's headline visible metric is now `total_tournaments` (the
// retired Score column was the previous default).
const ROWS = [
    { coach_id: 'a', coach_name: 'Alice', total_tournaments: 5, top3_count: 4, total_rating_gained:  10 },
    { coach_id: 'b', coach_name: 'Bob',   total_tournaments: 9, top3_count: 1, total_rating_gained: 120 },
    { coach_id: 'c', coach_name: 'Cara',  total_tournaments: 2, top3_count: 7, total_rating_gained: -40 },
];

assertEqual(
    kpi.sortLeaderboard(ROWS).map(r => r.coach_id),
    ['b', 'a', 'c'],
    'default: total_tournaments desc (b 9 > a 5 > c 2)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'total_tournaments', 'asc').map(r => r.coach_id),
    ['c', 'a', 'b'],
    'total_tournaments asc when requested');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'top3_count').map(r => r.coach_id),
    ['c', 'a', 'b'],
    'top3_count desc by default (more is better)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'total_rating_gained').map(r => r.coach_id),
    ['b', 'a', 'c'],
    'total_rating_gained desc by default (handles negatives correctly)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'coach_name').map(r => r.coach_id),
    ['a', 'b', 'c'],
    'coach_name asc by default (alphabetical)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'coach_name', 'desc').map(r => r.coach_id),
    ['c', 'b', 'a'],
    'coach_name desc when requested');

// PRD §Task 4 edge case: empty rows in sort.
assertEqual(kpi.sortLeaderboard([], 'total_tournaments'), [],
    'EDGE: empty rows array → empty result');
assertEqual(kpi.sortLeaderboard([], 'total_tournaments', 'asc'), [],
    'EDGE: empty rows + explicit direction → empty result');
assertEqual(kpi.sortLeaderboard(null, 'total_tournaments'), [],
    'EDGE: null rows → empty result (defensive)');
assertEqual(kpi.sortLeaderboard(undefined, 'total_tournaments'), [],
    'EDGE: undefined rows → empty result');
assertEqual(kpi.sortLeaderboard('not an array', 'total_tournaments'), [],
    'EDGE: non-array rows → empty result');
assertEqual(kpi.sortLeaderboard([{ coach_id: 'only' }], 'total_tournaments').map(r => r.coach_id),
    ['only'],
    'single-row array sorts to itself');

// PRD §Task 4 edge case: null/undefined values sort LAST regardless of direction.
const ROWS_WITH_NULL = [
    { coach_id: 'x', total_tournaments: null },
    { coach_id: 'y', total_tournaments: 50 },
    { coach_id: 'z', total_tournaments: 10 },
    { coach_id: 'w', total_tournaments: undefined },
];
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'total_tournaments', 'desc').map(r => r.coach_id),
    ['y', 'z', 'x', 'w'],
    'null/undefined sort last even when desc (real values come first)');
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'total_tournaments', 'asc').map(r => r.coach_id),
    ['z', 'y', 'x', 'w'],
    'null/undefined still sort last when asc (never read as best/smallest)');

const ALL_NULL = [
    { coach_id: 'first',  total_tournaments: null },
    { coach_id: 'second', total_tournaments: null },
    { coach_id: 'third',  total_tournaments: undefined },
];
assertEqual(
    kpi.sortLeaderboard(ALL_NULL, 'total_tournaments').map(r => r.coach_id),
    ['first', 'second', 'third'],
    'all-null rows preserve original order (stable when every key is null)');

// Stability: equal sort keys preserve input order.
const TIES = [
    { coach_id: 'first',  total_tournaments: 50 },
    { coach_id: 'second', total_tournaments: 50 },
    { coach_id: 'third',  total_tournaments: 50 },
];
assertEqual(
    kpi.sortLeaderboard(TIES, 'total_tournaments').map(r => r.coach_id),
    ['first', 'second', 'third'],
    'ties preserve original insertion order (stable sort, desc)');
assertEqual(
    kpi.sortLeaderboard(TIES, 'total_tournaments', 'asc').map(r => r.coach_id),
    ['first', 'second', 'third'],
    'ties preserve original insertion order (stable sort, asc)');

// String sort uses lowercase comparison so mixed-case names still order correctly.
const MIXED_CASE = [
    { coach_id: 'a', coach_name: 'bob' },
    { coach_id: 'b', coach_name: 'Alice' },
    { coach_id: 'c', coach_name: 'cara' },
];
assertEqual(
    kpi.sortLeaderboard(MIXED_CASE, 'coach_name').map(r => r.coach_id),
    ['b', 'a', 'c'],
    'string sort is case-insensitive (Alice < bob < cara regardless of case)');

// Unknown sort key falls back to total_tournaments desc — the headline metric.
assertEqual(
    kpi.sortLeaderboard(ROWS, 'bogus').map(r => r.coach_id),
    ['b', 'a', 'c'],
    'unknown sort key → falls back to total_tournaments desc');
assertEqual(
    kpi.sortLeaderboard(ROWS, undefined).map(r => r.coach_id),
    ['b', 'a', 'c'],
    'undefined sort key → falls back to total_tournaments desc');

// Non-mutation: input array stays intact (renderers depend on this).
(function testNoMutation() {
    const before = ROWS.map(r => r.coach_id);
    kpi.sortLeaderboard(ROWS, 'total_tournaments', 'desc');
    kpi.sortLeaderboard(ROWS, 'coach_name', 'asc');
    const after = ROWS.map(r => r.coach_id);
    assertEqual(after, before, 'sortLeaderboard does not mutate its input array');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
