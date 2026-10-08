/**
 * Tests for the event-driven Chesster freeze/thaw poke fired when an admin
 * flips a student's status (active <-> frozen) in the admin app.
 *
 * Static analysis of supabase-data.js:
 *  - pokeChessterFreezeThaw(studentId, status) is defined, only fires for
 *    active/frozen, reads the shared token from window.supabaseConfig (not
 *    hardcoded), bails when unconfigured, POSTs external_student_id + status
 *    with a Bearer token under a short AbortController timeout, is wrapped in
 *    try/catch (non-fatal) and surfaces a non-blocking toast on failure.
 *  - updateStudent fires the poke after the successful write, before the
 *    return, and does NOT await it (fire-and-forget).
 *
 * Run: node tests/test-chesster-freeze-thaw-poke.js
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
// (a) pokeChessterFreezeThaw helper
// ---------------------------------------------------------------
console.log('\n=== (a) supabase-data.js — pokeChessterFreezeThaw helper\n');

assert(/async pokeChessterFreezeThaw\(studentId,\s*status\)\s*\{/.test(DATA),
    'pokeChessterFreezeThaw(studentId, status) defined');

const start = DATA.indexOf('async pokeChessterFreezeThaw');
assert(start >= 0, 'pokeChessterFreezeThaw located');
const block = DATA.slice(start, start + 1600);

assert(/status\s*!==\s*'active'\s*&&\s*status\s*!==\s*'frozen'/.test(block),
    'only fires for active/frozen status');
assert(/window\.supabaseConfig/.test(block) && /chessterSyncToken/.test(block),
    'reads the service token from window.supabaseConfig (not hardcoded)');
assert(/if\s*\(!token\)\s*return/.test(block),
    'bails when no token is configured (cron is the safety net)');
assert(/new AbortController\(\)/.test(block) && /setTimeout\(/.test(block)
    && /controller\.abort\(\)/.test(block),
    'uses a short AbortController timeout');
assert(/method:\s*'POST'/.test(block),
    'uses POST');
assert(/'Authorization':\s*'Bearer '\s*\+\s*token/.test(block),
    'sends the Bearer service token');
assert(/external_student_id:\s*studentId/.test(block) && /status(,|\s*})/.test(block),
    'posts external_student_id + status in the body');
assert(/try\s*\{[\s\S]*\}\s*catch\s*\(e\)\s*\{[\s\S]*console\.warn/.test(block),
    'wrapped in try/catch (non-fatal, warns)');
assert(/showToast\(/.test(block),
    'surfaces a non-blocking toast on failure');

// ---------------------------------------------------------------
// (b) call site inside updateStudent
// ---------------------------------------------------------------
console.log('\n=== (b) supabase-data.js — poke fired from updateStudent\n');

const usStart = DATA.indexOf('async updateStudent(id, studentData)');
assert(usStart >= 0, 'updateStudent still defined');
const usReturn = DATA.indexOf('// Transform to match data.js format', usStart);
assert(usReturn > usStart, 'updateStudent has its transform/return block');

const usBlock = DATA.slice(usStart, usReturn + 40);
assert(/this\.pokeChessterFreezeThaw\(id,\s*studentData\.status\)/.test(usBlock),
    'updateStudent calls this.pokeChessterFreezeThaw(id, studentData.status)');

const pokeIdx = usBlock.indexOf('this.pokeChessterFreezeThaw');
const errIdx = usBlock.indexOf('throw error');
const returnIdx = usBlock.indexOf('// Transform to match data.js format');
assert(pokeIdx > errIdx && errIdx > 0, 'poke fires after the error guard (write succeeded)');
assert(pokeIdx < returnIdx, 'poke fires before the return/transform block');
assert(!/await\s+this\.pokeChessterFreezeThaw/.test(usBlock),
    'poke is NOT awaited (fire-and-forget)');

// ---------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
