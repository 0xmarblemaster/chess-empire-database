/**
 * Source-contract tests for migration 098 (3rd razryad and higher may register
 * for League A regardless of rating).
 *
 * Behaviour is covered against a real Postgres in
 * tests/test_league_a_razryad_db.py; this file guards the load-bearing lines
 * so they can't drift silently in a later rebuild of register_for_tournament.
 *
 * Run: node tests/test-league-a-razryad-pass.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/migrations/098_league_a_razryad_pass.sql'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\nmigration 098');
assert(/IF v_required_league IS DISTINCT FROM v_tournament_league\s+AND NOT \(v_tournament_league = 'A'\s+AND razryad_rank\(v_student_razryad\) >= razryad_rank\('3rd'\)\) THEN/.test(MIG),
    'student rating gate lets 3rd+ razryad through for League A only');
assert(MIG.indexOf('SELECT razryad INTO v_student_razryad') < MIG.indexOf("AND NOT (v_tournament_league = 'A'"),
    'razryad is read before the rating gate uses it');
assert(/IF v_tournament_league = 'B' THEN[\s\S]*?'reason', 'razryad_too_high'/.test(MIG),
    'League B razryad gate (092) is kept');
assert(/'reason', 'weekly_limit'/.test(MIG), 'weekly cap (094) is kept');
assert(/IF v_tournament_league = 'C' THEN[\s\S]*?'reason', 'level_too_low'/.test(MIG),
    'League C level gate (066) is kept');
assert(/IF p_guest_rating IS NOT NULL[\s\S]*?IF v_required_league IS DISTINCT FROM v_tournament_league THEN/.test(MIG),
    'guest rating gate has no razryad pass');
assert(/REVOKE EXECUTE ON FUNCTION register_for_tournament\([\s\S]*?FROM anon, PUBLIC;/.test(MIG),
    'anon/PUBLIC execute stays revoked');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
