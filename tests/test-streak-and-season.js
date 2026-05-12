/**
 * Tests for Phase 5 streak & season-summary helpers exposed by
 * supabase-data-tournaments.js. Run: node tests/test-streak-and-season.js
 *
 * Covers:
 *   - computeStreak: empty / single / 14d boundary / gap resets / longest tracked
 *   - computeSeasonSummary: 90-day window, best place, total delta, custom window
 */

const tournamentsData = require('../supabase-data-tournaments.js');
const { computeStreak, computeSeasonSummary } = tournamentsData;
const { _extractDate } = tournamentsData._internal;

// ===== harness ===========================================================
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

function daysAgo(refDate, days) {
    const d = new Date(refDate);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().split('T')[0];
}

const today = new Date('2026-05-12T00:00:00Z');

// ===== _extractDate ======================================================
console.log('\n• _extractDate helper');
assertEqual(_extractDate(null), null, 'null row → null');
assertEqual(_extractDate({}), null, 'empty row → null');
assertEqual(_extractDate({ date: '2026-05-01' }), '2026-05-01', '{date} → date');
assertEqual(_extractDate({ tournament_date: '2026-05-02' }), '2026-05-02', '{tournament_date} → date');
assertEqual(_extractDate({ tournament: { tournament_date: '2026-05-03' } }), '2026-05-03', 'nested tournament.tournament_date');
assertEqual(_extractDate({ date: '2026-05-01', tournament_date: '2099-01-01' }), '2026-05-01', 'top-level date wins');

// ===== computeStreak — degenerate inputs =================================
console.log('\n• computeStreak — degenerate inputs');
assertEqual(computeStreak(null), { current: 0, longest: 0 }, 'null → 0/0');
assertEqual(computeStreak(undefined), { current: 0, longest: 0 }, 'undefined → 0/0');
assertEqual(computeStreak([]), { current: 0, longest: 0 }, 'empty array → 0/0');
assertEqual(computeStreak([{}]), { current: 0, longest: 0 }, 'rows without dates → 0/0');
assertEqual(computeStreak([{ date: null }, { date: undefined }]), { current: 0, longest: 0 }, 'all-null dates → 0/0');

// ===== computeStreak — single tournament =================================
console.log('\n• computeStreak — single tournament');
assertEqual(computeStreak([{ date: '2026-05-01' }]), { current: 1, longest: 1 }, 'one tournament → 1/1');
assertEqual(computeStreak([{ tournament_date: '2026-05-01' }]), { current: 1, longest: 1 }, 'tournament_date shape → 1/1');

// ===== computeStreak — 14-day gap boundary ===============================
console.log('\n• computeStreak — 14-day boundary');
assertEqual(
    computeStreak([{ date: '2026-05-01' }, { date: '2026-05-15' }]),
    { current: 2, longest: 2 },
    'exactly 14 days gap → streak of 2'
);
assertEqual(
    computeStreak([{ date: '2026-05-01' }, { date: '2026-05-16' }]),
    { current: 1, longest: 1 },
    '15 days gap → streak resets (current = 1)'
);
assertEqual(
    computeStreak([{ date: '2026-05-01' }, { date: '2026-05-02' }]),
    { current: 2, longest: 2 },
    '1 day gap → streak of 2'
);
assertEqual(
    computeStreak([{ date: '2026-05-01' }, { date: '2026-05-01' }]),
    { current: 2, longest: 2 },
    'same-day → still in streak'
);

// ===== computeStreak — multi-tournament streaks =========================
console.log('\n• computeStreak — multi-tournament');
// 3 tournaments each within 14d → streak 3
assertEqual(
    computeStreak([
        { date: '2026-04-01' },
        { date: '2026-04-14' },  // +13
        { date: '2026-04-27' },  // +13
    ]),
    { current: 3, longest: 3 },
    '3 within 14d each → 3/3'
);

// gap in middle resets current; longest tracks earlier streak
assertEqual(
    computeStreak([
        { date: '2026-01-01' },
        { date: '2026-01-10' },  // streak 2
        { date: '2026-01-20' },  // streak 3
        { date: '2026-03-01' },  // gap > 14d → reset, current=1
    ]),
    { current: 1, longest: 3 },
    'gap resets current; longest preserved'
);

// gap at end: longest = 4
assertEqual(
    computeStreak([
        { date: '2026-01-01' },
        { date: '2026-01-08' },
        { date: '2026-01-15' },
        { date: '2026-01-22' },
        { date: '2026-03-01' },  // gap
    ]),
    { current: 1, longest: 4 },
    '4-streak then gap → longest 4, current 1'
);

