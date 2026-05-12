/**
 * Tests for Phase 3 student-card tournament widgets — pure-logic helpers
 * exposed by supabase-data-tournaments.js. Run: node tests/test-student-tournament-widgets.js
 *
 * Covers:
 *   - league-letter thresholds (<450=C, 450-800=B, >800=A)
 *   - cadence-from-date cutoffs (≤4w active, ≤8w occasional, >8w inactive)
 *   - aggregate-from-rows (total, ytd, best/avg place, net rating gained, lastDate)
 *   - detect-crossing-from-ratings (promotions + demotions, 90-day window)
 */

const tournamentsData = require('../supabase-data-tournaments.js');
const {
    _leagueFromRating,
    _cadenceFromDate,
    _aggregateFromRows,
    _detectCrossingFromRatings,
} = tournamentsData._internal;

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

// Helper to subtract days from a reference date. Uses UTC arithmetic so the
// boundary tests below behave deterministically across timezones.
function daysAgo(refDate, days) {
    const d = new Date(refDate);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().split('T')[0];
}

// ===== league thresholds =================================================
console.log('\n• League badge thresholds');
assertEqual(_leagueFromRating(0), 'C', '0 → C');
assertEqual(_leagueFromRating(100), 'C', '100 → C');
assertEqual(_leagueFromRating(449), 'C', '449 → C');
assertEqual(_leagueFromRating(450), 'B', '450 → B (inclusive lower bound)');
assertEqual(_leagueFromRating(451), 'B', '451 → B');
assertEqual(_leagueFromRating(600), 'B', '600 → B');
assertEqual(_leagueFromRating(800), 'B', '800 → B (inclusive upper bound)');
assertEqual(_leagueFromRating(801), 'A', '801 → A');
assertEqual(_leagueFromRating(1200), 'A', '1200 → A');
assertEqual(_leagueFromRating(null), null, 'null → null');
assertEqual(_leagueFromRating(undefined), null, 'undefined → null');
assertEqual(_leagueFromRating('abc'), null, 'non-numeric → null');

// ===== cadence cutoffs ====================================================
console.log('\n• Cadence cutoffs');
const today = new Date('2026-05-12T00:00:00Z');
assertEqual(_cadenceFromDate(null, today), 'inactive', 'no date → inactive');
assertEqual(_cadenceFromDate(daysAgo(today, 1), today), 'active', '1 day ago → active');
assertEqual(_cadenceFromDate(daysAgo(today, 27), today), 'active', '27 days ago → active');
assertEqual(_cadenceFromDate(daysAgo(today, 28), today), 'active', '28 days (=4w) → active');
assertEqual(_cadenceFromDate(daysAgo(today, 29), today), 'occasional', '29 days (>4w) → occasional');
assertEqual(_cadenceFromDate(daysAgo(today, 55), today), 'occasional', '55 days → occasional');
assertEqual(_cadenceFromDate(daysAgo(today, 56), today), 'occasional', '56 days (=8w) → occasional');
assertEqual(_cadenceFromDate(daysAgo(today, 57), today), 'inactive', '57 days (>8w) → inactive');
assertEqual(_cadenceFromDate(daysAgo(today, 200), today), 'inactive', '200 days → inactive');

// ===== aggregate calculations =============================================
console.log('\n• Aggregate calculations');
const aggToday = new Date('2026-05-12T00:00:00Z');
const rowsEmpty = [];
const aggEmpty = _aggregateFromRows(rowsEmpty, aggToday);
assertEqual(aggEmpty.total, 0, 'empty rows → total 0');
assertEqual(aggEmpty.bestPlace, null, 'empty rows → bestPlace null');
assertEqual(aggEmpty.avgPlace, null, 'empty rows → avgPlace null');
assertEqual(aggEmpty.totalRatingGained, 0, 'empty rows → totalRatingGained 0');
assertEqual(aggEmpty.cadence, 'inactive', 'empty rows → cadence inactive');

const rows = [
    { place: 7,  delta:  108, date: '2026-05-03' },  // recent
    { place: 3,  delta:   25, date: '2026-04-12' },  // <4w → still active
    { place: 12, delta:  -15, date: '2026-02-10' },
    { place: 1,  delta:   50, date: '2025-12-05' },  // previous year
];
const agg = _aggregateFromRows(rows, aggToday);
assertEqual(agg.total, 4, 'total = 4');
assertEqual(agg.ytd, 3, 'ytd = 3 (2026 dates only)');
assertEqual(agg.bestPlace, 1, 'best place = min = 1');
assertEqual(agg.avgPlace, Math.round((7 + 3 + 12 + 1) / 4), 'avg place = round(mean)');
assertEqual(agg.totalRatingGained, 108 + 25 - 15 + 50, 'net rating gained = sum of all deltas');
assertEqual(agg.lastDate, '2026-05-03', 'lastDate = most recent');
assertEqual(agg.cadence, 'active', 'cadence active (last play 9 days ago)');

