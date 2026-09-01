/**
 * Tests for Coach Chingis Baurzhanovich's Gagarin Park time slots.
 *
 * Requirement: Chingis reuses the generic Gagarin slot lists but with a
 * 18:00-19:00 slot appended at the BOTTOM of both Mon-Wed and Tue-Thu, without
 * ever duplicating it (the generic Mon-Wed list already ends with 18:00-19:00).
 *
 * Run: node tests/test-attendance-gagarin-chingis-slots.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

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

/** Slice out a top-level `function name() { ... }` declaration from src. */
function extractFn(src, name) {
    const idx = src.indexOf(`function ${name}(`);
    if (idx < 0) return '';
    const open = src.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(idx, i + 1);
        }
    }
    return '';
}

// Pull every `const ATTENDANCE_TIME_SLOTS_* = [ ... ];` declaration in source
// order so the Chingis arrays (which spread the generic ones) resolve.
const SLOT_CONSTS = (ADMIN_V2_SRC.match(/const ATTENDANCE_TIME_SLOTS_[A-Z_]+\s*=\s*\[[\s\S]*?\];/g) || []).join('\n');

// TIME_SLOTS_CACHE = null forces the hard-coded fallback path we're testing.
const factory = new Function(
    'TIME_SLOTS_CACHE',
    SLOT_CONSTS + '\n' +
    extractFn(ADMIN_V2_SRC, 'getTimeSlotsForBranch') + '\n' +
    'return { getTimeSlotsForBranch, ' +
    'GEN_MON_WED: ATTENDANCE_TIME_SLOTS_GAGARIN_MON_WED, ' +
    'GEN_TUE_THU: ATTENDANCE_TIME_SLOTS_GAGARIN_TUE_THU };'
);
const { getTimeSlotsForBranch, GEN_MON_WED, GEN_TUE_THU } = factory(null);

console.log('\n=== Chingis Gagarin slots ============================================\n');

// Mon-Wed: generic list already ends in 18:00-19:00 → unchanged, one at bottom.
{
    const slots = getTimeSlotsForBranch('Gagarin Park', 'mon_wed', 'Chingis Baurzhanovich');
    assertEqual(slots, GEN_MON_WED, 'Chingis mon_wed matches generic (already ends 18:00-19:00)');
    assertEqual(slots[slots.length - 1], '18:00-19:00', 'Chingis mon_wed last slot is 18:00-19:00');
    assertEqual(slots.filter(s => s === '18:00-19:00').length, 1, 'Chingis mon_wed has no duplicate 18:00-19:00');
}

// Tue-Thu: generic ends 17:30-19:00 → 18:00-19:00 appended at bottom.
{
    const slots = getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'Chingis Baurzhanovich');
    assertEqual(slots, [...GEN_TUE_THU, '18:00-19:00'], 'Chingis tue_thu = generic + 18:00-19:00 appended');
    assertEqual(slots[slots.length - 1], '18:00-19:00', 'Chingis tue_thu last slot is 18:00-19:00');
    assertEqual(slots.length, GEN_TUE_THU.length + 1, 'Chingis tue_thu adds exactly one slot');
    assertEqual(slots.filter(s => s === '18:00-19:00').length, 1, 'Chingis tue_thu has no duplicate 18:00-19:00');
}

// Name matching: full name, first name only, and Russian spelling.
{
    assertEqual(getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'Nurgalimov Chingis'),
        [...GEN_TUE_THU, '18:00-19:00'], 'matches "Nurgalimov Chingis"');
    assertEqual(getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'chingis'),
        [...GEN_TUE_THU, '18:00-19:00'], 'matches lowercase "chingis"');
    assertEqual(getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'Чингиз Бауржанович'),
        [...GEN_TUE_THU, '18:00-19:00'], 'matches Russian "Чингиз"');
}

console.log('\n=== No regression for other Gagarin coaches ==========================\n');

// Generic Gagarin (no/other coach) unchanged.
{
    assertEqual(getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'all'), GEN_TUE_THU,
        'generic Gagarin tue_thu unchanged for non-Chingis coach');
    assertEqual(getTimeSlotsForBranch('Gagarin Park', 'mon_wed', null), GEN_MON_WED,
        'generic Gagarin mon_wed unchanged when no coach given');
}

// Vasily still gets his own hourly lists (not the Chingis ones).
{
    const vasily = getTimeSlotsForBranch('Gagarin Park', 'tue_thu', 'Vasily Mikhaylovich');
    assert(vasily[vasily.length - 1] === '17:00-18:00', 'Vasily tue_thu still ends 17:00-18:00 (unaffected)');
    assert(JSON.stringify(vasily) !== JSON.stringify([...GEN_TUE_THU, '18:00-19:00']),
        'Vasily does not get Chingis slots');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
