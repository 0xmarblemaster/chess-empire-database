/**
 * Tests for TASK_cross_coach_add.md — cross-coach attendance visibility.
 *
 * getAttendanceCalendarData(branchId, scheduleType, year, month, coachId) must,
 * for a SPECIFIC coach + a scheduleType, union the coach's own students with the
 * set of students assigned to that branch+schedule via
 * student_time_slot_assignments — so a coach sees (and can add) any active branch
 * student regardless of coach_id, without changing any coach_id.
 *
 * Assertions:
 *   1. specific coach + scheduleType + non-empty assignments → students query
 *      issues .or('coach_id.eq.<id>,id.in.(...)') and NO plain .eq('coach_id',...).
 *   2. specific coach + scheduleType + EMPTY assignments → falls back to
 *      .eq('coach_id', <id>), no .or(), no empty in.().
 *   3. coachId 'all' (or null) → no assignments query, no coach filter.
 *   4. coachId 'unassigned' → .is('coach_id', null), no assignments query.
 *   5. returned students include a cross-coach student (owned by coachB) that is
 *      in the assignments set for the selected schedule.
 *
 * Uses the same Node `window` shim as test-attendance-delete-persists.js: set
 * global.window = { supabaseClient }, require the real supabase-data.js, and call
 * the actual getAttendanceCalendarData against a recording mock client.
 *
 * Run: node tests/test-attendance-cross-coach-add.js
 */

'use strict';

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

// ---------------------------------------------------------------------------
// Recording mock supabase client.
//
// Each `.from(table)` starts a fresh query builder that records every chained
// call ({ method, args }). The builder is thenable so `await query` resolves to
// { data, error } drawn from the canned tables map. All builder methods return
// `this` so chaining works for any order/length of calls.
// ---------------------------------------------------------------------------
function makeMockClient(tables) {
    const calls = []; // flat log of { table, method, args } across all builders

    function makeBuilder(table) {
        const record = { table, chain: [] };
        const builder = {
            _record: record,
            _resolve() {
                const data = tables[table];
                return { data: data === undefined ? [] : data, error: null };
            },
            then(onFulfilled, onRejected) {
                return Promise.resolve(this._resolve()).then(onFulfilled, onRejected);
            },
        };
        for (const method of ['select', 'eq', 'is', 'or', 'order', 'gte', 'lte', 'in']) {
            builder[method] = function (...args) {
                record.chain.push({ method, args });
                calls.push({ table, method, args });
                return this;
            };
        }
        return builder;
    }

    return {
        _calls: calls,
        from(table) {
            const b = makeBuilder(table);
            calls.push({ table, method: 'from', args: [table] });
            return b;
        },
    };
}

function loadSupabaseData(supabaseClient) {
    global.window = { supabaseClient };
    const file = path.join(ROOT, 'supabase-data.js');
    delete require.cache[require.resolve(file)];
    require(file);
    return global.window.supabaseData;
}

// Query helpers over the flat call log, scoped to a table.
function callsFor(client, table) {
    return client._calls.filter(c => c.table === table);
}
function methodCalls(client, table, method) {
    return callsFor(client, table).filter(c => c.method === method);
}

const COACH_A = 'aaaaaaaa-1111-2222-3333-444455556666';
const COACH_B = 'bbbbbbbb-1111-2222-3333-444455556666';
const BRANCH = 'branch-1';
const STUDENT_OWN = 'student-own-0001';
const STUDENT_CROSS = 'student-cross-0002'; // owned by COACH_B, assigned to A's schedule

