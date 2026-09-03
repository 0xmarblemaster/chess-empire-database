/**
 * Tests for the tombstoned-logical-slot skip fix in the attendance calendar
 * membership build (admin-v2.js loadAttendanceData). See
 * RALPH_TASK_tombstone-fallback-fix.md.
 *
 * The bug: when an assignment row's logical_slot_id resolves to NO live slot
 * (the logical slot is tombstoned this era), getSlotPositionForLogicalId returns
 * null and the code silently fell back to the raw positional a.timeSlotIndex.
 * After a restructure renumbers slots, that stale index re-homes the student
 * into an UNRELATED slot — and because the delete targets the DISPLAYED slot's
 * logical id, the stale row is unreachable, so the student reappears on every
 * refresh (undeletable loop). The fix skips the row entirely instead.
 *
 * Layered like test-slot-stable-id.js:
 *   1. Source-contract regex checks (catches accidental drift back to fallback).
 *   2. A faithful JS port of the assignment-map decision logic exercised across
 *      the four cases the task enumerates.
 *
 * Run: node tests/test-attendance-tombstoned-slot-skip.js
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

function fnBody(src, name) {
    const s = src.indexOf(`function ${name}(`);
    const asyncS = src.indexOf(`async function ${name}(`);
    const start = asyncS >= 0 ? asyncS : s;
    if (start < 0) return '';
    let depth = 0;
    const begin = src.indexOf('{', start);
    for (let i = begin; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(begin, i + 1); }
    }
    return '';
}

// ============================================================================
// 1. admin-v2.js — source contract: the assignment-map loop skips (continue)
//    a set-but-unresolvable logical id; it does NOT fall back to positional.
// ============================================================================
console.log('\n=== admin-v2.js source contract: tombstone skip ======================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const loadAttBody = fnBody(ADMIN_SRC, 'loadAttendanceData');

assert(loadAttBody.length > 0, 'loadAttendanceData body located');
assert(/if\s*\(a\.logicalSlotId && attendanceCurrentCoachName\)/.test(loadAttBody),
    'logical resolution is still gated on a logicalSlotId + a specific coach');
assert(/let slotIdx = a\.timeSlotIndex;/.test(loadAttBody),
    'still defaults to the stored positional index for legacy / all-coaches rows');
assert(/if\s*\(pos === null\)\s*continue;/.test(loadAttBody),
    'tombstoned logical id (pos === null) skips the row via continue');
assert(!/if\s*\(pos !== null\)\s*slotIdx = pos;/.test(loadAttBody),
    'the old positional fallback (if pos !== null slotIdx = pos) is gone');
assert(/if\s*\(pos === null\)\s*continue;\s*\n\s*slotIdx = pos;/.test(loadAttBody),
    'on resolution success it assigns the resolved position (slotIdx = pos)');

// getSlotPositionForLogicalId's own doc no longer promises a positional fallback
const resolverBody = ADMIN_SRC.slice(
    ADMIN_SRC.indexOf('// Reverse of getLogicalSlotIdForPosition'),
    ADMIN_SRC.indexOf('window.getSlotPositionForLogicalId'));
assert(/must then SKIP the assignment row/.test(resolverBody),
    'resolver doc directs callers to SKIP (not positional-fall-back) on null');

// ============================================================================
// 2. JS port of the assignment-map decision logic (the four required cases).
//    Faithful to the loop:
//        let slotIdx = a.timeSlotIndex;
//        if (a.logicalSlotId && coachName) {
//            const pos = resolve(a.logicalSlotId);
//            if (pos === null) continue;   // skip tombstoned
//            slotIdx = pos;
//        }
//        map[a.studentId].add(slotIdx);
// ============================================================================
console.log('\n=== assignment-map decision logic ====================================\n');

// resolver mimics getSlotPositionForLogicalId: a lookup table, null when absent.
function buildAssignmentMap(savedAssignments, coachName, livePositionByLogicalId) {
    const map = new Map();
    for (const a of savedAssignments) {
        let slotIdx = a.timeSlotIndex;
        if (a.logicalSlotId && coachName) {
            const pos = Object.prototype.hasOwnProperty.call(livePositionByLogicalId, a.logicalSlotId)
                ? livePositionByLogicalId[a.logicalSlotId]
                : null;
            if (pos === null) continue;   // tombstoned -> skip the row entirely
            slotIdx = pos;
        }
        if (!map.has(a.studentId)) map.set(a.studentId, new Set());
        map.get(a.studentId).add(slotIdx);
    }
    // Normalize to plain object of sorted arrays for easy assertions.
    const out = {};
    for (const [id, set] of map) out[id] = Array.from(set).sort((x, y) => x - y);
    return out;
}

// Case A: logicalSlotId set + resolves -> uses the RESOLVED position, not the
// stale stored index. Student 'S' stored index 2 but L2 now renders at pos 0.
{
    const map = buildAssignmentMap(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L2' }],
        'Coach C',
        { L2: 0 }
    );
    assertEqual(map, { S: [0] },
        'A) logical id resolves -> student placed at the resolved position (0), not stale index (2)');
}

// Case B: logicalSlotId set + does NOT resolve (tombstoned) -> row skipped.
// The stale index (2) must NOT be used; the student gets no slot from this row.
{
    const map = buildAssignmentMap(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L_DEAD' }],
        'Coach C',
        { L2: 0 }   // L_DEAD absent -> resolver returns null
    );
    assertEqual(map, {},
        'B) tombstoned logical id -> row skipped, student NOT added at the stale positional index');
}

// Case B2: a student with one live row and one tombstoned row keeps ONLY the
// live placement (the dead row does not leak the student into a wrong slot).
{
    const map = buildAssignmentMap(
        [
            { studentId: 'S', timeSlotIndex: 3, logicalSlotId: 'L_LIVE' },
            { studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L_DEAD' },
        ],
        'Coach C',
        { L_LIVE: 1 }
    );
    assertEqual(map, { S: [1] },
        'B2) live row resolves to pos 1; the tombstoned sibling row is dropped');
}

// Case C: logicalSlotId null (legacy row) -> positional index used unchanged.
{
    const map = buildAssignmentMap(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: null }],
        'Coach C',
        { L2: 0 }
    );
    assertEqual(map, { S: [2] },
        'C) legacy row (no logical id) -> stored positional index (2) used, unchanged');
}

// Case D: all-coaches mode (coachName falsy) -> positional index used even when
// a logical id is present (calendar uses fallback slot arrays there).
{
    const map = buildAssignmentMap(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L_DEAD' }],
        '',            // no coach selected
        { L2: 0 }
    );
    assertEqual(map, { S: [2] },
        'D) all-coaches mode -> positional index (2) used, resolver never consulted (unchanged pre-fix behavior)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
