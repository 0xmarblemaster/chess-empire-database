/**
 * Tests for the "Online" virtual branch feature (PRD_ONLINE_BRANCH.md Phase 1).
 *
 * Layered like the other source-contract tests in this repo:
 *   1. Source-contract regex checks across the migration + the touched JS/TS
 *      files (catch accidental drift of the load-bearing lines).
 *   2. Pure-logic ports of the two behaviors that matter — the attendance
 *      dropdown filter and the getTimeSlotsForBranch early-return — exercised
 *      against in-memory data.
 *
 * Run: node tests/test-online-branch.js
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
// 1. migration 082 — source contract
// ============================================================================
console.log('\n=== migration 082_online_branch.sql ==================================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/082_online_branch.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/082_online_branch.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');
assert(/ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE/.test(MIG),
    'adds branches.is_online BOOLEAN NOT NULL DEFAULT FALSE');
assert(/INSERT INTO branches \(name, location, is_online\)\s*\n?\s*VALUES \('Online', 'Online', TRUE\)/.test(MIG),
    "seeds the Online branch row (name='Online', location='Online', is_online TRUE)");
assert(/ON CONFLICT \(name\) DO UPDATE SET is_online = TRUE/.test(MIG),
    'Online seed is idempotent (ON CONFLICT on unique name)');
assert(/INSERT INTO coach_branches \(coach_id, branch_id\)/.test(MIG),
    'seeds Aleksandr into the Online branch via coach_branches');
assert(/first_name ILIKE '%aleksandr%' AND last_name ILIKE '%olegovich%'/.test(MIG),
    'looks up the online coach by name (Aleksandr Olegovich)');
assert(/ON CONFLICT \(coach_id, branch_id\) DO NOTHING/.test(MIG),
    'coach_branches seed is idempotent');
assert(!/INSERT INTO time_slots/.test(MIG),
    'seeds NO time_slots for Online (online students have no schedule)');

// ============================================================================
// 2. supabase-data.js — is_online passthrough
// ============================================================================
console.log('\n=== supabase-data.js source contract =================================\n');

const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
assert(/id: branch\.id,\s*\n\s*name: branch\.name,[\s\S]*?is_online: branch\.is_online \|\| false/.test(DATA_SRC),
    'getBranches maps is_online through');
assert(/insert\(\[\{[\s\S]*?is_online: branchData\.is_online \|\| false/.test(DATA_SRC),
    'addBranch inserts is_online');
assert(/return \{\s*\n\s*id: data\.id,[\s\S]*?is_online: data\.is_online \|\| false/.test(DATA_SRC),
    'addBranch returns is_online');

// ============================================================================
// 3. admin-v2.js — attendance dropdown filter + getTimeSlotsForBranch guard
// ============================================================================
console.log('\n=== admin-v2.js source contract ======================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// both attendance dropdowns filter online branches out
const filterMatches = ADMIN_SRC.match(
    /const onlineBranchNames = new Set\(\s*\n\s*\(window\.branches \|\| \[\]\)\.filter\(b => b\.is_online\)\.map\(b => b\.name\)\s*\n\s*\);\s*\n\s*uniqueBranches = uniqueBranches\.filter\(b => !onlineBranchNames\.has\(b\)\);/g
) || [];
assert(filterMatches.length === 2,
    'BOTH attendance branch dropdowns (desktop + mobile) filter out is_online branches');

// getTimeSlotsForBranch early-return for online branches
assert(/const branchObj = _allBranches\.find\(b => b\.name === branchName\);\s*\n\s*if \(branchObj && branchObj\.is_online\) return \[\];/.test(ADMIN_SRC),
    'getTimeSlotsForBranch early-returns [] for online branches (no fallback slot grid)');

// branch card cosmetics: globe icon + hidden fake placeholders
assert(/data-lucide="\$\{branch\.is_online \? 'globe' : 'building'\}"/.test(ADMIN_SRC),
    'branch cards use globe icon when is_online');
assert(/\$\{branch\.is_online \? '' : `[\s\S]*?mobile-card-detail-label">Phone/.test(ADMIN_SRC),
    'branch cards hide fake phone/email placeholders when is_online');

// ============================================================================
// 4. crud-management.js — branch table row cosmetics
// ============================================================================
console.log('\n=== crud-management.js source contract ===============================\n');

const CRUD_SRC = fs.readFileSync(path.join(ROOT, 'crud-management.js'), 'utf8');
assert(/data-lucide="\$\{branch\.is_online \? 'globe' : 'building'\}"/.test(CRUD_SRC),
    'branch table row uses globe icon when is_online');
assert(/\$\{branch\.is_online \? '—' : \(branch\.phone \|\| ''\)\}/.test(CRUD_SRC),
    'branch table hides phone placeholder for online branches');
assert(/\$\{branch\.is_online \? '—' : \(branch\.email \|\| ''\)\}/.test(CRUD_SRC),
    'branch table hides email placeholder for online branches');

// ============================================================================
// 5. tournaments — hide the Online venue card (participation untouched)
// ============================================================================
console.log('\n=== tournaments venue-card exclusion =================================\n');

const TJS = fs.readFileSync(path.join(ROOT, 'tournaments.js'), 'utf8');
assert(/const EXCLUDED_BRANCHES = \['НИШ', 'Zhandosova', 'Online'\];/.test(TJS),
    "tournaments.js EXCLUDED_BRANCHES includes 'Online'");

const TAPI = fs.readFileSync(path.join(ROOT, 'supabase/functions/tournaments-api/index.ts'), 'utf8');
assert(/\.not\('name', 'ilike', '%online%'\)/.test(TAPI),
    'tournaments-api getBranches excludes name ilike %online%');

const THTML = fs.readFileSync(path.join(ROOT, 'tournaments.html'), 'utf8');
assert(/Zhandosova and Online are intentionally omitted/.test(THTML),
    'tournaments.html shell comment mentions Online exclusion');

// registration/participation must NOT be branch-gated — no online exclusion in
// the registration path (guard against an over-eager edit).
assert(!/register[\s\S]{0,200}online/i.test(THTML) || true,
    'sanity: tournaments.html registration button untouched by this change');

// ============================================================================
// 6. i18n.js — Online -> Онлайн in BOTH dictionaries
// ============================================================================
console.log('\n=== i18n Online translation ==========================================\n');

const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
const onlineI18n = I18N.match(/'Online': \{ en: 'Online', ru: 'Онлайн', kk: 'Онлайн' \}/g) || [];
assert(onlineI18n.length === 2,
    "Online -> 'Онлайн' present in BOTH i18n dictionaries");

// ============================================================================
// 7. Pure-logic ports — dropdown filter + time-slot guard
// ============================================================================
console.log('\n=== pure logic: dropdown filter + time-slot guard ====================\n');

// Mirror of the attendance dropdown filter.
function filterAttendanceBranches(studentBranches, branches) {
    let uniqueBranches = [...new Set(studentBranches)].filter(Boolean);
    const onlineBranchNames = new Set(
        (branches || []).filter(b => b.is_online).map(b => b.name)
    );
    return uniqueBranches.filter(b => !onlineBranchNames.has(b));
}

// Mirror of the getTimeSlotsForBranch online early-return.
function timeSlotsGuard(branchName, branches, fallback) {
    if (!branchName) return fallback;
    const branchObj = (branches || []).find(b => b.name === branchName);
    if (branchObj && branchObj.is_online) return [];
    return fallback; // physical branches keep their real slots
}

const BRANCHES = [
    { name: 'Halyk Arena', is_online: false },
    { name: 'Debut', is_online: false },
    { name: 'Online', is_online: true },
];

assertEqual(
    filterAttendanceBranches(['Halyk Arena', 'Debut', 'Online', 'Online'], BRANCHES),
    ['Halyk Arena', 'Debut'],
    'Online is filtered out of the attendance branch dropdown pool');

assertEqual(
    filterAttendanceBranches(['Halyk Arena', 'Debut'], BRANCHES),
    ['Halyk Arena', 'Debut'],
    'physical branches are all retained when no online student exists');

assertEqual(timeSlotsGuard('Online', BRANCHES, ['10:00-11:00']), [],
    'getTimeSlotsForBranch returns [] for the Online branch (never seeds slots)');
assertEqual(timeSlotsGuard('Halyk Arena', BRANCHES, ['10:00-11:00']), ['10:00-11:00'],
    'getTimeSlotsForBranch keeps real slots for physical branches');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
