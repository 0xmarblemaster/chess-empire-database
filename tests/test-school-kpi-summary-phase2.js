/**
 * Tests for the Phase B migration of the `school_kpi_summary` edge-function
 * handler. The handler previously read from the legacy
 * `tournament_participants` + `tournaments` tables; migrations 036/037/038
 * retired those for Phase 2, so school summary must now read from
 * `tournaments_uploads` + `tournament_results` (the same source
 * `coach_leaderboard` already uses).
 *
 * The TS handler can't be required in Node (Deno-only imports), so we
 * source-grep the file to lock the table contract — the same pattern
 * test-coach-kpi-edge-function.js uses.
 *
 * Run: node tests/test-school-kpi-summary-phase2.js
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

// Pull just the school_kpi_summary block so our assertions can't be
// satisfied by an unrelated section of the file.
function extractAction(name) {
    const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
    const m = re.exec(SRC);
    return m ? m[1] : '';
}

const BLOCK = extractAction('school_kpi_summary');

console.log('\n=== source contract: school_kpi_summary uses Phase 2 tables ============\n');
assert(BLOCK.length > 0, 'school_kpi_summary handler block extracted');
assert(/from\('tournaments_uploads'\)/.test(BLOCK),
    'reads tournaments_uploads (Phase 2)');
assert(/from\('tournament_results'\)/.test(BLOCK),
    'reads tournament_results (Phase 2)');
assert(!/from\('tournament_participants'\)/.test(BLOCK),
    'NO longer reads the legacy tournament_participants table');
// The legacy `tournaments` table was historically queried for tournament_date
// filtering; Phase 2 pulls tournament_date off tournaments_uploads instead.
assert(!/from\('tournaments'\)/.test(BLOCK),
    'NO longer queries the legacy tournaments table inside school_kpi_summary');

console.log('\n=== source contract: response shape stays stable =======================\n');
assert(/active_students_count/.test(BLOCK), 'still emits active_students_count');
assert(/participants_count/.test(BLOCK), 'still emits participants_count');
assert(/participation_pct/.test(BLOCK), 'still emits participation_pct');
assert(/total_tournaments/.test(BLOCK), 'still emits total_tournaments');
assert(/top3_count/.test(BLOCK), 'still emits top3_count');
assert(/promotions_count/.test(BLOCK), 'still emits promotions_count');
assert(/new_razryads_count/.test(BLOCK), 'still emits new_razryads_count');
assert(/total_rating_gained/.test(BLOCK), 'still emits total_rating_gained');

console.log('\n=== source contract: window validation still in place ==================\n');
assert(/validateWindow/.test(BLOCK),
    'validateWindow gate retained on school_kpi_summary');

console.log('\n=== source contract: razryad-earning eligibility uses upload kind ======\n');
assert(/razryad_3|razryad_4/.test(BLOCK),
    'razryad eligibility filters on razryad_3 / razryad_4 upload kinds');
assert(/earned_razryad/.test(BLOCK),
    'reads earned_razryad column from tournament_results');

console.log('\n=== source contract: only counts rated games (games_played >= 1) =======\n');
assert(/games_played/.test(BLOCK),
    'gates aggregation on games_played (matches coach_leaderboard rule)');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
