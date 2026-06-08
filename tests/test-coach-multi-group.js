/**
 * Tests for COACH_MULTI_GROUP_PRD.md — same student in multiple time slots
 * per schedule (migration 061 + supabase-data.js + admin-v2.js changes).
 *
 * Three layers, modeled after test-student-assignments-versioning.js:
 *   1. Source-contract regex checks across migration 061, supabase-data.js,
 *      and admin-v2.js (catches accidental drift on rename, etc.).
 *   2. JS ports of the new per-slot `hide_student_versioned` RPC and the
 *      per-(student, slot) `getTimeSlotAssignments` resolver, exercised
 *      against an in-memory mock dataset — verifies the read/write
 *      semantics end-to-end without a network round trip.
 *   3. Live end-to-end tests against the real Supabase project (service-
 *      role client; cleans up every row it writes). Runs the five
 *      scenarios from the PRD's Tests section, plus a past-month
 *      effective-dating check.
 *
 * Run: node tests/test-coach-multi-group.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let createClient;
try {
    ({ createClient } = require('@supabase/supabase-js'));
} catch (_) {
    try {
        ({ createClient } = require('/tmp/node_modules/@supabase/supabase-js'));
    } catch (_) { /* no client — live tier will be skipped */ }
}

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
// 1. Migration 061 — source contract
// ============================================================================
console.log('\n=== migration 061_allow_multi_slot_per_schedule.sql ==================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/061_allow_multi_slot_per_schedule.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/061_allow_multi_slot_per_schedule.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/ALTER TABLE student_time_slot_assignments\s+ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE/.test(MIG),
    'adds hidden BOOLEAN NOT NULL DEFAULT FALSE column');
assert(/DROP CONSTRAINT IF EXISTS student_time_slot_assignments_version_uk/.test(MIG),
    'drops the per-schedule UNIQUE constraint from migration 051');
assert(/ADD CONSTRAINT student_time_slot_assignments_version_uk\s+UNIQUE \(student_id, branch_id, schedule_type, time_slot_index, effective_from\)/.test(MIG),
    'adds the per-slot UNIQUE constraint including time_slot_index');
assert(/DROP INDEX IF EXISTS idx_student_time_slot_assignments_lookup/.test(MIG),
    'drops the old lookup index');
assert(/CREATE INDEX idx_student_time_slot_assignments_lookup\s+ON student_time_slot_assignments\s+\(student_id, branch_id, schedule_type, time_slot_index, effective_from DESC\)/.test(MIG),
    'recreates the lookup index including time_slot_index');
