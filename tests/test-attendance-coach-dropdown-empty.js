/**
 * Regression tests for the role-agnostic Attendance coach dropdown.
 *
 * The coach selector must always be visible (display: flex) for every role —
 * admin and locked coach alike — and seeded with "All Coaches" plus every
 * coach assigned to the currently selected branch. Hiding the wrapper was
 * the source of the dead-end "blank dropdown" bug; the fix is to never set
 * display: none in the first place.
 *
 * Scenarios (each asserts filterGroup.style.display === 'flex'):
 *   - Admin on 0-coach branch        → All Coaches only, disabled.
 *   - Admin on 1-coach branch        → All Coaches + coach, enabled, auto-pinned.
 *   - Admin on multi-coach branch    → All Coaches + every coach (+ Unassigned), enabled.
 *   - Locked coach on 1-coach branch → All Coaches + coach, enabled, NOT pinned.
 *   - Locked coach on multi-coach    → All Coaches + every coach, enabled.
 *   - No branch selected             → All Coaches placeholder only, disabled.
 *
 * Plus a CSS guard: admin-styles.css must not re-introduce a !important
 * display rule on #attendanceCoachFilterGroup.
 *
 * Run: node tests/test-attendance-coach-dropdown-empty.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

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
// Helpers
// ---------------------------------------------------------------------------

/** Slice out a top-level `function name() { ... }` declaration from src. */
function extractFn(src, name) {
    const idx = src.indexOf(`function ${name}(`);
    if (idx < 0) return '';
    const open = src.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(idx, i + 1);
        }
    }
    return '';
}

/** Tiny mock <select> — only what populateAttendanceCoachDropdown touches. */
function makeSelect() {
    return {
        _options: [],
        innerHTML: 'INITIAL',
        disabled: false,
        value: '',
        appendChild(opt) { this._options.push(opt); },
    };
}

/** Tiny mock filter <div> — only style.display is read/written. */
function makeGroup(initial) {
    return { style: { display: initial == null ? '' : initial } };
}

/**
 * Inspect select state after populate completes: returns the values in the
 * order they were appended, plus the placeholder seeded via innerHTML.
 */
function selectValues(select) {
    return select._options.map(o => o.value);
}
function placeholderHasAll(select) {
    return /value="all"/.test(select.innerHTML);
}

/**
 * Build a callable populateAttendanceCoachDropdown that pulls its globals
 * (window, document, t, attendanceRoleInfo, …) from an injected scope object.
 * Returns invoke(scope). attendanceCurrentCoach mutations inside the function
 * cannot be observed from the test (the parameter is local to the sandbox),
 * so auto-pin is verified via select.value, which the function writes at the
 * end of the populate path.
 */
