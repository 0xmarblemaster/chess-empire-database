/**
 * Tests for stable logical slot identity (migration 076 + admin-v2.js +
 * supabase-data.js). See PRD_SLOT_STABLE_ID.md.
 *
 * Layered like test-time-slot-versioning.js:
 *   1. Source-contract regex checks across migration 076, admin-v2.js and
 *      supabase-data.js (catches accidental drift).
 *   2. JS ports of the versioned RPCs + the renumber-safe membership resolver
 *      exercised against an in-memory dataset, proving the PRD's core
 *      guarantee: create slots -> assign students -> renumber/tombstone slots
 *      -> membership resolves to the SAME logical slot (not a stale index).
 *
 * Run: node tests/test-slot-stable-id.js
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

function methodBody(src, name) {
    const re = new RegExp(`(?:async\\s+)?${name}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
        const open = src.indexOf('{', m.index);
        if (open < 0) continue;
        let depth = 0;
        for (let i = open; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) return src.slice(open, i + 1);
            }
        }
    }
    return '';
}

// ============================================================================
// 1. Migration 076 — source contract
// ============================================================================
console.log('\n=== migration 076_logical_slot_id_stable_identity.sql ===============\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/076_logical_slot_id_stable_identity.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/076_… exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');

// time_slots.logical_slot_id
assert(/ALTER TABLE time_slots\s+ADD COLUMN IF NOT EXISTS logical_slot_id UUID/.test(MIG),
    'adds time_slots.logical_slot_id UUID');
assert(/WITH chains AS \([\s\S]+?SELECT DISTINCT branch_id, coach_id, schedule_type, slot_index/.test(MIG),
    'backfills one UUID per (branch, coach, schedule, slot_index) chain');
assert(/ALTER COLUMN logical_slot_id SET DEFAULT gen_random_uuid\(\)/.test(MIG),
    'sets DEFAULT gen_random_uuid() so slot CREATION mints a fresh chain id');
assert(/ALTER TABLE time_slots\s+ALTER COLUMN logical_slot_id SET NOT NULL/.test(MIG),
    'enforces time_slots.logical_slot_id NOT NULL after backfill');
assert(/CREATE INDEX IF NOT EXISTS idx_time_slots_logical_slot_id/.test(MIG),
    'indexes time_slots.logical_slot_id');

// edit/delete RPCs carry logical_slot_id + updated_by
const editSql = MIG.slice(MIG.indexOf('FUNCTION edit_time_slot_versioned'), MIG.indexOf('FUNCTION delete_time_slot_versioned'));
assert(/INSERT INTO time_slots[\s\S]+?logical_slot_id, updated_by\)[\s\S]+?v_existing\.logical_slot_id, auth\.uid\(\)/.test(editSql),
    'edit_time_slot_versioned new version carries v_existing.logical_slot_id + auth.uid()');
assert(/UPDATE time_slots[\s\S]+?updated_by = auth\.uid\(\)/.test(editSql),
    'edit_time_slot_versioned in-place UPDATE sets updated_by = auth.uid()');
const delSql = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION delete_time_slot_versioned'), MIG.indexOf('ALTER TABLE student_time_slot_assignments'));
assert(/INSERT INTO time_slots[\s\S]+?logical_slot_id, updated_by\)[\s\S]+?v_existing\.logical_slot_id, auth\.uid\(\)/.test(delSql),
    'delete_time_slot_versioned tombstone carries v_existing.logical_slot_id + auth.uid()');

// student_time_slot_assignments.logical_slot_id + updated_by + backfill
assert(/ALTER TABLE student_time_slot_assignments\s+ADD COLUMN IF NOT EXISTS logical_slot_id UUID/.test(MIG),
    'adds student_time_slot_assignments.logical_slot_id UUID');
assert(/ALTER TABLE student_time_slot_assignments\s+ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth\.users\(id\)/.test(MIG),
    'adds student_time_slot_assignments.updated_by for attribution');
assert(/UPDATE student_time_slot_assignments a\s+SET logical_slot_id = ts\.logical_slot_id\s+FROM students s, time_slots ts/.test(MIG),
    'backfills assignment logical_slot_id via students + time_slots join');
assert(/a\.time_slot_index = ts\.slot_index/.test(MIG) && /s\.coach_id\s+= ts\.coach_id/.test(MIG),
    'backfill resolves on (student coach, schedule, time_slot_index=slot_index)');
assert(/a\.time_slot_index >= 0/.test(MIG),
    'backfill excludes legacy -1 schedule-wide hides (no slot identity)');
assert(/RAISE NOTICE '\[076\][\s\S]+?did not resolve/.test(MIG),
    'logs unresolved assignment rows as NOTICEs (does not delete them)');
assert(/CREATE INDEX IF NOT EXISTS idx_student_time_slot_assignments_logical_slot_id/.test(MIG),
    'indexes student_time_slot_assignments.logical_slot_id');

// hide_student_versioned — 6-arg with p_logical_slot_id + updated_by
assert(/DROP FUNCTION IF EXISTS hide_student_versioned\(UUID, UUID, TEXT, INT, DATE\)/.test(MIG),
    'drops the migration-061 5-arg hide_student_versioned overload');
assert(/CREATE OR REPLACE FUNCTION hide_student_versioned\([\s\S]+?p_logical_slot_id UUID DEFAULT NULL\s*\)/.test(MIG),
    'recreates hide_student_versioned with p_logical_slot_id UUID DEFAULT NULL');
assert(/GRANT EXECUTE ON FUNCTION hide_student_versioned\(UUID, UUID, TEXT, INT, DATE, UUID\) TO authenticated/.test(MIG),
    'grants EXECUTE on the new 6-arg hide_student_versioned');
assert(/updated_by\s+= auth\.uid\(\)/.test(MIG.slice(MIG.indexOf('FUNCTION hide_student_versioned'))),
    'hide_student_versioned sets updated_by = auth.uid()');
assert(/COALESCE\(p_logical_slot_id, v_existing\.logical_slot_id\)/.test(MIG),
    'hide_student_versioned later-month insert COALESCEs the logical id (never nulls it)');

// attendance FK drop
assert(/ALTER TABLE attendance\s+DROP CONSTRAINT IF EXISTS attendance_time_slot_id_fkey/.test(MIG),
    'drops the attendance.time_slot_id FK so it can hold logical_slot_id');

assert(/SECURITY INVOKER/.test(MIG), 'RPCs stay SECURITY INVOKER (RLS unchanged)');

// ============================================================================
// 2. admin-v2.js — source contract
// ============================================================================
console.log('\n=== admin-v2.js source contract ======================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// 2a. cache stores logicalSlotId
assert(/logical_slot_id,\s*\n\s*branches!inner\(name\)/.test(ADMIN_SRC),
    'loadTimeSlotsCache SELECT includes logical_slot_id');
assert(/logicalSlotId:\s*row\.logical_slot_id\s*\|\|\s*null/.test(ADMIN_SRC),
    'cache entries carry logicalSlotId');

// 2b. resolver helpers defined + exported
for (const fn of ['getLogicalSlotIdForTime', 'getLogicalSlotIdForPosition', 'getSlotPositionForLogicalId']) {
    assert(new RegExp(`function ${fn}\\(`).test(ADMIN_SRC), `${fn} is defined`);
    assert(new RegExp(`window\\.${fn}\\s*=\\s*${fn}`).test(ADMIN_SRC), `${fn} is exported on window`);
}
assert(fnBody(ADMIN_SRC, 'getSlotPositionForLogicalId').includes('findIndex'),
    'getSlotPositionForLogicalId resolves via findIndex (render position)');

// 2c. membership resolution prefers logical id, falls back to positional index
const loadAttBody = fnBody(ADMIN_SRC, 'loadAttendanceData');
assert(/getSlotPositionForLogicalId\(\s*\n?\s*attendanceCurrentBranch,\s*scheduleFilter,/.test(loadAttBody),
    'loadAttendanceData resolves membership via getSlotPositionForLogicalId');
assert(/if\s*\(a\.logicalSlotId && attendanceCurrentCoachName\)/.test(loadAttBody),
    'logical resolution is gated on a logicalSlotId + a specific coach (else positional fallback)');
assert(/let slotIdx = a\.timeSlotIndex;/.test(loadAttBody),
    'defaults to the stored positional index for legacy NULL rows');

// 2d. attendance marks store logical_slot_id
assert(!/getTimeSlotIdForTime\(attendanceCurrentBranch, attendanceCurrentSchedule,/.test(ADMIN_SRC),
    'attendance marks no longer store the per-version time_slots.id');
const logicalMarkCount = (ADMIN_SRC.match(/getLogicalSlotIdForTime\(attendanceCurrentBranch/g) || []).length;
assert(logicalMarkCount >= 2, 'both attendance-mark paths resolve slotId via getLogicalSlotIdForTime');
// getTimeSlotIdForTime survives ONLY for the edit-modal lookup (needs real id)
assert(fnBody(ADMIN_SRC, 'openEditTimeSlotModal').includes('getTimeSlotIdForTime'),
    'openEditTimeSlotModal still uses getTimeSlotIdForTime (per-version DB row id for editing)');

// 2e. write paths carry logical ids
// Migration 081: the drag move and the add-student modal route through the one
// move_student_slot_manual RPC (no direct assignment upsert survives).
assert(/p_from_logical_slot_id: fromLogicalId/.test(ADMIN_SRC),
    'move: manual-move RPC carries the source slot logical id');
assert(/p_to_logical_slot_id: toLogicalId/.test(ADMIN_SRC),
    'move: manual-move RPC carries the target slot logical id');
assert(/rpc\('move_student_slot_manual'/.test(ADMIN_SRC),
    'move + add-student both call the move_student_slot_manual RPC');
assert(/p_logical_slot_id: hideLogicalId/.test(ADMIN_SRC),
    'deleteStudentFromCalendar hide carries p_logical_slot_id');
assert(/p_to_logical_slot_id: targetLogicalId/.test(ADMIN_SRC),
    'add-student: manual-move RPC carries the target slot logical id');
assert(/p_from_slot_index: null/.test(ADMIN_SRC),
    'add-student: manual-move RPC passes a NULL source slot (first-time assignment)');

// 2f. Migration 077: write paths pass the real physical slot_index (not the
//     display position) as p_time_slot_index, resolved via getSlotIndexForPosition.
assert(new RegExp('function getSlotIndexForPosition\\(').test(ADMIN_SRC),
    'getSlotIndexForPosition is defined');
assert(/window\.getSlotIndexForPosition\s*=\s*getSlotIndexForPosition/.test(ADMIN_SRC),
    'getSlotIndexForPosition is exported on window');
assert(fnBody(ADMIN_SRC, 'getSlotIndexForPosition').includes('slot.slotIndex'),
    'getSlotIndexForPosition returns the physical slotIndex from the cache bucket');
assert(/p_to_slot_index: toPhysicalIndex !== null \? toPhysicalIndex : toSlotIndex/.test(ADMIN_SRC),
    'move: manual-move RPC passes the target physical slot_index (falls back to display position)');
assert(/p_time_slot_index: hidePhysicalIndex !== null \? hidePhysicalIndex : slotIndex/.test(ADMIN_SRC),
    'deleteStudentFromCalendar hide passes the physical slot_index (falls back to display position)');

// ============================================================================
// 3. supabase-data.js — source contract
// ============================================================================
console.log('\n=== supabase-data.js source contract ================================\n');

const SDATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

const getBody = methodBody(SDATA_SRC, 'getTimeSlotAssignments');
assert(/\.select\('student_id, time_slot_index, effective_from, hidden, logical_slot_id'\)/.test(getBody),
    'getTimeSlotAssignments selects logical_slot_id');
assert(/logicalSlotId:\s*d\.logical_slot_id\s*\|\|\s*null/.test(getBody),
    'getTimeSlotAssignments returns logicalSlotId per assignment');

assert(/async upsertTimeSlotAssignment\(studentId, branchId, scheduleType, timeSlotIndex, logicalSlotId = null\)/.test(SDATA_SRC),
    'upsertTimeSlotAssignment accepts an optional logicalSlotId');
const upsertBody = methodBody(SDATA_SRC, 'upsertTimeSlotAssignment');
assert(/if \(logicalSlotId\) row\.logical_slot_id = logicalSlotId;/.test(upsertBody),
    'upsertTimeSlotAssignment only writes logical_slot_id when provided (never nulls on conflict)');
const bulkBody = methodBody(SDATA_SRC, 'bulkUpsertTimeSlotAssignments');
assert(/if \(a\.logicalSlotId\) row\.logical_slot_id = a\.logicalSlotId;/.test(bulkBody),
    'bulkUpsertTimeSlotAssignments carries logical_slot_id when provided');

// Migration 077: read-path dedupe shadows by logical_slot_id (fallback index).
assert(/const slotKey = d\.logical_slot_id \|\| `idx:\$\{d\.time_slot_index\}`;/.test(getBody),
    'getTimeSlotAssignments dedupes by logical_slot_id (fallback to positional index)');
// Migration 077: add-path hide-cleanup is scoped to the SAME logical slot.
assert(/clearSlotHidesQuery = logicalSlotId\s*\n?\s*\? clearSlotHidesQuery\.eq\('logical_slot_id', logicalSlotId\)\s*\n?\s*: clearSlotHidesQuery\.eq\('time_slot_index', timeSlotIndex\);/.test(upsertBody),
    'upsertTimeSlotAssignment clears future hides scoped by logical_slot_id (fallback index)');

// ============================================================================
// 3b. Migration 077 — hide_student_versioned resolves by logical_slot_id
// ============================================================================
console.log('\n=== migration 077_hide_student_resolve_by_logical_slot.sql ==========\n');

const MIG77_PATH = path.join(ROOT, 'supabase/migrations/077_hide_student_resolve_by_logical_slot.sql');
assert(fs.existsSync(MIG77_PATH), 'supabase/migrations/077_… exists');
const MIG77 = fs.existsSync(MIG77_PATH) ? fs.readFileSync(MIG77_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG77), 'wrapped in BEGIN;…COMMIT;');
assert(/CREATE OR REPLACE FUNCTION hide_student_versioned\([\s\S]+?p_logical_slot_id UUID DEFAULT NULL\s*\)/.test(MIG77),
    'recreates the 6-arg hide_student_versioned (p_logical_slot_id DEFAULT NULL)');
assert(/IF p_logical_slot_id IS NOT NULL THEN[\s\S]+?AND logical_slot_id = p_logical_slot_id/.test(MIG77),
    'resolves the target row by logical_slot_id when one is provided');
assert(/AND time_slot_index = p_time_slot_index[\s\S]+?AND \(p_logical_slot_id IS NULL OR logical_slot_id IS NULL\)/.test(MIG77),
    'falls back to positional index only for legacy rows with NULL logical id');
assert(/GRANT EXECUTE ON FUNCTION hide_student_versioned\(UUID, UUID, TEXT, INT, DATE, UUID\) TO authenticated/.test(MIG77),
    'grants EXECUTE on the 6-arg overload');
assert(/SECURITY INVOKER/.test(MIG77), 'stays SECURITY INVOKER (RLS unchanged)');
assert(/updated_by\s+= auth\.uid\(\)/.test(MIG77) && /COALESCE\(p_logical_slot_id/.test(MIG77),
    'preserves 076 semantics (updated_by = auth.uid(), COALESCE logical id)');

// ============================================================================
// 4. JS port of the versioned RPCs — logical_slot_id is carried across versions
// ============================================================================
console.log('\n=== edit/delete_time_slot_versioned carry logical_slot_id ===========\n');

function newSlotDb() { return { rows: [], nextId: 1 }; }
function sid(n) { return `ts-${n.toString().padStart(4, '0')}`; }

function editTimeSlotVersioned(db, { p_slot_id, p_start, p_end, p_label, p_effective_from }) {
    const ex = db.rows.find(r => r.id === p_slot_id);
    if (!ex) throw new Error('not found');
    if (ex.effective_from === p_effective_from) {
        ex.start_time = p_start; ex.end_time = p_end; ex.label = p_label;
        return ex;
    }
    const row = {
        id: sid(db.nextId++), branch_id: ex.branch_id, coach_id: ex.coach_id,
        schedule_type: ex.schedule_type, slot_index: ex.slot_index,
        start_time: p_start, end_time: p_end, label: p_label,
        effective_from: p_effective_from, deleted_at: null,
        logical_slot_id: ex.logical_slot_id,           // <-- carried
    };
    db.rows.push(row);
    return row;
}

function deleteTimeSlotVersioned(db, { p_slot_id, p_effective_from }) {
    const ex = db.rows.find(r => r.id === p_slot_id);
    if (!ex) throw new Error('not found');
    if (ex.effective_from === p_effective_from) { ex.deleted_at = 'now'; return ex; }
    const row = {
        id: sid(db.nextId++), branch_id: ex.branch_id, coach_id: ex.coach_id,
        schedule_type: ex.schedule_type, slot_index: ex.slot_index,
        start_time: ex.start_time, end_time: ex.end_time, label: ex.label,
        effective_from: p_effective_from, deleted_at: 'now',
        logical_slot_id: ex.logical_slot_id,           // <-- carried
    };
    db.rows.push(row);
    return row;
}

{
    const db = newSlotDb();
    db.rows.push({ id: sid(db.nextId++), branch_id: 'B', coach_id: 'C',
        schedule_type: 'mon_wed', slot_index: 2, start_time: '11:00', end_time: '12:00',
        label: null, effective_from: '1970-01-01', deleted_at: null, logical_slot_id: 'L2' });
    const v = editTimeSlotVersioned(db, { p_slot_id: db.rows[0].id, p_start: '11:00',
        p_end: '12:30', p_label: 'Group C', p_effective_from: '2026-09-01' });
    assertEqual(v.logical_slot_id, 'L2', 'edit new version inherits the chain logical_slot_id');
    const d = deleteTimeSlotVersioned(db, { p_slot_id: db.rows[0].id, p_effective_from: '2026-10-01' });
    assertEqual(d.logical_slot_id, 'L2', 'delete tombstone inherits the chain logical_slot_id');
}

// ============================================================================
// 5. JS port of the renumber-safe membership resolver — the PRD guarantee
// ============================================================================
console.log('\n=== renumber-safe membership: create -> assign -> tombstone ==========\n');

// Mirror of loadTimeSlotsCache: latest non-deleted version per chain, sorted by
// slot_index, COMPACTED into render positions (bucket.map order). Returns
// [{ slotIndex, logicalSlotId, time }].
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
        if (r.deleted_at) continue;              // tombstone wins -> slot hidden
        out.push({ slotIndex: r.slot_index, logicalSlotId: r.logical_slot_id, time: `${r.start_time}-${r.end_time}` });
    }
    out.sort((a, b) => a.slotIndex - b.slotIndex);
    return out;
}

// Mirror of getSlotPositionForLogicalId (render position in compacted bucket).
function positionForLogicalId(bucket, logicalSlotId) {
    const p = bucket.findIndex(s => s.logicalSlotId === logicalSlotId);
    return p >= 0 ? p : null;
}

// Mirror of loadAttendanceData membership build: prefer logical id -> current
// render position; fall back to the stored positional index.
function resolveMembership(bucket, assignment) {
    let slotIdx = assignment.timeSlotIndex;
    if (assignment.logicalSlotId) {
        const pos = positionForLogicalId(bucket, assignment.logicalSlotId);
        if (pos !== null) slotIdx = pos;
    }
    return slotIdx;
}

{
    // Coach C at branch B, mon_wed: three slots seeded at effective 1970.
    const db = newSlotDb();
    const mk = (idx, lid, s, e) => db.rows.push({ id: sid(db.nextId++), branch_id: 'B',
        coach_id: 'C', schedule_type: 'mon_wed', slot_index: idx, start_time: s, end_time: e,
        label: null, effective_from: '1970-01-01', deleted_at: null, logical_slot_id: lid });
    mk(0, 'L0', '09:00', '10:00');
    mk(1, 'L1', '10:00', '11:00');
    mk(2, 'L2', '11:00', '12:00');

    // Student S assigned to the 11:00 group (logical L2). Backfill records both
    // the stable logical id and the positional index that was current then.
    const assignS = { studentId: 'S', timeSlotIndex: 2, logicalSlotId: 'L2' };

    // --- Month M0 (before restructure): contiguous, positions == slot_index.
    const bM0 = buildBucket(db.rows, '2026-08-31');
    assertEqual(bM0.map(s => s.logicalSlotId), ['L0', 'L1', 'L2'], 'M0 bucket = [L0, L1, L2]');
    assertEqual(resolveMembership(bM0, assignS), 2, 'M0: S resolves to render position 2 (the 11:00 slot)');
    // Sanity: logical resolution agrees with the stale positional index here.
    assertEqual(positionForLogicalId(bM0, 'L2'), 2, 'M0: L2 lives at position 2');

    // --- Month M1 (RESTRUCTURE): admin tombstones slot_index 0 and 1.
    deleteTimeSlotVersioned(db, { p_slot_id: db.rows.find(r => r.slot_index === 0).id, p_effective_from: '2026-09-01' });
    deleteTimeSlotVersioned(db, { p_slot_id: db.rows.find(r => r.slot_index === 1 && !r.deleted_at).id, p_effective_from: '2026-09-01' });

    const bM1 = buildBucket(db.rows, '2026-09-30');
    assertEqual(bM1.map(s => s.logicalSlotId), ['L2'], 'M1 bucket compacts to just [L2] after tombstoning 0 & 1');

    // THE GUARANTEE: S still resolves to their group (L2), now at position 0.
    assertEqual(resolveMembership(bM1, assignS), 0, 'M1: S follows logical L2 to its new render position 0');

    // Contrast: the stale positional index (2) is out of range in the 1-slot
    // bucket — that is exactly the orphaning bug the logical id prevents.
    assert(assignS.timeSlotIndex >= bM1.length,
        'M1: the stored positional index (2) is now out of range (would orphan S without logical id)');

    // --- Month M2: admin tombstones S's OWN slot (L2). S correctly drops out.
    deleteTimeSlotVersioned(db, { p_slot_id: db.rows.find(r => r.slot_index === 2 && !r.deleted_at).id, p_effective_from: '2026-10-01' });
    const bM2 = buildBucket(db.rows, '2026-10-31');
    assertEqual(bM2.map(s => s.logicalSlotId), [], 'M2 bucket empty after all three slots tombstoned');
    assertEqual(positionForLogicalId(bM2, 'L2'), null, 'M2: L2 is gone -> resolver returns null (S has no slot)');

    // --- Re-timing must NOT move membership: edit L2 in a fresh chain.
    const db2 = newSlotDb();
    db2.rows.push({ id: sid(db2.nextId++), branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed',
        slot_index: 0, start_time: '11:00', end_time: '12:00', label: null,
        effective_from: '1970-01-01', deleted_at: null, logical_slot_id: 'LX' });
    editTimeSlotVersioned(db2, { p_slot_id: db2.rows[0].id, p_start: '11:30', p_end: '12:30',
        p_label: 'Retimed', p_effective_from: '2026-09-01' });
    const bRetime = buildBucket(db2.rows, '2026-09-30');
    assertEqual(bRetime.map(s => s.time), ['11:30-12:30'], 're-timed slot shows new time in M1');
    assertEqual(resolveMembership(bRetime, { studentId: 'S2', timeSlotIndex: 0, logicalSlotId: 'LX' }), 0,
        're-timing keeps the student on the same logical slot (position unchanged)');
}

// ============================================================================
// 6. JS port of migration 077 — hide/add resolve by logical_slot_id, not the
//    positional index (the Zhandosova tombstone-skew incident).
// ============================================================================
console.log('\n=== migration 077: hide resolves by logical id under index skew =====\n');

let _aid = 1;
function aid() { return `a-${(_aid++).toString().padStart(4, '0')}`; }

// Port of hide_student_versioned (migration 077 resolution order).
function hideStudentVersioned(rows, {
    p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
    p_effective_from, p_logical_slot_id = null,
}) {
    const bySameSchedule = r => r.student_id === p_student_id &&
        r.branch_id === p_branch_id && r.schedule_type === p_schedule_type &&
        r.effective_from <= p_effective_from;
    const latest = list => list.slice()
        .sort((a, b) => a.effective_from < b.effective_from ? 1 : -1)[0] || null;

    let existing = null;
    if (p_logical_slot_id) {
        existing = latest(rows.filter(r => bySameSchedule(r) && r.logical_slot_id === p_logical_slot_id));
    }
    if (!existing) {
        existing = latest(rows.filter(r => bySameSchedule(r) &&
            r.time_slot_index === p_time_slot_index &&
            (p_logical_slot_id === null || r.logical_slot_id == null)));
    }

    if (!existing) {
        const row = { id: aid(), student_id: p_student_id, branch_id: p_branch_id,
            schedule_type: p_schedule_type, time_slot_index: p_time_slot_index,
            effective_from: p_effective_from, hidden: true, logical_slot_id: p_logical_slot_id };
        rows.push(row); return row;
    }
    if (existing.effective_from === p_effective_from) {
        existing.hidden = true;
        existing.logical_slot_id = p_logical_slot_id || existing.logical_slot_id;
        return existing;
    }
    const row = { id: aid(), student_id: existing.student_id, branch_id: existing.branch_id,
        schedule_type: existing.schedule_type, time_slot_index: existing.time_slot_index,
        effective_from: p_effective_from, hidden: true,
        logical_slot_id: p_logical_slot_id || existing.logical_slot_id };
    rows.push(row); return row;
}

// Port of getTimeSlotAssignments dedupe (migration 077: shadow by logical id).
function visibleSlots(rows, branch_id, schedule_type, monthEnd) {
    const data = rows
        .filter(r => r.branch_id === branch_id && r.schedule_type === schedule_type && r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => a.student_id !== b.student_id
            ? (a.student_id < b.student_id ? -1 : 1)
            : (a.effective_from < b.effective_from ? 1 : -1)); // effective_from DESC
    const seen = new Set();
    const out = [];
    for (const d of data) {
        if (d.time_slot_index < 0) continue;
        const slotKey = d.logical_slot_id || `idx:${d.time_slot_index}`;
        const key = `${d.student_id}|${slotKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (d.hidden === true) continue;
        out.push({ studentId: d.student_id, timeSlotIndex: d.time_slot_index, logicalSlotId: d.logical_slot_id || null });
    }
    return out;
}

{
    // Zhandosova mon_wed: "12:00-13:00" is physical slot_index 4 (logical L4)
    // but renders at display position 2. A dead legacy row lingers at idx 2.
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 4, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L4' }, // real
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 2, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L2' }, // dead legacy
    ];

    // The write path resolves display position 2 -> logical L4 + physical idx 4.
    hideStudentVersioned(rows, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 4, p_effective_from: '2026-09-01', p_logical_slot_id: 'L4' });

    const septReal = rows.find(r => r.logical_slot_id === 'L4' && r.effective_from === '2026-09-01');
    assert(!!septReal && septReal.hidden === true && septReal.time_slot_index === 4,
        'hide targets the REAL idx-4 (logical L4) row, storing the physical index');
    assert(!rows.some(r => r.logical_slot_id === 'L2' && r.hidden === true),
        'the dead legacy idx-2 (logical L2) row is left untouched');

    // Survives a "refresh": re-read September membership.
    const sept = visibleSlots(rows, 'B', 'mon_wed', '2026-09-30');
    assert(!sept.some(a => a.studentId === 'S' && a.logicalSlotId === 'L4'),
        'after refresh, S no longer renders in their L4 slot (correct row hidden)');
    // August (before the hide) is unaffected — versioned semantics preserved.
    const aug = visibleSlots(rows, 'B', 'mon_wed', '2026-08-31');
    assert(aug.some(a => a.studentId === 'S' && a.logicalSlotId === 'L4'),
        'August still shows S in L4 (hide is effective Sept onward)');

    // Contrast: the OLD index-keyed resolution (display position 2) would have
    // matched the dead L2 row — exactly the bug this fixes.
    const rows2 = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 4, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L4' },
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 2, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L2' },
    ];
    // Legacy caller (no logical id) passing the display position 2:
    hideStudentVersioned(rows2, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 2, p_effective_from: '2026-09-01', p_logical_slot_id: null });
    const septBug = visibleSlots(rows2, 'B', 'mon_wed', '2026-09-30');
    assert(septBug.some(a => a.studentId === 'S' && a.logicalSlotId === 'L4'),
        'legacy index-2 hide leaves the real L4 row visible (the original incident)');
}

console.log('\n=== migration 077: add-path hide-cleanup is scoped by logical id ====\n');

// Port of upsertTimeSlotAssignment's future-hide cleanup (migration 077 scope).
function clearFutureHidesOnAdd(rows, { student_id, branch_id, schedule_type, time_slot_index, logical_slot_id }) {
    return rows.filter(r => {
        const isMatch = r.student_id === student_id && r.branch_id === branch_id &&
            r.schedule_type === schedule_type && r.hidden === true &&
            r.effective_from > '1970-01-01' &&
            (logical_slot_id ? r.logical_slot_id === logical_slot_id : r.time_slot_index === time_slot_index);
        return !isMatch; // keep everything that does NOT match the cleanup filter
    });
}

{
    // A repair hide row for a DIFFERENT logical slot (LR) happens to sit at the
    // numeric index (2) that a re-add of logical L4 targets by display position.
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 2, effective_from: '2026-09-01', hidden: true, logical_slot_id: 'LR' }, // repair hide
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 4, effective_from: '2026-09-01', hidden: true, logical_slot_id: 'L4' }, // L4 hide to lift
    ];

    // Re-add to logical L4 (physical idx 4): cleanup scoped by logical id.
    const after = clearFutureHidesOnAdd(rows, { student_id: 'S', branch_id: 'B',
        schedule_type: 'mon_wed', time_slot_index: 4, logical_slot_id: 'L4' });
    assert(after.some(r => r.logical_slot_id === 'LR'),
        'add-path cleanup keeps the repair hide row of the OTHER logical slot (LR)');
    assert(!after.some(r => r.logical_slot_id === 'L4'),
        'add-path cleanup still lifts the hide of the SAME logical slot (L4)');

    // Contrast: an index-scoped cleanup at display position 2 would wipe LR.
    const afterBug = clearFutureHidesOnAdd(rows, { student_id: 'S', branch_id: 'B',
        schedule_type: 'mon_wed', time_slot_index: 2, logical_slot_id: null });
    assert(!afterBug.some(r => r.logical_slot_id === 'LR'),
        'index-scoped cleanup (position 2) would delete the LR repair hide (the original incident)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