assert(/CREATE OR REPLACE FUNCTION hide_student_versioned\(/.test(MIG),
    'rewrites hide_student_versioned RPC');
assert(/AND time_slot_index = p_time_slot_index/.test(MIG),
    'RPC resolves the current row per (student, branch, schedule, slot)');
assert(/SECURITY INVOKER/.test(MIG),
    'RPC stays SECURITY INVOKER (RLS keys on coach/admin role; do not bypass)');
assert(/IF v_existing\.effective_from = p_effective_from THEN\s+UPDATE student_time_slot_assignments\s+SET hidden\s*=\s*TRUE/.test(MIG),
    'RPC updates hidden=TRUE in place when effective_from matches');
assert(/IF NOT FOUND THEN[\s\S]+INSERT INTO student_time_slot_assignments[\s\S]+hidden, created_at, updated_at[\s\S]+TRUE, NOW\(\), NOW\(\)/.test(MIG),
    'RPC inserts a fresh hidden=TRUE row when no prior version exists (migration 054 semantic preserved)');
assert(/INSERT INTO student_time_slot_assignments[\s\S]+v_existing\.time_slot_index, p_effective_from, TRUE/.test(MIG),
    'RPC inserts a new versioned hidden=TRUE row carrying the same slot identity');
assert(/GRANT EXECUTE ON FUNCTION hide_student_versioned[^;]+TO authenticated/.test(MIG),
    'grants EXECUTE on the per-slot RPC to authenticated');

// ============================================================================
// 2. supabase-data.js — multi-slot read + per-slot upsert
// ============================================================================
console.log('\n=== supabase-data.js multi-slot contract =============================\n');

const SDATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

const getBody = methodBody(SDATA_SRC, 'getTimeSlotAssignments');
assert(getBody.length > 0, 'located getTimeSlotAssignments method body');
assert(/\.select\(['"]student_id, time_slot_index, effective_from, hidden['"]\)/.test(getBody),
    'getTimeSlotAssignments selects hidden column');
assert(/`\$\{d\.student_id\}\|\$\{d\.time_slot_index\}`/.test(getBody),
    'getTimeSlotAssignments dedupes by (student_id, time_slot_index)');
assert(/scheduleWideHidden\.add\(d\.student_id\)/.test(getBody),
    'getTimeSlotAssignments honours legacy schedule-wide -1 markers');
assert(/d\.hidden === true/.test(getBody),
    'getTimeSlotAssignments filters out hidden=TRUE rows');
assert(/d\.time_slot_index < 0/.test(getBody),
    'getTimeSlotAssignments skips the legacy -1 sentinel rows when building the result');

const upsertBody = methodBody(SDATA_SRC, 'upsertTimeSlotAssignment');
assert(upsertBody.length > 0, 'located upsertTimeSlotAssignment method body');
assert(/onConflict:\s*['"]student_id,branch_id,schedule_type,time_slot_index,effective_from['"]/.test(upsertBody),
    'upsertTimeSlotAssignment conflict target includes time_slot_index');
assert(/hidden:\s*false/.test(upsertBody),
    'upsertTimeSlotAssignment writes hidden=false on the active row');
assert(/\.eq\(['"]time_slot_index['"],\s*timeSlotIndex\)[\s\S]+\.eq\(['"]hidden['"],\s*true\)/.test(upsertBody),
    'clear-future-hides query is scoped to (time_slot_index = timeSlotIndex, hidden = true)');

const bulkBody = methodBody(SDATA_SRC, 'bulkUpsertTimeSlotAssignments');
assert(bulkBody.length > 0, 'located bulkUpsertTimeSlotAssignments method body');
assert(/onConflict:\s*['"]student_id,branch_id,schedule_type,time_slot_index,effective_from['"]/.test(bulkBody),
    'bulkUpsertTimeSlotAssignments conflict target includes time_slot_index');

// ============================================================================
// 3. admin-v2.js — render path + per-slot delete + drag uses fromSlotIndex
// ============================================================================
console.log('\n=== admin-v2.js multi-slot render + write paths ======================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

assert(/student\.timeSlotIndexes\?\.includes\(slotIndex\)|student\.timeSlotIndexes && student\.timeSlotIndexes\.includes\(slotIndex\)|Array\.isArray\(student\.timeSlotIndexes\)[\s\S]{0,80}\.includes\(slotIndex\)/.test(ADMIN_SRC),
    'getStudentsForTimeSlot filters by timeSlotIndexes.includes(slotIndex)');
assert(/timeSlotIndexes\s*=\s*Array\.from\(assignmentMap\.get\(student\.id\)\)/.test(ADMIN_SRC),
    'loadAttendanceData builds student.timeSlotIndexes from assignmentMap (studentId → Set<slot>)');
assert(/student\.timeSlotIndexes\s*=\s*\[slot\]/.test(ADMIN_SRC),
    'initializeStudentTimeSlots writes timeSlotIndexes = [slot] for Halyk auto-seed');

const delBody = fnBody(ADMIN_SRC, 'deleteStudentFromCalendar');
assert(delBody.length > 0, 'located deleteStudentFromCalendar function body');
assert(/async function deleteStudentFromCalendar\(studentId, studentName, slotIndex\)/.test(ADMIN_SRC),
    'deleteStudentFromCalendar accepts slotIndex as third argument');
assert(/p_time_slot_index\s*:\s*slotIndex/.test(delBody),
    'deleteStudentFromCalendar forwards the row-context slotIndex to hide_student_versioned');
assert(/student\.timeSlotIndexes\s*=\s*student\.timeSlotIndexes\.filter\(i\s*=>\s*i !== slotIndex\)/.test(delBody),
    'deleteStudentFromCalendar removes only the targeted slot from local state');

const moveBody = fnBody(ADMIN_SRC, 'moveStudentToTimeSlot');
assert(moveBody.length > 0, 'located moveStudentToTimeSlot function body');
assert(/async function moveStudentToTimeSlot\(studentId, fromSlotIndex, toSlotId, toSlotIndex\)/.test(ADMIN_SRC),
    'moveStudentToTimeSlot takes both fromSlotIndex and toSlotIndex');
assert(/next\.delete\(fromSlotIndex\)/.test(moveBody),
    'drag removes fromSlotIndex from local timeSlotIndexes');
assert(/next\.add\(toSlotIndex\)/.test(moveBody),
    'drag adds toSlotIndex to local timeSlotIndexes');
assert(/hide_student_versioned[\s\S]+p_time_slot_index\s*:\s*fromSlotIndex/.test(moveBody),
    'drag hides the source slot via per-slot hide_student_versioned RPC');

const dropBody = fnBody(ADMIN_SRC, 'handleSlotDrop');
assert(dropBody.length > 0, 'located handleSlotDrop function body');
assert(/time-slot-\(\\d\+\)/.test(dropBody),
    'handleSlotDrop derives fromSlotIndex from draggedFromSlotId (`time-slot-N`)');
assert(/moveStudentToTimeSlot\(draggedStudentId, fromSlotIndex, targetSlotId, targetSlotIndex\)/.test(dropBody),
    'handleSlotDrop threads fromSlotIndex into moveStudentToTimeSlot');

// Menus are slot-scoped so multi-slot rows each get their own action menu.
assert(/`student-menu-\$\{studentId\}-slot-\$\{slotIndex\}`/.test(ADMIN_SRC),
    'student action menu DOM id is slot-scoped (`student-menu-${studentId}-slot-${slotIndex}`)');

// Capacity check uses the multi-slot shape (array/Set) with scalar fallback.
const capacityBlock = ADMIN_SRC.slice(ADMIN_SRC.indexOf('Check slot capacity before adding'));
assert(/Array\.isArray\(slotsForSchedule\)[\s\S]{0,200}includes\(timeSlotIndex\)/.test(capacityBlock),
    'capacity check supports array timeSlotAssignments[schedule] shape');

// ============================================================================
// 4. JS port of the per-slot hide_student_versioned semantics
// ============================================================================
console.log('\n=== per-slot hide_student_versioned semantics ========================\n');

function newDb() { return { rows: [], nextId: 1 }; }
function uid(n) { return `as-${n.toString().padStart(8, '0')}`; }

// In-memory port of migration 061's hide_student_versioned RPC. Mirrors the
// SQL exactly: per-slot resolution, hidden=TRUE on the new/updated row.
function hideStudentVersioned(db, { p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from }) {
    const existing = db.rows
        .filter(r => r.student_id === p_student_id
            && r.branch_id === p_branch_id
            && r.schedule_type === p_schedule_type
            && r.time_slot_index === p_time_slot_index
            && r.effective_from <= p_effective_from)
        .sort((a, b) => a.effective_from < b.effective_from ? 1 : -1)[0];

    if (!existing) {
        // Migration 054 semantic preserved: insert a fresh hidden row.
        const row = {
            id: uid(db.nextId++),
            student_id: p_student_id,
            branch_id: p_branch_id,
            schedule_type: p_schedule_type,
            time_slot_index: p_time_slot_index,
            effective_from: p_effective_from,
            hidden: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        db.rows.push(row);
        return row;
    }
    if (existing.effective_from === p_effective_from) {
        existing.hidden = true;
        existing.updated_at = new Date().toISOString();
        return existing;
    }
    const row = {
        id: uid(db.nextId++),
        student_id: existing.student_id,
        branch_id: existing.branch_id,
        schedule_type: existing.schedule_type,
        time_slot_index: existing.time_slot_index,
        effective_from: p_effective_from,
        hidden: true,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
    };
    db.rows.push(row);
    return row;
}

// In-memory port of upsertTimeSlotAssignment (active row at the 1970 baseline,
// then clear future per-slot hides + legacy schedule-wide -1 rows).
function upsertTimeSlotAssignment(db, { studentId, branchId, scheduleType, timeSlotIndex }) {
    const existing = db.rows.find(r =>
        r.student_id === studentId
        && r.branch_id === branchId
        && r.schedule_type === scheduleType
        && r.time_slot_index === timeSlotIndex
        && r.effective_from === '1970-01-01');
    if (existing) {
        existing.hidden = false;
        existing.updated_at = new Date().toISOString();
    } else {
        db.rows.push({
            id: uid(db.nextId++),
            student_id: studentId,
            branch_id: branchId,
            schedule_type: scheduleType,
            time_slot_index: timeSlotIndex,
            effective_from: '1970-01-01',
            hidden: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }
    // Clear future per-slot hides for THIS slot only.
    db.rows = db.rows.filter(r => !(
        r.student_id === studentId
        && r.branch_id === branchId
        && r.schedule_type === scheduleType
        && r.time_slot_index === timeSlotIndex
        && r.hidden === true
        && r.effective_from > '1970-01-01'));
    // Clear legacy schedule-wide -1 hide rows.
    db.rows = db.rows.filter(r => !(
        r.student_id === studentId
        && r.branch_id === branchId
        && r.schedule_type === scheduleType
        && r.time_slot_index === -1
        && r.effective_from > '1970-01-01'));
}

// In-memory port of getTimeSlotAssignments dedup logic.
function resolveAssignments(rows, monthEnd) {
    const sorted = rows
        .filter(r => r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => a.effective_from < b.effective_from ? 1 : -1);

    // Schedule-wide hidden pass: latest row across ALL slots per student.
    const scheduleWide = new Set();
    const seenStudent = new Set();
    for (const r of sorted) {
        if (seenStudent.has(r.student_id)) continue;
        seenStudent.add(r.student_id);
        if (r.time_slot_index === -1) scheduleWide.add(r.student_id);
    }

    // Per (student, slot) dedup.
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        if (r.time_slot_index < 0) continue;
        const key = `${r.student_id}|${r.time_slot_index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (r.hidden) continue;
        if (scheduleWide.has(r.student_id)) continue;
        out.push({ studentId: r.student_id, timeSlotIndex: r.time_slot_index });
    }
    return out;
}

// Scenario A: add to slot A → fetch → S in slot A only.
{
    const db = newDb();
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    const out = resolveAssignments(db.rows, '2026-06-30').filter(r => r.studentId === 'S');
    assertEqual(out, [{ studentId: 'S', timeSlotIndex: 0 }],
        'add slot A → fetch returns S only in slot A');
}

// Scenario B: add to slot A, then slot B → fetch → S in both A and B.
{
    const db = newDb();
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 1 });
    const slots = resolveAssignments(db.rows, '2026-06-30')
        .filter(r => r.studentId === 'S')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(slots, [0, 1],
        'add to slot A then slot B → fetch returns S in BOTH slots');
}

// Scenario C: add to A and B, then hide A → fetch → S still in B, gone from A.
{
    const db = newDb();
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 1 });
    hideStudentVersioned(db, {
        p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 0, p_effective_from: '2026-06-01',
    });
    const slots = resolveAssignments(db.rows, '2026-06-30')
        .filter(r => r.studentId === 'S')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(slots, [1],
        'hide from slot A → fetch returns S only in slot B');
}

// Scenario D: hide A on June, then check March view — past attendance unchanged.
{
    const db = newDb();
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 1 });
    hideStudentVersioned(db, {
        p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 0, p_effective_from: '2026-06-01',
    });

    // March view: slot A row at 1970 wins (hide is at 2026-06, not yet effective).
    const marSlots = resolveAssignments(db.rows, '2026-03-31')
        .filter(r => r.studentId === 'S')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(marSlots, [0, 1],
        'past month view (March) preserves S in slot A even after a June hide (migration 051/057 semantic)');

    // Same-month-as-hide view: also hides for March if we hide retroactively
    // — but here March precedes the hide effective_from, so it stays visible.
    const mayHideDb = newDb();
    upsertTimeSlotAssignment(mayHideDb, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    upsertTimeSlotAssignment(mayHideDb, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 1 });
    hideStudentVersioned(mayHideDb, {
        p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 0, p_effective_from: '2026-05-01',
    });
    const aprSlots = resolveAssignments(mayHideDb.rows, '2026-04-30')
        .filter(r => r.studentId === 'S')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(aprSlots, [0, 1],
        'past month view (April) preserves slot A even when hide is dated 2026-05-01');
}

// Scenario E: drag B → C — S ends up in A and C, gone from B.
{
    const db = newDb();
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 0 });
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 1 });
    // drag from slot B (=1) to slot C (=2): hide B + upsert C.
    hideStudentVersioned(db, {
        p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 1, p_effective_from: '2026-06-01',
    });
    upsertTimeSlotAssignment(db, { studentId: 'S', branchId: 'B', scheduleType: 'mon_wed', timeSlotIndex: 2 });
    const slots = resolveAssignments(db.rows, '2026-06-30')
        .filter(r => r.studentId === 'S')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(slots, [0, 2],
        'drag from slot B to slot C → S now in slots A and C, not B');
}

// Scenario F: legacy schedule-wide hide (-1 row) still hides in current month.
{
    const db = newDb();
    // baseline slot 7 + legacy -1 at 2026-06-01
    db.rows.push({
        id: uid(db.nextId++),
        student_id: 'L', branch_id: 'B', schedule_type: 'tue_thu',
        time_slot_index: 7, effective_from: '1970-01-01', hidden: false,
    });
    db.rows.push({
        id: uid(db.nextId++),
        student_id: 'L', branch_id: 'B', schedule_type: 'tue_thu',
        time_slot_index: -1, effective_from: '2026-06-01', hidden: false,
    });
    const cur = resolveAssignments(db.rows, '2026-06-30').filter(r => r.studentId === 'L');
    assertEqual(cur, [],
        'legacy time_slot_index=-1 row continues to mean schedule-wide hide for current month');
    const past = resolveAssignments(db.rows, '2026-05-31').filter(r => r.studentId === 'L');
    assertEqual(past, [{ studentId: 'L', timeSlotIndex: 7 }],
        'legacy schedule-wide hide does NOT affect past months (slot 7 still rendered in May)');
}

// Scenario G: re-add after legacy schedule-wide hide unhides them.
{
    const db = newDb();
    db.rows.push({
        id: uid(db.nextId++),
        student_id: 'L', branch_id: 'B', schedule_type: 'tue_thu',
        time_slot_index: 7, effective_from: '1970-01-01', hidden: false,
    });
    db.rows.push({
        id: uid(db.nextId++),
        student_id: 'L', branch_id: 'B', schedule_type: 'tue_thu',
        time_slot_index: -1, effective_from: '2026-06-01', hidden: false,
    });
    upsertTimeSlotAssignment(db, { studentId: 'L', branchId: 'B', scheduleType: 'tue_thu', timeSlotIndex: 7 });
    const cur = resolveAssignments(db.rows, '2026-06-30')
        .filter(r => r.studentId === 'L')
        .map(r => r.timeSlotIndex)
        .sort();
    assertEqual(cur, [7],
        're-adding to slot 7 clears the legacy schedule-wide -1 row and unhides the student');
}

// ============================================================================
// 5. Live end-to-end (PRD verification step 1)
// ============================================================================
async function runLive() {
    if (!createClient) {
        console.log('\n=== Live DB tests SKIPPED (no @supabase/supabase-js available) ===\n');
        return;
    }
    const SUPABASE_URL = 'https://papgcizhfkngubwofjuo.supabase.co';
    const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGdjaXpoZmtuZ3Vid29manVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTkzMDM1MSwiZXhwIjoyMDc3NTA2MzUxfQ.XwEjEJIxZ6J_3C9UZQ3hvrlm3GsfOCxMz3lYUK_trKg';
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Use a test student + branch from the live project. The migration's
    // unique key on (student, branch, schedule, slot, effective_from) lets
    // us seed and clean up freely without collisions.
    const TEST_STUDENT = '96f38386-cfb9-4582-ad90-8b005f5fe19e';
    const TEST_BRANCH  = '7d1946c8-183b-4ad9-8f49-77402bac2210'; // Almaty-1
    const SCHEDULE     = 'mon_wed';
    const SLOT_A = 0;
    const SLOT_B = 1;
    const SLOT_C = 2;
    const SLOT_X_PAST = 0;
    const MONTH_NOW   = '2026-06-30';
    const MONTH_PAST  = '2026-03-31';
    const HIDE_FROM_DATE = '2026-06-01';

    async function cleanup() {
        await supabase
            .from('student_time_slot_assignments')
            .delete()
            .eq('student_id', TEST_STUDENT)
            .eq('branch_id', TEST_BRANCH)
            .eq('schedule_type', SCHEDULE);
    }

    async function rowsForTest() {
        const { data, error } = await supabase
            .from('student_time_slot_assignments')
            .select('student_id, time_slot_index, effective_from, hidden')
            .eq('student_id', TEST_STUDENT)
            .eq('branch_id', TEST_BRANCH)
            .eq('schedule_type', SCHEDULE)
            .order('effective_from', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    function inMemoryResolve(rows, monthEnd) {
        return resolveAssignments(rows, monthEnd).filter(r => r.studentId === TEST_STUDENT);
    }

    try {
        // Pre-clean: leave no residue from prior failed runs.
        await cleanup();

        console.log('\n=== Live: PRD scenarios end-to-end against Supabase ==============\n');

        // (A) Add S to slot A.
        {
            const { error } = await supabase
                .from('student_time_slot_assignments')
                .upsert([{
                    student_id: TEST_STUDENT,
                    branch_id: TEST_BRANCH,
                    schedule_type: SCHEDULE,
                    time_slot_index: SLOT_A,
                    effective_from: '1970-01-01',
                    hidden: false,
                    updated_at: new Date().toISOString(),
                }], {
                    onConflict: 'student_id,branch_id,schedule_type,time_slot_index,effective_from',
                });
            assert(!error, `add to slot A succeeds (live insert): ${error ? error.message : 'ok'}`);
            const rows = await rowsForTest();
            const resolved = inMemoryResolve(rows, MONTH_NOW).map(r => r.timeSlotIndex).sort();
            assertEqual(resolved, [SLOT_A], 'live: S resolved to slot A only after add');
        }

        // (B) Add S to slot B — both slots now active.
        {
            const { error } = await supabase
                .from('student_time_slot_assignments')
                .upsert([{
                    student_id: TEST_STUDENT,
                    branch_id: TEST_BRANCH,
                    schedule_type: SCHEDULE,
                    time_slot_index: SLOT_B,
                    effective_from: '1970-01-01',
                    hidden: false,
                    updated_at: new Date().toISOString(),
                }], {
                    onConflict: 'student_id,branch_id,schedule_type,time_slot_index,effective_from',
                });
            assert(!error, `add to slot B succeeds (live insert): ${error ? error.message : 'ok'}`);
            const rows = await rowsForTest();
            const resolved = inMemoryResolve(rows, MONTH_NOW).map(r => r.timeSlotIndex).sort();
            assertEqual(resolved, [SLOT_A, SLOT_B],
                'live: S resolved to BOTH slot A and slot B after adding the second slot');
        }

        // (C) Hide slot A — S should remain in slot B only for current month.
        {
            const { error } = await supabase.rpc('hide_student_versioned', {
                p_student_id: TEST_STUDENT,
                p_branch_id: TEST_BRANCH,
                p_schedule_type: SCHEDULE,
                p_time_slot_index: SLOT_A,
                p_effective_from: HIDE_FROM_DATE,
            });
            assert(!error, `hide_student_versioned RPC succeeds for slot A: ${error ? error.message : 'ok'}`);
            const rows = await rowsForTest();
            const resolved = inMemoryResolve(rows, MONTH_NOW).map(r => r.timeSlotIndex).sort();
            assertEqual(resolved, [SLOT_B],
                'live: hide slot A — S now resolved to slot B only (current month)');
        }

        // (D) Past month view preserves slot A (effective-dating).
        {
            const rows = await rowsForTest();
            const resolved = inMemoryResolve(rows, MONTH_PAST).map(r => r.timeSlotIndex).sort();
            assertEqual(resolved, [SLOT_A, SLOT_B],
                'live: past month (March) preserves S in slot A even after a June hide');
        }

        // (E) Drag B → C — hide slot B, upsert slot C.
        {
            const { error: hideErr } = await supabase.rpc('hide_student_versioned', {
                p_student_id: TEST_STUDENT,
                p_branch_id: TEST_BRANCH,
                p_schedule_type: SCHEDULE,
                p_time_slot_index: SLOT_B,
                p_effective_from: HIDE_FROM_DATE,
            });
            assert(!hideErr, `hide_student_versioned RPC succeeds for slot B (drag away): ${hideErr ? hideErr.message : 'ok'}`);
            const { error: upErr } = await supabase
                .from('student_time_slot_assignments')
                .upsert([{
                    student_id: TEST_STUDENT,
                    branch_id: TEST_BRANCH,
                    schedule_type: SCHEDULE,
                    time_slot_index: SLOT_C,
                    effective_from: '1970-01-01',
                    hidden: false,
                    updated_at: new Date().toISOString(),
                }], {
                    onConflict: 'student_id,branch_id,schedule_type,time_slot_index,effective_from',
                });
            assert(!upErr, `add to slot C succeeds (live insert, drag target): ${upErr ? upErr.message : 'ok'}`);

            const rows = await rowsForTest();
            const resolved = inMemoryResolve(rows, MONTH_NOW).map(r => r.timeSlotIndex).sort();
            // Slot A is also hidden as of June from scenario (C), so only C remains
            // active in June. Past months keep A and the pre-drag B membership.
            assertEqual(resolved, [SLOT_C],
                'live: after drag, current month resolves to slot C (A still hidden from earlier step, B newly hidden)');

            const pastResolved = inMemoryResolve(rows, MONTH_PAST).map(r => r.timeSlotIndex).sort();
            // Past months see every baseline (eff=1970) active row that
            // wasn't hidden BEFORE the past month. None of our hides are
            // effective before March, so March resolves to all three
            // baseline slots — A, B, and the newly-added C. Confirms the
            // drag hides did NOT retroactively rewrite past attendance.
            assertEqual(pastResolved, [SLOT_A, SLOT_B, SLOT_C],
                'live: past month shows A + B + C — June hides do not retroactively hide March');
            void SLOT_X_PAST;
        }
    } finally {
        await cleanup();
    }
}

(async () => {
    try {
        await runLive();
    } catch (e) {
        console.error('Live test error:', e && e.message ? e.message : e);
        failed += 1;
    }
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})();
