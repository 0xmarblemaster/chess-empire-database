/**
 * Tests for the "new time slots auto-populate with students" fix.
 * See specs/slot-empty-fix-20260903.md.
 *
 * Layered like test-slot-stable-id.js:
 *   1. Source-contract regex checks across migration 080 + admin-v2.js (catch
 *      accidental drift of the load-bearing lines).
 *   2. JS ports of the pure mapping logic exercised against in-memory data,
 *      proving the three acceptance criteria:
 *        - creating a new earlier slot leaves it empty (no auto-seed leak);
 *        - legacy NULL-logical rows resolve to the SAME slot before and after a
 *          new earlier slot is inserted (stable under reorder);
 *        - auto-seed still runs for genuine fallback-mode buckets.
 *
 * Run: node tests/test-slot-empty-fix.js
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
    const start = src.indexOf(`async function ${name}(`);
    const startSync = src.indexOf(`function ${name}(`);
    const s = start >= 0 ? start : startSync;
    if (s < 0) return '';
    let depth = 0;
    let i = src.indexOf('{', s);
    const begin = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(begin, i + 1);
        }
    }
    return '';
}

// ============================================================================
// 1. migration 080 — source contract
// ============================================================================
console.log('\n=== migration 080_backfill_halyk_slot_assignments.sql ================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/080_backfill_halyk_slot_assignments.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/080_… exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');

// PART A — positional seed
assert(/effective_from = DATE '1970-01-01'\s+AND ts\.deleted_at IS NULL/.test(MIG),
    'PART A targets only original (1970-01-01, non-deleted) slots — never a post-078 slot');
assert(/ROW_NUMBER\(\) OVER \(\s*PARTITION BY ts\.coach_id, ts\.schedule_type ORDER BY ts\.slot_index\s*\)/.test(MIG),
    'PART A ranks slots by ascending slot_index (render position 0 = lowest slot_index)');
assert(/ORDER BY s\.last_name/.test(MIG),
    'PART A ranks students by last_name (matches the app .order(\'last_name\'))');
assert(/LEAST\(FLOOR\(rs\.idx \/ 10\)::INT, os\.n_slots - 1\)/.test(MIG),
    'PART A places 10 students per slot (floor(idx/10)) clamped to the last slot');
assert(/NOT EXISTS \(\s*SELECT 1 FROM student_time_slot_assignments e[\s\S]+?e\.student_id = t\.student_id[\s\S]+?e\.schedule_type = t\.schedule_type\s*\)/.test(MIG),
    'PART A is idempotent: skips students already having a row for the (branch, schedule) bucket');
assert(/ON CONFLICT \(student_id, branch_id, schedule_type, time_slot_index, effective_from\)\s*\n?\s*DO NOTHING/.test(MIG),
    'PART A also guards with ON CONFLICT DO NOTHING on the per-slot unique key');
assert(/FROM attendance a\s+JOIN halyk h/.test(MIG),
    'PART A only seeds (student, schedule) pairs the student actually attends');
assert(/t\.logical_slot_id/.test(MIG),
    'PART A writes the chosen slot\'s logical_slot_id onto the seeded assignment');

// PART B — finish 076 logical_slot_id backfill
assert(/UPDATE student_time_slot_assignments a\s+SET logical_slot_id = ts\.logical_slot_id\s+FROM students s, time_slots ts/.test(MIG),
    'PART B backfills logical_slot_id via students + time_slots join (like migration 076)');
assert(/a\.time_slot_index = ts\.slot_index/.test(MIG),
    'PART B maps time_slot_index -> the slot whose slot_index equals it');
assert(/a\.time_slot_index >= 0\s+AND a\.logical_slot_id IS NULL/.test(MIG),
    'PART B only touches real-index rows that are still NULL (idempotent, excludes -1 hides)');
assert(/still have NULL logical_slot_id[\s\S]+?left untouched, not deleted/.test(MIG),
    'PART B logs (does not delete) rows it cannot resolve');

// ============================================================================
// 2. admin-v2.js — source contract
// ============================================================================
console.log('\n=== admin-v2.js source contract ======================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// 2a. new resolver + gate helpers exist and are exported
for (const fn of ['getSlotPositionForSlotIndex', 'isDbModeSlotBucket']) {
    assert(new RegExp(`function ${fn}\\(`).test(ADMIN_SRC), `${fn} is defined`);
    assert(new RegExp(`window\\.${fn}\\s*=\\s*${fn}`).test(ADMIN_SRC), `${fn} is exported on window`);
}
assert(fnBody(ADMIN_SRC, 'getSlotPositionForSlotIndex').includes('s.slotIndex === slotIndex'),
    'getSlotPositionForSlotIndex resolves by matching slot_index (stable identity)');
assert(fnBody(ADMIN_SRC, 'getSlotPositionForSlotIndex').includes('findIndex'),
    'getSlotPositionForSlotIndex returns the render position via findIndex');

// 2b. auto-seed is gated on DB mode
const initBody = fnBody(ADMIN_SRC, 'initializeStudentTimeSlots');
assert(/if\s*\(isDbModeSlotBucket\(attendanceCurrentBranch, attendanceCurrentSchedule,\s*\n?\s*attendanceCurrentCoachName[\s\S]*?\)\)\s*\{\s*\n?\s*return;/.test(initBody),
    'initializeStudentTimeSlots returns early for DB-mode buckets (no positional auto-seed)');
// the Halyk gate + the /10 bucketing must still be present (unchanged behavior for fallback)
assert(/attendanceCurrentBranch !== 'Halyk Arena'/.test(initBody),
    'initializeStudentTimeSlots keeps the Halyk-Arena gate');
assert(/Math\.floor\(index \/ DEFAULT_TIME_SLOT_ROWS\)/.test(initBody),
    'initializeStudentTimeSlots keeps floor(index / DEFAULT_TIME_SLOT_ROWS) fallback bucketing');

// 2c. legacy read-path resolution maps slot_index -> current render position
const loadBody = fnBody(ADMIN_SRC, 'loadAttendanceData');
assert(/else if\s*\(!a\.logicalSlotId && attendanceCurrentCoachName\)/.test(loadBody),
    'loadAttendanceData adds a legacy branch for rows with no logical id + a concrete coach');
assert(/getSlotPositionForSlotIndex\(\s*\n?\s*attendanceCurrentBranch, scheduleFilter,\s*\n?\s*attendanceCurrentCoachName, a\.timeSlotIndex/.test(loadBody),
    'legacy branch resolves a.timeSlotIndex via getSlotPositionForSlotIndex (never raw index as render position)');
// the pre-existing logical-id branch is preserved
assert(/if\s*\(a\.logicalSlotId && attendanceCurrentCoachName\)/.test(loadBody),
    'logical-id branch is preserved for rows that carry a logical_slot_id');

// 2d. stale comment updated to reflect prod reality
assert(/prod data\s*\n?\s*\/\/\s*disproved the old assumption that legacy rows only live on\s*\n?\s*\/\/\s*fallback-only schedules/.test(ADMIN_SRC),
    'the ~5711 safety comment now reflects that legacy rows DO live on DB-mode buckets');

// ============================================================================
// 3. Pure-logic ports — the three acceptance criteria
// ============================================================================
console.log('\n=== pure logic: build bucket / resolvers =============================\n');

// Mirror of loadTimeSlotsCache: latest non-deleted version per (branch, coach,
// schedule, slot_index) chain, compacted and sorted chronologically by start
// time with slot_index as tiebreaker (exactly the admin-v2 sort).
function slotStartMin(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : Number.MAX_SAFE_INTEGER;
}
function buildBucket(rows, monthEnd) {
    const sorted = rows
        .filter(r => r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => {
            if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;
            return a.effective_from < b.effective_from ? 1 : -1; // effective_from DESC
        });
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        const k = `${r.branch_id}|${r.coach_id}|${r.schedule_type}|${r.slot_index}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (r.deleted_at) continue;
        // Mirror admin-v2's fmt(): strip the leading zero on the hour.
        const fmt = (t) => { const [h, m] = t.split(':'); return `${parseInt(h, 10)}:${m}`; };
        out.push({ slotIndex: r.slot_index, logicalSlotId: r.logical_slot_id, time: `${fmt(r.start_time)}-${fmt(r.end_time)}` });
    }
    out.sort((a, b) => (slotStartMin(a.time) - slotStartMin(b.time)) || (a.slotIndex - b.slotIndex));
    return out;
}

// Mirror of getSlotPositionForSlotIndex (admin-v2.js).
function positionForSlotIndex(bucket, slotIndex) {
    if (!bucket || typeof slotIndex !== 'number' || slotIndex < 0) return null;
    const p = bucket.findIndex(s => s.slotIndex === slotIndex);
    return p >= 0 ? p : null;
}
// Mirror of getSlotPositionForLogicalId (admin-v2.js).
function positionForLogicalId(bucket, logicalSlotId) {
    if (!bucket || !logicalSlotId) return null;
    const p = bucket.findIndex(s => s.logicalSlotId === logicalSlotId);
    return p >= 0 ? p : null;
}

// Mirror of the loadAttendanceData membership build (with the new legacy branch).
function resolveMembership(bucket, assignment, coachName) {
    let slotIdx = assignment.timeSlotIndex;
    if (assignment.logicalSlotId && coachName) {
        const pos = positionForLogicalId(bucket, assignment.logicalSlotId);
        if (pos !== null) slotIdx = pos;
    } else if (!assignment.logicalSlotId && coachName) {
        const pos = positionForSlotIndex(bucket, assignment.timeSlotIndex);
        if (pos !== null) slotIdx = pos;
    }
    return slotIdx;
}

// Mirror of isDbModeSlotBucket + the initializeStudentTimeSlots gate.
function shouldPositionalAutoSeed(branchName, bucket) {
    if (branchName !== 'Halyk Arena') return false;      // Halyk-only gate
    if (bucket && bucket.length > 0) return false;        // DB mode -> never seed
    return true;                                          // fallback mode -> seed
}

function coach(idx, lid, s, e, eff = '1970-01-01', del = null) {
    return { id: `ts-${idx}-${eff}`, branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed',
        slot_index: idx, start_time: s, end_time: e, label: null,
        effective_from: eff, deleted_at: del, logical_slot_id: lid };
}

// ---------------------------------------------------------------------------
// Criterion 1: creating a new earlier slot leaves it empty (no auto-seed leak).
// ---------------------------------------------------------------------------
console.log('\n=== criterion 1: new earlier slot stays empty ========================\n');
{
    // Original bucket: three seeded slots 10:00/11:00/12:00 (slot_index 0/1/2).
    const rows = [
        coach(0, 'L0', '10:00', '11:00'),
        coach(1, 'L1', '11:00', '12:00'),
        coach(2, 'L2', '12:00', '13:00'),
    ];
    // Admin adds a NEW 9:00-10:00 slot: migration 078 gives it slot_index max+1
    // (=3) but effective_from = the viewed month. Chronologically it sorts FIRST.
    rows.push(coach(3, 'L3', '09:00', '10:00', '2026-09-01'));

    const bucket = buildBucket(rows, '2026-09-30');
    assertEqual(bucket.map(s => s.time), ['9:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00'],
        'new 9:00 slot renders first (render position 0) despite the highest slot_index');
    assertEqual(bucket.map(s => s.logicalSlotId), ['L3', 'L0', 'L1', 'L2'],
        'render order: [L3(new), L0, L1, L2]');

    // The bucket is DB-mode -> the positional auto-seed must NOT run, so the new
    // slot inherits no students.
    assert(shouldPositionalAutoSeed('Halyk Arena', bucket) === false,
        'DB-mode bucket does not positionally auto-seed (new slot starts empty)');

    // Students who DO have real assignment rows land only in their own slots.
    const students = [
        { studentId: 'S1', timeSlotIndex: 0, logicalSlotId: 'L0' }, // 10:00 group
        { studentId: 'S2', timeSlotIndex: 2, logicalSlotId: 'L2' }, // 12:00 group
    ];
    const membership = students.map(a => resolveMembership(bucket, a, 'Coach C'));
    assertEqual(membership, [1, 3],
        'assigned students follow their logical slot (positions 1 & 3); none land in the new slot (position 0)');
    const inNewSlot = students.filter(a => resolveMembership(bucket, a, 'Coach C') === 0);
    assertEqual(inNewSlot, [], 'no student resolves into the new 9:00 slot (render position 0)');
}

// ---------------------------------------------------------------------------
// Criterion 2: legacy NULL-logical rows resolve to the SAME slot before and
// after a new earlier slot is inserted (stable under reorder).
// ---------------------------------------------------------------------------
console.log('\n=== criterion 2: legacy rows stable under reorder ====================\n');
{
    const base = [
        coach(0, 'L0', '10:00', '11:00'),
        coach(1, 'L1', '11:00', '12:00'),
        coach(2, 'L2', '12:00', '13:00'),
    ];
    // Legacy row: no logical id; stored time_slot_index = physical slot_index 1
    // (the 11:00 group, backfilled by migration 076 as time_slot_index=slot_index).
    const legacy = { studentId: 'S', timeSlotIndex: 1, logicalSlotId: null };

    // BEFORE: contiguous bucket, render position == slot_index.
    const before = buildBucket(base, '2026-08-31');
    const posBefore = resolveMembership(before, legacy, 'Coach C');
    assertEqual(posBefore, 1, 'BEFORE: legacy row renders at position 1 (the 11:00 slot)');
    assertEqual(before[posBefore].time, '11:00-12:00', 'BEFORE: position 1 is the 11:00 slot');

    // AFTER: a new earlier 9:00 slot shifts every render position by one.
    const withNew = base.concat([coach(3, 'L3', '09:00', '10:00', '2026-09-01')]);
    const after = buildBucket(withNew, '2026-09-30');
    const posAfter = resolveMembership(after, legacy, 'Coach C');
    assertEqual(posAfter, 2, 'AFTER: legacy row renders at position 2 (the 11:00 slot shifted right)');
    assertEqual(after[posAfter].time, '11:00-12:00',
        'AFTER: the resolved slot is STILL the 11:00 slot — the student did not move');
    assertEqual(after[posAfter].slotIndex, 1,
        'AFTER: resolved slot keeps physical slot_index 1 (stable identity)');

    // Contrast: the OLD buggy behavior used the raw index (1) as a render
    // position, which after the reorder points at the 10:00 slot — the re-homing
    // bug this fix removes.
    assertEqual(after[legacy.timeSlotIndex].time, '10:00-11:00',
        'raw-index behavior would have wrongly pointed at the 10:00 slot (the bug)');
}

// ---------------------------------------------------------------------------
// Criterion 3: auto-seed still works for genuine fallback-mode buckets.
// ---------------------------------------------------------------------------
console.log('\n=== criterion 3: fallback-mode auto-seed still runs ==================\n');
{
    // No DB slots for this coach/schedule -> fallback mode (no cache bucket).
    assert(shouldPositionalAutoSeed('Halyk Arena', null) === true,
        'Halyk fallback-mode bucket (no cache) still positionally auto-seeds');
    assert(shouldPositionalAutoSeed('Halyk Arena', []) === true,
        'Halyk empty-cache bucket still positionally auto-seeds');

    // Non-Halyk branches never auto-seed, DB or fallback.
    assert(shouldPositionalAutoSeed('Debut', null) === false,
        'non-Halyk branch never positionally auto-seeds');

    // Faithful port of the floor(index/10) bucketing over a fallback array of 3
    // slots: first 10 students -> slot 0, next 10 -> slot 1, overflow clamps.
    const DEFAULT_TIME_SLOT_ROWS = 10;
    const numSlots = 3;
    function autoSeedIndex(listIndex) {
        let slot = Math.floor(listIndex / DEFAULT_TIME_SLOT_ROWS);
        if (slot >= numSlots) slot = numSlots - 1;
        return slot;
    }
    assertEqual([0, 9, 10, 19, 20, 29, 30].map(autoSeedIndex), [0, 0, 1, 1, 2, 2, 2],
        'fallback auto-seed: 10 students per slot, overflow clamps to the last slot');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
