/**
 * Tests for the razryad-detection trigger in migration 039_tournament_results.sql.
 *
 * COACH_KPI_PHASE2_SPEC.md §2 razryad_earned_rate + §6 schema trigger:
 *   - 4th razryad: score >= 6/10 in a 4th-razryad qualification tournament
 *   - 3rd razryad: score >= 7/9 in a 3rd-razryad qualification tournament
 *   - Only upgrade students.razryad when newly-earned razryad outranks current
 *   - No downgrades, no double-award
 *
 * Tests are content-based — no local Postgres. We assert the SQL captures
 * the intent + reads the razryad ranking correctly via the helper function
 * we mirror locally.
 *
 * Run: node tests/test-razryad-detection.js
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

const M039 = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '039_tournament_results.sql'),
    'utf8'
);

console.log('\n=== migration 039 file shape ==========================================\n');
assert(M039.length > 0, '039_tournament_results.sql exists and is non-empty');
assert(/CREATE TYPE tournament_kind AS ENUM/.test(M039), 'declares tournament_kind enum');
assert(/'league_c'/.test(M039) && /'league_b'/.test(M039)
    && /'razryad_4'/.test(M039) && /'razryad_3'/.test(M039),
    'enum includes all 4 spec values');
assert(/CREATE TABLE IF NOT EXISTS tournaments_uploads/.test(M039), 'declares tournaments_uploads table');
assert(/CREATE TABLE IF NOT EXISTS tournament_results/.test(M039), 'declares tournament_results table');

console.log('\n=== rounds-per-kind CHECK constraint ==================================\n');
assert(/kind = 'league_c'\s*AND rounds = 6/.test(M039), 'league_c → 6 rounds');
assert(/kind = 'league_b'\s*AND rounds = 6/.test(M039), 'league_b → 6 rounds');
assert(/kind = 'razryad_4'\s*AND rounds = 10/.test(M039), 'razryad_4 → 10 rounds');
assert(/kind = 'razryad_3'\s*AND rounds = 9/.test(M039), 'razryad_3 → 9 rounds');

console.log('\n=== tournament_results columns =======================================\n');
assert(/upload_id\s+UUID NOT NULL REFERENCES tournaments_uploads\(id\) ON DELETE CASCADE/.test(M039),
    'upload_id FK with CASCADE');
assert(/student_id\s+UUID NOT NULL REFERENCES students\(id\) ON DELETE CASCADE/.test(M039),
    'student_id FK with CASCADE');
assert(/rank\s+SMALLINT NOT NULL/.test(M039), 'rank column');
assert(/score\s+NUMERIC\(3,1\) NOT NULL/.test(M039), 'score column');
assert(/games_played\s+SMALLINT NOT NULL/.test(M039), 'games_played column');
assert(/avg_opp_rating\s+INTEGER/.test(M039), 'avg_opp_rating column (nullable)');
assert(/rating_before\s+INTEGER NOT NULL/.test(M039), 'rating_before column');
assert(/rating_delta\s+INTEGER NOT NULL/.test(M039), 'rating_delta column');
assert(/earned_razryad\s+TEXT CHECK \(earned_razryad IS NULL OR earned_razryad IN \('3', '4'\)\)/.test(M039),
    'earned_razryad column with 3/4 CHECK');

console.log('\n=== razryad-detection trigger ========================================\n');
assert(/CREATE OR REPLACE FUNCTION detect_razryad_from_result/.test(M039),
    'trigger function declared');
assert(/v_kind = 'razryad_4' AND NEW\.score >= 6/.test(M039),
    '4th razryad threshold: score >= 6 in razryad_4 upload');
assert(/v_kind = 'razryad_3' AND NEW\.score >= 7/.test(M039),
    '3rd razryad threshold: score >= 7 in razryad_3 upload');
assert(/BEFORE INSERT ON tournament_results/.test(M039),
    'trigger fires BEFORE INSERT so earned_razryad fills the row');
assert(/razryad_rank\(v_earned\) > razryad_rank\(v_current\)/.test(M039),
    'only upgrades when newly-earned razryad outranks current (no downgrade, no double-award)');

console.log('\n=== razryad_rank helper (ordinal ranking) ============================\n');
assert(/CREATE OR REPLACE FUNCTION razryad_rank/.test(M039), 'razryad_rank helper declared');
assert(/'kms'\s+THEN RETURN 5/.test(M039), "razryad_rank('kms') = 5");
assert(/'1st'\s+THEN RETURN 4/.test(M039), "razryad_rank('1st') = 4");
assert(/'2nd'\s+THEN RETURN 3/.test(M039), "razryad_rank('2nd') = 3");
assert(/'3rd'\s+THEN RETURN 2/.test(M039), "razryad_rank('3rd') = 2");
assert(/'4th'\s+THEN RETURN 1/.test(M039), "razryad_rank('4th') = 1");

console.log('\n=== local re-implementation: behavioural checks ======================\n');
// Mirror the SQL CASE in JS so the test catches logic drift.
function razryadRank(r) {
    if (r == null) return 0;
    switch (String(r).toLowerCase()) {
        case 'kms': return 5;
        case '1st': case '1': return 4;
        case '2nd': case '2': return 3;
        case '3rd': case '3': return 2;
        case '4th': case '4': return 1;
        default: return 0;
    }
}
function detect(kind, score) {
    if (kind === 'razryad_4' && score >= 6) return '4';
    if (kind === 'razryad_3' && score >= 7) return '3';
    return null;
}
function shouldUpgrade(currentRazryad, earned) {
    if (!earned) return false;
    return razryadRank(earned) > razryadRank(currentRazryad);
}

// 4th razryad threshold checks
assertEqual(detect('razryad_4', 6),   '4', '6/10 → earns 4th razryad');
assertEqual(detect('razryad_4', 7.5), '4', '7.5/10 → earns 4th razryad');
assertEqual(detect('razryad_4', 5.5), null, '5.5/10 → no razryad (below threshold)');
assertEqual(detect('razryad_4', 10),  '4', 'perfect 10 → 4th razryad');

// 3rd razryad threshold checks
assertEqual(detect('razryad_3', 7),   '3', '7/9 → earns 3rd razryad');
assertEqual(detect('razryad_3', 6.5), null, '6.5/9 → no razryad (just below threshold)');
assertEqual(detect('razryad_3', 9),   '3', 'perfect 9 → 3rd razryad');

// League uploads never award razryads (qualification-only)
assertEqual(detect('league_c', 10), null, 'league_c never awards razryad');
assertEqual(detect('league_b', 10), null, 'league_b never awards razryad');

// No downgrade, no double-award
assert(!shouldUpgrade('1st', '4'),
    'student with 1st razryad earning 4th → not upgraded (no downgrade)');
assert(!shouldUpgrade('3rd', '4'),
    'student with 3rd razryad earning 4th → not upgraded (no downgrade)');
assert(!shouldUpgrade('4th', '4'),
    'student with 4th razryad earning 4th → not upgraded (no double-award)');
assert(shouldUpgrade(null, '4'),
    'student with no razryad earning 4th → upgraded');
assert(shouldUpgrade('none', '4'),
    "student with razryad='none' earning 4th → upgraded");
assert(shouldUpgrade('4th', '3'),
    '4th razryad earning 3rd → upgraded (3rd outranks 4th)');
assert(!shouldUpgrade('kms', '3'),
    'KMS earning 3rd → not upgraded');

console.log('\n=== RLS on the new tables ===========================================\n');
assert(/ALTER TABLE tournaments_uploads ENABLE ROW LEVEL SECURITY/.test(M039),
    'RLS enabled on tournaments_uploads');
assert(/ALTER TABLE tournament_results\s+ENABLE ROW LEVEL SECURITY/.test(M039),
    'RLS enabled on tournament_results');
assert(/CREATE POLICY "Admins manage tournaments_uploads"/.test(M039),
    'admins FOR ALL policy on tournaments_uploads');
assert(/CREATE POLICY "Admins manage tournament_results"/.test(M039),
    'admins FOR ALL policy on tournament_results');
assert(/CREATE POLICY "Coaches read tournament_results for their students"/.test(M039),
    'coach SELECT policy scoped to their own students');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