// trailing streak shorter than earlier one
assertEqual(
    computeStreak([
        { date: '2026-01-01' },
        { date: '2026-01-08' },
        { date: '2026-01-15' },  // streak 3
        { date: '2026-04-01' },  // gap
        { date: '2026-04-10' },  // streak 2 trailing
    ]),
    { current: 2, longest: 3 },
    'longest stays even when newer streak is shorter'
);

// trailing streak BEATS earlier one — longest updates
assertEqual(
    computeStreak([
        { date: '2026-01-01' },
        { date: '2026-01-10' },  // streak 2
        { date: '2026-04-01' },  // gap
        { date: '2026-04-08' },
        { date: '2026-04-15' },
        { date: '2026-04-22' },  // trailing 4 — beats earlier
    ]),
    { current: 4, longest: 4 },
    'trailing streak beats earlier → longest updates'
);

// unsorted input — function sorts internally
assertEqual(
    computeStreak([
        { date: '2026-04-15' },
        { date: '2026-04-01' },
        { date: '2026-04-08' },
    ]),
    { current: 3, longest: 3 },
    'unsorted → handled correctly'
);

// nested tournament shape
assertEqual(
    computeStreak([
        { tournament: { tournament_date: '2026-05-01' } },
        { tournament: { tournament_date: '2026-05-10' } },
    ]),
    { current: 2, longest: 2 },
    'nested tournament.tournament_date works'
);

// configurable maxGapDays
assertEqual(
    computeStreak(
        [{ date: '2026-05-01' }, { date: '2026-05-08' }],
        { maxGapDays: 7 }
    ),
    { current: 2, longest: 2 },
    'maxGapDays=7 with 7d gap → 2/2'
);
assertEqual(
    computeStreak(
        [{ date: '2026-05-01' }, { date: '2026-05-09' }],
        { maxGapDays: 7 }
    ),
    { current: 1, longest: 1 },
    'maxGapDays=7 with 8d gap → resets'
);

// mixed-with-null dates: nulls are dropped before computing streak
assertEqual(
    computeStreak([
        { date: '2026-04-01' },
        { date: null },
        { date: '2026-04-14' },
    ]),
    { current: 2, longest: 2 },
    'null dates ignored, valid ones still streak'
);

// large streak (12 tournaments roughly weekly)
const weekly = [];
for (let i = 0; i < 12; i++) weekly.push({ date: daysAgo(today, i * 7) });
assertEqual(computeStreak(weekly), { current: 12, longest: 12 }, '12 weekly tournaments → 12/12');

// ===== computeSeasonSummary — degenerate inputs ==========================
console.log('\n• computeSeasonSummary — degenerate inputs');
assertEqual(
    computeSeasonSummary(null, 90, today),
    { tournamentsPlayed: 0, bestPlace: null, totalRatingDelta: 0, daysWindow: 90 },
    'null → empty summary'
);
assertEqual(
    computeSeasonSummary([], 90, today),
    { tournamentsPlayed: 0, bestPlace: null, totalRatingDelta: 0, daysWindow: 90 },
    'empty array → empty summary'
);
assertEqual(
    computeSeasonSummary([{ date: null }], 90, today),
    { tournamentsPlayed: 0, bestPlace: null, totalRatingDelta: 0, daysWindow: 90 },
    'null-date row → empty summary'
);

// ===== computeSeasonSummary — happy path =================================
console.log('\n• computeSeasonSummary — 90-day window');
const inWindow = [
    { date: daysAgo(today, 5),  place: 7,  rating_delta: 108 },
    { date: daysAgo(today, 30), place: 3,  rating_delta: 25 },
    { date: daysAgo(today, 80), place: 12, rating_delta: -15 },
];
const summary = computeSeasonSummary(inWindow, 90, today);
assertEqual(summary.tournamentsPlayed, 3, 'all 3 within 90 days');
assertEqual(summary.bestPlace, 3, 'best place = min place');
assertEqual(summary.totalRatingDelta, 108 + 25 - 15, 'total delta = sum');
assertEqual(summary.daysWindow, 90, 'daysWindow echoed back');

