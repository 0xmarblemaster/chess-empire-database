/**
 * Tests for "Add Time Slot" (migration 078 + admin-v2.js / admin-v2.html / i18n.js).
 *
 * Layered like test-time-slot-versioning.js:
 *   1. Source-contract regex checks across the migration, admin-v2.js,
 *      admin-v2.html and i18n.js (catches accidental drift).
 *   2. A JS port of the add_time_slot_versioned RPC exercised against an
 *      in-memory dataset (seed handling, max+1 slot_index, month effective_from,
 *      duplicate rejection).
 *   3. A JS port of submitAddTimeSlot's client-side validation
 *      (end > start, duplicate, all-coaches guard, seed passing for fallback).
 *
 * Run: node tests/test-add-time-slot-versioned.js
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

const ADMIN_JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// ============================================================================
// 1. Migration 078 — source contract
// ============================================================================
console.log('\n=== migration 078_add_time_slot_versioned.sql ========================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/078_add_time_slot_versioned.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/078_add_time_slot_versioned.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/CREATE OR REPLACE FUNCTION add_time_slot_versioned\(/.test(MIG),
    'defines add_time_slot_versioned RPC');
assert(/p_seed_slots\s+JSONB\s+DEFAULT\s+NULL/i.test(MIG),
    'accepts p_seed_slots JSONB DEFAULT NULL');
assert(/SECURITY INVOKER/.test(MIG),
    'RPC runs as SECURITY INVOKER (mirrors edit RPC; RLS keys on coach_id)');
assert(/IF p_end_time <= p_start_time THEN\s+RAISE EXCEPTION/.test(MIG),
    'rejects end_time <= start_time');
assert(/jsonb_array_elements\(p_seed_slots\)/.test(MIG),
    'iterates p_seed_slots to seed fallback rows');
assert(/DATE '1970-01-01'/.test(MIG),
    'seeds fallback slots at effective_from 1970-01-01');
assert(/COALESCE\(MAX\(slot_index\)\s*\+\s*1,\s*0\)/.test(MIG),
    'new slot_index = max(slot_index)+1 for the bucket');
assert(/RAISE EXCEPTION 'a slot .* already exists/.test(MIG),
    'rejects a duplicate active start+end');
assert(/GRANT EXECUTE ON FUNCTION add_time_slot_versioned[\s\S]*TO authenticated/.test(MIG),
    'grants EXECUTE to authenticated (matches edit RPC grant)');
assert(!/SECURITY DEFINER/.test(MIG),
    'does NOT use SECURITY DEFINER (does not bypass RLS)');

// ============================================================================
// 2. admin-v2.html — button next to Add Student + modal
// ============================================================================
console.log('\n=== admin-v2.html button + modal =====================================\n');

// The "+ Add Time Slot" button sits in the same header cell as the green
// Add Student button (rendered in admin-v2.js, checked below), and the modal
// lives in the HTML.
assert(/id="addTimeSlotModal"/.test(ADMIN_HTML), 'addTimeSlotModal present in HTML');
assert(/id="addTimeSlotStart"/.test(ADMIN_HTML), 'modal has start time input');
assert(/id="addTimeSlotEnd"/.test(ADMIN_HTML), 'modal has end time input');
assert(/id="addTimeSlotLabel"/.test(ADMIN_HTML), 'modal has optional label input');
assert(/id="addTimeSlotEffectiveFromNote"/.test(ADMIN_HTML), 'modal has appliesFrom note element');
assert(/id="addTimeSlotError"/.test(ADMIN_HTML), 'modal has error element');
assert(/onclick="submitAddTimeSlot\(\)"/.test(ADMIN_HTML), 'modal Add button calls submitAddTimeSlot()');
assert(/onclick="closeAddTimeSlotModal\(\)"/.test(ADMIN_HTML), 'modal Cancel/close calls closeAddTimeSlotModal()');
assert(/data-i18n="admin\.attendance\.addTimeSlot\.title"/.test(ADMIN_HTML), 'modal title uses i18n key');
assert(/data-i18n="admin\.attendance\.addTimeSlot\.startTime"/.test(ADMIN_HTML), 'start label uses i18n key');
assert(/data-i18n="admin\.attendance\.addTimeSlot\.endTime"/.test(ADMIN_HTML), 'end label uses i18n key');

// Button is rendered in admin-v2.js right after the Add Student button, in the
// same header <th>.
const headerIdx = ADMIN_JS.indexOf('attendance-add-student-btn');
const headerSlice = ADMIN_JS.slice(headerIdx, headerIdx + 1600);
assert(/openAddStudentToCalendarModal\(\)[\s\S]*openAddTimeSlotModal\(\)/.test(headerSlice),
    'Add Time Slot button rendered right next to Add Student button in the header');
assert(/admin\.attendance\.addTimeSlot\.button/.test(headerSlice),
    'button label uses the addTimeSlot.button i18n key');

// ============================================================================
// 3. admin-v2.js — validation + RPC wiring
// ============================================================================
console.log('\n=== admin-v2.js openAddTimeSlotModal / submitAddTimeSlot =============\n');

const openBody = fnBody(ADMIN_JS, 'openAddTimeSlotModal');
assert(openBody.length > 0, 'located openAddTimeSlotModal');
assert(/attendanceCurrentCoach === 'all'/.test(openBody) &&
       /selectCoachFirst/.test(openBody),
    'all-coaches guard alerts selectCoachFirst on open');

const subBody = fnBody(ADMIN_JS, 'submitAddTimeSlot');
assert(subBody.length > 0, 'located submitAddTimeSlot');
assert(/\.rpc\(\s*['"]add_time_slot_versioned['"]/.test(subBody),
    'routes through add_time_slot_versioned RPC');
assert(!/\.from\(['"]time_slots['"]\)\s*\.insert\(/.test(subBody),
    'never INSERTs into time_slots directly');
assert(/startVal >= endVal/.test(subBody),
    'validates end > start');
assert(/renderedSlots\.includes\(candidate\)/.test(subBody) &&
       /errDuplicate/.test(subBody),
    'rejects a duplicate against currently rendered slots');
assert(/isFallbackOnly/.test(subBody) && /p_seed_slots:\s*seedSlots/.test(subBody),
    'passes seed slots for fallback-only buckets');
assert(/p_effective_from:\s*currentMonthStart/.test(subBody) &&
       /-01`/.test(subBody),
    'effective_from is the viewed month first day');
assert(/reloadTimeSlotsCache\(attendanceCurrentYear,\s*attendanceCurrentMonth\)/.test(subBody),
    'reloads the slot cache after a successful add');
assert(/window\.openAddTimeSlotModal\s*=/.test(ADMIN_JS) &&
       /window\.submitAddTimeSlot\s*=/.test(ADMIN_JS) &&
       /window\.closeAddTimeSlotModal\s*=/.test(ADMIN_JS),
    'openAddTimeSlotModal / submitAddTimeSlot / closeAddTimeSlotModal exposed on window');

// ============================================================================
// 4. i18n keys exist in en, ru, kk
// ============================================================================
console.log('\n=== i18n addTimeSlot keys in en, ru, kk ==============================\n');

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
const CYRILLIC = /[Ѐ-ӿ]/;

const KEYS = [
    'button', 'title', 'startTime', 'endTime', 'label', 'labelPlaceholder',
    'labelHelp', 'cancel', 'save', 'appliesFromNote', 'selectCoachFirst',
    'selectScheduleFirst', 'selectBranchFirst', 'errBothTimes',
    'errEndAfterStart', 'errDuplicate', 'errSaveFailed'
].map(k => `admin.attendance.addTimeSlot.${k}`);

for (const key of KEYS) {
    const en = valueFor(EN, key);
    const ru = valueFor(RU, key);
    const kk = valueFor(KK, key);
    assert(typeof en === 'string' && en.length > 0, `[en] "${key}" defined`);
    assert(typeof ru === 'string' && ru.length > 0, `[ru] "${key}" defined`);
    assert(typeof kk === 'string' && kk.length > 0, `[kk] "${key}" defined`);
    if (ru) assert(CYRILLIC.test(ru), `[ru] "${key}" is in Cyrillic`);
    if (kk) assert(CYRILLIC.test(kk), `[kk] "${key}" is in Cyrillic`);
}
assert(/\{month\}/.test(valueFor(EN, 'admin.attendance.addTimeSlot.appliesFromNote') || ''),
    'appliesFromNote carries the {month} placeholder');

// ============================================================================
// 5. JS port of add_time_slot_versioned — semantics
// ============================================================================
console.log('\n=== add_time_slot_versioned semantics (JS port) ======================\n');

// Faithful port of the migration RPC over an in-memory time_slots array.
// Row shape: { branch, coach, schedule, slot_index, start, end, label,
//              effective_from, deleted_at }
function addTimeSlotVersioned(rows, args) {
    const { branch, coach, schedule, start, end, label, effective_from, seed_slots } = args;
    if (end <= start) throw new Error('end must be after start');

    const inBucket = (r) => r.branch === branch && r.coach === coach && r.schedule === schedule;
    const bucketRows = () => rows.filter(inBucket);

    // Seed fallback slots first when the bucket is empty.
    if (bucketRows().length === 0 && Array.isArray(seed_slots)) {
        seed_slots.forEach((s, i) => {
            rows.push({
                branch, coach, schedule, slot_index: i,
                start: s.start, end: s.end, label: s.label || null,
                effective_from: '1970-01-01', deleted_at: null
            });
        });
    }

    // Duplicate check against latest non-deleted version per slot_index
    // effective on/before the viewed month.
    const byIndex = {};
    for (const r of bucketRows()) {
        if (r.effective_from <= effective_from) {
            if (!byIndex[r.slot_index] || r.effective_from > byIndex[r.slot_index].effective_from) {
                byIndex[r.slot_index] = r;
            }
        }
    }
    const dup = Object.values(byIndex).some(r => !r.deleted_at && r.start === start && r.end === end);
    if (dup) throw new Error('duplicate');

    const maxIdx = bucketRows().reduce((m, r) => Math.max(m, r.slot_index), -1);
    const newIndex = maxIdx + 1;
    const row = {
        branch, coach, schedule, slot_index: newIndex,
        start, end, label: label || null, effective_from, deleted_at: null
    };
    rows.push(row);
    return row;
}

// (a) Fresh bucket with seed slots: seeds at 1970-01-01, new slot at month, max+1.
{
    const rows = [];
    const created = addTimeSlotVersioned(rows, {
        branch: 'b1', coach: 'c1', schedule: 'mon_wed',
        start: '13:00', end: '14:00', label: null, effective_from: '2026-09-01',
        seed_slots: [
            { start: '09:00', end: '10:00', label: null },
            { start: '10:00', end: '11:00', label: null }
        ]
    });
    assertEqual(created.slot_index, 2, 'seeded bucket: new slot gets max+1 index (2 after 2 seeds)');
    assertEqual(created.effective_from, '2026-09-01', 'new slot effective_from = viewed month first day');
    const seeds = rows.filter(r => r.effective_from === '1970-01-01');
    assertEqual(seeds.length, 2, 'both fallback slots were seeded at 1970-01-01');
    assertEqual(seeds.map(r => r.slot_index), [0, 1], 'seed slots get sequential slot_index');
}

// (b) First-ever slot with no seed: index 0.
{
    const rows = [];
    const created = addTimeSlotVersioned(rows, {
        branch: 'b1', coach: 'c1', schedule: 'tue_thu',
        start: '15:00', end: '16:00', label: 'Group B', effective_from: '2026-09-01',
        seed_slots: null
    });
    assertEqual(created.slot_index, 0, 'first-ever unseeded slot gets index 0');
    assertEqual(created.label, 'Group B', 'label carried through');
}

// (c) Existing DB bucket: no reseed, new index = max+1.
{
    const rows = [
        { branch: 'b1', coach: 'c1', schedule: 'mon_wed', slot_index: 0, start: '09:00', end: '10:00', label: null, effective_from: '1970-01-01', deleted_at: null },
        { branch: 'b1', coach: 'c1', schedule: 'mon_wed', slot_index: 1, start: '10:00', end: '11:00', label: null, effective_from: '1970-01-01', deleted_at: null }
    ];
    const before = rows.length;
    const created = addTimeSlotVersioned(rows, {
        branch: 'b1', coach: 'c1', schedule: 'mon_wed',
        start: '11:00', end: '12:00', label: null, effective_from: '2026-09-01',
        seed_slots: [{ start: '09:00', end: '10:00', label: null }]  // must be ignored
    });
    assertEqual(created.slot_index, 2, 'existing bucket: new index = max+1');
    assertEqual(rows.length, before + 1, 'existing bucket is NOT reseeded');
}

// (d) Duplicate start+end is rejected.
{
    const rows = [
        { branch: 'b1', coach: 'c1', schedule: 'mon_wed', slot_index: 0, start: '09:00', end: '10:00', label: null, effective_from: '1970-01-01', deleted_at: null }
    ];
    let threw = false;
    try {
        addTimeSlotVersioned(rows, {
            branch: 'b1', coach: 'c1', schedule: 'mon_wed',
            start: '09:00', end: '10:00', label: null, effective_from: '2026-09-01',
            seed_slots: null
        });
    } catch (e) { threw = /duplicate/.test(e.message); }
    assert(threw, 'duplicate active start+end is rejected');
}

// (e) A tombstoned slot with the same time is NOT a duplicate (can re-add).
{
    const rows = [
        { branch: 'b1', coach: 'c1', schedule: 'mon_wed', slot_index: 0, start: '09:00', end: '10:00', label: null, effective_from: '1970-01-01', deleted_at: null },
        { branch: 'b1', coach: 'c1', schedule: 'mon_wed', slot_index: 0, start: '09:00', end: '10:00', label: null, effective_from: '2026-09-01', deleted_at: '2026-09-01' }
    ];
    const created = addTimeSlotVersioned(rows, {
        branch: 'b1', coach: 'c1', schedule: 'mon_wed',
        start: '09:00', end: '10:00', label: null, effective_from: '2026-09-01',
        seed_slots: null
    });
    assertEqual(created.slot_index, 1, 'can re-add a time whose only active-index version is tombstoned');
}

// (f) end <= start rejected.
{
    let threw = false;
    try {
        addTimeSlotVersioned([], {
            branch: 'b1', coach: 'c1', schedule: 'mon_wed',
            start: '10:00', end: '10:00', label: null, effective_from: '2026-09-01', seed_slots: null
        });
    } catch (e) { threw = true; }
    assert(threw, 'end == start rejected by RPC port');
}

// ============================================================================
// 6. JS port of submitAddTimeSlot client validation
// ============================================================================
console.log('\n=== submitAddTimeSlot client validation (JS port) ====================\n');

function fmtSlotTime(hm) {
    const [h, m] = hm.split(':');
    return `${parseInt(h, 10)}:${m}`;
}
// Returns { ok, error } | { ok:true, seedSlots }
function validateSubmit(ctx) {
    const { coach, schedule, branch, startVal, endVal, renderedSlots, bucketHasDbRows } = ctx;
    if (!coach || coach === 'all' || coach === 'unassigned' || !schedule || schedule === 'all' || !branch) {
        return { ok: false, error: 'selectCoachFirst' };
    }
    if (!startVal || !endVal) return { ok: false, error: 'errBothTimes' };
    if (startVal >= endVal) return { ok: false, error: 'errEndAfterStart' };
    const candidate = `${fmtSlotTime(startVal)}-${fmtSlotTime(endVal)}`;
    if (renderedSlots.includes(candidate)) return { ok: false, error: 'errDuplicate' };
    const seedSlots = bucketHasDbRows ? null : renderedSlots.map(s => {
        const [a, b] = s.split('-');
        const pad = (t) => { const [h, m] = t.split(':'); return `${String(h).padStart(2, '0')}:${m}`; };
        return { start: `${pad(a)}:00`, end: `${pad(b)}:00`, label: null };
    });
    return { ok: true, seedSlots };
}

assertEqual(
    validateSubmit({ coach: 'all', schedule: 'mon_wed', branch: 'X', startVal: '13:00', endVal: '14:00', renderedSlots: [], bucketHasDbRows: false }),
    { ok: false, error: 'selectCoachFirst' },
    'all-coaches selection blocked before submit');

assertEqual(
    validateSubmit({ coach: 'c1', schedule: 'mon_wed', branch: 'X', startVal: '14:00', endVal: '13:00', renderedSlots: [], bucketHasDbRows: true }),
    { ok: false, error: 'errEndAfterStart' },
    'end before start blocked');

// <input type="time"> always yields zero-padded HH:MM ('09:00'); the rendered
// slot list uses non-padded hours ('9:00-10:00'). fmtSlotTime normalizes so the
// candidate still matches.
assertEqual(
    validateSubmit({ coach: 'c1', schedule: 'mon_wed', branch: 'X', startVal: '09:00', endVal: '10:00', renderedSlots: ['9:00-10:00'], bucketHasDbRows: true }),
    { ok: false, error: 'errDuplicate' },
    'duplicate against rendered slot blocked (leading-zero normalized)');

{
    const res = validateSubmit({ coach: 'c1', schedule: 'mon_wed', branch: 'X', startVal: '13:00', endVal: '14:00', renderedSlots: ['9:00-10:00', '10:00-11:00'], bucketHasDbRows: false });
    assert(res.ok && Array.isArray(res.seedSlots) && res.seedSlots.length === 2, 'fallback bucket: rendered slots passed as seed');
    assertEqual(res.seedSlots[0], { start: '09:00:00', end: '10:00:00', label: null }, 'seed slots padded to HH:MM:SS');
}

{
    const res = validateSubmit({ coach: 'c1', schedule: 'mon_wed', branch: 'X', startVal: '13:00', endVal: '14:00', renderedSlots: ['9:00-10:00'], bucketHasDbRows: true });
    assert(res.ok && res.seedSlots === null, 'DB bucket: no seed slots passed');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
