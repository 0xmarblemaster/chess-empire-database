/**
 * Tests for the Phase 2 coach leaderboard composite formula.
 *
 * COACH_KPI_PHASE2_SPEC.md §1 locks the weighting:
 *   score = 0.30 × participation_rate
 *         + 0.25 × normalized_avg_rating_delta
 *         + 0.20 × top3_finish_rate
 *         + 0.15 × promotion_rate
 *         + 0.10 × razryad_earned_rate
 *
 * - Each sub-metric clamped 0–1 before weighting; sum × 100 → 0–100.
 * - Tie-break: equal scores → higher participation_rate wins (spec §1 / §4).
 *
 * We mirror the edge-function helpers locally so tests can run without Deno.
 *
 * Run: node tests/test-coach-leaderboard-formula.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}
function assertClose(actual, expected, eps, msg) {
    if (Math.abs(actual - expected) <= eps) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${expected} ± ${eps}\n      got      ${actual}`);
    }
}

// ── source-level guard: confirm edge function declares the Phase 2 helpers ──
console.log('\n=== source-level: Phase 2 helpers exist in edge function ==============\n');
const EDGE_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts'),
    'utf8'
);
assert(/calcPhase2CompositeScore/.test(EDGE_SRC), 'calcPhase2CompositeScore declared');
assert(/seedRatingForKind/.test(EDGE_SRC), 'seedRatingForKind declared');
assert(/clamp01/.test(EDGE_SRC), 'clamp01 declared');
assert(/participation_rate.*COACH_SCORE_WEIGHTS\.participation/.test(EDGE_SRC),
    'composite multiplies participation_rate × weight.participation');
assert(/promotion_rate.*COACH_SCORE_WEIGHTS\.promotion/.test(EDGE_SRC),
    'composite multiplies promotion_rate × weight.promotion');
assert(/razryad_earned_rate.*COACH_SCORE_WEIGHTS\.razryad/.test(EDGE_SRC),
    'composite multiplies razryad_earned_rate × weight.razryad');
assert(/b\.composite_score - a\.composite_score[\s\S]*b\.participation_rate - a\.participation_rate/.test(EDGE_SRC),
    'tie-break sort: composite_score desc, then participation_rate desc');

// ── local re-implementation (mirrors edge function) ─────────────────────────
const COACH_SCORE_WEIGHTS = {
    participation: 0.30, rating_delta: 0.25, top3: 0.20, promotion: 0.15, razryad: 0.10,
};
const SEED = { league_c: 150, league_b: 450, razryad_4: 300, razryad_3: 550 };
function clamp01(n) { if (!Number.isFinite(n)) return 0; if (n < 0) return 0; if (n > 1) return 1; return n; }
function calcPhase2CompositeScore(r) {
    const score =
        clamp01(r.participation_rate)          * COACH_SCORE_WEIGHTS.participation +
        clamp01(r.normalized_avg_rating_delta) * COACH_SCORE_WEIGHTS.rating_delta +
        clamp01(r.top3_finish_rate)            * COACH_SCORE_WEIGHTS.top3 +
        clamp01(r.promotion_rate)              * COACH_SCORE_WEIGHTS.promotion +
        clamp01(r.razryad_earned_rate)         * COACH_SCORE_WEIGHTS.razryad;
    return Math.round(score * 100 * 10) / 10;
}

console.log('\n=== weights sum to 1.0 =================================================\n');
const sum = Object.values(COACH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
assertClose(sum, 1.0, 0.0001, 'weights sum = 1.0');

console.log('\n=== bounds: all-zero / perfect / all-out-of-range ======================\n');
{
    const allZero = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(allZero, 0, 'all-zero inputs → score 0');

    const perfect = calcPhase2CompositeScore({
        participation_rate: 1, normalized_avg_rating_delta: 1,
        top3_finish_rate: 1, promotion_rate: 1, razryad_earned_rate: 1,
    });
    assertEqual(perfect, 100, 'all-1.0 inputs → score 100');

    const overflow = calcPhase2CompositeScore({
        participation_rate: 5, normalized_avg_rating_delta: 5,
        top3_finish_rate: 5, promotion_rate: 5, razryad_earned_rate: 5,
    });
    assertEqual(overflow, 100, 'inputs > 1.0 clamped → still 100');

    const negatives = calcPhase2CompositeScore({
        participation_rate: -1, normalized_avg_rating_delta: -1,
        top3_finish_rate: -1, promotion_rate: -1, razryad_earned_rate: -1,
    });
    assertEqual(negatives, 0, 'inputs < 0 clamped → score 0');
}

console.log('\n=== individual weight contribution ===================================\n');
{
    const partOnly = calcPhase2CompositeScore({
        participation_rate: 1, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(partOnly, 30, 'participation=1 alone → 30');
    const ratingOnly = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 1,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(ratingOnly, 25, 'rating_delta=1 alone → 25');
    const top3Only = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 0,
        top3_finish_rate: 1, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(top3Only, 20, 'top3=1 alone → 20');
    const promoOnly = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 1, razryad_earned_rate: 0,
    });
    assertEqual(promoOnly, 15, 'promotion=1 alone → 15');
    const razOnly = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 1,
    });
    assertEqual(razOnly, 10, 'razryad=1 alone → 10');
}

console.log('\n=== participation can exceed 1.0 in raw form but is clamped =========\n');
{
    // Per spec §2: "Count each entry — a student who plays 4 League + 1 razryad
    // = 5 contributions. Rate can exceed 100%". The raw rate exceeds 1.0; the
    // formula clamps it to 1.0 before weighting.
    const rate = calcPhase2CompositeScore({
        participation_rate: 1.4, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(rate, 30, 'participation rate > 1.0 clamps to 1.0 in formula');
}

console.log('\n=== tie-break: composite tied → higher participation_rate wins =======\n');
{
    const rows = [
        { coach_id: 'A', composite_score: 50, participation_rate: 0.3 },
        { coach_id: 'B', composite_score: 50, participation_rate: 0.6 },
        { coach_id: 'C', composite_score: 70, participation_rate: 0.1 },
        { coach_id: 'D', composite_score: 50, participation_rate: 0.45 },
    ];
    const sorted = rows.slice().sort((a, b) => {
        if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
        return b.participation_rate - a.participation_rate;
    });
    assertEqual(sorted.map(r => r.coach_id), ['C', 'B', 'D', 'A'],
        'order: C (70) > B/D/A at 50 sorted by participation desc');
}

console.log('\n=== edge cases: empty coach / all-zero sub-metrics ====================\n');
{
    // A coach with no students → all sub-metrics zero in caller code; formula
    // returns 0. Verify the documented behavior holds.
    const out = calcPhase2CompositeScore({
        participation_rate: 0, normalized_avg_rating_delta: 0,
        top3_finish_rate: 0, promotion_rate: 0, razryad_earned_rate: 0,
    });
    assertEqual(out, 0, 'empty coach (all sub-metrics 0) → score 0');
}

console.log('\n=== mid-range mix sanity check ======================================\n');
{
    // participation=0.5, rating=0.4, top3=0.2, promotion=0.3, razryad=0.5
    // = 0.5*30 + 0.4*25 + 0.2*20 + 0.3*15 + 0.5*10 = 15 + 10 + 4 + 4.5 + 5 = 38.5
    const out = calcPhase2CompositeScore({
        participation_rate: 0.5, normalized_avg_rating_delta: 0.4,
        top3_finish_rate: 0.2, promotion_rate: 0.3, razryad_earned_rate: 0.5,
    });
    assertEqual(out, 38.5, 'mixed mid-range inputs → 38.5');
}

console.log('\n=== seedRatingForKind (new-student bootstrap, spec §2) ===============\n');
function seedRatingForKind(kind) { return SEED[kind] != null ? SEED[kind] : null; }
assertEqual(seedRatingForKind('league_c'),  150, 'league_c seed = 150');
assertEqual(seedRatingForKind('league_b'),  450, 'league_b seed = 450');
assertEqual(seedRatingForKind('razryad_4'), 300, '4th razryad seed = 300');
assertEqual(seedRatingForKind('razryad_3'), 550, '3rd razryad seed = 550');
assertEqual(seedRatingForKind('league_a'),  null, 'unknown kind → null');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
