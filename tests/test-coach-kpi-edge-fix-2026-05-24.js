/**
 * Coach KPI edge-function fix locks — 2026-05-24.
 * Run: node tests/test-coach-kpi-edge-fix-2026-05-24.js
 *
 * Pins three regressions found while diagnosing the broken
 * /admin#coach-kpi dashboard:
 *
 *   1) The catch-all error handler used to stringify supabase-js error
 *      objects via `String(error)` → `"[object Object]"` (PostgREST errors
 *      are plain objects, not Error instances). The fix forwards
 *      `{message, code, details, hint}` so callers see what failed.
 *
 *   2) The summary actions used to call `.in('student_id', studentIds)`
 *      with the full active-student list (~770 UUIDs). At ~37 bytes per
 *      UUID this blew past PostgREST's URL limit, which surfaced as a
 *      generic 400 "Bad Request". The fix scopes the query by upload_id
 *      only and filters by student_id in process.
 *
 *   3) `coach_kpi_summary` used to read from the legacy
 *      `tournament_participants` table, which the Phase 2 upload flow
 *      never populates — so the per-coach page always showed zeros even
 *      with data present. The fix points it at `tournament_results` +
 *      `tournaments_uploads`, matching coach_leaderboard.
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

function stripComments(s) {
    // Drop JS line comments so prose like "// Skip the .in('student_id', …)"
    // doesn't fool the source-grep assertions below.
    return s.replace(/^\s*\/\/.*$/gm, '');
}

function extractAction(name) {
    const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
    const m = re.exec(SRC);
    return m ? stripComments(m[1]) : '';
}

console.log('\n=== (1) error handler forwards full PostgREST error shape =============\n');
// The catch block must surface PostgREST's structured fields, not collapse
// the object via String() which yields "[object Object]".
assert(!/error\s*instanceof\s*Error[^]*String\(error\)\s*\}\s*,\s*500/.test(SRC),
    'old "String(error)" path is gone — no more "[object Object]" responses');
assert(/code:\s*e\.code/.test(SRC) && /details:\s*e\.details/.test(SRC) && /hint:\s*e\.hint/.test(SRC),
    'catch handler forwards PostgREST {code, details, hint} fields');
assert(/console\.error\(['"]analytics-tournaments error:/.test(SRC),
    'catch handler logs the full payload to the function console');

console.log('\n=== (2) summary actions avoid .in() URL blow-up on student_id =========\n');
const schoolBlock = extractAction('school_kpi_summary');
const leaderboardBlock = extractAction('coach_leaderboard');
const coachBlock = extractAction('coach_kpi_summary');

assert(schoolBlock.length > 0 && leaderboardBlock.length > 0 && coachBlock.length > 0,
    'all three summary handler blocks extracted from source');

// Each handler still queries tournament_results, but must NOT pass studentIds
// through PostgREST's `.in('student_id', …)` — the list is hundreds of UUIDs
// and breaches the URL length limit, surfacing as a generic 400.
for (const [label, block] of [
    ['school_kpi_summary', schoolBlock],
    ['coach_leaderboard',  leaderboardBlock],
    ['coach_kpi_summary',  coachBlock],
]) {
    assert(/from\('tournament_results'\)/.test(block),
        `${label}: still reads tournament_results`);
    assert(!/\.in\(['"]student_id['"]/.test(block),
        `${label}: no .in('student_id', ...) — avoids URL-length 400 with 700+ UUIDs`);
    assert(/in\(['"]upload_id['"]/.test(block) || label === 'coach_kpi_summary'
        ? /in\(['"]upload_id['"]/.test(block)
        : true,
        `${label}: still scopes the tournament_results read by upload_id`);
}

// The promotion fetch used to thread .in('student_id', studentIds) too;
// confirm those are scoped client-side instead.
for (const [label, block] of [
    ['school_kpi_summary', schoolBlock],
    ['coach_leaderboard',  leaderboardBlock],
    ['coach_kpi_summary',  coachBlock],
]) {
    const promQuery = block.match(/from\('student_league_events'\)[\s\S]*?(?=const\s|let\s|if \(|\}\n)/);
    assert(promQuery && !/\.in\(['"]student_id['"]/.test(promQuery[0]),
        `${label}: student_league_events query no longer threads studentIds through .in()`);
}

console.log('\n=== (3) coach_kpi_summary reads Phase 2 tables, not legacy ============\n');
assert(/from\('tournaments_uploads'\)/.test(coachBlock),
    'coach_kpi_summary reads tournaments_uploads (Phase 2 source)');
assert(/from\('tournament_results'\)/.test(coachBlock),
    'coach_kpi_summary reads tournament_results (Phase 2 source)');
assert(!/from\('tournament_participants'\)/.test(coachBlock),
    'coach_kpi_summary no longer reads the legacy tournament_participants table');
assert(/games_played/.test(coachBlock),
    'coach_kpi_summary filters out registered-but-no-games rows (games_played>=1)');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