// Rows with no Number place are excluded from best/avg but still counted in total.
const rowsMixed = [
    { place: 2,  delta: 10, date: '2026-05-01' },
    { place: null, delta: 5, date: '2026-04-20' },
    { place: 4,  delta: -2, date: '2026-03-15' },
];
const aggMixed = _aggregateFromRows(rowsMixed, aggToday);
assertEqual(aggMixed.total, 3, 'mixed: total counts all dated rows');
assertEqual(aggMixed.bestPlace, 2, 'mixed: best place ignores non-finite');
assertEqual(aggMixed.avgPlace, 3, 'mixed: avg = round((2+4)/2)');
assertEqual(aggMixed.totalRatingGained, 13, 'mixed: net delta');

// Rows missing date are dropped from the aggregate entirely.
const aggDropped = _aggregateFromRows([{ place: 5, delta: 100, date: null }], aggToday);
assertEqual(aggDropped.total, 0, 'rows without date → dropped');

// ===== league promotion detection =========================================
console.log('\n• League promotion / demotion detection');
const promoToday = new Date('2026-05-12T00:00:00Z');

assertEqual(_detectCrossingFromRatings([], 90, promoToday), null, 'empty → null');
assertEqual(_detectCrossingFromRatings([{ rating: 500, rating_date: '2026-05-01' }], 90, promoToday), null, 'single rating → null');

// 450 boundary — C(449) → B(500) crossing within 90 days.
const cToBRecent = [
    { rating: 449, rating_date: daysAgo(promoToday, 60) },
    { rating: 500, rating_date: daysAgo(promoToday, 30) },
];
const cToBResult = _detectCrossingFromRatings(cToBRecent, 90, promoToday);
assert(cToBResult !== null, 'C→B crossing within 90d → result exists');
assertEqual(cToBResult.from, 'C', 'C→B: from = C');
assertEqual(cToBResult.to, 'B', 'C→B: to = B');
assertEqual(cToBResult.direction, 'promoted', 'C→B: direction = promoted');

// 800 boundary — B(800) → A(801) crossing within 90 days.
const bToARecent = [
    { rating: 800, rating_date: daysAgo(promoToday, 45) },
    { rating: 801, rating_date: daysAgo(promoToday, 10) },
];
const bToAResult = _detectCrossingFromRatings(bToARecent, 90, promoToday);
assert(bToAResult !== null, 'B→A crossing within 90d → result exists');
assertEqual(bToAResult.from, 'B', 'B→A: from = B');
assertEqual(bToAResult.to, 'A', 'B→A: to = A');
assertEqual(bToAResult.direction, 'promoted', 'B→A: direction = promoted');

// Demotion — A(900) → B(700).
const aToBRecent = [
    { rating: 900, rating_date: daysAgo(promoToday, 50) },
    { rating: 700, rating_date: daysAgo(promoToday, 15) },
];
const aToBResult = _detectCrossingFromRatings(aToBRecent, 90, promoToday);
assert(aToBResult !== null, 'A→B demotion → result exists');
assertEqual(aToBResult.direction, 'demoted', 'A→B: direction = demoted');
assertEqual(aToBResult.from, 'A', 'A→B: from = A');
assertEqual(aToBResult.to, 'B', 'A→B: to = B');

// Crossing outside 90-day window — should be ignored.
const oldCrossing = [
    { rating: 449, rating_date: daysAgo(promoToday, 200) },
    { rating: 500, rating_date: daysAgo(promoToday, 100) },  // >90d ago
];
assertEqual(_detectCrossingFromRatings(oldCrossing, 90, promoToday), null, 'crossing >90d ago → null');

// No crossing — same league throughout.
const noCross = [
    { rating: 600, rating_date: daysAgo(promoToday, 60) },
    { rating: 650, rating_date: daysAgo(promoToday, 30) },
    { rating: 700, rating_date: daysAgo(promoToday, 10) },
];
assertEqual(_detectCrossingFromRatings(noCross, 90, promoToday), null, 'same league throughout → null');

// Multiple crossings: reports the most recent.
const multi = [
    { rating: 449, rating_date: daysAgo(promoToday, 80) },
    { rating: 500, rating_date: daysAgo(promoToday, 60) },  // C → B
    { rating: 850, rating_date: daysAgo(promoToday, 20) },  // B → A (most recent)
];
const multiResult = _detectCrossingFromRatings(multi, 90, promoToday);
assert(multiResult !== null, 'multi: result exists');
assertEqual(multiResult.from, 'B', 'multi: most-recent crossing from = B');
assertEqual(multiResult.to, 'A', 'multi: most-recent crossing to = A');

// Boundary value: rating exactly 450 belongs to B, not C.
const exactly450 = [
    { rating: 449, rating_date: daysAgo(promoToday, 60) },
    { rating: 450, rating_date: daysAgo(promoToday, 30) },
];
const exactly450Result = _detectCrossingFromRatings(exactly450, 90, promoToday);
assert(exactly450Result !== null, '449→450: still detected as C→B crossing');
assertEqual(exactly450Result.direction, 'promoted', '449→450: promoted');

// ===== report =============================================================
console.log('\n================================================================');
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('================================================================');

process.exit(failed === 0 ? 0 : 1);
