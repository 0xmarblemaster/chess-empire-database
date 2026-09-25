/**
 * Tests for the Chesster gamification sync poke fired after a tournament upload.
 *
 * Covers (static analysis of supabase-data.js):
 *  - pokeGamificationSync() is defined, targets the sync-request endpoint with a
 *    Bearer token pulled from auth.getSession(), and is wrapped in try/catch.
 *  - addTournamentUpload fires the poke after the row-insert loop, right before
 *    `return { upload_id, inserted }`, and does NOT await it.
 *
 * Run: node tests/test-gamification-sync-poke.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const DATA = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

// ---------------------------------------------------------------
// (a) pokeGamificationSync helper
// ---------------------------------------------------------------
console.log('\n=== (a) supabase-data.js — pokeGamificationSync helper\n');

assert(/async pokeGamificationSync\(\)\s*\{/.test(DATA),
    'pokeGamificationSync() defined');

const pokeStart = DATA.indexOf('async pokeGamificationSync');
assert(pokeStart >= 0, 'pokeGamificationSync located');
// slice the helper body: from its start to the next top-level method
const pokeBlock = DATA.slice(pokeStart, pokeStart + 800);

assert(/auth\.getSession\(\)/.test(pokeBlock),
    'pokeGamificationSync reads token from auth.getSession()');
assert(/session\?\.access_token/.test(pokeBlock),
    'pokeGamificationSync extracts session.access_token');
assert(/if\s*\(!token\)\s*return/.test(pokeBlock),
    'pokeGamificationSync bails when no token');
assert(/fetch\('https:\/\/chesster\.io\/api\/chess-empire\/gamification\/sync-request'/.test(pokeBlock),
    'pokeGamificationSync targets the sync-request endpoint');
assert(/method:\s*'POST'/.test(pokeBlock),
    'pokeGamificationSync uses POST');
assert(/'Authorization':\s*'Bearer '\s*\+\s*token/.test(pokeBlock),
    'pokeGamificationSync sends Bearer token');
assert(/try\s*\{[\s\S]*\}\s*catch\s*\(e\)\s*\{[\s\S]*console\.warn/.test(pokeBlock),
    'pokeGamificationSync wrapped in try/catch (non-fatal, warns)');

// ---------------------------------------------------------------
// (b) call site inside addTournamentUpload
// ---------------------------------------------------------------
console.log('\n=== (b) supabase-data.js — poke fired from addTournamentUpload\n');

const tuStart = DATA.indexOf('async addTournamentUpload');
assert(tuStart >= 0, 'addTournamentUpload still defined');
const tuEnd = DATA.indexOf('return { upload_id, inserted }', tuStart);
assert(tuEnd > tuStart, 'addTournamentUpload has `return { upload_id, inserted }`');

const tuBlock = DATA.slice(tuStart, tuEnd + 40);
assert(/this\.pokeGamificationSync\(\)/.test(tuBlock),
    'addTournamentUpload calls this.pokeGamificationSync()');

// The poke must appear AFTER the insert loop but BEFORE the return, and must
// NOT be awaited (fire-and-forget).
const pokeIdx = tuBlock.indexOf('this.pokeGamificationSync()');
const loopIdx = tuBlock.indexOf("from('tournament_results')");
const returnIdx = tuBlock.indexOf('return { upload_id, inserted }');
assert(pokeIdx > loopIdx, 'poke fires after the tournament_results insert loop');
assert(pokeIdx < returnIdx && returnIdx > 0, 'poke fires before the return statement');
assert(!/await\s+this\.pokeGamificationSync\(\)/.test(tuBlock),
    'poke is NOT awaited (fire-and-forget)');

// ---------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
