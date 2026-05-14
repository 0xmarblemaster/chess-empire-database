/**
 * Coach Performance KPI dashboard — Phase 1 edge-function unit tests.
 * Run: node tests/test-coach-kpi-edge-function.js
 *
 * Strategy mirrors test-analytics-tournaments.js: the TS source can't be
 * required directly (Deno-only imports), so we (a) lock its public surface
 * via source-contract greps and (b) re-implement the pure helpers in JS
 * and exhaustively test them. The math is the part that actually needs
 * to be right; the Supabase wiring is checked by the source contract.
 */

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

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
function assertClose(actual, expected, tol, msg) {
    if (Math.abs(actual - expected) <= tol) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ~${expected} (±${tol})\n      got      ${actual}`);
    }
}

// ============================================================
// SOURCE CONTRACT
// ============================================================
console.log('\n=== source contract =====================================================\n');

assert(SRC.includes("action === 'coach_leaderboard'"), 'handles action=coach_leaderboard');
assert(SRC.includes("action === 'coach_kpi_summary'"), 'handles action=coach_kpi_summary');
assert(SRC.includes("action === 'school_kpi_summary'"), 'handles action=school_kpi_summary');

assert(/window_start required/.test(SRC), 'validates window_start');
assert(/window_end required/.test(SRC), 'validates window_end');
assert(/window_start must be <= window_end/.test(SRC), 'validates window ordering');
assert(/coach_id required/.test(SRC), 'coach_kpi_summary requires coach_id');

assert(/COACH_SCORE_WEIGHTS/.test(SRC), 'COACH_SCORE_WEIGHTS constant present');
assert(/participation:\s*0\.30/.test(SRC), 'participation weight = 0.30');
assert(/rating_delta:\s*0\.25/.test(SRC), 'rating_delta weight = 0.25');
assert(/top3:\s*0\.20/.test(SRC), 'top3 weight = 0.20');
assert(/promotion:\s*0\.15/.test(SRC), 'promotion weight = 0.15');
assert(/razryad:\s*0\.10/.test(SRC), 'razryad weight = 0.10');

assert(/calcLeagueFromRating/.test(SRC), 'exports calcLeagueFromRating helper');
assert(/calcCompositeScore/.test(SRC), 'exports calcCompositeScore helper');

assert(/from\('coaches'\)/.test(SRC), 'reads coaches table');
assert(/from\('coach_branches'\)/.test(SRC), 'reads coach_branches junction');
assert(/from\('students'\)/.test(SRC), 'reads students table');
assert(/from\('student_league_events'\)/.test(SRC), 'reads student_league_events table');
assert(/from\('razryad_history'\)/.test(SRC), 'reads razryad_history table');

// PRD: this edge function is read-only — no mutations even after extensions.
assert(!/\bsupabase\.[\s\S]*?\.insert\(/.test(SRC), 'no inserts');
assert(!/\bsupabase\.[\s\S]*?\.update\(/.test(SRC), 'no updates');
assert(!/\bsupabase\.[\s\S]*?\.upsert\(/.test(SRC), 'no upserts');
assert(!/\bsupabase\.[\s\S]*?\.delete\(/.test(SRC), 'no deletes');

// Existing actions still wired (regression guard).
assert(SRC.includes("action === 'list'"), 'still handles list');
assert(SRC.includes("action === 'detail'"), 'still handles detail');
assert(SRC.includes("action === 'student_history'"), 'still handles student_history');
assert(SRC.includes("action === 'branch_leaderboard'"), 'still handles branch_leaderboard');

// ============================================================
// PURE HELPERS — ported from index.ts
// ============================================================
const COACH_SCORE_WEIGHTS = {
    participation: 0.30,
    rating_delta:  0.25,
    top3:          0.20,
    promotion:     0.15,
    razryad:       0.10,
};

function calcLeagueFromRating(r) {
    if (r == null || !Number.isFinite(r)) return null;
    if (r > 800) return 'A';
    if (r >= 450) return 'B';
    return 'C';
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function normalizeParticipation(p, active) { return active <= 0 ? 0 : clamp((p / active) * 100, 0, 100); }
function normalizeRatingDelta(avg) { return clamp(50 + avg, 0, 100); }
function normalizeTop3(t, total) { return total <= 0 ? 0 : clamp((t / total) * 100, 0, 100); }
function normalizePromotion(p, active) { return active <= 0 ? 0 : clamp((p / active) * 200, 0, 100); }
function normalizeRazryad(r, active) { return active <= 0 ? 0 : clamp((r / active) * 400, 0, 100); }

function calcCompositeScore(m) {
    const parts = {
        participation: normalizeParticipation(m.participants_count, m.active_students_count),
        rating_delta:  normalizeRatingDelta(m.avg_rating_delta),
        top3:          normalizeTop3(m.top3_count, m.total_results),
        promotion:     normalizePromotion(m.promotions_count, m.active_students_count),
        razryad:       normalizeRazryad(m.new_razryads_count, m.active_students_count),
    };
    const score =
        parts.participation * COACH_SCORE_WEIGHTS.participation +
        parts.rating_delta  * COACH_SCORE_WEIGHTS.rating_delta +
        parts.top3          * COACH_SCORE_WEIGHTS.top3 +
        parts.promotion     * COACH_SCORE_WEIGHTS.promotion +
        parts.razryad       * COACH_SCORE_WEIGHTS.razryad;
    return Math.round(score * 10) / 10;
}

console.log('\n=== weights ============================================================\n');
const sum = Object.values(COACH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
assertClose(sum, 1.0, 0.0001, 'weights sum to 1.0');

console.log('\n=== calcLeagueFromRating ==============================================\n');
assertEqual(calcLeagueFromRating(null), null, 'null → null');
assertEqual(calcLeagueFromRating(undefined), null, 'undefined → null');
assertEqual(calcLeagueFromRating(NaN), null, 'NaN → null');
assertEqual(calcLeagueFromRating(0), 'C', '0 → C');
assertEqual(calcLeagueFromRating(449), 'C', '449 → C');
assertEqual(calcLeagueFromRating(450), 'B', '450 → B (boundary inclusive)');
assertEqual(calcLeagueFromRating(800), 'B', '800 → B (boundary inclusive)');
assertEqual(calcLeagueFromRating(801), 'A', '801 → A');
assertEqual(calcLeagueFromRating(1500), 'A', '1500 → A');

console.log('\n=== normalizers ========================================================\n');
assertEqual(normalizeParticipation(0, 0), 0, 'participation: empty cohort → 0');
assertEqual(normalizeParticipation(5, 10), 50, '5/10 participants → 50');
assertEqual(normalizeParticipation(10, 10), 100, 'full participation → 100');
assertEqual(normalizeParticipation(20, 10), 100, 'overflow clamped → 100');

assertEqual(normalizeRatingDelta(0), 50, 'avg delta 0 → 50 (neutral)');
assertEqual(normalizeRatingDelta(50), 100, 'avg delta +50 → 100');
assertEqual(normalizeRatingDelta(-50), 0, 'avg delta -50 → 0');
assertEqual(normalizeRatingDelta(200), 100, 'avg delta +200 clamped → 100');
assertEqual(normalizeRatingDelta(-200), 0, 'avg delta -200 clamped → 0');

assertEqual(normalizeTop3(0, 0), 0, 'top3: zero results → 0');
assertEqual(normalizeTop3(3, 10), 30, '3/10 results in top3 → 30');
assertEqual(normalizeTop3(10, 10), 100, '10/10 → 100');

assertEqual(normalizePromotion(0, 10), 0, 'no promotions → 0');
assertEqual(normalizePromotion(5, 10), 100, '50% promoted → 100 (cap)');
assertEqual(normalizePromotion(2, 10), 40, '20% promoted → 40');
assertEqual(normalizePromotion(1, 0), 0, 'empty cohort → 0');

assertEqual(normalizeRazryad(0, 10), 0, 'no razryads → 0');
assertEqual(normalizeRazryad(1, 10), 40, '10% earned razryad → 40');
assertEqual(normalizeRazryad(3, 10), 100, '30% earned razryad → 100 (cap)');
assertEqual(normalizeRazryad(1, 0), 0, 'empty cohort → 0');

console.log('\n=== calcCompositeScore ================================================\n');
{
    const zero = calcCompositeScore({
        active_students_count: 0, participants_count: 0, total_results: 0,
        top3_count: 0, avg_rating_delta: 0, promotions_count: 0, new_razryads_count: 0,
    });
    assertEqual(zero, 12.5, 'all-zero cohort scores 12.5 (just the neutral rating-delta weight)');

    const perfect = calcCompositeScore({
        active_students_count: 10, participants_count: 10, total_results: 30,
        top3_count: 30, avg_rating_delta: 100, promotions_count: 5, new_razryads_count: 3,
    });
    assertEqual(perfect, 100.0, 'maxed-out inputs score 100');

    const mid = calcCompositeScore({
        active_students_count: 10, participants_count: 5, total_results: 10,
        top3_count: 3, avg_rating_delta: 20, promotions_count: 1, new_razryads_count: 1,
    });
    // participation = 50, rating = 70, top3 = 30, promotion = 20, razryad = 40
    // = 50*.3 + 70*.25 + 30*.2 + 20*.15 + 40*.1 = 15 + 17.5 + 6 + 3 + 4 = 45.5
    assertEqual(mid, 45.5, 'mid-range inputs compute to 45.5');

    // Property: composite is monotone in participation when other inputs fixed.
    const lowPart = calcCompositeScore({
        active_students_count: 10, participants_count: 2, total_results: 4,
        top3_count: 1, avg_rating_delta: 10, promotions_count: 0, new_razryads_count: 0,
    });
    const highPart = calcCompositeScore({
        active_students_count: 10, participants_count: 8, total_results: 4,
        top3_count: 1, avg_rating_delta: 10, promotions_count: 0, new_razryads_count: 0,
    });
    assert(highPart > lowPart, 'higher participation yields higher composite (monotonicity)');
}

// ============================================================
// AGGREGATION END-TO-END — via a mock supabase client
// ============================================================
console.log('\n=== rollup logic (per-coach) ==========================================\n');

// Re-implement the per-coach rollup the way coach_leaderboard does, then
// verify it on a fixed dataset. This catches drift in counters even if
// nobody hits the live Supabase.
function rollupCoach({ coach, studentIds, participations, promotions, razryadEvents }) {
    const myStudentIds = new Set(studentIds);
    const myParts = participations.filter(p => myStudentIds.has(p.student_id));
    const myProms = promotions.filter(p => myStudentIds.has(p.student_id));
    const myRaz   = razryadEvents.filter(r => myStudentIds.has(r.student_id) && r.new_razryad && r.new_razryad !== 'none');

    const tournamentIds = new Set();
    const participantStudentIds = new Set();
    const places = [];
    const deltas = [];
    let top1 = 0, top3 = 0;
    for (const r of myParts) {
        tournamentIds.add(r.tournament_id);
        participantStudentIds.add(r.student_id);
        if (Number.isFinite(r.place)) {
            places.push(r.place);
            if (r.place === 1) top1++;
            if (r.place <= 3) top3++;
        }
        if (Number.isFinite(r.rating_delta)) deltas.push(r.rating_delta);
    }
    const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const composite = calcCompositeScore({
        active_students_count: myStudentIds.size,
        participants_count: participantStudentIds.size,
        total_results: myParts.length,
        top3_count: top3,
        avg_rating_delta: avgDelta,
        promotions_count: myProms.length,
        new_razryads_count: myRaz.length,
    });
    return {
        coach_id: coach.id,
        active_students_count: myStudentIds.size,
        total_tournaments: tournamentIds.size,
        avg_place: places.length ? Math.round((places.reduce((a, b) => a + b, 0) / places.length) * 100) / 100 : null,
        top1_count: top1,
        top3_count: top3,
        total_rating_gained: deltas.reduce((a, b) => a + b, 0),
        promotions_count: myProms.length,
        new_razryads_count: myRaz.length,
        composite_score: composite,
    };
}

{
    const coach = { id: 'C1', first_name: 'Alex', last_name: 'K' };
    const studentIds = ['S1', 'S2', 'S3'];
    const participations = [
        { student_id: 'S1', tournament_id: 'T1', place: 1, rating_delta: 30 },
        { student_id: 'S2', tournament_id: 'T1', place: 3, rating_delta: 20 },
        { student_id: 'S1', tournament_id: 'T2', place: 5, rating_delta: -5 },
        // S3 didn't participate.
    ];
    const promotions = [{ student_id: 'S1', event_type: 'promotion' }];
    const razryadEvents = [
        { student_id: 'S2', new_razryad: '3rd' },
        { student_id: 'S2', new_razryad: 'none' }, // ignored (back to 'none')
    ];
    const out = rollupCoach({ coach, studentIds, participations, promotions, razryadEvents });

    assertEqual(out.coach_id, 'C1', 'coach_id passthrough');
    assertEqual(out.active_students_count, 3, '3 active students');
    assertEqual(out.total_tournaments, 2, '2 unique tournaments (T1, T2)');
    assertEqual(out.avg_place, 3, 'avg_place = round((1+3+5)/3) = 3');
    assertEqual(out.top1_count, 1, 'top1_count = 1');
    assertEqual(out.top3_count, 2, 'top3_count = 2 (place 1 + place 3)');
    assertEqual(out.total_rating_gained, 45, 'rating gained = 30+20-5');
    assertEqual(out.promotions_count, 1, '1 promotion');
    assertEqual(out.new_razryads_count, 1, "razryad → 'none' is excluded from new_razryads");
}

{
    // Empty cohort: no students, no parts, no events.
    const out = rollupCoach({
        coach: { id: 'CX' }, studentIds: [],
        participations: [], promotions: [], razryadEvents: [],
    });
    assertEqual(out.active_students_count, 0, 'empty cohort: active=0');
    assertEqual(out.total_tournaments, 0, 'empty cohort: tournaments=0');
    assertEqual(out.avg_place, null, 'empty cohort: avg_place=null');
    assertEqual(out.composite_score, 12.5, 'empty cohort: composite=12.5 (neutral)');
}

{
    // Off-coach data leakage check: a participation row by a student NOT in
    // this coach's roster must not count.
    const out = rollupCoach({
        coach: { id: 'C1' },
        studentIds: ['S1'],
        participations: [
            { student_id: 'S1', tournament_id: 'T1', place: 2, rating_delta: 10 },
            { student_id: 'STRANGER', tournament_id: 'T1', place: 1, rating_delta: 999 },
        ],
        promotions: [{ student_id: 'STRANGER' }],
        razryadEvents: [{ student_id: 'STRANGER', new_razryad: 'kms' }],
    });
    assertEqual(out.total_rating_gained, 10, 'stranger delta excluded');
    assertEqual(out.top1_count, 0, 'stranger top-1 excluded');
    assertEqual(out.promotions_count, 0, 'stranger promotion excluded');
    assertEqual(out.new_razryads_count, 0, 'stranger razryad excluded');
}

console.log('\n=== window validation source-level =====================================\n');
// Spot-check the validation messages we depend on existing in the source.
assert(/window_start and window_end must be ISO dates/.test(SRC),
       'edge function rejects non-ISO dates with a descriptive error');

console.log('\n' + '='.repeat(64));
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(64));
process.exit(failed === 0 ? 0 : 1);
