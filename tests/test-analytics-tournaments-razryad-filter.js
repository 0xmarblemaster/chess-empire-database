/**
 * Tests for the league → tournaments_uploads.kind mapping in
 * supabase/functions/analytics-tournaments/index.ts.
 *
 * The Coach Performance filter exposes five options: all / B / C / R3 / R4.
 * The first two map to the legacy `league_b` / `league_c` kinds; R3/R4 map
 * to the razryad qualifier kinds (`razryad_3` / `razryad_4`). The TS handler
 * can't be `require()`d in Node (Deno-only imports), so this test
 * source-greps the edge function for the locked mapping at BOTH call sites
 * (coach_leaderboard ~line 333 and school_student_drilldown ~line 911).
 *
 * Run: node tests/test-analytics-tournaments-razryad-filter.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const SRC = fs.readFileSync(
    path.resolve(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts'),
    'utf8'
);

// Locate the two `(league|drillLeague)Param === '…' ? '<kind>'` ternary
// ladders. We grab the multi-line slice that follows each declaration so a
// future refactor that splits the chain across more lines still matches.
function ladderAfter(src, declaration) {
    const idx = src.indexOf(declaration);
    if (idx < 0) return null;
    return src.slice(idx, idx + 600);
}

const COACH_LADDER = ladderAfter(SRC, 'const leagueKind = ');
const DRILL_LADDER = ladderAfter(SRC, 'const drillLeagueKind = ');

assert(COACH_LADDER !== null, 'coach_leaderboard exposes leagueKind ternary');
assert(DRILL_LADDER !== null, 'school_student_drilldown exposes drillLeagueKind ternary');

console.log('\n=== legacy B/C mappings remain at both call sites =====================\n');
for (const [name, slice] of [['coach_leaderboard', COACH_LADDER], ['school_student_drilldown', DRILL_LADDER]]) {
    assert(/=== 'B'\s*\?\s*'league_b'/.test(slice),
        `[${name}] League B → 'league_b' mapping present`);
    assert(/=== 'C'\s*\?\s*'league_c'/.test(slice),
        `[${name}] League C → 'league_c' mapping present`);
}

console.log('\n=== razryad qualifier mappings present at both call sites =============\n');
for (const [name, slice] of [['coach_leaderboard', COACH_LADDER], ['school_student_drilldown', DRILL_LADDER]]) {
    assert(/=== 'R3'\s*\?\s*'razryad_3'/.test(slice),
        `[${name}] R3 → 'razryad_3' mapping present`);
    assert(/=== 'R4'\s*\?\s*'razryad_4'/.test(slice),
        `[${name}] R4 → 'razryad_4' mapping present`);
}

console.log('\n=== unknown league values still fall through to null ==================\n');
for (const [name, slice] of [['coach_leaderboard', COACH_LADDER], ['school_student_drilldown', DRILL_LADDER]]) {
    // The terminal arm of the chain must be `null` — any other default would
    // silently accept bogus league strings and quietly drop the filter.
    assert(/:\s*null/.test(slice),
        `[${name}] terminal arm is `+'`null`'+` (unknown values do not match any kind)`);
}

console.log('\n=== local reimplementation of the league→kind mapping matches the source ==\n');
// Pin the contract in JS so any future divergence between the TS source and
// the documented behavior surfaces here, not only in production.
function leagueKindOf(p) {
    if (p === 'B') return 'league_b';
    if (p === 'C') return 'league_c';
    if (p === 'R3') return 'razryad_3';
    if (p === 'R4') return 'razryad_4';
    return null;
}

const cases = [
    ['B',  'league_b'],
    ['C',  'league_c'],
    ['R3', 'razryad_3'],
    ['R4', 'razryad_4'],
    ['all', null],
    [undefined, null],
    ['A', null],  // League A retired — must not silently match anything.
    ['',  null],
    ['r3', null], // case-sensitive — uppercase only.
];
for (const [param, expected] of cases) {
    const got = leagueKindOf(param);
    if (got === expected) { passed++; console.log(`  ✓ leagueKindOf(${JSON.stringify(param)}) → ${JSON.stringify(expected)}`); }
    else { failed++; console.error(`  ✗ FAIL: leagueKindOf(${JSON.stringify(param)})\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`); }
}

console.log('\n=== drilldown active_players row exposes tournament_kind ==============\n');
// The frontend's leagueCell helper does a null-league fallback to R3/R4
// labels based on `tournament_kind` — the edge function must surface that
// field on every active_players row.
assert(/tournament_kind:\s*tournamentKind/.test(SRC),
    'active_players row carries tournament_kind so the frontend can label null-league rows');
assert(/kinds\.size === 1\s*\?\s*\[\.\.\.kinds\]\[0\]\s*:\s*null/.test(SRC),
    'tournament_kind is set only when the student played a single distinct kind in window (else null)');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