function loadPopulate(fnSrc) {
    const body = `
'use strict';
${fnSrc}
return populateAttendanceCoachDropdown;
`;
    const factory = new Function(
        'window', 'document', 't',
        'attendanceRoleInfo', 'attendanceCurrentBranch',
        'attendanceCurrentCoach', 'attendanceCurrentCoachName',
        'syncMobileCoachFilter', 'console',
        body
    );

    return function invoke(scope) {
        const fn = factory(
            scope.window,
            scope.document,
            (k) => k,
            scope.attendanceRoleInfo,
            scope.attendanceCurrentBranch,
            scope.attendanceCurrentCoach,
            scope.attendanceCurrentCoachName,
            scope.syncMobileCoachFilter || (() => {}),
            scope.console || console
        );
        return fn();
    };
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const BRANCH_HALYK = { id: 'b-halyk', name: 'Halyk Arena' };
const BRANCH_DEBUT = { id: 'b-debut', name: 'Debut' };
const BRANCH_GHOST = { id: 'b-ghost', name: 'Ghost Branch' }; // no coaches

const COACH_ALICE = {
    id: 'alice', firstName: 'Alice', lastName: 'A', fullName: 'Alice A',
    branchNames: ['Halyk Arena', 'Debut'], branchIds: ['b-halyk', 'b-debut'],
};
const COACH_BOB = {
    id: 'bob', firstName: 'Bob', lastName: 'B', fullName: 'Bob B',
    branchNames: ['Debut'], branchIds: ['b-debut'],
};
const COACH_DAN = {
    id: 'dan', firstName: 'Dan', lastName: 'D', fullName: 'Dan D',
    branchNames: ['Halyk Arena'], branchIds: ['b-halyk'],
};

function makeDocument(select, group) {
    return {
        getElementById(id) {
            if (id === 'attendanceCoachFilter') return select;
            if (id === 'attendanceCoachFilterGroup') return group;
            return null;
        },
        createElement(tag) {
            return { tagName: tag, value: '', textContent: '', selected: false };
        },
    };
}

function runPopulate({ roleInfo, branch, coach = 'all', coaches, students = [], branches }) {
    const invoke = loadPopulate(extractFn(ADMIN_V2_SRC, 'populateAttendanceCoachDropdown'));
    const select = makeSelect();
    const group = makeGroup('none'); // start hidden — populate should flip to flex
    const document = makeDocument(select, group);
    const window = { coaches, branches, students };
    let mobileSyncCalled = 0;

    invoke({
        window, document,
        attendanceRoleInfo: roleInfo,
        attendanceCurrentBranch: branch,
        attendanceCurrentCoach: coach,
        attendanceCurrentCoachName: null,
        syncMobileCoachFilter: () => { mobileSyncCalled++; },
    });

    return { select, group, mobileSyncCalled };
}

// ---------------------------------------------------------------------------
// (1) Admin scenarios
// ---------------------------------------------------------------------------
console.log('\n=== Admin scenarios ===================================================\n');

const ADMIN = { isAdmin: true, coachId: null };

{
    // 0-coach branch: visible, only "All Coaches", disabled.
    const { select, group } = runPopulate({
        roleInfo: ADMIN,
        branch: 'Ghost Branch',
        coaches: [COACH_ALICE, COACH_BOB, COACH_DAN],
        branches: [BRANCH_HALYK, BRANCH_DEBUT, BRANCH_GHOST],
    });
    assertEqual(group.style.display, 'flex',
        'admin / 0-coach branch: filterGroup is visible (display: flex)');
    assert(placeholderHasAll(select),
        'admin / 0-coach branch: All Coaches placeholder seeded');
    assertEqual(selectValues(select), [],
        'admin / 0-coach branch: no coach <option> elements appended');
    assertEqual(select.disabled, true,
        'admin / 0-coach branch: select disabled');
}

{
    // 1-coach branch: visible, All Coaches + that coach, enabled, auto-pinned.
    const branches = [BRANCH_HALYK, BRANCH_DEBUT];
    const { select, group } = runPopulate({
        roleInfo: ADMIN,
        branch: 'Halyk Arena',
        coach: 'all',
        coaches: [COACH_DAN],
        branches,
    });
    assertEqual(group.style.display, 'flex',
        'admin / 1-coach branch: filterGroup is visible (display: flex)');
    assert(placeholderHasAll(select),
        'admin / 1-coach branch: All Coaches placeholder seeded');
    assertEqual(selectValues(select), ['dan'],
        'admin / 1-coach branch: the only coach appended as an option');
    assertEqual(select.disabled, false,
        'admin / 1-coach branch: select enabled');
    assertEqual(select.value, 'dan',
        'admin / 1-coach branch: auto-pinned to the only coach');
    // The option marked selected should be the auto-pinned coach.
    assert(select._options[0].selected === true,
        'admin / 1-coach branch: the coach option is marked selected');
}

{
    // Multi-coach branch + unassigned student: visible, All Coaches + every
    // coach + Unassigned, enabled.
    const students = [{
        branchId: 'b-debut', coachId: null, status: 'active',
    }];
    const { select, group } = runPopulate({
        roleInfo: ADMIN,
        branch: 'Debut',
        coach: 'all',
        coaches: [COACH_ALICE, COACH_BOB],
        branches: [BRANCH_HALYK, BRANCH_DEBUT],
        students,
    });
    assertEqual(group.style.display, 'flex',
        'admin / multi-coach branch: filterGroup is visible (display: flex)');
    assert(placeholderHasAll(select),
        'admin / multi-coach branch: All Coaches placeholder seeded');
    assertEqual(selectValues(select), ['alice', 'bob', 'unassigned'],
        'admin / multi-coach branch: every coach + Unassigned appended');
    assertEqual(select.disabled, false,
        'admin / multi-coach branch: select enabled');
}

{
    // Multi-coach branch with no unassigned students: no Unassigned option.
    const { select, group } = runPopulate({
        roleInfo: ADMIN,
        branch: 'Debut',
        coach: 'all',
        coaches: [COACH_ALICE, COACH_BOB],
        branches: [BRANCH_HALYK, BRANCH_DEBUT],
        students: [],
    });
    assertEqual(group.style.display, 'flex',
        'admin / multi-coach branch (no unassigned): filterGroup visible');
    assertEqual(selectValues(select), ['alice', 'bob'],
        'admin / multi-coach branch (no unassigned): only coach options appended');
}

// ---------------------------------------------------------------------------
// (2) Locked coach scenarios — same dropdown UX as admin
// ---------------------------------------------------------------------------
console.log('\n=== Locked coach scenarios ============================================\n');

const LOCKED_ALICE = { isAdmin: false, coachId: 'alice' };

{
    // Locked coach on 1-coach branch: visible, All Coaches + coach, enabled,
    // NOT pinned (the user's saved 'all' selection sticks).
    const { select, group } = runPopulate({
        roleInfo: LOCKED_ALICE,
        branch: 'Halyk Arena',
        coach: 'all',
        coaches: [COACH_DAN],
        branches: [BRANCH_HALYK],
    });
    assertEqual(group.style.display, 'flex',
        'locked / 1-coach branch: filterGroup is visible (display: flex)');
    assert(placeholderHasAll(select),
        'locked / 1-coach branch: All Coaches placeholder seeded');
    assertEqual(selectValues(select), ['dan'],
        'locked / 1-coach branch: the only coach appended as an option');
    assertEqual(select.disabled, false,
        'locked / 1-coach branch: select enabled');
    // NOT pinned — value stays at the placeholder ('all'); no auto-mutation
    // of attendanceCurrentCoach for the locked role.
    assert(select.value !== 'dan',
        'locked / 1-coach branch: NOT auto-pinned to the only coach');
}

{
    // Locked coach on multi-coach branch: visible, All Coaches + every coach,
    // enabled.
    const { select, group } = runPopulate({
        roleInfo: LOCKED_ALICE,
        branch: 'Debut',
        coach: 'all',
        coaches: [COACH_ALICE, COACH_BOB],
        branches: [BRANCH_HALYK, BRANCH_DEBUT],
        students: [],
    });
    assertEqual(group.style.display, 'flex',
        'locked / multi-coach branch: filterGroup is visible (display: flex)');
    assert(placeholderHasAll(select),
        'locked / multi-coach branch: All Coaches placeholder seeded');
    assertEqual(selectValues(select), ['alice', 'bob'],
        'locked / multi-coach branch: every coach appended');
    assertEqual(select.disabled, false,
        'locked / multi-coach branch: select enabled');
}

// ---------------------------------------------------------------------------
// (3) No branch selected — both roles
// ---------------------------------------------------------------------------
console.log('\n=== No branch selected ================================================\n');

for (const [label, roleInfo] of [['admin', ADMIN], ['locked coach', LOCKED_ALICE]]) {
    const { select, group } = runPopulate({
        roleInfo,
        branch: null,
        coaches: [COACH_ALICE, COACH_BOB],
        branches: [BRANCH_HALYK, BRANCH_DEBUT],
    });
    assertEqual(group.style.display, 'flex',
        `${label} / no branch: filterGroup is visible (display: flex)`);
    assert(placeholderHasAll(select),
        `${label} / no branch: All Coaches placeholder seeded`);
    assertEqual(selectValues(select), [],
        `${label} / no branch: no coach <option> elements appended`);
    assertEqual(select.disabled, true,
        `${label} / no branch: select disabled`);
}

// ---------------------------------------------------------------------------
// (4) CSS guard — admin-styles.css must NOT re-introduce a `display: flex
//     !important` rule scoped to #attendanceCoachFilterGroup. Even though
//     the wrapper is always visible now, an !important override would
//     prevent a future legitimate hide path from working.
// ---------------------------------------------------------------------------
console.log('\n=== admin-styles.css guard (no !important on filter group) ===========\n');

{
    const cssSrc = fs.readFileSync(path.join(ROOT, 'admin-styles.css'), 'utf8');
    assert(!/#attendanceCoachFilterGroup\s*\{[^}]*!important/.test(cssSrc),
        'admin-styles.css has no #attendanceCoachFilterGroup rule using !important');
}

// ---------------------------------------------------------------------------
// (5) Source guard — populate must never set display: none on the wrapper.
//     Catches a future refactor that re-introduces hiding behavior.
// ---------------------------------------------------------------------------
console.log('\n=== populateAttendanceCoachDropdown source guard =====================\n');

{
    const populateSrc = extractFn(ADMIN_V2_SRC, 'populateAttendanceCoachDropdown');
    assert(populateSrc.length > 0,
        'populateAttendanceCoachDropdown located in admin-v2.js');
    assert(!/filterGroup\.style\.display\s*=\s*['"]none['"]/.test(populateSrc),
        'populate never sets filterGroup.style.display = "none"');
    assert(/filterGroup\.style\.display\s*=\s*['"]flex['"]/.test(populateSrc),
        'populate sets filterGroup.style.display = "flex"');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
