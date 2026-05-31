/**
 * Tests for time-slot effective-dating (migration 049 + admin-v2.js Phase 3/4/5).
 *
 * Layered like test-tournaments-api.js:
 *   1. Source-contract regex checks across admin-v2.js, i18n.js,
 *      admin-v2.html, and the migration (catches accidental drift).
 *   2. JS ports of the new `edit_time_slot_versioned` RPC and the
 *      month-aware `loadTimeSlotsCache` logic exercised against an
 *      in-memory mock dataset, so the versioning semantics are
 *      verified end-to-end without hitting the live DB.
 *
 * Run: node tests/test-time-slot-versioning.js
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
// 1. Migration 049 — source contract
// ============================================================================
console.log('\n=== migration 049_time_slots_effective_dating.sql ====================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/049_time_slots_effective_dating.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/049_time_slots_effective_dating.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/ALTER TABLE time_slots\s+ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT DATE '1970-01-01'/.test(MIG),
    'adds effective_from DATE NOT NULL DEFAULT 1970-01-01');
assert(/DROP CONSTRAINT IF EXISTS time_slots_branch_id_coach_id_schedule_type_slot_index_key/.test(MIG),
    'drops the old (branch, coach, schedule, slot_index) unique key');
assert(/ADD CONSTRAINT time_slots_version_uk\s+UNIQUE \(branch_id, coach_id, schedule_type, slot_index, effective_from\)/.test(MIG),
    'adds the versioned unique key including effective_from');
assert(/CREATE INDEX IF NOT EXISTS idx_time_slots_lookup\s+ON time_slots \(branch_id, coach_id, schedule_type, slot_index, effective_from DESC\)/.test(MIG),
    'adds idx_time_slots_lookup composite index ordered by effective_from DESC');
assert(/CREATE OR REPLACE FUNCTION edit_time_slot_versioned\(/.test(MIG),
    'defines edit_time_slot_versioned RPC');
assert(/SECURITY INVOKER/.test(MIG),
    'RPC runs as SECURITY INVOKER (RLS keys on coach_id; do not bypass)');
assert(/IF v_existing\.effective_from = p_effective_from THEN\s+UPDATE time_slots/.test(MIG),
    'RPC updates in place when effective_from matches');
assert(/INSERT INTO time_slots \(branch_id, coach_id, schedule_type, slot_index,\s+start_time, end_time, label, effective_from\)/.test(MIG),
    'RPC inserts a new version when effective_from differs');
assert(/GRANT EXECUTE ON FUNCTION edit_time_slot_versioned[^;]+TO authenticated/.test(MIG),
    'grants EXECUTE on the RPC to authenticated');

// ============================================================================
// 2. admin-v2.js — source contract
// ============================================================================
console.log('\n=== admin-v2.js source contract ======================================\n');

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// 2a. saveTimeSlotEdit uses the RPC (not .update)
const saveBody = fnBody(ADMIN_SRC, 'saveTimeSlotEdit');
assert(saveBody.length > 0, 'located saveTimeSlotEdit function body');
assert(/\.rpc\(\s*['"]edit_time_slot_versioned['"]/.test(saveBody),
    'saveTimeSlotEdit calls edit_time_slot_versioned RPC');
assert(!/\.from\(['"]time_slots['"]\)\s*\n?\s*\.update\(/.test(saveBody),
    'saveTimeSlotEdit no longer mutates time_slots via .update() directly');
assert(/p_slot_id\s*:\s*id/.test(saveBody),
    'RPC call passes p_slot_id');
assert(/p_effective_from\s*:\s*currentMonthStart/.test(saveBody),
    'RPC call passes p_effective_from = currentMonthStart');
assert(/attendanceCurrentYear[\s\S]*attendanceCurrentMonth[\s\S]*-01/.test(saveBody) ||
       /currentMonthStart\s*=\s*`\$\{attendanceCurrentYear\}-\$\{String\(attendanceCurrentMonth\s*\+\s*1\)\.padStart\(2,\s*['"]0['"]\)\}-01`/.test(saveBody),
    'currentMonthStart is YYYY-MM-01 derived from the displayed attendance month');
assert(/if\s*\(\s*!data\s*\)/.test(saveBody),
    'zero-row defensive check still fires (!data after RPC)');
assert(/admin\.attendance\.editTimeSlot\.errPermission/.test(saveBody),
    'zero-row branch still references errPermission i18n key');
assert(/window\.reloadTimeSlotsCache\(attendanceCurrentYear, attendanceCurrentMonth\)/.test(saveBody),
    'invalidates cache by month after save');

// Top-of-function reminder comment
assert(/NEVER \.update\(\) time_slots directly[\s\S]{0,80}edit_time_slot_versioned RPC[\s\S]{0,40}migration 049/.test(ADMIN_SRC),
    'comment forbids direct .update() and points at migration 049');

// 2b. loadTimeSlotsCache is month-aware
const loadBody = fnBody(ADMIN_SRC, 'loadTimeSlotsCache');
assert(loadBody.length > 0, 'located loadTimeSlotsCache function body');
assert(/async function loadTimeSlotsCache\(year,\s*month\)/.test(ADMIN_SRC),
    'loadTimeSlotsCache takes optional (year, month) arguments');
assert(/\.lte\(\s*['"]effective_from['"]\s*,\s*monthEnd\s*\)/.test(loadBody),
    'query filters effective_from <= monthEnd');
assert(/\.order\(\s*['"]effective_from['"]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/.test(loadBody),
    'query orders effective_from DESC so latest version wins per slot');
assert(/seenSlot/.test(loadBody) && /continue/.test(loadBody),
    'JS-side dedup picks the first (latest effective_from) row per slot');
assert(/\$\{monthKey\}/.test(loadBody),
    'cache keys include monthKey suffix');

// 2c. reloadTimeSlotsCache invalidates per month
const reloadBody = fnBody(ADMIN_SRC, 'reloadTimeSlotsCache');
assert(reloadBody.length > 0, 'located reloadTimeSlotsCache function body');
assert(/endsWith\(`\|\$\{monthKey\}`\)/.test(reloadBody),
    'reloadTimeSlotsCache only deletes entries for the target monthKey');

// 2d. getTimeSlotsForBranch accepts monthKey
const getSlotsBody = fnBody(ADMIN_SRC, 'getTimeSlotsForBranch');
assert(getSlotsBody.length > 0, 'located getTimeSlotsForBranch function body');
assert(/function getTimeSlotsForBranch\(branchName, scheduleType = null, coachName = null, monthKey = null\)/.test(ADMIN_SRC),
    'getTimeSlotsForBranch signature has monthKey arg with null default');
assert(/_currentAttendanceMonthKey\(\)/.test(getSlotsBody),
    'getTimeSlotsForBranch falls back to current attendance month');

// 2e. getTimeSlotLabel / getTimeSlotIdForTime accept monthKey
assert(/function getTimeSlotLabel\(branchName, scheduleType, coachName, timeString, monthKey\)/.test(ADMIN_SRC),
    'getTimeSlotLabel signature includes monthKey');
assert(/function getTimeSlotIdForTime\(branchName, scheduleType, coachName, timeString, monthKey\)/.test(ADMIN_SRC),
    'getTimeSlotIdForTime signature includes monthKey');

// 2f. openEditTimeSlotModal looks up via month-aware cache key and renders the note
const openBody = fnBody(ADMIN_SRC, 'openEditTimeSlotModal');
assert(openBody.length > 0, 'located openEditTimeSlotModal function body');
assert(/_currentAttendanceMonthKey\(\)/.test(openBody),
    'openEditTimeSlotModal reads cache using the current month key');
assert(/editTimeSlotEffectiveFromNote/.test(openBody),
    'openEditTimeSlotModal targets the #editTimeSlotEffectiveFromNote element');
assert(/admin\.attendance\.editTimeSlot\.effectiveFromNote/.test(openBody),
    'openEditTimeSlotModal renders the effectiveFromNote i18n key');
assert(/\.replace\(['"]\{month\}['"]\s*,\s*monthLabel\)/.test(openBody),
    'openEditTimeSlotModal interpolates {month} into the note template');

// 2g. loadAttendanceData triggers loadTimeSlotsCache for the displayed month
const loadAttBody = fnBody(ADMIN_SRC, 'loadAttendanceData');
assert(loadAttBody.length > 0, 'located loadAttendanceData function body');
assert(/loadTimeSlotsCache\(attendanceCurrentYear, attendanceCurrentMonth\)/.test(loadAttBody),
    'loadAttendanceData triggers loadTimeSlotsCache for the displayed month');

// ============================================================================
// 3. admin-v2.html — modal contains the note element
// ============================================================================
console.log('\n=== admin-v2.html edit modal =========================================\n');

const HTML_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
assert(/id="editTimeSlotEffectiveFromNote"/.test(HTML_SRC),
    'admin-v2.html contains #editTimeSlotEffectiveFromNote inside the modal');

// ============================================================================
// 4. i18n — effectiveFromNote present in en, ru, kk
// ============================================================================
console.log('\n=== i18n effectiveFromNote in en, ru, kk ============================\n');

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
const KEY = 'admin.attendance.editTimeSlot.effectiveFromNote';

const enVal = valueFor(EN, KEY);
const ruVal = valueFor(RU, KEY);
const kkVal = valueFor(KK, KEY);

assert(typeof enVal === 'string' && enVal.length > 0, `[en] "${KEY}" defined`);
assert(typeof ruVal === 'string' && ruVal.length > 0, `[ru] "${KEY}" defined`);
assert(typeof kkVal === 'string' && kkVal.length > 0, `[kk] "${KEY}" defined`);
assert(enVal && enVal.includes('{month}'), '[en] template contains {month} placeholder');
assert(ruVal && ruVal.includes('{month}'), '[ru] template contains {month} placeholder');
assert(kkVal && kkVal.includes('{month}'), '[kk] template contains {month} placeholder');

const CYRILLIC = /[Ѐ-ӿ]/;
if (ruVal) assert(CYRILLIC.test(ruVal), `[ru] "${KEY}" is in Cyrillic`);
if (kkVal) assert(CYRILLIC.test(kkVal), `[kk] "${KEY}" is in Cyrillic`);
if (enVal && ruVal) assert(ruVal !== enVal, `[ru] "${KEY}" differs from English`);
if (enVal && kkVal) assert(kkVal !== enVal, `[kk] "${KEY}" differs from English`);

// ============================================================================
// 5. JS port of edit_time_slot_versioned — semantics tests
// ============================================================================
console.log('\n=== edit_time_slot_versioned semantics ==============================\n');

// In-memory table of time_slots rows.
function newDb() {
    return { rows: [], nextId: 1 };
}
function uuid(n) { return `tt-${n.toString().padStart(8, '0')}`; }

function editTimeSlotVersioned(db, { p_slot_id, p_start, p_end, p_label, p_effective_from }) {
    const existing = db.rows.find(r => r.id === p_slot_id);
    if (!existing) throw new Error(`time_slot ${p_slot_id} not found`);

    if (existing.effective_from === p_effective_from) {
        existing.start_time = p_start;
        existing.end_time = p_end;
        existing.label = p_label;
        existing.updated_at = new Date().toISOString();
        return existing;
    }
    const dup = db.rows.find(r =>
        r.branch_id === existing.branch_id &&
        r.coach_id === existing.coach_id &&
        r.schedule_type === existing.schedule_type &&
        r.slot_index === existing.slot_index &&
        r.effective_from === p_effective_from);
    if (dup) {
        throw new Error('duplicate key value violates unique constraint "time_slots_version_uk"');
    }
    const inserted = {
        id: uuid(db.nextId++),
        branch_id: existing.branch_id,
        coach_id: existing.coach_id,
        schedule_type: existing.schedule_type,
        slot_index: existing.slot_index,
        start_time: p_start,
        end_time: p_end,
        label: p_label,
        effective_from: p_effective_from,
        updated_at: new Date().toISOString(),
    };
    db.rows.push(inserted);
    return inserted;
}

// Scenario A: existing row with effective_from=1970-01-01. Editing in
// current month (effective_from=2026-05-01) must INSERT a new version.
{
    const db = newDb();
    db.rows.push({
        id: uuid(db.nextId++),
        branch_id: 'B1', coach_id: 'C1', schedule_type: 'mon_wed', slot_index: 0,
        start_time: '09:00:00', end_time: '10:00:00', label: 'Old A',
        effective_from: '1970-01-01',
    });
    const before = JSON.parse(JSON.stringify(db.rows[0]));
    const out = editTimeSlotVersioned(db, {
        p_slot_id: db.rows[0].id,
        p_start: '09:30:00', p_end: '10:30:00', p_label: 'Group A',
        p_effective_from: '2026-05-01',
    });
    assertEqual(db.rows.length, 2,
        'edit at different effective_from inserts a new row');
    assertEqual(db.rows[0], before,
        'old row is untouched (start/end/label/effective_from preserved)');
    assertEqual(
        { st: out.start_time, en: out.end_time, lb: out.label, ef: out.effective_from,
          br: out.branch_id, co: out.coach_id, sc: out.schedule_type, si: out.slot_index },
        { st: '09:30:00', en: '10:30:00', lb: 'Group A', ef: '2026-05-01',
          br: 'B1', co: 'C1', sc: 'mon_wed', si: 0 },
        'new row inherits (branch, coach, schedule, slot_index) from old row');
}

// Scenario B: existing row already at effective_from=2026-05-01. Re-editing
// in the same month must UPDATE in place (no new row).
{
    const db = newDb();
    db.rows.push({
        id: uuid(db.nextId++),
        branch_id: 'B1', coach_id: 'C1', schedule_type: 'mon_wed', slot_index: 0,
        start_time: '09:30:00', end_time: '10:30:00', label: 'Group A',
        effective_from: '2026-05-01',
    });
    const id = db.rows[0].id;
    editTimeSlotVersioned(db, {
        p_slot_id: id,
        p_start: '09:00:00', p_end: '10:00:00', p_label: 'Group A renamed',
        p_effective_from: '2026-05-01',
    });
    assertEqual(db.rows.length, 1,
        'edit at same effective_from updates in place (no new row)');
    assertEqual(
        { st: db.rows[0].start_time, en: db.rows[0].end_time, lb: db.rows[0].label, ef: db.rows[0].effective_from },
        { st: '09:00:00', en: '10:00:00', lb: 'Group A renamed', ef: '2026-05-01' },
        'in-place update preserves effective_from and applies new values');
}

// ============================================================================
// 6. JS port of loadTimeSlotsCache — month boundary resolution
// ============================================================================
console.log('\n=== loadTimeSlotsCache month-boundary resolution ====================\n');

function resolveLatestPerSlotForMonth(rows, monthEnd) {
    // Mirrors the SELECT ... ORDER BY ... effective_from DESC + JS dedup logic.
    const sorted = rows
        .filter(r => r.effective_from <= monthEnd)
        .slice()
        .sort((a, b) => {
            if (a.branch_id !== b.branch_id) return a.branch_id < b.branch_id ? -1 : 1;
            if (a.coach_id !== b.coach_id) return a.coach_id < b.coach_id ? -1 : 1;
            if (a.schedule_type !== b.schedule_type) return a.schedule_type < b.schedule_type ? -1 : 1;
            if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;
            return a.effective_from < b.effective_from ? 1 : -1; // DESC
        });
    const seen = new Set();
    const out = [];
    for (const r of sorted) {
        const k = `${r.branch_id}|${r.coach_id}|${r.schedule_type}|${r.slot_index}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
    }
    return out;
}

{
    // Three versions for the same (branch, coach, schedule, slot_index=0).
    // v0 seeded 1970-01-01, v1 effective 2026-04-01, v2 effective 2026-05-01.
    const rows = [
        { branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed', slot_index: 0,
          start_time: '09:00:00', end_time: '10:00:00', label: 'v0', effective_from: '1970-01-01' },
        { branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed', slot_index: 0,
          start_time: '09:15:00', end_time: '10:15:00', label: 'v1', effective_from: '2026-04-01' },
        { branch_id: 'B', coach_id: 'C', schedule_type: 'mon_wed', slot_index: 0,
          start_time: '09:30:00', end_time: '10:30:00', label: 'v2', effective_from: '2026-05-01' },
    ];

    const mar = resolveLatestPerSlotForMonth(rows, '2026-03-31');
    assertEqual(mar.length, 1, 'March 2026 sees exactly one version');
    assertEqual(mar[0].label, 'v0', 'March 2026 picks v0 (1970-01-01 default)');

    const apr = resolveLatestPerSlotForMonth(rows, '2026-04-30');
    assertEqual(apr[0].label, 'v1', 'April 2026 picks v1 (effective 2026-04-01)');

    const may = resolveLatestPerSlotForMonth(rows, '2026-05-31');
    assertEqual(may[0].label, 'v2', 'May 2026 picks v2 (effective 2026-05-01)');
}

// ============================================================================
// 7. Old test still in tree — verify the new state stays compatible
// ============================================================================
console.log('\n=== compatibility check =============================================\n');

// deleteTimeSlot is intentionally untouched by this PR; its zero-row guard
// from the previous commit must still be intact.
const delBody = fnBody(ADMIN_SRC, 'deleteTimeSlot');
assert(delBody.length > 0, 'located deleteTimeSlot function body');
assert(/\.delete\(\)\s*\.eq\(['"]id['"]\s*,\s*id\)\s*\.select\(\)/.test(delBody),
    'deleteTimeSlot still uses .delete().eq(id).select() chain');
assert(/if\s*\(\s*!data\s*\|\|\s*data\.length\s*===\s*0\s*\)/.test(delBody),
    'deleteTimeSlot still has explicit zero-row guard');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
