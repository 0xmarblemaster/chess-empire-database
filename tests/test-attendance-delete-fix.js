/**
 * Tests for the attendance resurrection fix (migrations 085 + 086,
 * supabase-data.js, admin-v2.js). See tasks/attendance-delete-fix-20260916.md.
 *
 * Layered like test-slot-stable-id.js:
 *   1. Source-contract regex checks across migrations 085/086 and the JS
 *      read/write paths (catches accidental drift).
 *   2. JS ports of the dedupe/shadow/exclusion read logic + the dual-chain
 *      hide, exercised against in-memory data, proving:
 *        - modern-row delete
 *        - legacy-row delete
 *        - mixed modern+legacy duplicate (the "Sabit Alimansur" case)
 *        - exclusion blocks resurrection
 *        - explicit re-add clears the exclusion
 *        - fail-open when the exclusions table is missing
 *
 * Run: node tests/test-attendance-delete-fix.js
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

// Extract a method body by its DEFINITION (`async name(` / `name(`), skipping
// call-sites like `this.name(` that would otherwise match first.
function methodBody(src, name) {
    const re = new RegExp(`(?<![.\\w])(?:async\\s+)?${name}\\s*\\(`, 'g');
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
// 1. Migration 085 — hide every chain + backfill trigger
// ============================================================================
console.log('\n=== migration 085_hide_student_all_chains.sql =======================\n');

const MIG85_PATH = path.join(ROOT, 'supabase/migrations/085_hide_student_all_chains.sql');
assert(fs.existsSync(MIG85_PATH), 'supabase/migrations/085_… exists');
const MIG85 = fs.existsSync(MIG85_PATH) ? fs.readFileSync(MIG85_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG85), 'wrapped in BEGIN;…COMMIT;');
assert(/CREATE OR REPLACE FUNCTION hide_student_chain\(/.test(MIG85),
    'defines the private hide_student_chain helper');
assert(/p_insert_if_missing BOOLEAN/.test(MIG85),
    'hide_student_chain takes p_insert_if_missing (only the primary chain inserts)');
assert(/IF NOT p_insert_if_missing THEN\s+RETURN v_empty;/.test(MIG85),
    'secondary chains never fabricate a fresh hidden row');
// STRICT legacy guard (fixes 077 vacuous OR-clause)
assert(/logical_slot_id IS NULL\s+AND time_slot_index = p_time_slot_index/.test(MIG85),
    'legacy chain lookup is STRICTLY logical_slot_id IS NULL (fixes 077 vacuous guard)');
assert(!/\(p_logical_slot_id IS NULL OR logical_slot_id IS NULL\)/.test(MIG85),
    'the vacuous 077 fallback guard is gone');
// dual-chain hide in hide_student_versioned
const hsv85 = MIG85.slice(MIG85.indexOf('FUNCTION hide_student_versioned'));
assert(/v_primary := hide_student_chain\([\s\S]+?p_logical_slot_id, TRUE\)/.test(hsv85),
    'hide_student_versioned hides the logical-id chain (insert-if-missing) as primary');
assert(/v_legacy := hide_student_chain\([\s\S]+?NULL, FALSE\)/.test(hsv85),
    'hide_student_versioned ALSO shadows the legacy NULL-logical chain (no insert)');
assert(/GRANT EXECUTE ON FUNCTION hide_student_versioned\(UUID, UUID, TEXT, INT, DATE, UUID\) TO authenticated/.test(MIG85),
    'grants EXECUTE on the 6-arg hide_student_versioned');
assert(/SECURITY INVOKER/.test(MIG85), 'stays SECURITY INVOKER (RLS unchanged)');
assert(/COALESCE\(p_logical_slot_id, v_existing\.logical_slot_id\)/.test(MIG85),
    'preserves 076/077 semantics (COALESCE the logical id, never null it)');
// backfill trigger (write-path fix)
assert(/CREATE OR REPLACE FUNCTION backfill_assignment_logical_slot_id\(\)/.test(MIG85),
    'defines the logical_slot_id backfill trigger function');
assert(/BEFORE INSERT ON student_time_slot_assignments/.test(MIG85),
    'backfill runs BEFORE INSERT on student_time_slot_assignments');
assert(/NEW\.logical_slot_id IS NULL AND NEW\.time_slot_index >= 0/.test(MIG85),
    'backfill only fires for NULL-logical rows with a real slot index');
assert(/JOIN students s ON s\.id = NEW\.student_id[\s\S]+?ts\.coach_id\s+= s\.coach_id/.test(MIG85),
    'backfill resolves via the student coach + schedule + slot_index');

// ============================================================================
// 2. Migration 086 — hard exclusion table
// ============================================================================
console.log('\n=== migration 086_student_slot_exclusions.sql =======================\n');

const MIG86_PATH = path.join(ROOT, 'supabase/migrations/086_student_slot_exclusions.sql');
assert(fs.existsSync(MIG86_PATH), 'supabase/migrations/086_… exists');
const MIG86 = fs.existsSync(MIG86_PATH) ? fs.readFileSync(MIG86_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG86), 'wrapped in BEGIN;…COMMIT;');
assert(/CREATE TABLE IF NOT EXISTS student_slot_exclusions/.test(MIG86),
    'creates student_slot_exclusions');
assert(/logical_slot_id UUID,/.test(MIG86), 'logical_slot_id is NULLABLE');
assert(/time_slot_index INT NOT NULL/.test(MIG86), 'time_slot_index (physical) is NOT NULL');
assert(/active\s+BOOLEAN NOT NULL DEFAULT TRUE/.test(MIG86), 'has an active flag defaulting TRUE');
assert(/created_at\s+TIMESTAMPTZ/.test(MIG86) && /created_by\s+UUID/.test(MIG86),
    'has created_at + created_by');
assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_student_slot_exclusions_slot\s+ON student_slot_exclusions \(student_id, branch_id, schedule_type, time_slot_index\)/.test(MIG86),
    'unique per (student, branch, schedule, physical slot) — supports upsert onConflict');
assert(/ENABLE ROW LEVEL SECURITY/.test(MIG86), 'RLS enabled');
assert(/CREATE POLICY "Dashboard users manage student slot exclusions"[\s\S]+?FROM user_roles/.test(MIG86),
    'RLS mirrors migration 079 (any user_roles row manages exclusions)');
assert(/students\(id\) ON DELETE CASCADE/.test(MIG86),
    'student_id FK cascades on student delete');

// ============================================================================
// 3. supabase-data.js — read filter + write path
// ============================================================================
console.log('\n=== supabase-data.js source contract ================================\n');

const SDATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

const getBody = methodBody(SDATA_SRC, 'getTimeSlotAssignments');
assert(/resolved = await this\._applySlotExclusions\(resolved, branchId, scheduleType\)/.test(getBody),
    'getTimeSlotAssignments applies the exclusion filter as the FINAL step');

const applyBody = methodBody(SDATA_SRC, '_applySlotExclusions');
assert(/\.from\('student_slot_exclusions'\)/.test(applyBody) && /\.eq\('active', true\)/.test(applyBody),
    '_applySlotExclusions reads only ACTIVE exclusions');
assert(/if \(error \|\| !data\) return resolved;/.test(applyBody),
    '_applySlotExclusions fails open (returns input) when the table is absent');
assert(/excludedByLogical\.has/.test(applyBody) && /excludedByIndex\.has/.test(applyBody),
    '_applySlotExclusions excludes by logical id OR physical index');

const addExclBody = methodBody(SDATA_SRC, 'addStudentSlotExclusion');
assert(/onConflict: 'student_id,branch_id,schedule_type,time_slot_index'/.test(addExclBody),
    'addStudentSlotExclusion upserts one row per (student, branch, schedule, slot)');
assert(/return false;/.test(addExclBody) && /catch \(e\)/.test(addExclBody),
    'addStudentSlotExclusion fails open on error');

const deacBody = methodBody(SDATA_SRC, 'deactivateStudentSlotExclusion');
assert(/\.update\(\{ active: false \}\)/.test(deacBody),
    'deactivateStudentSlotExclusion flips active=false');
assert(/logicalSlotId\s*\n?\s*\?\s*query\.eq\('logical_slot_id', logicalSlotId\)\s*\n?\s*:\s*query\.eq\('time_slot_index', timeSlotIndex\)/.test(deacBody),
    'deactivate scopes by logical id when known, else by physical index');

const upsertBody = methodBody(SDATA_SRC, 'upsertTimeSlotAssignment');
assert(/if \(!logicalSlotId\) \{\s+logicalSlotId = await this\._resolveLogicalSlotId\(/.test(upsertBody),
    'upsertTimeSlotAssignment resolves logical_slot_id before insert (no new legacy rows)');
assert(/await this\.deactivateStudentSlotExclusion\(/.test(upsertBody),
    'upsertTimeSlotAssignment clears the exclusion on explicit re-add');
const resolveBody = methodBody(SDATA_SRC, '_resolveLogicalSlotId');
assert(/\.from\('time_slots'\)[\s\S]+?\.eq\('slot_index', timeSlotIndex\)/.test(resolveBody),
    '_resolveLogicalSlotId resolves via the time_slots chain');

// ============================================================================
// 4. admin-v2.js — delete writes exclusions, add/move clear them
// ============================================================================
console.log('\n=== admin-v2.js source contract =====================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const delCount = (ADMIN_SRC.match(/addStudentSlotExclusion\?\.\(/g) || []).length;
assert(delCount >= 2, 'deleteStudentFromCalendar writes exclusions on both the chain + fallback paths');
const clrCount = (ADMIN_SRC.match(/deactivateStudentSlotExclusion\?\.\(/g) || []).length;
assert(clrCount >= 2, 'add-student and move paths both clear the exclusion (explicit re-add)');

// ============================================================================
// 5. JS ports — the read/hide/exclusion logic against in-memory data
// ============================================================================
console.log('\n=== JS port: dual-chain hide + dedupe + exclusion ===================\n');

let _aid = 1;
function aid() { return `a-${(_aid++).toString().padStart(4, '0')}`; }

// Port of hide_student_chain (migration 085).
function hideChain(rows, {
    p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
    p_effective_from, p_logical_slot_id, p_insert_if_missing,
}) {
    const same = r => r.student_id === p_student_id && r.branch_id === p_branch_id &&
        r.schedule_type === p_schedule_type && r.effective_from <= p_effective_from;
    const latest = list => list.slice()
        .sort((a, b) => a.effective_from < b.effective_from ? 1 : -1)[0] || null;

    let existing;
    if (p_logical_slot_id) {
        existing = latest(rows.filter(r => same(r) && r.logical_slot_id === p_logical_slot_id));
    } else {
        existing = latest(rows.filter(r => same(r) && r.logical_slot_id == null &&
            r.time_slot_index === p_time_slot_index));
    }

    if (!existing) {
        if (!p_insert_if_missing) return null;
        const row = { id: aid(), student_id: p_student_id, branch_id: p_branch_id,
            schedule_type: p_schedule_type, time_slot_index: p_time_slot_index,
            effective_from: p_effective_from, hidden: true, logical_slot_id: p_logical_slot_id || null };
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
        // preserve the chain identity: NULL stays NULL for legacy chains
        logical_slot_id: p_logical_slot_id || existing.logical_slot_id || null };
    rows.push(row); return row;
}

// Port of hide_student_versioned (migration 085): hide BOTH chains.
function hideStudentVersioned(rows, args) {
    if (args.p_logical_slot_id) {
        const primary = hideChain(rows, { ...args, p_insert_if_missing: true });
        hideChain(rows, { ...args, p_logical_slot_id: null, p_insert_if_missing: false });
        return primary;
    }
    return hideChain(rows, { ...args, p_logical_slot_id: null, p_insert_if_missing: true });
}

// Port of getTimeSlotAssignments dedupe + exclusion filter.
function visibleSlots(rows, branch_id, schedule_type, monthEnd, exclusions = []) {
    const data = rows
        .filter(r => r.branch_id === branch_id && r.schedule_type === schedule_type && r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => a.student_id !== b.student_id
            ? (a.student_id < b.student_id ? -1 : 1)
            : (a.effective_from < b.effective_from ? 1 : -1)); // effective_from DESC
    const seen = new Set();
    let out = [];
    for (const d of data) {
        if (d.time_slot_index < 0) continue;
        const slotKey = d.logical_slot_id || `idx:${d.time_slot_index}`;
        const key = `${d.student_id}|${slotKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (d.hidden === true) continue;
        out.push({ studentId: d.student_id, timeSlotIndex: d.time_slot_index, logicalSlotId: d.logical_slot_id || null });
    }
    // Exclusion filter (migration 086) — the FINAL step.
    const exLogical = new Set();
    const exIndex = new Set();
    for (const e of exclusions.filter(e => e.active !== false)) {
        if (e.logical_slot_id) exLogical.add(`${e.student_id}|${e.logical_slot_id}`);
        exIndex.add(`${e.student_id}|idx:${e.time_slot_index}`);
    }
    out = out.filter(r =>
        !(r.logicalSlotId && exLogical.has(`${r.studentId}|${r.logicalSlotId}`)) &&
        !exIndex.has(`${r.studentId}|idx:${r.timeSlotIndex}`));
    return out;
}

// --- modern-row delete: student in a single modern slot, deleted cleanly.
{
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 4, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L4' },
    ];
    hideStudentVersioned(rows, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 4, p_effective_from: '2026-09-01', p_logical_slot_id: 'L4' });
    assert(!visibleSlots(rows, 'B', 'mon_wed', '2026-09-30').some(a => a.studentId === 'S'),
        'modern-row delete: S is gone in September');
    assert(visibleSlots(rows, 'B', 'mon_wed', '2026-08-31').some(a => a.studentId === 'S'),
        'modern-row delete: August (before the hide) still shows S');
}

// --- legacy-row delete: student's only row is a legacy NULL-logical row.
{
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: null },
    ];
    // A pure legacy delete (no logical id resolved) at the physical index.
    hideStudentVersioned(rows, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 5, p_effective_from: '2026-09-01', p_logical_slot_id: null });
    assert(!visibleSlots(rows, 'B', 'mon_wed', '2026-09-30').some(a => a.studentId === 'S'),
        'legacy-row delete: S is gone in September');
    // The hide preserves NULL logical identity so its shadow key stays idx:5.
    const hide = rows.find(r => r.hidden === true && r.effective_from === '2026-09-01');
    assert(hide && hide.logical_slot_id === null && hide.time_slot_index === 5,
        'legacy hide keeps NULL logical identity (shadow key idx:5)');
}

// --- THE SABIT CASE: delete resolves the slot's logical id, but the row that
//     renders the student is a legacy NULL row at that physical index.
{
    const rows = [
        // legacy NULL-logical row rendering S at physical idx 5 (the resurrecting row)
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: null },
    ];
    // Coach deletes slot 5 — the write path resolved slot 5's logical id L5.
    hideStudentVersioned(rows, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 5, p_effective_from: '2026-09-01', p_logical_slot_id: 'L5' });

    const sept = visibleSlots(rows, 'B', 'mon_wed', '2026-09-30');
    assert(!sept.some(a => a.studentId === 'S'),
        'Sabit case: S no longer renders in Sept (the legacy idx:5 row is ALSO shadowed)');

    // Prove the OLD single-chain behavior would have left S visible: only the
    // logical chain gets a hide (keyed L5), the idx:5 legacy row survives.
    const rowsOld = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: null },
    ];
    hideChain(rowsOld, { p_student_id: 'S', p_branch_id: 'B', p_schedule_type: 'mon_wed',
        p_time_slot_index: 5, p_effective_from: '2026-09-01', p_logical_slot_id: 'L5', p_insert_if_missing: true });
    assert(visibleSlots(rowsOld, 'B', 'mon_wed', '2026-09-30').some(a => a.studentId === 'S'),
        'Sabit case: single-chain (logical-only) hide leaves S resurrecting — the original bug');
}

// --- exclusion blocks resurrection even when a garbage visible row exists.
{
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: null },
    ];
    const exclusions = [{ student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
        time_slot_index: 5, logical_slot_id: 'L5', active: true }];
    const sept = visibleSlots(rows, 'B', 'mon_wed', '2026-09-30', exclusions);
    assert(!sept.some(a => a.studentId === 'S'),
        'exclusion blocks resurrection despite a stale visible idx:5 row');
}

// --- explicit re-add clears the exclusion (active=false → student renders).
{
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L5' },
    ];
    const exclusions = [{ student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
        time_slot_index: 5, logical_slot_id: 'L5', active: false }]; // re-add flipped it off
    const sept = visibleSlots(rows, 'B', 'mon_wed', '2026-09-30', exclusions);
    assert(sept.some(a => a.studentId === 'S'),
        'a deactivated exclusion no longer blocks the student (explicit re-add)');
}

// --- fail-open: exclusions unavailable → read path behaves as before.
{
    const rows = [
        { id: aid(), student_id: 'S', branch_id: 'B', schedule_type: 'mon_wed',
          time_slot_index: 5, effective_from: '1970-01-01', hidden: false, logical_slot_id: 'L5' },
    ];
    // No exclusions passed (table missing / query errored → helper returns input).
    const sept = visibleSlots(rows, 'B', 'mon_wed', '2026-09-30', []);
    assert(sept.some(a => a.studentId === 'S'),
        'fail-open: with no exclusions the student renders normally');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