// rows split inside / outside window
const split = [
    { date: daysAgo(today, 10),  place: 2, rating_delta: 50 },   // inside
    { date: daysAgo(today, 89),  place: 4, rating_delta: 20 },   // inside (boundary)
    { date: daysAgo(today, 91),  place: 1, rating_delta: 200 },  // outside
    { date: daysAgo(today, 200), place: 1, rating_delta: 999 },  // outside
];
const splitSum = computeSeasonSummary(split, 90, today);
assertEqual(splitSum.tournamentsPlayed, 2, 'split: only inside-window rows count');
assertEqual(splitSum.bestPlace, 2, 'split: best place from inside-window only');
assertEqual(splitSum.totalRatingDelta, 70, 'split: delta sum from inside-window only');

// camelCase shape (ratingDelta) also accepted
const camel = [
    { date: daysAgo(today, 10), place: 1, ratingDelta: 80 },
    { date: daysAgo(today, 20), place: 5, ratingDelta: -10 },
];
const camelSum = computeSeasonSummary(camel, 90, today);
assertEqual(camelSum.totalRatingDelta, 70, 'camelCase ratingDelta is summed');
assertEqual(camelSum.tournamentsPlayed, 2, 'camelCase shape counted');

// custom window — 30 days
const win30 = computeSeasonSummary(
    [
        { date: daysAgo(today, 10), place: 1, rating_delta: 10 },
        { date: daysAgo(today, 40), place: 1, rating_delta: 100 },
    ],
    30,
    today
);
assertEqual(win30.tournamentsPlayed, 1, '30-day window excludes 40-day-old row');
assertEqual(win30.totalRatingDelta, 10, '30-day window delta sum');
assertEqual(win30.daysWindow, 30, 'daysWindow=30 echoed');

// non-finite place handling
const placeMixed = [
    { date: daysAgo(today, 5),  place: 4,    rating_delta: 5 },
    { date: daysAgo(today, 10), place: null, rating_delta: -2 },
    { date: daysAgo(today, 20), place: 2,    rating_delta: 0 },
];
const placeSummary = computeSeasonSummary(placeMixed, 90, today);
assertEqual(placeSummary.tournamentsPlayed, 3, 'placeMixed: all 3 counted');
assertEqual(placeSummary.bestPlace, 2, 'placeMixed: best place ignores non-finite');
assertEqual(placeSummary.totalRatingDelta, 3, 'placeMixed: delta sum');

// all rows have non-finite place → bestPlace null
const noPlaces = [
    { date: daysAgo(today, 5),  place: null, rating_delta: 5 },
    { date: daysAgo(today, 10), place: 'x',  rating_delta: 5 },
];
const noPlacesSum = computeSeasonSummary(noPlaces, 90, today);
assertEqual(noPlacesSum.bestPlace, null, 'no finite places → bestPlace null');
assertEqual(noPlacesSum.tournamentsPlayed, 2, 'no-places: still counted');

// all-negative deltas
const negs = [
    { date: daysAgo(today, 5),  place: 10, rating_delta: -10 },
    { date: daysAgo(today, 10), place: 12, rating_delta: -5 },
];
const negSum = computeSeasonSummary(negs, 90, today);
assertEqual(negSum.totalRatingDelta, -15, 'negative-only deltas sum correctly');
assertEqual(negSum.bestPlace, 10, 'best place still smallest number');

// missing rating_delta → treated as 0
const missingDelta = [
    { date: daysAgo(today, 5), place: 3 },
    { date: daysAgo(today, 10), place: 5, rating_delta: 20 },
];
const missingSum = computeSeasonSummary(missingDelta, 90, today);
assertEqual(missingSum.totalRatingDelta, 20, 'missing rating_delta = 0');
assertEqual(missingSum.tournamentsPlayed, 2, 'missing-delta row still counted');

// nested tournament shape works for season summary too
const nested = [
    { tournament: { tournament_date: daysAgo(today, 5) }, place: 1, rating_delta: 10 },
    { tournament: { tournament_date: daysAgo(today, 200) }, place: 1, rating_delta: 999 },
];
const nestedSum = computeSeasonSummary(nested, 90, today);
assertEqual(nestedSum.tournamentsPlayed, 1, 'nested + window filter');
assertEqual(nestedSum.totalRatingDelta, 10, 'nested + delta sum');

// daysWindow defaults to 90 when omitted
const def = computeSeasonSummary(
    [{ date: daysAgo(today, 5), place: 1, rating_delta: 10 }],
    undefined,
    today
);
assertEqual(def.daysWindow, 90, 'omitted daysWindow defaults to 90');
assertEqual(def.tournamentsPlayed, 1, 'default-window happy path');

// ===== report =============================================================
console.log('\n================================================================');
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('================================================================');

process.exit(failed === 0 ? 0 : 1);
