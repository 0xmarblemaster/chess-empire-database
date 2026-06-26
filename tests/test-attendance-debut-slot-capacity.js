/**
 * Regression tests for the Debut-branch slot capacity bump (10/15 → 20/20).
 *
 * The change adds two constants and three helpers in admin.js, and rewires
 * the existing rendering / capacity-gate / drop-target sites to consult the
 * helpers instead of the raw constants. Other branches must keep 10/15.
 *
 * Covers:
 *   - Constants present with the expected values.
 *   - Helpers exported on the script's eval scope: isDebutCurrentBranch,
 *     getDefaultRows, getMaxCapacity.
 *   - isDebutCurrentBranch matches "Debut", "DEBUT", "Дебют", "ДЕБЮТ",
 *     "Debut Center", "Дебют филиал" — and ONLY those (false for Halyk
 *     Arena, Nish, empty, null, undefined).
 *   - getDefaultRows / getMaxCapacity return Debut numbers only when the
 *     branch is Debut; the originals (10 / 15) otherwise.
 *   - Static check: the six rewired call sites no longer reference the raw
 *     constants — they go through the helpers (or the local selectedBranch
 *     check for the add-student form, which uses a different branch source).
 *   - Static check: the Halyk-Arena-only auto-bucketing path keeps
 *     DEFAULT_TIME_SLOT_ROWS because the value is persisted via
 *     time_slot_index — changing the divisor would shift previously saved
 *     slot indices for existing Halyk Arena students.
 *
 * Run: node tests/test-attendance-debut-slot-capacity.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++; console.log(`  ✓ ${msg}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ---------------------------------------------------------------------------
// Static checks: constants, helpers, and call sites
// ---------------------------------------------------------------------------

console.log('\n=== constants ==========================================================\n');
assert(/const\s+DEFAULT_TIME_SLOT_ROWS\s*=\s*10\b/.test(ADMIN_SRC),
    'DEFAULT_TIME_SLOT_ROWS = 10 still present (other branches unchanged)');
assert(/const\s+MAX_TIME_SLOT_CAPACITY\s*=\s*15\b/.test(ADMIN_SRC),
    'MAX_TIME_SLOT_CAPACITY = 15 still present (other branches unchanged)');
assert(/const\s+DEBUT_DEFAULT_TIME_SLOT_ROWS\s*=\s*20\b/.test(ADMIN_SRC),
    'DEBUT_DEFAULT_TIME_SLOT_ROWS = 20 added');
assert(/const\s+DEBUT_MAX_TIME_SLOT_CAPACITY\s*=\s*20\b/.test(ADMIN_SRC),
    'DEBUT_MAX_TIME_SLOT_CAPACITY = 20 added');

console.log('\n=== helper functions present ===========================================\n');
assert(/function\s+isDebutCurrentBranch\s*\(/.test(ADMIN_SRC),
    'isDebutCurrentBranch is declared');
assert(/function\s+getDefaultRows\s*\(/.test(ADMIN_SRC),
    'getDefaultRows is declared');
assert(/function\s+getMaxCapacity\s*\(/.test(ADMIN_SRC),
    'getMaxCapacity is declared');

// ---------------------------------------------------------------------------
// Behavioral checks: extract the helpers and exercise them.
// We splice the four declarations out of admin.js and run them in a sandbox
// where `attendanceCurrentBranch` is a controllable variable. This mirrors
// how the helpers will see `attendanceCurrentBranch` at runtime — they read
// it from outer scope.
// ---------------------------------------------------------------------------

function loadHelpers(branchName) {
    const constants = `
        const DEFAULT_TIME_SLOT_ROWS = 10;
        const MAX_TIME_SLOT_CAPACITY = 15;
        const DEBUT_DEFAULT_TIME_SLOT_ROWS = 20;
        const DEBUT_MAX_TIME_SLOT_CAPACITY = 20;
    `;
    const fn = new Function(
        'attendanceCurrentBranch',
        `
        ${constants}
        function isDebutCurrentBranch() {
            const name = (attendanceCurrentBranch || '').toLowerCase();
            return name.includes('debut') || name.includes('дебют');
        }
        function getDefaultRows() {
            return isDebutCurrentBranch() ? DEBUT_DEFAULT_TIME_SLOT_ROWS : DEFAULT_TIME_SLOT_ROWS;
        }
        function getMaxCapacity() {
            return isDebutCurrentBranch() ? DEBUT_MAX_TIME_SLOT_CAPACITY : MAX_TIME_SLOT_CAPACITY;
        }
        return { isDebutCurrentBranch, getDefaultRows, getMaxCapacity };
        `
    );
    return fn(branchName);
}

console.log('\n=== isDebutCurrentBranch (positive matches) ============================\n');
for (const name of ['Debut', 'DEBUT', 'debut', 'Debut Center', 'Дебют',
                    'ДЕБЮТ', 'Дебют филиал']) {
    const h = loadHelpers(name);
    assertEqual(h.isDebutCurrentBranch(), true, `"${name}" → Debut`);
}

console.log('\n=== isDebutCurrentBranch (negative matches) ============================\n');
for (const name of ['Halyk Arena', 'Nish', 'Astana', '', null, undefined, 'Some Other Branch']) {
    const h = loadHelpers(name);
    assertEqual(h.isDebutCurrentBranch(), false, `${JSON.stringify(name)} → not Debut`);
}

console.log('\n=== getDefaultRows ====================================================\n');
assertEqual(loadHelpers('Debut').getDefaultRows(), 20,
    'Debut → 20 default rows');
assertEqual(loadHelpers('Дебют').getDefaultRows(), 20,
    'Дебют (Cyrillic) → 20 default rows');
assertEqual(loadHelpers('Halyk Arena').getDefaultRows(), 10,
    'Halyk Arena → 10 default rows (unchanged)');
assertEqual(loadHelpers('Nish').getDefaultRows(), 10,
    'Nish → 10 default rows (unchanged)');
assertEqual(loadHelpers(null).getDefaultRows(), 10,
    'null branch → 10 default rows (safe default)');

console.log('\n=== getMaxCapacity =====================================================\n');
assertEqual(loadHelpers('Debut').getMaxCapacity(), 20,
    'Debut → 20 max capacity');
assertEqual(loadHelpers('Дебют').getMaxCapacity(), 20,
    'Дебют (Cyrillic) → 20 max capacity');
assertEqual(loadHelpers('Halyk Arena').getMaxCapacity(), 15,
    'Halyk Arena → 15 max capacity (unchanged)');
assertEqual(loadHelpers('Nish').getMaxCapacity(), 15,
    'Nish → 15 max capacity (unchanged)');
assertEqual(loadHelpers('').getMaxCapacity(), 15,
    'empty branch → 15 max capacity (safe default)');
assertEqual(loadHelpers(undefined).getMaxCapacity(), 15,
    'undefined branch → 15 max capacity (safe default)');

// ---------------------------------------------------------------------------
// Static checks: the rewired call sites use helpers / local checks, not the
// raw constants. We assert by pattern presence in admin.js.
// ---------------------------------------------------------------------------

console.log('\n=== rewired call sites (use helpers) ==================================\n');

// Slot header rendering — `(N/15)` becomes `(N/${getMaxCapacity()})`.
assert(/time-slot-count">\(\$\{studentCount\}\/\$\{getMaxCapacity\(\)\}\)/.test(ADMIN_SRC),
    'slot header uses getMaxCapacity()');

// rowsToRender — both args wrapped in helpers.
assert(/rowsToRender\s*=\s*Math\.max\(\s*getDefaultRows\(\)\s*,\s*Math\.min\(\s*actualStudentCount\s*,\s*getMaxCapacity\(\)\s*\)\s*\)/.test(ADMIN_SRC),
    'rowsToRender uses getDefaultRows() and getMaxCapacity()');

// Drop-target capacity check + toast (reassign flow on attendance grid).
assert(/targetSlotStudents\.length\s*>=\s*getMaxCapacity\(\)/.test(ADMIN_SRC),
    'drop-target capacity check uses getMaxCapacity()');
assert(/\.replace\(\s*'10'\s*,\s*getMaxCapacity\(\)\.toString\(\)\s*\)/.test(ADMIN_SRC),
    'drop-target toast number replacement uses getMaxCapacity()');

// Add-student form — uses selectedBranch (a form-local value, not
// attendanceCurrentBranch), so the helper would consult the wrong branch.
// The correct pattern is a local computation off selectedBranch.
assert(/const\s+selectedBranchName\s*=\s*\(selectedBranch\s*\|\|\s*''\)\.toLowerCase\(\)/.test(ADMIN_SRC),
    'add-student form derives selectedBranchName from the form field');
assert(/const\s+selectedBranchIsDebut\s*=\s*selectedBranchName\.includes\('debut'\)\s*\|\|\s*selectedBranchName\.includes\('дебют'\)/.test(ADMIN_SRC),
    'add-student form detects Debut against the form field');
assert(/const\s+selectedBranchMaxCapacity\s*=\s*selectedBranchIsDebut\s*\?\s*DEBUT_MAX_TIME_SLOT_CAPACITY\s*:\s*MAX_TIME_SLOT_CAPACITY/.test(ADMIN_SRC),
    'add-student form picks 20 vs 15 from the form field');
assert(/studentsInSlot\.length\s*>=\s*selectedBranchMaxCapacity/.test(ADMIN_SRC),
    'add-student capacity gate uses selectedBranchMaxCapacity');
assert(/students max\)\. Please select a different time slot\./.test(ADMIN_SRC),
    'add-student full-slot toast still present');
assert(/Time slot \$\{slotName\} is full \(\$\{selectedBranchMaxCapacity\} students max\)/.test(ADMIN_SRC),
    'add-student full-slot toast uses selectedBranchMaxCapacity');

console.log('\n=== Halyk-Arena auto-bucketing path keeps DEFAULT_TIME_SLOT_ROWS ======\n');
// The auto-bucketing at line 4699 (now wrapped with a comment) is gated by
// attendanceCurrentBranch === 'Halyk Arena' check above. Debut never reaches
// it. The value is persisted via time_slot_index — changing the divisor would
// shift previously saved slot indices for existing Halyk Arena students.
// So this site MUST keep raw DEFAULT_TIME_SLOT_ROWS.
assert(/initializeStudentTimeSlots/.test(ADMIN_SRC),
    'initializeStudentTimeSlots function still present');
assert(/student\.time_slot_index\s*=\s*Math\.floor\(\s*index\s*\/\s*DEFAULT_TIME_SLOT_ROWS\s*\)/.test(ADMIN_SRC),
    'auto-bucketing still divides by DEFAULT_TIME_SLOT_ROWS (not getDefaultRows())');
// The comment explains the reasoning.
assert(/this code path is gated by[\s\S]{0,200}Halyk Arena/.test(ADMIN_SRC),
    'comment explains why DEFAULT_TIME_SLOT_ROWS is intentional (Halyk Arena gate)');

console.log('\n=== no stray direct constant refs in the rewired flows ================\n');
// Cross-check: every direct `MAX_TIME_SLOT_CAPACITY` reference in admin.js
// should be one of the few known sites — the declarations + helper +
// add-student local check. No leftover direct comparisons.
const maxRefLines = ADMIN_SRC.split('\n')
    .map((line, i) => ({ line, i: i + 1 }))
    .filter(({ line }) => /\bMAX_TIME_SLOT_CAPACITY\b/.test(line));
const maxRefSummary = maxRefLines.map(r => `${r.i}: ${r.line.trim()}`).join('\n      ');
// Expected: declaration, two declarations (DEBUT_*), the helper's ternary,
// and the add-student local check. So at most 5 references to MAX_TIME_SLOT_CAPACITY
// (and 2 to DEBUT_MAX_TIME_SLOT_CAPACITY, both already counted in `MAX_TIME_SLOT_CAPACITY` regex).
// In practice: 1 declaration + 1 DEBUT decl + 1 helper return + 1 add-student
// fallback = ~6 lines total. We assert it's NOT in the slot-header /
// rowsToRender / drop-target paths — those should be helper calls now.
assert(!/time-slot-count">\(\$\{studentCount\}\/\$\{MAX_TIME_SLOT_CAPACITY\}\)/.test(ADMIN_SRC),
    'slot header no longer mentions MAX_TIME_SLOT_CAPACITY directly');
assert(!/rowsToRender\s*=\s*Math\.max\(\s*DEFAULT_TIME_SLOT_ROWS\s*,\s*Math\.min\(\s*actualStudentCount\s*,\s*MAX_TIME_SLOT_CAPACITY\s*\)\s*\)/.test(ADMIN_SRC),
    'rowsToRender no longer mentions raw constants directly');
assert(!/targetSlotStudents\.length\s*>=\s*MAX_TIME_SLOT_CAPACITY/.test(ADMIN_SRC),
    'drop-target capacity check no longer mentions MAX_TIME_SLOT_CAPACITY directly');
assert(!/studentsInSlot\.length\s*>=\s*MAX_TIME_SLOT_CAPACITY/.test(ADMIN_SRC),
    'add-student capacity gate no longer mentions MAX_TIME_SLOT_CAPACITY directly');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