// ---------------------------------------------------------------------------
// (1) specific coach + scheduleType + non-empty assignments → .or() union
// ---------------------------------------------------------------------------
async function test_union_when_assigned() {
    console.log('\n=== (1) specific coach + schedule + assignments → .or() union =========\n');
    const client = makeMockClient({
        student_time_slot_assignments: [
            { student_id: STUDENT_OWN },
            { student_id: STUDENT_CROSS },
            { student_id: STUDENT_CROSS }, // duplicate → collapses
            { student_id: null },          // null → dropped
        ],
        students: [
            { id: STUDENT_OWN, first_name: 'Own', last_name: 'A', coach_id: COACH_A },
            { id: STUDENT_CROSS, first_name: 'Cross', last_name: 'B', coach_id: COACH_B },
        ],
        attendance: [],
    });
    const sd = loadSupabaseData(client);
    await sd.getAttendanceCalendarData(BRANCH, 'mon_fri', 2026, 8, COACH_A);

    // Assignments query ran on the right table with branch + schedule filters.
    const assignCalls = callsFor(client, 'student_time_slot_assignments');
    assert(assignCalls.length > 0, 'issued a student_time_slot_assignments query');
    const assignEqs = methodCalls(client, 'student_time_slot_assignments', 'eq').map(c => c.args);
    assert(assignEqs.some(a => a[0] === 'branch_id' && a[1] === BRANCH),
        'assignments query filters .eq(branch_id, branchId)');
    assert(assignEqs.some(a => a[0] === 'schedule_type' && a[1] === 'mon_fri'),
        'assignments query filters .eq(schedule_type, scheduleType)');

    // Students query issued an .or() containing both the coach eq and the id in().
    const orCalls = methodCalls(client, 'students', 'or').map(c => c.args[0]);
    assert(orCalls.length === 1, 'students query issued exactly one .or()');
    const or = orCalls[0] || '';
    assert(or.includes(`coach_id.eq.${COACH_A}`), '.or() includes coach_id.eq.<coachId>');
    assert(/id\.in\.\(/.test(or), '.or() includes id.in.(...)');
    assert(or.includes(STUDENT_OWN) && or.includes(STUDENT_CROSS),
        '.or() id.in.() lists both assigned student ids');
    // Deduped: STUDENT_CROSS must appear once, null must not appear.
    const inList = (or.match(/id\.in\.\(([^)]*)\)/) || [])[1] || '';
    const ids = inList.split(',').filter(Boolean);
    assertEqual(ids.filter(x => x === STUDENT_CROSS).length, 1,
        'duplicate assigned id collapsed to a single entry');
    assert(!ids.includes('null') && !ids.includes(''),
        'null / empty student_id excluded from the in() list');

    // No plain .eq('coach_id', ...) on the students query in the union path.
    const studentCoachEq = methodCalls(client, 'students', 'eq')
        .map(c => c.args).filter(a => a[0] === 'coach_id');
    assertEqual(studentCoachEq.length, 0,
        'students query does NOT issue a plain .eq(coach_id, ...) in the union path');
}

// ---------------------------------------------------------------------------
// (2) specific coach + scheduleType + EMPTY assignments → fallback .eq()
// ---------------------------------------------------------------------------
async function test_fallback_when_empty() {
    console.log('\n=== (2) specific coach + schedule + no assignments → .eq fallback =====\n');
    const client = makeMockClient({
        student_time_slot_assignments: [], // empty set
        students: [
            { id: STUDENT_OWN, first_name: 'Own', last_name: 'A', coach_id: COACH_A },
        ],
        attendance: [],
    });
    const sd = loadSupabaseData(client);
    await sd.getAttendanceCalendarData(BRANCH, 'mon_fri', 2026, 8, COACH_A);

    assert(callsFor(client, 'student_time_slot_assignments').length > 0,
        'assignments query still runs (to discover it is empty)');

    const orCalls = methodCalls(client, 'students', 'or');
    assertEqual(orCalls.length, 0, 'no .or() issued when assignments set is empty');

    const studentCoachEq = methodCalls(client, 'students', 'eq')
        .map(c => c.args).filter(a => a[0] === 'coach_id');
    assertEqual(studentCoachEq, [['coach_id', COACH_A]],
        'falls back to a single .eq(coach_id, coachId)');

    // Never emit an empty in.() anywhere.
    const anyOr = client._calls.filter(c => c.method === 'or').map(c => c.args[0] || '');
    assert(!anyOr.some(s => /in\.\(\)/.test(s)), 'no empty in.() emitted');
}

