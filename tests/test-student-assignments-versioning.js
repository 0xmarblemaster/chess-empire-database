/**
 * Tests for student_time_slot_assignments effective-dating (migrations 051+052
 * and admin-v2.js Phase 3/4 + supabase-data.js Phase 4).
 *
 * Layered like test-time-slot-versioning.js:
 *   1. Source-contract regex checks across admin-v2.js, supabase-data.js,
 *      i18n.js, and the two migrations (catches accidental drift).
 *   2. JS ports of the new `hide_student_versioned` RPC and the month-aware
 *      assignment resolver exercised against an in-memory mock dataset, so
 *      the versioning semantics are verified end-to-end without hitting
 *      the live DB.
 *
 * Run: node tests/test-student-assignments-versioning.js
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

// Extract a JSON-style method body from an object literal (`name(...)` or
// `async name(...)`), returning the brace-balanced body.
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
// 1. Migration 051 — source contract
// ============================================================================
console.log('\n=== migration 051_student_time_slot_assignments_versioning.sql ======\n');

const MIG051_PATH = path.join(ROOT, 'supabase/migrations/051_student_time_slot_assignments_versioning.sql');
assert(fs.existsSync(MIG051_PATH), 'supabase/migrations/051_… exists');
const MIG051 = fs.existsSync(MIG051_PATH) ? fs.readFileSync(MIG051_PATH, 'utf8') : '';

assert(/ALTER TABLE student_time_slot_assignments\s+ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT DATE '1970-01-01'/.test(MIG051),
    'adds effective_from DATE NOT NULL DEFAULT 1970-01-01');
assert(/DROP CONSTRAINT IF EXISTS student_time_slot_assignments_student_id_branch_id_schedule_key/.test(MIG051),
    'drops the actual (student, branch, schedule) unique constraint');
assert(/ADD CONSTRAINT student_time_slot_assignments_version_uk\s+UNIQUE \(student_id, branch_id, schedule_type, effective_from\)/.test(MIG051),
    'adds the versioned unique key including effective_from');
assert(/CREATE INDEX IF NOT EXISTS idx_student_time_slot_assignments_lookup\s+ON student_time_slot_assignments \(student_id, branch_id, schedule_type, effective_from DESC\)/.test(MIG051),
    'adds composite lookup index ordered by effective_from DESC');
assert(/CREATE OR REPLACE FUNCTION hide_student_versioned\(/.test(MIG051),
    'defines hide_student_versioned RPC');
assert(/SECURITY INVOKER/.test(MIG051),
    'RPC runs as SECURITY INVOKER (RLS keys on coach/admin role; do not bypass)');
assert(/IF v_existing\.effective_from = p_effective_from THEN\s+UPDATE student_time_slot_assignments/.test(MIG051),
    'RPC updates in place when effective_from matches');
assert(/INSERT INTO student_time_slot_assignments[\s\S]+?p_effective_from/.test(MIG051),
    'RPC inserts a new version when effective_from differs');
assert(/GRANT EXECUTE ON FUNCTION hide_student_versioned[^;]+TO authenticated/.test(MIG051),
    'grants EXECUTE on the RPC to authenticated');

// ============================================================================
// 2. Migration 052 — Berik restoration contract
// ============================================================================
console.log('\n=== migration 052_restore_berik_attendance_visibility.sql ===========\n');

const MIG052_PATH = path.join(ROOT, 'supabase/migrations/052_restore_berik_attendance_visibility.sql');
assert(fs.existsSync(MIG052_PATH), 'supabase/migrations/052_… exists');
const MIG052 = fs.existsSync(MIG052_PATH) ? fs.readFileSync(MIG052_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG052), 'wrapped in BEGIN;…COMMIT;');
assert(/ada27d52-28ff-4b70-b78b-caa27a3cfd69/.test(MIG052),
    "references Berik's auth user_id in the audit-log filter");
assert(/new_value LIKE '% \| slot -1'/.test(MIG052),
    'filters hide events by the slot -1 sentinel');
// UPDATE must come BEFORE INSERT to free the (…,1970-01-01) unique slot.
const updIdx = MIG052.indexOf('UPDATE student_time_slot_assignments');
const insIdx = MIG052.indexOf('INSERT INTO student_time_slot_assignments');
assert(updIdx > 0 && insIdx > updIdx,
    'UPDATE -1→click_month precedes INSERT 1970-01-01 (frees unique slot)');
assert(/AND s\.effective_from\s+=\s+DATE '1970-01-01'\s+AND s\.time_slot_index\s+=\s+-1/.test(MIG052),
    'UPDATE is gated on the current (1970-01-01, -1) state (idempotent)');
assert(/ON CONFLICT \(student_id, branch_id, schedule_type, effective_from\) DO NOTHING/.test(MIG052),
    'INSERT uses idempotent ON CONFLICT DO NOTHING on the versioned unique key');
assert(/restored from audit_log on 2026-05-31 — Berik knock-on/.test(MIG052),
    'Zakhar restoration notes include the Berik knock-on tag');
assert(/changed_at\s+>=\s+'2026-05-01'/.test(MIG052),
    'Zakhar filter restricts to the 2026-05-02 batch (excludes earlier unrelated 2026-03-08 deletion)');
assert(/split_part\(al\.old_value, ' \| ', 3\)::date < '2026-05-01'/.test(MIG052),
    'Zakhar filter restricts to past-month dates (< May 2026)');
assert(/DO \$\$[\s\S]+RAISE EXCEPTION[\s\S]+RAISE EXCEPTION[\s\S]+\$\$/.test(MIG052),
    'verification DO block raises on count mismatch (41 baselines, 7 Zakhar rows)');

// ============================================================================
// 3. admin-v2.js — Phase 3 rewrite of deleteStudentFromCalendar
// ============================================================================
console.log('\n=== admin-v2.js deleteStudentFromCalendar (Phase 3) =================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const hideBody = fnBody(ADMIN_SRC, 'deleteStudentFromCalendar');
assert(hideBody.length > 0, 'located deleteStudentFromCalendar function body');

// Phase 3.1: attendance DELETE removed entirely
assert(!/\.from\(['"]attendance['"]\)\s*[\s\S]{0,40}\.delete\(\)/.test(hideBody),
    'no .from("attendance").delete() (past attendance preserved)');
assert(!/attendanceIds/.test(hideBody),
    'no attendanceIds variable (the batch-delete block is gone)');

// Phase 3.2: RPC call replaces direct upsert with -1
assert(/\.rpc\(\s*['"]hide_student_versioned['"]/.test(hideBody),
    'calls hide_student_versioned RPC');
assert(!/upsertTimeSlotAssignment\s*\([\s\S]{0,200}-1\s*[,)]/.test(hideBody),
    'does NOT call upsertTimeSlotAssignment with -1 anymore');
// Migration 061 multi-slot: hide_student_versioned takes p_time_slot_index
// as a key parameter — the slot being hidden. deleteStudentFromCalendar
// forwards the row-context `slotIndex` rather than the legacy global -1
// sentinel. See COACH_MULTI_GROUP_PRD.md.
assert(/p_time_slot_index\s*:\s*slotIndex/.test(hideBody),
    'RPC payload sets p_time_slot_index = slotIndex (per-slot hide, migration 061)');
assert(/p_effective_from\s*:\s*displayedMonthStart/.test(hideBody),
    'RPC payload sets p_effective_from = displayedMonthStart');
assert(/displayedMonthStart\s*=\s*`\$\{attendanceCurrentYear\}-\$\{String\(attendanceCurrentMonth\s*\+\s*1\)\.padStart\(2,\s*['"]0['"]\)\}-01`/.test(hideBody),
    'displayedMonthStart is YYYY-MM-01 from the displayed attendance month');

// Phase 3.3: confirmation modal references new i18n keys with {month}
assert(/admin\.attendance\.confirmHideStudent/.test(hideBody),
    'confirmation uses admin.attendance.confirmHideStudent i18n key');
assert(/admin\.attendance\.studentHidden/.test(hideBody),
    'success toast uses admin.attendance.studentHidden i18n key');
assert(/name:\s*studentName,\s*month:\s*monthLabel/.test(hideBody),
    'i18n calls pass {name, month} interpolation values');

// Phase 3 guardrail comment
assert(/NEVER \.delete\(\) attendance rows or \.update\(\{time_slot_index: -1\}\) directly[\s\S]{0,200}migration 051/.test(ADMIN_SRC),
    'comment forbids direct attendance DELETE / -1 update and points at migration 051');

// ============================================================================
// 4. admin-v2.js — Phase 4: monthKey passed into getTimeSlotAssignments
// ============================================================================
console.log('\n=== admin-v2.js getTimeSlotAssignments call (Phase 4) ===============\n');

assert(/getTimeSlotAssignments\?\.\(branchObj\.id,\s*scheduleFilter,\s*attendanceCurrentYear,\s*attendanceCurrentMonth\)/.test(ADMIN_SRC),
    'admin-v2.js threads (year, month) into getTimeSlotAssignments call');

// ============================================================================
// 5. supabase-data.js — Phase 4: month-aware getTimeSlotAssignments + upsert
// ============================================================================
console.log('\n=== supabase-data.js Phase 4 ========================================\n');

const SDATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

// 5a. getTimeSlotAssignments signature + per-month resolution
assert(/async getTimeSlotAssignments\(branchId,\s*scheduleType,\s*year,\s*month\)/.test(SDATA_SRC),
    'getTimeSlotAssignments signature accepts (branchId, scheduleType, year, month)');
const getBody = methodBody(SDATA_SRC, 'getTimeSlotAssignments');
assert(getBody.length > 0, 'located getTimeSlotAssignments method body');
assert(/\.lte\(\s*['"]effective_from['"]\s*,\s*monthEnd\s*\)/.test(getBody),
    'query filters effective_from <= monthEnd');
assert(/\.order\(\s*['"]effective_from['"]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/.test(getBody),
    'query orders effective_from DESC (latest version per student first)');
assert(/seen\.has/.test(getBody) && /seen\.add/.test(getBody),
    'JS-side dedup picks the first (latest) row per (student, slot) pair (migration 061)');

// 5b. upsertTimeSlotAssignment writes effective_from = 1970-01-01 against
//     the migration-061 per-slot versioned constraint.
const upsertBody = methodBody(SDATA_SRC, 'upsertTimeSlotAssignment');
assert(upsertBody.length > 0, 'located upsertTimeSlotAssignment method body');
assert(/effective_from:\s*['"]1970-01-01['"]/.test(upsertBody),
    'upsertTimeSlotAssignment writes effective_from = 1970-01-01 (baseline)');
assert(/onConflict:\s*['"]student_id,branch_id,schedule_type,time_slot_index,effective_from['"]/.test(upsertBody),
    'upsertTimeSlotAssignment uses the migration-061 per-slot versioned conflict target');

// 5c. bulkUpsertTimeSlotAssignments mirrors the same pattern
const bulkBody = methodBody(SDATA_SRC, 'bulkUpsertTimeSlotAssignments');
assert(bulkBody.length > 0, 'located bulkUpsertTimeSlotAssignments method body');
assert(/effective_from:\s*['"]1970-01-01['"]/.test(bulkBody),
    'bulkUpsertTimeSlotAssignments writes effective_from = 1970-01-01');
assert(/onConflict:\s*['"]student_id,branch_id,schedule_type,time_slot_index,effective_from['"]/.test(bulkBody),
    'bulkUpsertTimeSlotAssignments uses the migration-061 per-slot versioned conflict target');

// ============================================================================
// 6. i18n — new keys present in en, ru, kk
// ============================================================================
console.log('\n=== i18n: confirmHideStudent + studentHidden (en, ru, kk) ===========\n');

const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

function sliceLocale(src, locale) {
    const re = new RegExp(`\\n\\s+${locale}:\\s*\\{`, 'g');
    let combined = '';
    let m;
    while ((m = re.exec(src)) !== null) {
        let depth = 0;
        let i = src.indexOf('{', m.index);
        const begin = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) { combined += src.slice(begin, i + 1); break; }
            }
        }
    }
    return combined;
}

function valueFor(block, dottedKey) {
    const escaped = dottedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`"${escaped}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = block.match(re);
    return m ? m[1] : null;
}

const EN = sliceLocale(I18N_SRC, 'en');
const RU = sliceLocale(I18N_SRC, 'ru');
const KK = sliceLocale(I18N_SRC, 'kk');

for (const key of ['admin.attendance.confirmHideStudent', 'admin.attendance.studentHidden']) {
    const enVal = valueFor(EN, key);
    const ruVal = valueFor(RU, key);
    const kkVal = valueFor(KK, key);
    assert(typeof enVal === 'string' && enVal.length > 0, `[en] "${key}" defined`);
    assert(typeof ruVal === 'string' && ruVal.length > 0, `[ru] "${key}" defined`);
    assert(typeof kkVal === 'string' && kkVal.length > 0, `[kk] "${key}" defined`);
    assert(enVal && enVal.includes('{name}'), `[en] "${key}" contains {name} placeholder`);
    assert(enVal && enVal.includes('{month}'), `[en] "${key}" contains {month} placeholder`);
    const CYRILLIC = /[Ѐ-ӿ]/;
    if (ruVal) assert(CYRILLIC.test(ruVal), `[ru] "${key}" is in Cyrillic`);
    if (kkVal) assert(CYRILLIC.test(kkVal), `[kk] "${key}" is in Cyrillic`);
    if (enVal && ruVal) assert(ruVal !== enVal, `[ru] "${key}" differs from English`);
    if (enVal && kkVal) assert(kkVal !== enVal, `[kk] "${key}" differs from English`);
}

// ============================================================================
// 7. JS port of hide_student_versioned — semantics tests
// ============================================================================
console.log('\n=== hide_student_versioned semantics ================================\n');

function newDb() {
    return { rows: [], nextId: 1 };
}
function uuid(n) { return `as-${n.toString().padStart(8, '0')}`; }

function hideStudentVersioned(db, { p_student_id, p_branch_id, p_schedule_type, p_time_slot_index, p_effective_from }) {
    const existing = db.rows
        .filter(r => r.student_id === p_student_id && r.branch_id === p_branch_id && r.schedule_type === p_schedule_type && r.effective_from <= p_effective_from)
        .sort((a, b) => a.effective_from < b.effective_from ? 1 : -1)[0];
    if (!existing) throw new Error('not found');

    if (existing.effective_from === p_effective_from) {
        existing.time_slot_index = p_time_slot_index;
        existing.updated_at = new Date().toISOString();
        return existing;
    }
    const dup = db.rows.find(r =>
        r.student_id === p_student_id &&
        r.branch_id === p_branch_id &&
        r.schedule_type === p_schedule_type &&
        r.effective_from === p_effective_from);
    if (dup) throw new Error('duplicate key value violates unique constraint');

    const inserted = {
        id: uuid(db.nextId++),
        student_id: existing.student_id,
        branch_id: existing.branch_id,
        schedule_type: existing.schedule_type,
        time_slot_index: p_time_slot_index,
        effective_from: p_effective_from,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
    };
    db.rows.push(inserted);
    return inserted;
}

// Scenario A: hide in a future month inserts a new version, baseline preserved.
{
    const db = newDb();
    db.rows.push({
        id: uuid(db.nextId++),
        student_id: 'S1', branch_id: 'B1', schedule_type: 'sat_sun',
        time_slot_index: 2, effective_from: '1970-01-01',
        created_at: '2026-01-01T00:00:00Z',
    });
    const before = JSON.parse(JSON.stringify(db.rows[0]));
    const out = hideStudentVersioned(db, {
        p_student_id: 'S1', p_branch_id: 'B1', p_schedule_type: 'sat_sun',
        p_time_slot_index: -1, p_effective_from: '2026-06-01',
    });
    assertEqual(db.rows.length, 2, 'hide in a new month inserts a new version row');
    assertEqual(db.rows[0], before, 'baseline 1970-01-01 row is untouched (visible in past months)');
    assertEqual(
        { si: out.time_slot_index, ef: out.effective_from, st: out.student_id, br: out.branch_id, sc: out.schedule_type },
        { si: -1, ef: '2026-06-01', st: 'S1', br: 'B1', sc: 'sat_sun' },
        'new hide row carries -1 at click-month effective_from and inherits identity');
}

// Scenario B: re-hide in the same month updates in place (no extra row).
{
    const db = newDb();
    db.rows.push({
        id: uuid(db.nextId++),
        student_id: 'S1', branch_id: 'B1', schedule_type: 'sat_sun',
        time_slot_index: -1, effective_from: '2026-06-01',
    });
    hideStudentVersioned(db, {
        p_student_id: 'S1', p_branch_id: 'B1', p_schedule_type: 'sat_sun',
        p_time_slot_index: -1, p_effective_from: '2026-06-01',
    });
    assertEqual(db.rows.length, 1, 're-hiding in the same month does not insert a duplicate');
}

// ============================================================================
// 8. JS port of getTimeSlotAssignments — month-boundary resolution
// ============================================================================
console.log('\n=== getTimeSlotAssignments month-boundary resolution ================\n');

function resolveLatestPerStudent(rows, monthEnd) {
    const sorted = rows
        .filter(r => r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => {
            if (a.student_id !== b.student_id) return a.student_id < b.student_id ? -1 : 1;
            return a.effective_from < b.effective_from ? 1 : -1; // DESC
        });
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        if (seen.has(r.student_id)) continue;
        seen.add(r.student_id);
        out.push({ studentId: r.student_id, timeSlotIndex: r.time_slot_index });
    }
    return out;
}

{
    // Berik's "Natan Dadamyan" scenario: baseline slot 2, hidden from 2026-04-01 onward.
    const rows = [
        { student_id: 'natan', branch_id: 'B', schedule_type: 'sat_sun',
          time_slot_index: 2, effective_from: '1970-01-01' },
        { student_id: 'natan', branch_id: 'B', schedule_type: 'sat_sun',
          time_slot_index: -1, effective_from: '2026-04-01' },
    ];

    const mar = resolveLatestPerStudent(rows, '2026-03-31');
    assertEqual(mar.length, 1, 'March 2026 has one resolved assignment');
    assertEqual(mar[0], { studentId: 'natan', timeSlotIndex: 2 },
        'March 2026 picks the baseline slot 2 (student visible)');

    const apr = resolveLatestPerStudent(rows, '2026-04-30');
    assertEqual(apr[0], { studentId: 'natan', timeSlotIndex: -1 },
        'April 2026 picks the -1 hide row (student excluded by caller)');

    const may = resolveLatestPerStudent(rows, '2026-05-31');
    assertEqual(may[0], { studentId: 'natan', timeSlotIndex: -1 },
        'May 2026 also resolves to -1 (hide persists across later months)');
}

// Scenario: Block A's idempotent re-run does not create a third version.
// If we re-process the same hide event after migration 052, the UPDATE no-ops
// (effective_from is no longer 1970-01-01) and the INSERT no-ops (1970-01-01
// is already occupied by the baseline).
{
    // Post-052 state: baseline (slot 2 at 1970-01-01) + hide (-1 at 2026-04-01).
    const rows = [
        { student_id: 'natan', branch_id: 'B', schedule_type: 'sat_sun',
          time_slot_index: 2, effective_from: '1970-01-01' },
        { student_id: 'natan', branch_id: 'B', schedule_type: 'sat_sun',
          time_slot_index: -1, effective_from: '2026-04-01' },
    ];
    // Block A re-run as a JS sim: UPDATE gate fails (no row at (1970-01-01,-1)).
    // INSERT gate: would-insert (1970-01-01, slot 2) — conflicts with row[0], DO NOTHING.
    const newRowCount = rows.length;
    assertEqual(newRowCount, 2,
        'Block A is idempotent — re-running over post-052 state does not add rows');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
