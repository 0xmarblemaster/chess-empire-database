/**
 * Tests for making students on TOMBSTONED logical slots deletable without
 * moving them, in the attendance calendar (admin-v2.js). See
 * RALPH_TASK_tombstone-delete-anywhere.md. This SUPERSEDES the skip approach in
 * commit cb63d57 (and its test test-attendance-tombstoned-slot-skip.js).
 *
 * The rejected cb63d57 behavior: when an assignment row's logical_slot_id
 * resolved to NO live slot (tombstoned this era), the membership build SKIPPED
 * the row (continue), removing the student from the calendar entirely.
 *
 * Required behavior instead:
 *   1. Rendering: restore the positional fallback — a tombstoned row still
 *      renders at its stored a.timeSlotIndex (zero visual change).
 *   2. The build records, per displayed slot, every contributing chain
 *      { logicalSlotId, physicalIndex } in a module map _assignmentChainsBySlot,
 *      cleared at the start of every build.
 *   3. Delete hides EACH recorded chain by its own logicalSlotId + physicalIndex
 *      (so an orphan/tombstoned chain is reachable). No recorded chains -> fall
 *      back to displayed-position resolution.
 *
 * Layered like test-slot-stable-id.js:
 *   1. Source-contract regex checks (guards against drift back to the skip and
 *      confirms the delete path consults the chain map).
 *   2. Faithful JS ports of the build (render placement + chain recording) and
 *      of the delete decision, exercised across the required cases.
 *
 * Run: node tests/test-attendance-tombstoned-slot-delete.js
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
// 1. admin-v2.js — source contract.
// ============================================================================
console.log('\n=== admin-v2.js source contract: tombstone delete ====================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const loadAttBody = fnBody(ADMIN_SRC, 'loadAttendanceData');
const deleteBody = fnBody(ADMIN_SRC, 'deleteStudentFromCalendar');

assert(loadAttBody.length > 0, 'loadAttendanceData body located');
assert(deleteBody.length > 0, 'deleteStudentFromCalendar body located');

// -- build: positional fallback restored, no tombstone skip --------------
assert(/if\s*\(a\.logicalSlotId && attendanceCurrentCoachName\)/.test(loadAttBody),
    'logical resolution is still gated on a logicalSlotId + a specific coach');
assert(/let slotIdx = a\.timeSlotIndex;/.test(loadAttBody),
    'still defaults to the stored positional index');
assert(/if\s*\(pos !== null\)\s*slotIdx = pos;/.test(loadAttBody),
    'positional fallback restored: on resolution success it uses pos, else keeps a.timeSlotIndex');
assert(!/if\s*\(pos === null\)\s*continue;/.test(loadAttBody),
    'the cb63d57 tombstone skip (if pos === null continue) is GONE');

// -- build: records contributing chains ----------------------------------
assert(/_assignmentChainsBySlot\s*=\s*\{\}/.test(loadAttBody),
    'build clears _assignmentChainsBySlot at the start of every run');
assert(/_assignmentChainsBySlot\[chainKey\]\.push\(\{[\s\S]*logicalSlotId: a\.logicalSlotId \|\| null[\s\S]*physicalIndex: a\.timeSlotIndex[\s\S]*\}\)/.test(loadAttBody),
    'build records { logicalSlotId, physicalIndex } per chain (null logical id for legacy rows)');
assert(/const chainKey = `\$\{a\.studentId\}:\$\{slotIdx\}`;/.test(loadAttBody),
    'chain map keyed by `${studentId}:${slotIdx}` (displayed slot index)');

// -- module-level declaration --------------------------------------------
assert(/let _assignmentChainsBySlot = \{\};/.test(ADMIN_SRC),
    '_assignmentChainsBySlot declared at module scope');

// -- delete: consults the chain map, hides each chain, has fallback -------
assert(/_assignmentChainsBySlot\[`\$\{studentId\}:\$\{slotIndex\}`\]/.test(deleteBody),
    'delete looks up recorded chains by `${studentId}:${slotIndex}`');
assert(/for \(const chain of recordedChains\)/.test(deleteBody),
    'delete iterates each recorded chain');
assert(/p_logical_slot_id: chain\.logicalSlotId/.test(deleteBody),
    'delete passes the chain\'s own logicalSlotId to the RPC');
assert(/p_time_slot_index: chain\.physicalIndex !== null \? chain\.physicalIndex : slotIndex/.test(deleteBody),
    'delete passes the chain\'s own physicalIndex to the RPC');
assert(/getLogicalSlotIdForPosition\(/.test(deleteBody) && /getSlotIndexForPosition\(/.test(deleteBody),
    'delete keeps the displayed-position resolution as a safety fallback');

// resolver doc no longer promises a skip
const resolverBody = ADMIN_SRC.slice(
    ADMIN_SRC.indexOf('// Reverse of getLogicalSlotIdForPosition'),
    ADMIN_SRC.indexOf('window.getSlotPositionForLogicalId'));
assert(!/must then SKIP the assignment row/.test(resolverBody),
    'resolver doc no longer directs callers to SKIP on null');
assert(/falls back to the stored positional index/.test(resolverBody),
    'resolver doc now describes the positional fallback');

// ============================================================================
// 2. Faithful port of the build: render placement + chain recording.
//    Mirrors the loop:
//        _assignmentChainsBySlot = {};
//        for (const a of savedAssignments) {
//            let slotIdx = a.timeSlotIndex;
//            if (a.logicalSlotId && coachName) {
//                const pos = resolve(a.logicalSlotId);
//                if (pos !== null) slotIdx = pos;      // else positional fallback
//            }
//            map[a.studentId].add(slotIdx);
//            chainKey = `${a.studentId}:${slotIdx}`;
//            chains[chainKey].push({ logicalSlotId: a.logicalSlotId||null, physicalIndex: a.timeSlotIndex });
//        }
// ============================================================================
console.log('\n=== build: render placement + chain recording ========================\n');

function buildAttendance(savedAssignments, coachName, livePositionByLogicalId) {
    const map = new Map();
    const chains = {};   // fresh every build (mirrors _assignmentChainsBySlot = {})
    for (const a of savedAssignments) {
        let slotIdx = a.timeSlotIndex;
        if (a.logicalSlotId && coachName) {
            const pos = Object.prototype.hasOwnProperty.call(livePositionByLogicalId, a.logicalSlotId)
                ? livePositionByLogicalId[a.logicalSlotId]
                : null;
            if (pos !== null) slotIdx = pos;   // else keep positional fallback
        }
        if (!map.has(a.studentId)) map.set(a.studentId, new Set());
        map.get(a.studentId).add(slotIdx);

        const chainKey = `${a.studentId}:${slotIdx}`;
        if (!chains[chainKey]) chains[chainKey] = [];
        chains[chainKey].push({
            logicalSlotId: a.logicalSlotId || null,
            physicalIndex: a.timeSlotIndex
        });
    }
    const membership = {};
    for (const [id, set] of map) membership[id] = Array.from(set).sort((x, y) => x - y);
    return { membership, chains };
}

// Case A: logicalSlotId set + resolves -> uses the RESOLVED position; chain
// records the row's own logical id + stored physical index.
{
    const { membership, chains } = buildAttendance(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L2' }],
        'Coach C',
        { L2: 0 }
    );
    assertEqual(membership, { S: [0] },
        'A) live-resolving row placed at resolved position (0), not stale index (2)');
    assertEqual(chains['S:0'], [{ logicalSlotId: 'L2', physicalIndex: 2 }],
        'A) chain map records { L2, physicalIndex: 2 } at displayed slot 0');
}

// Case B: logicalSlotId set + does NOT resolve (tombstoned) -> row STILL
// renders at its positional index (NOT skipped); chain records the orphan.
{
    const { membership, chains } = buildAttendance(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L_DEAD' }],
        'Coach C',
        { L2: 0 }   // L_DEAD absent -> resolver returns null
    );
    assertEqual(membership, { S: [2] },
        'B) tombstoned row renders at its positional index (2) — NOT skipped (supersedes cb63d57)');
    assertEqual(chains['S:2'], [{ logicalSlotId: 'L_DEAD', physicalIndex: 2 }],
        'B) chain map records the orphan chain { L_DEAD, physicalIndex: 2 } for delete to reach');
}

// Case C: legacy row (no logical id) -> positional index, chain records null id.
{
    const { membership, chains } = buildAttendance(
        [{ studentId: 'S', timeSlotIndex: 2, logicalSlotId: null }],
        'Coach C',
        { L2: 0 }
    );
    assertEqual(membership, { S: [2] },
        'C) legacy row placed at its stored positional index (2)');
    assertEqual(chains['S:2'], [{ logicalSlotId: null, physicalIndex: 2 }],
        'C) chain map records { logicalSlotId: null, physicalIndex: 2 } for the legacy row');
}

// Case D: two rows land the same student in the same displayed slot (a live one
// resolving to pos 2 and a tombstoned one whose positional index is also 2):
// BOTH chains recorded so delete hides both.
{
    const { membership, chains } = buildAttendance(
        [
            { studentId: 'S', timeSlotIndex: 5, logicalSlotId: 'L_LIVE' }, // resolves to 2
            { studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L_DEAD' }, // tombstoned -> pos 2
        ],
        'Coach C',
        { L_LIVE: 2 }
    );
    assertEqual(membership, { S: [2] },
        'D) student appears once at displayed slot 2 (Set dedups the index)');
    assertEqual(chains['S:2'], [
        { logicalSlotId: 'L_LIVE', physicalIndex: 5 },
        { logicalSlotId: 'L_DEAD', physicalIndex: 2 },
    ], 'D) both contributing chains recorded at displayed slot 2');
}

// ============================================================================
// 3. Faithful port of the delete decision: which RPC args get sent.
//    Mirrors deleteStudentFromCalendar:
//        const recorded = chains[`${studentId}:${slotIndex}`];
//        if (recorded?.length) recorded.forEach(c => rpc(c.logicalSlotId, c.physicalIndex ?? slotIndex));
//        else rpc(getLogicalSlotIdForPosition(slotIndex), getSlotIndexForPosition(slotIndex) ?? slotIndex);
// ============================================================================
console.log('\n=== delete: which chains get hidden ==================================\n');

function planDeleteRpcs(chains, studentId, slotIndex, displayed) {
    const recorded = chains[`${studentId}:${slotIndex}`];
    const calls = [];
    if (Array.isArray(recorded) && recorded.length > 0) {
        for (const c of recorded) {
            calls.push({
                p_logical_slot_id: c.logicalSlotId,
                p_time_slot_index: c.physicalIndex !== null ? c.physicalIndex : slotIndex
            });
        }
    } else {
        // Safety fallback: resolve from the displayed position.
        const hideLogicalId = displayed.logicalId;       // getLogicalSlotIdForPosition(slotIndex)
        const hidePhysicalIndex = displayed.physicalIndex; // getSlotIndexForPosition(slotIndex)
        calls.push({
            p_logical_slot_id: hideLogicalId,
            p_time_slot_index: hidePhysicalIndex !== null ? hidePhysicalIndex : slotIndex
        });
    }
    return calls;
}

// Delete case 1: orphan (tombstoned) chain recorded at displayed slot 2. The
// displayed position resolves to a DIFFERENT (live) logical id — the bug that
// made the student undeletable. The RPC must target the ORPHAN's own id+index.
{
    const chains = { 'S:2': [{ logicalSlotId: 'L_DEAD', physicalIndex: 2 }] };
    const calls = planDeleteRpcs(chains, 'S', 2, { logicalId: 'L_LIVE_AT_POS_2', physicalIndex: 9 });
    assertEqual(calls, [{ p_logical_slot_id: 'L_DEAD', p_time_slot_index: 2 }],
        'delete-1) orphan chain hidden by its OWN logical id (L_DEAD) + physical index (2), NOT the displayed slot\'s (L_LIVE_AT_POS_2/9)');
}

// Delete case 2: multiple recorded chains -> one RPC per chain, each with its
// own logical id + physical index.
{
    const chains = { 'S:2': [
        { logicalSlotId: 'L_LIVE', physicalIndex: 5 },
        { logicalSlotId: 'L_DEAD', physicalIndex: 2 },
    ] };
    const calls = planDeleteRpcs(chains, 'S', 2, { logicalId: 'L_LIVE', physicalIndex: 5 });
    assertEqual(calls, [
        { p_logical_slot_id: 'L_LIVE', p_time_slot_index: 5 },
        { p_logical_slot_id: 'L_DEAD', p_time_slot_index: 2 },
    ], 'delete-2) each recorded chain produces its own RPC with its own args');
}

// Delete case 3: legacy chain (null logical id) -> RPC uses null id + positional.
{
    const chains = { 'S:2': [{ logicalSlotId: null, physicalIndex: 2 }] };
    const calls = planDeleteRpcs(chains, 'S', 2, { logicalId: 'IGNORED', physicalIndex: 7 });
    assertEqual(calls, [{ p_logical_slot_id: null, p_time_slot_index: 2 }],
        'delete-3) legacy chain hidden with null logical id + its positional index');
}

// Delete case 4: NO recorded chain -> safety fallback to displayed-position
// resolution (unchanged pre-fix behavior).
{
    const chains = {};   // e.g. all-coaches mode never populated the map
    const calls = planDeleteRpcs(chains, 'S', 2, { logicalId: 'L_DISPLAYED', physicalIndex: 4 });
    assertEqual(calls, [{ p_logical_slot_id: 'L_DISPLAYED', p_time_slot_index: 4 }],
        'delete-4) no recorded chains -> displayed-position resolution (L_DISPLAYED/4)');
}

// Delete case 5: fallback where displayed-position physical index is null ->
// RPC falls back to the raw slotIndex.
{
    const chains = {};
    const calls = planDeleteRpcs(chains, 'S', 3, { logicalId: null, physicalIndex: null });
    assertEqual(calls, [{ p_logical_slot_id: null, p_time_slot_index: 3 }],
        'delete-5) fallback with null physical index -> RPC uses the displayed slotIndex (3)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
