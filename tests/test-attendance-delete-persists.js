/**
 * Tests for PRD_ATTENDANCE_DELETE_FIX.md — restore the pre-061 invariant
 * "students intentionally hidden from this schedule must not survive
 * loadAttendanceData", without breaking the new per-slot multi-membership
 * semantic.
 *
 * Two layers:
 *   1. Live end-to-end against the real Supabase project (papgcizhfkngubwofjuo)
 *      exercising the actual `supabaseData.getTimeSlotAssignments` function
 *      via a Node `window` shim. Verifies the new return shape
 *      ({ assignments, hiddenStudentIds }) — the four PRD scenarios.
 *   2. A pure-JS source-contract guard on admin-v2.js confirming
 *      loadAttendanceData reads `hiddenStudentIds` and filters
 *      `attendanceCalendarData` by it before calling
 *      initializeStudentTimeSlots. This is the regression guard against the
 *      Halyk Arena auto-seed bug.
 *
 * Run: node tests/test-attendance-delete-persists.js
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

// ============================================================================
// 1. Source-contract guard: admin-v2.js loadAttendanceData wiring
// ============================================================================
console.log('\n=== admin-v2.js loadAttendanceData hiddenStudentIds wiring ===========\n');

const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

// Locate loadAttendanceData body. Extract via brace-depth to keep the
// assertion scoped (avoid accidental matches in unrelated functions).
function fnBody(src, name) {
    const sigA = src.indexOf(`async function ${name}(`);
    const sigB = src.indexOf(`function ${name}(`);
    const s = sigA >= 0 ? sigA : sigB;
    if (s < 0) return '';
    const open = src.indexOf('{', s);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    return '';
}

const loadBody = fnBody(ADMIN_V2_SRC, 'loadAttendanceData');
assert(loadBody.length > 0, 'located loadAttendanceData function body');

// Destructures the new shape from the Promise.allSettled value.
assert(/assignments:\s*savedAssignments[^}]*hiddenStudentIds(?:\s*=\s*\[\])?/.test(loadBody)
    || /hiddenStudentIds(?:\s*=\s*\[\])?[^}]*assignments:\s*savedAssignments/.test(loadBody),
    'loadAttendanceData destructures `assignments` and `hiddenStudentIds` from timeSlotAssignmentsResult.value');

// Filters attendanceCalendarData by hiddenStudentIds — the regression
// guard. Without this, Halyk auto-seed resurrects the hidden student.
assert(/attendanceCalendarData\s*=\s*attendanceCalendarData\.filter\([^)]*hiddenIdSet/.test(loadBody),
    'loadAttendanceData filters attendanceCalendarData by the hiddenStudentIds set');

// The filter has to run BEFORE initializeStudentTimeSlots so the
// auto-seed cannot resurrect the hidden student.
const filterIdx = loadBody.search(/attendanceCalendarData\s*=\s*attendanceCalendarData\.filter\([^)]*hiddenIdSet/);
const initIdx = loadBody.indexOf('initializeStudentTimeSlots(');
assert(filterIdx > 0 && initIdx > filterIdx,
    'attendanceCalendarData filter runs BEFORE initializeStudentTimeSlots (auto-seed cannot resurrect hidden students)');

// Cleared cached schedule assignment for removed students — matches the
// pre-061 cleanup at the old splice site.
assert(/delete\s+attendanceStudentScheduleAssignments\[/.test(loadBody),
    'loadAttendanceData clears attendanceStudentScheduleAssignments[id] for hidden students');

// supabase-data.js must build hiddenStudentIds for admin-v2.js to read.
const SDATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
assert(/return\s*\{\s*assignments:\s*resolved,\s*hiddenStudentIds\s*\}/.test(SDATA_SRC),
    'supabase-data.js getTimeSlotAssignments returns { assignments, hiddenStudentIds }');
assert(/return\s*\{\s*assignments:\s*\[\],\s*hiddenStudentIds:\s*\[\]\s*\}/.test(SDATA_SRC),
    'supabase-data.js getTimeSlotAssignments empty/error path returns { assignments: [], hiddenStudentIds: [] }');

// ============================================================================
// 2. Load supabaseData.getTimeSlotAssignments under a Node `window` shim so
//    the live tests exercise the actual function (not a JS port).
// ============================================================================

function loadSupabaseData(supabaseClient) {
    global.window = { supabaseClient };
    const file = path.join(ROOT, 'supabase-data.js');
    // Drop any cached copy so a re-require picks up the freshly-set window.
    delete require.cache[require.resolve(file)];
    require(file);
    const sd = global.window.supabaseData;
    if (!sd || typeof sd.getTimeSlotAssignments !== 'function') {
        throw new Error('supabaseData.getTimeSlotAssignments not exported on window');
    }
    return sd;
}

// ============================================================================
// 3. Live PRD scenarios
// ============================================================================
async function runLive() {
    if (!createClient) {
        console.log('\n=== Live DB tests SKIPPED (no @supabase/supabase-js available) ===\n');
        return;
    }
    const SUPABASE_URL = 'https://papgcizhfkngubwofjuo.supabase.co';
    const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGdjaXpoZmtuZ3Vid29manVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTkzMDM1MSwiZXhwIjoyMDc3NTA2MzUxfQ.XwEjEJIxZ6J_3C9UZQ3hvrlm3GsfOCxMz3lYUK_trKg';
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const supabaseData = loadSupabaseData(supabase);

    // Reuse the test student + Almaty-1 branch from test-coach-multi-group.js;
    // the per-slot unique key lets us seed and clean up freely.
    const TEST_STUDENT     = '96f38386-cfb9-4582-ad90-8b005f5fe19e';
    const NEW_STUDENT      = '00000000-0000-0000-0000-000000000abc'; // never has rows
    const TEST_BRANCH      = '7d1946c8-183b-4ad9-8f49-77402bac2210';
    const SCHEDULE         = 'mon_wed';
    const SLOT_A           = 0;
    const SLOT_B           = 1;
    const HIDE_FROM_DATE   = '2026-06-01';
    const LEGACY_HIDE_DATE = '2026-06-01';
    const YEAR             = 2026;
    const MONTH            = 5; // 0-indexed → June

    async function cleanup() {
        await supabase
            .from('student_time_slot_assignments')
            .delete()
            .eq('student_id', TEST_STUDENT)
            .eq('branch_id', TEST_BRANCH)
            .eq('schedule_type', SCHEDULE);
    }

    async function seedBaseline(slotIndex) {
        const { error } = await supabase
            .from('student_time_slot_assignments')
            .upsert([{
                student_id: TEST_STUDENT,
                branch_id: TEST_BRANCH,
                schedule_type: SCHEDULE,
                time_slot_index: slotIndex,
                effective_from: '1970-01-01',
                hidden: false,
                updated_at: new Date().toISOString(),
            }], {
                onConflict: 'student_id,branch_id,schedule_type,time_slot_index,effective_from',
            });
        if (error) throw new Error(`seed slot ${slotIndex}: ${error.message}`);
    }

    try {
        console.log('\n=== Live: PRD_ATTENDANCE_DELETE_FIX scenarios ====================\n');

        // ------------------------------------------------------------------
        // (1) Per-slot hide of a student's ONLY slot → student disappears
        //     from assignments and shows up in hiddenStudentIds.
        // ------------------------------------------------------------------
        await cleanup();
        await seedBaseline(SLOT_A);

        // Sanity check: visible before hide.
        {
            const result = await supabaseData.getTimeSlotAssignments(TEST_BRANCH, SCHEDULE, YEAR, MONTH);
            assert(result && Array.isArray(result.assignments) && Array.isArray(result.hiddenStudentIds),
                '(1a) baseline read returns the new { assignments, hiddenStudentIds } shape');
            const slots = result.assignments
                .filter(r => r.studentId === TEST_STUDENT)
                .map(r => r.timeSlotIndex)
                .sort();
            assertEqual(slots, [SLOT_A],
                '(1a) student visible in slot A before hide');
            assert(!result.hiddenStudentIds.includes(TEST_STUDENT),
                '(1a) student NOT in hiddenStudentIds before hide');
        }

        {
            const { error } = await supabase.rpc('hide_student_versioned', {
                p_student_id: TEST_STUDENT,
                p_branch_id: TEST_BRANCH,
                p_schedule_type: SCHEDULE,
                p_time_slot_index: SLOT_A,
                p_effective_from: HIDE_FROM_DATE,
            });
            assert(!error, `(1) hide_student_versioned RPC succeeds for only slot A: ${error ? error.message : 'ok'}`);

            const result = await supabaseData.getTimeSlotAssignments(TEST_BRANCH, SCHEDULE, YEAR, MONTH);
            const slots = result.assignments
                .filter(r => r.studentId === TEST_STUDENT)
                .map(r => r.timeSlotIndex);
            assertEqual(slots, [],
                '(1) per-slot hide → student excluded from assignments');
            assert(result.hiddenStudentIds.includes(TEST_STUDENT),
                '(1) per-slot hide → student included in hiddenStudentIds');
        }

        // ------------------------------------------------------------------
        // (2) Legacy -1 schedule-wide hide row → student in hiddenStudentIds,
        //     NOT in assignments. Insert a raw -1 row (pre-061 sentinel).
        // ------------------------------------------------------------------
        await cleanup();
        await seedBaseline(SLOT_A);

        {
            const { error } = await supabase
                .from('student_time_slot_assignments')
                .upsert([{
                    student_id: TEST_STUDENT,
                    branch_id: TEST_BRANCH,
                    schedule_type: SCHEDULE,
                    time_slot_index: -1,
                    effective_from: LEGACY_HIDE_DATE,
                    hidden: false,
                    updated_at: new Date().toISOString(),
                }], {
                    onConflict: 'student_id,branch_id,schedule_type,time_slot_index,effective_from',
                });
            assert(!error, `(2) seed legacy -1 sentinel row: ${error ? error.message : 'ok'}`);

            const result = await supabaseData.getTimeSlotAssignments(TEST_BRANCH, SCHEDULE, YEAR, MONTH);
            const slots = result.assignments
                .filter(r => r.studentId === TEST_STUDENT)
                .map(r => r.timeSlotIndex);
            assertEqual(slots, [],
                '(2) legacy schedule-wide -1 hide → student excluded from assignments');
            assert(result.hiddenStudentIds.includes(TEST_STUDENT),
                '(2) legacy schedule-wide -1 hide → student included in hiddenStudentIds');
        }

        // ------------------------------------------------------------------
        // (3) Per-slot hide of ONE of multiple slots → student stays in
        //     assignments for the other slot(s) and NOT in hiddenStudentIds.
        // ------------------------------------------------------------------
        await cleanup();
        await seedBaseline(SLOT_A);
        await seedBaseline(SLOT_B);

        {
            const { error } = await supabase.rpc('hide_student_versioned', {
                p_student_id: TEST_STUDENT,
                p_branch_id: TEST_BRANCH,
                p_schedule_type: SCHEDULE,
                p_time_slot_index: SLOT_A,
                p_effective_from: HIDE_FROM_DATE,
            });
            assert(!error, `(3) hide_student_versioned RPC succeeds for slot A (B survives): ${error ? error.message : 'ok'}`);

            const result = await supabaseData.getTimeSlotAssignments(TEST_BRANCH, SCHEDULE, YEAR, MONTH);
            const slots = result.assignments
                .filter(r => r.studentId === TEST_STUDENT)
                .map(r => r.timeSlotIndex)
                .sort();
            assertEqual(slots, [SLOT_B],
                '(3) per-slot hide on one of two slots → student still visible in the other slot');
            assert(!result.hiddenStudentIds.includes(TEST_STUDENT),
                '(3) per-slot hide on one of two slots → student NOT in hiddenStudentIds (still has a visible slot)');
        }

        // ------------------------------------------------------------------
        // (4) Student with NO rows in this schedule → NOT in
        //     hiddenStudentIds (Halyk auto-seed must still work for new
        //     students).
        // ------------------------------------------------------------------
        await cleanup();
        {
            const result = await supabaseData.getTimeSlotAssignments(TEST_BRANCH, SCHEDULE, YEAR, MONTH);
            assert(!result.hiddenStudentIds.includes(TEST_STUDENT),
                '(4) student with no rows at all is not in hiddenStudentIds (genuinely-new student stays auto-seedable)');
            assert(!result.hiddenStudentIds.includes(NEW_STUDENT),
                '(4) NEW_STUDENT (never inserted) is not in hiddenStudentIds');
            assert(!result.assignments.some(r => r.studentId === TEST_STUDENT),
                '(4) student with no rows at all is not in assignments either');
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
