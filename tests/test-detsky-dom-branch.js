/**
 * Tests for the "Детский Дом" branch feature (DETSKY_DOM_BRANCH_SPEC.md).
 *
 * Layered like test-online-branch.js:
 *   1. Source-contract regex checks across the migration + the touched JS files
 *      (catch accidental drift of the load-bearing lines).
 *   2. A pure-logic port of the relaxed coach validation — exercised against
 *      in-memory data.
 *
 * Run: node tests/test-detsky-dom-branch.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 1. migration 090 — source contract
// ============================================================================
console.log('\n=== migration 090_detsky_dom_branch.sql ==============================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/090_detsky_dom_branch.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/090_detsky_dom_branch.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');
assert(/ALTER TABLE branches ADD COLUMN IF NOT EXISTS coach_optional BOOLEAN NOT NULL DEFAULT FALSE/.test(MIG),
    'adds branches.coach_optional BOOLEAN NOT NULL DEFAULT FALSE');
assert(/INSERT INTO branches \(name, location, coach_optional\)\s*\n?\s*VALUES \('Детский Дом', 'Almaty', TRUE\)/.test(MIG),
    "seeds the Детский Дом branch row (name='Детский Дом', location='Almaty', coach_optional TRUE)");
assert(/ON CONFLICT \(name\) DO UPDATE SET coach_optional = TRUE/.test(MIG),
    'Детский Дом seed is idempotent (ON CONFLICT on unique name)');
assert(!/INSERT INTO time_slots/.test(MIG),
    'seeds NO time_slots for Детский Дом');
assert(!/INSERT INTO coach_branches/.test(MIG),
    'seeds NO coach_branches for Детский Дом');
assert(/RAISE NOTICE/.test(MIG) && /DO \$\$/.test(MIG),
    'has a DO $$ … RAISE NOTICE verification block');

// ============================================================================
// 2. supabase-data.js — coach_optional passthrough
// ============================================================================
console.log('\n=== supabase-data.js source contract =================================\n');

const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
assert(/id: branch\.id,\s*\n\s*name: branch\.name,[\s\S]*?coach_optional: branch\.coach_optional \|\| false/.test(DATA_SRC),
    'getBranches maps coach_optional through');
assert(/insert\(\[\{[\s\S]*?coach_optional: branchData\.coach_optional \|\| false/.test(DATA_SRC),
    'addBranch inserts coach_optional');
assert(/return \{\s*\n\s*id: data\.id,[\s\S]*?coach_optional: data\.coach_optional \|\| false/.test(DATA_SRC),
    'addBranch returns coach_optional');

// ============================================================================
// 3. admin-v2.js — required-attribute toggle on ADD + EDIT coach selects
// ============================================================================
console.log('\n=== admin-v2.js source contract ======================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// Both coach selects toggle `required` based on branch.coach_optional.
const toggleMatches = ADMIN_SRC.match(
    /const branch = window\.branches\?\.find\(b => b\.name === selectedBranch\);\s*\n\s*if \(branch\?\.coach_optional\) \{\s*\n\s*coachSelect\.removeAttribute\('required'\);\s*\n\s*\} else \{\s*\n\s*coachSelect\.setAttribute\('required', ''\);\s*\n\s*\}/g
) || [];
assert(toggleMatches.length === 2,
    'BOTH coachSelect and editCoachSelect toggle `required` based on coach_optional');

// submitAddStudent: coach guard is relaxed for coach_optional branches.
assert(/const coachOptional = !!branch\?\.coach_optional;/.test(ADMIN_SRC),
    'submitAddStudent computes coachOptional from the selected branch');
assert(/if \(!coach && !coachOptional\) \{/.test(ADMIN_SRC),
    'submitAddStudent only hard-fails on missing coach when coach is NOT optional');
assert(/coach: coach \? coachName : null,\s*\n\s*coachId: coach \? coach\.id : null,/.test(ADMIN_SRC),
    'submitAddStudent allows null coach / coachId');
assert(/\(!studentData\.coachId && !coachOptional\)/.test(ADMIN_SRC),
    'submitAddStudent drops coachId from required-fields check when coach is optional');

// ============================================================================
// 4. Pure-logic port — relaxed coach validation
// ============================================================================
console.log('\n=== pure logic: relaxed coach validation =============================\n');

// Mirror of the Add-form required-fields decision, reduced to the coach term:
// the form PASSES when a coach is present OR the branch is coach_optional.
function coachValidationPasses(branch, coach) {
    const coachOptional = !!branch?.coach_optional;
    const coachId = coach ? coach.id : null;
    return !(!coachId && !coachOptional);
}

const DETSKY = { name: 'Детский Дом', coach_optional: true };
const NORMAL = { name: 'Halyk Arena', coach_optional: false };
const COACH = { id: 'c1', firstName: 'Ivan', lastName: 'Petrov' };

assert(coachValidationPasses(DETSKY, null) === true,
    'coach_optional branch with NO coach → PASS');
assert(coachValidationPasses(NORMAL, null) === false,
    'normal branch with NO coach → FAIL');
assert(coachValidationPasses(DETSKY, COACH) === true,
    'coach_optional branch WITH a coach → PASS');
assert(coachValidationPasses(NORMAL, COACH) === true,
    'normal branch WITH a coach → PASS');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
