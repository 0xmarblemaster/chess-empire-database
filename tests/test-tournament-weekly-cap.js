/**
 * Source-contract tests for migration 094 (one tournament per student per week).
 *
 * Behaviour is covered against a real Postgres in
 * tests/test_tournament_weekly_cap_db.py; this file guards the load-bearing lines
 * so they can't drift silently in a later rebuild of register_for_tournament.
 *
 * Run: node tests/test-tournament-weekly-cap.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/migrations/094_tournament_weekly_cap.sql'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'supabase/functions/tournaments-api/index.ts'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\nmigration 094');
assert(/'reason', 'weekly_limit'/.test(MIG), 'returns reason weekly_limit');
assert(/IF NOT COALESCE\(p_force, FALSE\) THEN\s+--[^\n]*\n[\s\S]*?pg_advisory_xact_lock/.test(MIG),
    'cap is skipped only for p_force (admin) and takes a per-student advisory lock');
assert(/hashtextextended\('tournament_weekly_cap:' \|\| p_student_id::text, 0\)/.test(MIG), 'lock key is per student');
assert(/date_trunc\('week', v_tournament_date\)::date/.test(MIG), 'week = Monday-start week of tournament_date');
assert(/t\.tournament_date <  v_week_start \+ 7/.test(MIG), 'window is 7 days from week start');
assert(/t\.status <> 'cancelled'/.test(MIG), 'cancelled tournaments do not count');
assert(/t\.id <> p_tournament_id/.test(MIG), 'same tournament is left to the duplicate check');
assert(MIG.indexOf("'reason', 'duplicate'") < MIG.indexOf("'reason', 'weekly_limit'"),
    'duplicate check runs before the weekly cap');
assert(/ELSIF p_student_id IS NOT NULL THEN[\s\S]*weekly_limit[\s\S]*IF v_tournament_league = 'R' THEN/.test(MIG),
    'cap lives in the student branch only (guests not capped) and covers every league');
assert(/REVOKE EXECUTE ON FUNCTION register_for_tournament\([\s\S]*?FROM anon, PUBLIC;/.test(MIG),
    'anon/PUBLIC execute stays revoked');

console.log('\ntournaments-api');
assert(/'weekly_limit'/.test(API.slice(API.indexOf('const REASONS'), API.indexOf('type Reason'))),
    'weekly_limit is a documented Reason');
assert(/reason === 'weekly_limit'\s+\? 409/.test(API), 'weekly_limit maps to HTTP 409');
assert(/reason === 'level_too_low'\s+\? 409/.test(API) && /reason === 'razryad_too_high'\s+\? 409/.test(API),
    'existing gate reasons map to 409 instead of falling through to 500');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
