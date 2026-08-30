/**
 * Tests for migration 071 — add a 09:00-10:00 slot to Halyk Arena's Sat-Sun
 * schedule (DB `time_slots` branch; see SPEC_halyk_satsun_9am.md STEP 0).
 *
 * Layered like test-time-slot-versioning.js:
 *   1. Source-contract regex checks on 071_halyk_satsun_9am_slot.sql so the
 *      migration keeps its shape (branch lookup, sat_sun-only filter,
 *      collision-safe shift, idempotency guard, -1 sentinel guard).
 *   2. A JS port of the migration's transformation exercised against an
 *      in-memory time_slots / student_time_slot_assignments dataset, so the
 *      resulting slot list and student placements are verified end-to-end
 *      without touching the live DB.
 *
 * Run: node tests/test-halyk-satsun-9am-slot.js
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
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++; console.log(`  ✓ ${msg}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 1. Migration 071 — source contract
// ============================================================================
console.log('\n=== migration 071_halyk_satsun_9am_slot.sql ==========================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/071_halyk_satsun_9am_slot.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/071_halyk_satsun_9am_slot.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]*COMMIT;/.test(MIG), 'wrapped in a BEGIN/COMMIT transaction');
assert(/name ILIKE '%halyk%' OR name ILIKE '%khalyk%'/.test(MIG),
    'resolves the Halyk branch id via ILIKE (no hard-coded UUID)');
assert(/schedule_type = 'sat_sun'/.test(MIG),
    "operates on the sat_sun schedule");
assert(!/'mon_wed'|'tue_thu'|'mon_wed_fri'/.test(MIG),
    'never touches weekday schedules (mon_wed / tue_thu / mon_wed_fri)');
assert(/TIME '09:00'[\s\S]*TIME '10:00'/.test(MIG),
    'inserts a 09:00-10:00 slot');
assert(/slot_index,\s*\d?\s*[\s\S]*?0,\s*\n\s*TIME '09:00'/.test(MIG) || /schedule_type, 0,\s*\n\s*TIME '09:00'/.test(MIG),
    'new 09:00 slot is inserted at slot_index 0');
assert(/slot_index = slot_index \+ 1000/.test(MIG) && /slot_index = slot_index - 999/.test(MIG),
    'shifts time_slots with the collision-safe +1000 / -999 offset');
assert(/time_slot_index = time_slot_index \+ 1000/.test(MIG) && /time_slot_index = time_slot_index - 999/.test(MIG),
    'shifts student_time_slot_assignments with the same offset trick');
assert(/time_slot_index >= 0/.test(MIG),
    'guards assignment shift on time_slot_index >= 0 (preserves -1 sentinels)');
assert(/ON CONFLICT \(branch_id, coach_id, schedule_type, slot_index, effective_from\) DO NOTHING/.test(MIG),
    'new-slot INSERT is idempotent via ON CONFLICT DO NOTHING');
assert(/IF EXISTS \([\s\S]*?slot_index = 0[\s\S]*?start_time = TIME '09:00'[\s\S]*?RETURN;/.test(MIG),
    'idempotency guard returns early when the 09:00 slot already exists');
assert(/DO NOT APPLY TO PRODUCTION/i.test(MIG),
    'carries the do-not-apply-to-prod warning');

// ============================================================================
// 2. JS port of the migration transformation — slot list result
// ============================================================================
console.log('\n=== transformation: Halyk Sat-Sun slot list =========================\n');

const HALYK = 'halyk-branch-id';
const OTHER = 'other-branch-id';
const COACH = 'andrei-coach-id';

// Seed mirrors migration 044's Halyk block: 8 slots 10:00-19:00, baseline.
function halykSlots(scheduleType) {
    const times = [
        ['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'],
        ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00'],
        ['17:00', '18:00'], ['18:00', '19:00'],
    ];
    return times.map(([s, e], i) => ({
        branch_id: HALYK, coach_id: COACH, schedule_type: scheduleType,
        slot_index: i, start_time: s, end_time: e, effective_from: '1970-01-01',
        deleted_at: null,
    }));
}

/** Faithful JS port of migration 071's time_slots transformation. */
function applySlotMigration(rows, branchId) {
    // Guard: skip if a 09:00 slot already sits at sat_sun index 0.
    const already = rows.some(r =>
        r.branch_id === branchId && r.schedule_type === 'sat_sun' &&
        r.slot_index === 0 && r.start_time === '09:00');
    if (already) return rows;

    const isTarget = r => r.branch_id === branchId && r.schedule_type === 'sat_sun';
    // Two-pass collision-safe +1 shift.
    for (const r of rows) if (isTarget(r)) r.slot_index += 1000;
    for (const r of rows) if (isTarget(r) && r.slot_index >= 1000) r.slot_index -= 999;

    // Insert new 09:00-10:00 at index 0 per (coach, effective_from) with a
    // live slot now at index 1.
    const anchors = rows.filter(r =>
        isTarget(r) && r.slot_index === 1 && r.deleted_at === null);
    const seen = new Set();
    for (const a of anchors) {
        const key = `${a.coach_id}|${a.effective_from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
            branch_id: branchId, coach_id: a.coach_id, schedule_type: 'sat_sun',
            slot_index: 0, start_time: '09:00', end_time: '10:00',
            effective_from: a.effective_from, deleted_at: null,
        });
    }
    return rows;
}

// Same "H:MM-H:MM" formatter loadTimeSlotsCache uses (strips leading zero).
function fmt(t) { const [h, m] = t.split(':'); return `${parseInt(h, 10)}:${m}`; }
function renderList(rows, branchId, scheduleType) {
    return rows
        .filter(r => r.branch_id === branchId && r.schedule_type === scheduleType && r.deleted_at === null)
        .sort((a, b) => a.slot_index - b.slot_index)
        .map(r => `${fmt(r.start_time)}-${fmt(r.end_time)}`);
}

const EXPECTED_SAT_SUN = [
    '9:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00',
];
const ORIGINAL_HALYK = [
    '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00',
    '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00',
];

{
    const rows = [
        ...halykSlots('sat_sun'),
        ...halykSlots('mon_wed'),   // Halyk weekday — must stay put
        // Another branch's sat_sun — must stay put.
        { branch_id: OTHER, coach_id: 'x', schedule_type: 'sat_sun', slot_index: 0,
          start_time: '09:00', end_time: '10:00', effective_from: '1970-01-01', deleted_at: null },
    ];
    applySlotMigration(rows, HALYK);

    assertEqual(renderList(rows, HALYK, 'sat_sun'), EXPECTED_SAT_SUN,
        'Halyk sat_sun === 9-slot list starting with 9:00-10:00');
    assert(renderList(rows, HALYK, 'sat_sun')[0] === '9:00-10:00',
        'Halyk sat_sun now starts at 9:00-10:00');
    assertEqual(renderList(rows, HALYK, 'mon_wed'), ORIGINAL_HALYK,
        'Halyk mon_wed unchanged (8 slots, no 9:00-10:00)');
    assert(!renderList(rows, HALYK, 'mon_wed').includes('9:00-10:00'),
        'Halyk weekday never gains a 9:00-10:00 slot');
    assertEqual(renderList(rows, OTHER, 'sat_sun'), ['9:00-10:00'],
        'other branch sat_sun unchanged');
}

// Idempotency: a second application is a no-op.
{
    const rows = halykSlots('sat_sun');
    applySlotMigration(rows, HALYK);
    const afterFirst = renderList(rows, HALYK, 'sat_sun');
    applySlotMigration(rows, HALYK);
    assertEqual(renderList(rows, HALYK, 'sat_sun'), afterFirst,
        're-running the migration does not add a second 9:00 slot');
}

// ============================================================================
// 3. JS port — student_time_slot_assignments shift
// ============================================================================
console.log('\n=== transformation: student assignment shift ========================\n');

/** Faithful JS port of migration 071's assignment transformation. */
function applyAssignmentMigration(rows, branchId) {
    const isTarget = r => r.branch_id === branchId && r.schedule_type === 'sat_sun' && r.time_slot_index >= 0;
    for (const r of rows) if (isTarget(r)) r.time_slot_index += 1000;
    for (const r of rows) if (r.branch_id === branchId && r.schedule_type === 'sat_sun' && r.time_slot_index >= 1000) r.time_slot_index -= 999;
    return rows;
}

{
    const rows = [
        // Student A at old slot 0 (10:00) -> new slot 1.
        { student_id: 'A', branch_id: HALYK, schedule_type: 'sat_sun', time_slot_index: 0, effective_from: '1970-01-01' },
        // Student B at old slot 7 (18:00) -> new slot 8.
        { student_id: 'B', branch_id: HALYK, schedule_type: 'sat_sun', time_slot_index: 7, effective_from: '1970-01-01' },
        // Legacy -1 schedule-wide hide sentinel — must NOT move.
        { student_id: 'C', branch_id: HALYK, schedule_type: 'sat_sun', time_slot_index: -1, effective_from: '1970-01-01' },
        // Halyk weekday assignment — must NOT move.
        { student_id: 'D', branch_id: HALYK, schedule_type: 'mon_wed', time_slot_index: 0, effective_from: '1970-01-01' },
        // Forward-dated hide for A at old slot 0 -> new slot 1 (stays consistent).
        { student_id: 'A', branch_id: HALYK, schedule_type: 'sat_sun', time_slot_index: 0, effective_from: '2026-09-01' },
    ];
    applyAssignmentMigration(rows, HALYK);

    const idx = (sid, ef) => rows.find(r => r.student_id === sid && r.effective_from === ef).time_slot_index;
    assertEqual(idx('A', '1970-01-01'), 1, 'student A shifts from slot 0 to slot 1 (same 10:00 time)');
    assertEqual(idx('B', '1970-01-01'), 8, 'student B shifts from slot 7 to slot 8 (same 18:00 time)');
    assertEqual(idx('C', '1970-01-01'), -1, 'legacy -1 sentinel preserved (not shifted)');
    assertEqual(idx('D', '1970-01-01'), 0, 'Halyk weekday assignment untouched');
    assertEqual(idx('A', '2026-09-01'), 1, 'forward-dated version shifts consistently with baseline');

    // New slot 0 must have no student assignments.
    const atSlot0 = rows.filter(r => r.branch_id === HALYK && r.schedule_type === 'sat_sun' && r.time_slot_index === 0);
    assertEqual(atSlot0.length, 0, 'new 9:00-10:00 slot (index 0) is left empty');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