// ---------------------------------------------------------------------------
// (3) coachId 'all' (and null) → no assignments query, no coach filter
// ---------------------------------------------------------------------------
async function test_all_and_null_unchanged() {
    console.log('\n=== (3) coachId all/null → unchanged (no assignments, no filter) ======\n');
    for (const coachId of ['all', null]) {
        const client = makeMockClient({
            students: [
                { id: STUDENT_OWN, first_name: 'Own', last_name: 'A', coach_id: COACH_A },
            ],
            attendance: [],
        });
        const sd = loadSupabaseData(client);
        await sd.getAttendanceCalendarData(BRANCH, 'mon_fri', 2026, 8, coachId);

        assertEqual(callsFor(client, 'student_time_slot_assignments').length, 0,
            `coachId=${coachId}: no assignments query (no useless round-trip)`);
        assertEqual(methodCalls(client, 'students', 'or').length, 0,
            `coachId=${coachId}: no .or() on students`);
        const coachEq = methodCalls(client, 'students', 'eq')
            .map(c => c.args).filter(a => a[0] === 'coach_id');
        assertEqual(coachEq.length, 0, `coachId=${coachId}: no coach_id filter`);
        assertEqual(methodCalls(client, 'students', 'is').length, 0,
            `coachId=${coachId}: no .is() on students`);
    }
}

// ---------------------------------------------------------------------------
// (4) coachId 'unassigned' → .is('coach_id', null), no assignments query
// ---------------------------------------------------------------------------
async function test_unassigned_unchanged() {
    console.log('\n=== (4) coachId unassigned → .is(coach_id, null), unchanged ===========\n');
    const client = makeMockClient({
        students: [
            { id: STUDENT_OWN, first_name: 'Own', last_name: 'A', coach_id: null },
        ],
        attendance: [],
    });
    const sd = loadSupabaseData(client);
    await sd.getAttendanceCalendarData(BRANCH, 'mon_fri', 2026, 8, 'unassigned');

    assertEqual(callsFor(client, 'student_time_slot_assignments').length, 0,
        'unassigned: no assignments query');
    const isCalls = methodCalls(client, 'students', 'is').map(c => c.args);
    assertEqual(isCalls, [['coach_id', null]], 'unassigned: issues .is(coach_id, null)');
    assertEqual(methodCalls(client, 'students', 'or').length, 0, 'unassigned: no .or()');
}

// ---------------------------------------------------------------------------
// (5) returned students include a cross-coach student in the assignments set
// ---------------------------------------------------------------------------
async function test_cross_coach_student_returned() {
    console.log('\n=== (5) cross-coach student surfaces in returned students =============\n');
    // The DB would apply the .or() filter; our mock returns whatever `students`
    // canned data we give it. Model the post-filter result: both the coach's own
    // student and the cross-coach student (owned by COACH_B) come back because
    // the union query matched the assignment on id.in.().
    const client = makeMockClient({
        student_time_slot_assignments: [
            { student_id: STUDENT_CROSS },
        ],
        students: [
            { id: STUDENT_OWN, first_name: 'Own', last_name: 'Astudent', coach_id: COACH_A },
            { id: STUDENT_CROSS, first_name: 'Cross', last_name: 'Bstudent', coach_id: COACH_B },
        ],
        attendance: [],
    });
    const sd = loadSupabaseData(client);
    const result = await sd.getAttendanceCalendarData(BRANCH, 'mon_fri', 2026, 8, COACH_A);

    const ids = result.students.map(s => s.id);
    assert(ids.includes(STUDENT_CROSS),
        'returned students include the cross-coach student (owned by coachB)');
    assert(ids.includes(STUDENT_OWN),
        'returned students still include the coach\'s own student');
    const cross = result.students.find(s => s.id === STUDENT_CROSS);
    assertEqual({ firstName: cross.firstName, lastName: cross.lastName },
        { firstName: 'Cross', lastName: 'Bstudent' },
        'cross-coach student is mapped to the { firstName, lastName } shape');
}

(async () => {
    await test_union_when_assigned();
    await test_fallback_when_empty();
    await test_all_and_null_unchanged();
    await test_unassigned_unchanged();
    await test_cross_coach_student_returned();

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})();
