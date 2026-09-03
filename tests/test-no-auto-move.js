/**
 * Tests for the "no automatic student slot moves" invariant + the slot-shift
 * render fix. See specs/no-auto-move-20260903.md.
 *
 * Layered like test-slot-stable-id.js / test-slot-empty-fix.js:
 *   1. Source-contract regex checks across migration 081, admin-v2.js and
 *      admin.js (catch drift of the load-bearing lines).
 *   2. A JS port of the loadAttendanceData membership resolution, proving the
 *      Part-1 regression: after adding an earlier slot, previously-assigned
 *      students resolve to the SAME logical slots as before.
 *
 * Run: node tests/test-no-auto-move.js
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
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(begin, i + 1); }
    }
    return '';
}

// ============================================================================
// 1. migration 081 — source contract / parse
// ============================================================================
console.log('\n=== migration 081_no_auto_student_moves.sql =========================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/081_no_auto_student_moves.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/081_… exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

// idempotent + transactional wrapper
assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');
// balanced dollar-quoted function bodies (cheap "parses" check)
assert((MIG.match(/\$\$/g) || []).length % 2 === 0, 'balanced $$ dollar-quoted blocks');
assert((MIG.match(/\bBEGIN\b/g) || []).length === (MIG.match(/\bEND\b/g) || []).length + 0 ||
       (MIG.match(/\bEND\b/g) || []).length > 0, 'has PL/pgSQL BEGIN/END blocks');

// 1a. move_student_slot_manual RPC
assert(/CREATE OR REPLACE FUNCTION move_student_slot_manual\(/.test(MIG),
    'defines move_student_slot_manual (CREATE OR REPLACE — idempotent)');
assert(/move_student_slot_manual\([\s\S]*?p_from_logical_slot_id UUID DEFAULT NULL/.test(MIG),
    'move_student_slot_manual takes p_from_logical_slot_id (NULL for first-time add)');
assert(/move_student_slot_manual\([\s\S]*?p_to_logical_slot_id UUID DEFAULT NULL/.test(MIG),
    'move_student_slot_manual takes p_to_logical_slot_id');
assert(/move_student_slot_manual\([\s\S]*?p_day_group TEXT/.test(MIG),
    'move_student_slot_manual takes p_day_group (schedule_type) + p_coach_id');
assert(/move_student_slot_manual\([\s\S]*?p_coach_id UUID DEFAULT NULL/.test(MIG),
    'move_student_slot_manual takes p_coach_id');
assert(/SECURITY DEFINER/.test(MIG.slice(MIG.indexOf('move_student_slot_manual'))),
    'move_student_slot_manual is SECURITY DEFINER');
assert(/PERFORM set_config\('app\.manual_slot_move', 'on', true\)/.test(MIG),
    "sets the transaction-local sentinel set_config('app.manual_slot_move','on',true)");
assert(/target slot % not found for this coach\/day-group/.test(MIG),
    'validates the target slot belongs to the coach/day-group');
assert(/PERFORM hide_student_versioned\(/.test(MIG),
    'move hides the student from the source slot (versioned per-slot)');
assert(/GRANT EXECUTE ON FUNCTION move_student_slot_manual\([\s\S]*?\) TO authenticated/.test(MIG),
    'grants EXECUTE on move_student_slot_manual to authenticated');

// 1b. guard trigger
assert(/CREATE OR REPLACE FUNCTION forbid_auto_student_slot_moves\(\)/.test(MIG),
    'defines the forbid_auto_student_slot_moves trigger function');
assert(/automatic student slot moves are forbidden; use move_student_slot_manual/.test(MIG),
    'guard RAISEs the "automatic student slot moves are forbidden" exception');
assert(/IF current_setting\('app\.manual_slot_move', true\) = 'on' THEN\s*\n\s*RETURN NEW;/.test(MIG),
    'guard lets the write through when the sentinel is on');
assert(/NEW\.time_slot_index IS DISTINCT FROM OLD\.time_slot_index[\s\S]*?NEW\.logical_slot_id IS DISTINCT FROM OLD\.logical_slot_id/.test(MIG),
    'guard only blocks UPDATEs that CHANGE a slot reference (hide-only updates pass)');
assert(/DROP TRIGGER IF EXISTS trg_forbid_auto_student_slot_moves ON student_time_slot_assignments/.test(MIG),
    'drops the trigger before create (idempotent)');
assert(/CREATE TRIGGER trg_forbid_auto_student_slot_moves\s*\n\s*BEFORE INSERT OR UPDATE ON student_time_slot_assignments/.test(MIG),
    'trigger is BEFORE INSERT OR UPDATE (DELETEs are not guarded)');
assert(!/BEFORE INSERT OR UPDATE OR DELETE ON student_time_slot_assignments\s*\n\s*FOR EACH ROW EXECUTE FUNCTION forbid_auto_student_slot_moves/.test(MIG),
    'guard trigger does NOT fire on DELETE (removal is not a move)');

// 1c. hide_student_versioned recreated to set the sentinel
assert(/CREATE OR REPLACE FUNCTION hide_student_versioned\(/.test(MIG),
    'recreates hide_student_versioned so it sets the sentinel too');
const hideChunk = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION hide_student_versioned('));
assert(/PERFORM set_config\('app\.manual_slot_move', 'on', true\)/.test(hideChunk),
    'hide_student_versioned sets the sentinel (its fresh-hidden-row insert needs it)');

// 1d. RLS tightening (defense-in-depth)
assert(/DROP POLICY IF EXISTS "Dashboard users manage time slot assignments" ON student_time_slot_assignments/.test(MIG),
    'drops the permissive migration-079 FOR ALL policy');
assert(/CREATE POLICY "Manual slot assignment inserts"[\s\S]*?FOR INSERT[\s\S]*?current_setting\('app\.manual_slot_move', true\) = 'on'/.test(MIG),
    'INSERT policy additionally requires the sentinel');
assert(/CREATE POLICY "Manual slot assignment updates"[\s\S]*?FOR UPDATE[\s\S]*?current_setting\('app\.manual_slot_move', true\) = 'on'/.test(MIG),
    'UPDATE policy additionally requires the sentinel');
assert(/CREATE POLICY "Dashboard users delete time slot assignments"[\s\S]*?FOR DELETE/.test(MIG),
    'DELETE stays open to dashboard users (removal is not a move)');

// 1e. slot add/edit/delete RPCs must NOT get the sentinel (creating a slot must
//     never write an assignment row)
assert(!/CREATE OR REPLACE FUNCTION add_time_slot_versioned/.test(MIG) &&
       !/CREATE OR REPLACE FUNCTION edit_time_slot_versioned/.test(MIG) &&
       !/CREATE OR REPLACE FUNCTION delete_time_slot_versioned/.test(MIG),
    'migration 081 does not redefine the slot add/edit/delete RPCs (creating a slot never writes an assignment row)');

// ============================================================================
// 2. admin-v2.js — client routes writes through the manual RPC
// ============================================================================
console.log('\n=== admin-v2.js source contract =====================================\n');

const ADMIN2 = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// 2a. drag move → move_student_slot_manual, no direct upsert
const moveBody = fnBody(ADMIN2, 'moveStudentToTimeSlot');
assert(moveBody.length > 0, 'located moveStudentToTimeSlot body');
assert(/rpc\('move_student_slot_manual'/.test(moveBody),
    'drag move calls the move_student_slot_manual RPC');
assert(!/upsertTimeSlotAssignment/.test(moveBody),
    'drag move no longer calls upsertTimeSlotAssignment directly');
assert(!/rpc\('hide_student_versioned'/.test(moveBody),
    'drag move no longer issues a separate hide_student_versioned RPC (the manual RPC hides internally)');
assert(/p_from_logical_slot_id: fromLogicalId/.test(moveBody) && /p_to_logical_slot_id: toLogicalId/.test(moveBody),
    'drag move passes DOM-resolved from/to logical slot ids');
assert(/moveFailed/.test(moveBody) && /'error'/.test(moveBody) &&
       /await loadAttendanceData\(\)/.test(moveBody),
    'drag move surfaces an error toast (moveFailed) and resyncs on RPC rejection (no silent fail)');

// 2b. add-student-to-calendar modal → move_student_slot_manual (from = NULL)
const addBody = fnBody(ADMIN2, 'submitAddStudentToCalendar');
assert(addBody.length > 0, 'located submitAddStudentToCalendar body');
assert(/rpc\('move_student_slot_manual'/.test(addBody),
    'add-student modal calls the move_student_slot_manual RPC');
assert(/p_from_slot_index: null/.test(addBody) && /p_from_logical_slot_id: null/.test(addBody),
    'add-student modal passes a NULL source slot (first-time assignment)');
assert(!/upsertTimeSlotAssignment/.test(addBody),
    'add-student modal no longer calls upsertTimeSlotAssignment directly');
assert(/addStudentFailed[\s\S]*?'error'/.test(addBody),
    'add-student modal surfaces an error toast on RPC rejection');

// 2c. slot add/edit/delete re-resolve via loadAttendanceData (Part 1) and write
//     NO assignment rows (they only touch the slot RPCs + cache reload).
for (const [fn, rpc] of [
    ['saveTimeSlotEdit', 'edit_time_slot_versioned'],
    ['deleteTimeSlot', 'delete_time_slot_versioned'],
    ['submitAddTimeSlot', 'add_time_slot_versioned'],
]) {
    const body = fnBody(ADMIN2, fn);
    assert(body.length > 0, `located ${fn} body`);
    assert(/await loadAttendanceData\(\)/.test(body),
        `${fn} re-runs loadAttendanceData() (re-resolves membership vs the fresh slot cache)`);
    assert(new RegExp(`rpc\\('${rpc}'`).test(body),
        `${fn} calls the ${rpc} slot RPC`);
    assert(!/upsertTimeSlotAssignment/.test(body) && !/move_student_slot_manual/.test(body) &&
           !/hide_student_versioned/.test(body) &&
           !/from\('student_time_slot_assignments'\)/.test(body),
        `${fn} writes ZERO assignment rows (creating/editing a slot never moves a student)`);
}

// ============================================================================
// 3. admin.js — legacy (dead) direct writes are disabled, not left in place
// ============================================================================
console.log('\n=== admin.js legacy write sites disabled ============================\n');

const ADMIN1 = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
assert(!/await\s+(window\.)?supabaseData\.upsertTimeSlotAssignment\(/.test(ADMIN1),
    'admin.js no longer performs any direct upsertTimeSlotAssignment write');
assert((ADMIN1.match(/\[legacy admin\.js\][^\n]*disabled/g) || []).length >= 3,
    'the three legacy admin.js write sites are console.warn-disabled');

// ============================================================================
// 4. Part 1 regression — re-resolution keeps students on the SAME logical slot
// ============================================================================
console.log('\n=== part 1 regression: add-earlier-slot keeps membership stable =====\n');

// Faithful ports of buildBucket / getSlotPositionForLogicalId + the
// loadAttendanceData membership build (same as test-slot-empty-fix.js).
function slotStartMin(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : Number.MAX_SAFE_INTEGER;
}
function buildBucket(rows, monthEnd) {
    const sorted = rows.filter(r => r.effective_from <= monthEnd).slice().sort((a, b) => {
        if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;
        return a.effective_from < b.effective_from ? 1 : -1;
    });
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        const k = `${r.branch_id}|${r.coach_id}|${r.schedule_type}|${r.slot_index}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (r.deleted_at) continue;
        const fmt = (t) => { const [h, m] = t.split(':'); return `${parseInt(h, 10)}:${m}`; };
        out.push({ slotIndex: r.slot_index, logicalSlotId: r.logical_slot_id, time: `${fmt(r.start_time)}-${fmt(r.end_time)}` });
    }
    out.sort((a, b) => (slotStartMin(a.time) - slotStartMin(b.time)) || (a.slotIndex - b.slotIndex));
    return out;
}
function positionForLogicalId(bucket, lid) {
    if (!bucket || !lid) return null;
    const p = bucket.findIndex(s => s.logicalSlotId === lid);
    return p >= 0 ? p : null;
}
function resolveMembership(bucket, a, coachName) {
    let slotIdx = a.timeSlotIndex;
    if (a.logicalSlotId && coachName) {
        const pos = positionForLogicalId(bucket, a.logicalSlotId);
        if (pos !== null) slotIdx = pos;
    }
    return slotIdx;
}
function slot(idx, lid, s, e, eff = '1970-01-01', del = null) {
    return { id: `ts-${idx}-${eff}`, branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed',
        slot_index: idx, start_time: s, end_time: e, effective_from: eff, deleted_at: del, logical_slot_id: lid };
}

{
    // Three original slots at 10/11/12. Two students assigned by logical id.
    const base = [ slot(0, 'L0', '10:00', '11:00'), slot(1, 'L1', '11:00', '12:00'), slot(2, 'L2', '12:00', '13:00') ];
    const students = [
        { studentId: 'S1', timeSlotIndex: 1, logicalSlotId: 'L1' }, // 11:00 group
        { studentId: 'S2', timeSlotIndex: 2, logicalSlotId: 'L2' }, // 12:00 group
    ];

    const before = buildBucket(base, '2026-08-31');
    const posBefore = students.map(a => resolveMembership(before, a, 'Coach C'));
    const logicalBefore = students.map(a => before[resolveMembership(before, a, 'Coach C')].logicalSlotId);
    assertEqual(posBefore, [1, 2], 'BEFORE: S1→pos1, S2→pos2');
    assertEqual(logicalBefore, ['L1', 'L2'], 'BEFORE: students sit on logical slots L1 / L2');

    // Admin adds an earlier 9:00 slot (migration 078: slot_index max+1 = 3, but
    // sorts FIRST chronologically). loadAttendanceData re-resolves membership.
    const withNew = base.concat([ slot(3, 'L3', '09:00', '10:00', '2026-09-01') ]);
    const after = buildBucket(withNew, '2026-09-30');
    const posAfter = students.map(a => resolveMembership(after, a, 'Coach C'));
    const logicalAfter = students.map(a => after[resolveMembership(after, a, 'Coach C')].logicalSlotId);

    assertEqual(posAfter, [2, 3], 'AFTER: render positions shift right by one (9:00 slot took position 0)');
    assertEqual(logicalAfter, ['L1', 'L2'],
        'AFTER: students still resolve to the SAME logical slots (L1 / L2) — no re-home');
    assert(after[posAfter[0]].time === '11:00-12:00' && after[posAfter[1]].time === '12:00-13:00',
        'AFTER: resolved slots are still the 11:00 and 12:00 groups');

    // Nobody lands in the new 9:00 slot.
    const inNew = students.filter(a => resolveMembership(after, a, 'Coach C') === 0);
    assertEqual(inNew, [], 'no previously-assigned student is re-homed into the new earlier slot');

    // The bug this guards: if a render used the STALE pre-add positions [1,2]
    // against the NEW order, both students would appear one slot too early.
    assert(after[posBefore[0]].time === '10:00-11:00' && after[posBefore[1]].time === '11:00-12:00',
        'stale positions [1,2] against the new order would wrongly show the 10:00 & 11:00 slots (the bug)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
