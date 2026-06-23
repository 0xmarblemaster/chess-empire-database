/**
 * Regression tests for the attendance coach-dropdown empty-options bug.
 *
 * Background — see /root/.claude/plans/floating-weaving-snowflake.md:
 * a locked coach (admin-v2.js:6507 path) at a multi-coach branch could render
 * a fully blank <select> when coachesAtBranch returned []. The dropdown showed
 * no options *and* no placeholder, an unrecoverable dead-end UI.
 *
 * This file exercises the three defensive fixes shipped together:
 *
 *  1. attendance-role-lock.js coachesAtBranch — when no coach matches by
 *     branchNames, the function now falls back to resolving the branch by id
 *     (via the optional `branches` arg) and matching coaches by branchIds.
 *
 *  2. admin-v2.js populateAttendanceCoachDropdown locked path — if
 *     branchCoaches.length === 0 after the fallback also fails, the function
 *     hides the filter group (display: none), disables the select, logs a
 *     console.warn naming the empty branch, and returns. The blank-box
 *     dead-end is now a clean hidden-filter state.
 *
 *  3. admin-v2.js populateAttendanceCoachDropdown — if attendanceRoleInfo
 *     reports isAdmin === true, the locked path is skipped *unconditionally*,
 *     even if a coachId is also present. Admins always get the admin path
 *     (which seeds the "All Coaches" option).
 *
 * Run: node tests/test-attendance-coach-dropdown-empty.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const lock = require('../attendance-role-lock.js');

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
 * Build a callable populateAttendanceCoachDropdown that pulls its globals
 * (window, document, t, attendanceRoleInfo, …) from an injected scope object.
 * Returns { invoke(scope), warnings: [] }.
 */
function loadPopulate() {
    const fnSrc = extractFn(ADMIN_V2_SRC, 'populateAttendanceCoachDropdown');
    if (!fnSrc) throw new Error('populateAttendanceCoachDropdown not found in admin-v2.js');

    const warnings = [];
    const consoleStub = { warn: (...args) => warnings.push(args), log() {}, error() {} };

    // Wrap the extracted function so its free identifiers resolve to the
    // sandbox we pass in. `t` is a no-op translator returning the key.
    const body = `
'use strict';
${fnSrc}
return populateAttendanceCoachDropdown;
`;
    const factory = new Function(
        'window', 'document', 't',
        'attendanceRoleInfo', 'attendanceCurrentBranch', 'attendanceCurrentCoach',
        'attendanceCurrentCoachName', 'syncMobileCoachFilter', 'console',
        body
    );

    function invoke(scope) {
        const fn = factory(
            scope.window,
            scope.document,
            (k) => k,
            scope.attendanceRoleInfo,
            scope.attendanceCurrentBranch,
            scope.attendanceCurrentCoach,
            scope.attendanceCurrentCoachName,
            scope.syncMobileCoachFilter || (() => {}),
            consoleStub
        );
        return fn();
    }

    return { invoke, warnings };
}

// ---------------------------------------------------------------------------
// (1) Pure-function: coachesAtBranch fallback via branchIds when branchNames
//     is empty — Case B from the plan.
// ---------------------------------------------------------------------------
console.log('\n=== coachesAtBranch fallback (Case B) =================================\n');

{
    // Alex is assigned to Halyk Arena via branchIds, but the supabase-data join
    // somehow returned an empty branchNames array. The old code would treat him
    // as unassigned at every branch.
    const coaches = [{
        id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
        branchNames: [], branchIds: ['b-halyk'],
    }];
    const branches = [{ id: 'b-halyk', name: 'Halyk Arena' }];

    // Without the branches arg, the original behavior must be preserved
    // (empty array) — we don't want to silently change the contract for
    // callers that don't pass branches.
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena'), [],
        'no branches arg → original behavior (empty array) preserved');

    // With branches, the fallback kicks in and the coach is recovered.
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', branches),
        [{ id: 'alex', name: 'Alex X' }],
        'fallback: branchNames empty but branchIds matches → coach recovered');
}

{
    // When branchNames DOES match, branches is irrelevant — the primary lookup
    // wins and the result is the same. (Defensive: the fallback must not run
    // when the primary already succeeded, or it could double-count.)
    const coaches = [{
        id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
        branchNames: ['Halyk Arena'], branchIds: ['b-halyk'],
    }];
    const branches = [{ id: 'b-halyk', name: 'Halyk Arena' }];
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', branches),
        [{ id: 'alex', name: 'Alex X' }],
        'primary branchNames match → branches arg is ignored (no double-count)');
}

{
    // No coach assigned via either path → empty array even with the fallback.
    const coaches = [{
        id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
        branchNames: [], branchIds: [],
    }];
    const branches = [{ id: 'b-halyk', name: 'Halyk Arena' }];
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', branches), [],
        'no match by name OR id → still empty (defensive fallback does not invent matches)');
}

{
    // Branch name not present in branches → fallback can't resolve an id and
    // bails out with empty. (Guards against the fallback accidentally matching
    // every coach when branchObj is undefined.)
    const coaches = [{
        id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
        branchNames: [], branchIds: ['b-halyk'],
    }];
    const branches = [{ id: 'b-other', name: 'Other Branch' }];
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', branches), [],
        'branch not in branches list → fallback bails out, empty result');
}

{
    // Branches is not an array → fallback is skipped (existing contract).
    const coaches = [{
        id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
        branchNames: [], branchIds: ['b-halyk'],
    }];
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', null), [],
        'branches = null → original behavior, no fallback');
    assertEqual(lock.coachesAtBranch(coaches, 'Halyk Arena', undefined), [],
        'branches = undefined → original behavior, no fallback');
}

// ---------------------------------------------------------------------------
// (2) populateAttendanceCoachDropdown — locked path with branchCoaches=[]
//     hides the group (Case D, the defensive guard).
// ---------------------------------------------------------------------------
console.log('\n=== populateAttendanceCoachDropdown locked-empty guard (Case D) ======\n');

{
    // We isolate the new defensive guard (path B) by stubbing the lock module
    // so coachSelectorVisibilityForBranch reports hidden=false (visible
    // selector) while coachesAtBranch returns []. In live data the two
    // helpers are computed off the same source, so triggering this exact
    // mismatch organically is hard — but the defensive guard exists precisely
    // to catch an impossible-looking case, and the test must exercise it.
    const { invoke, warnings } = loadPopulate();
    warnings.length = 0;

    const select = makeSelect();
    const group = makeGroup('flex');
    const document = {
        getElementById(id) {
            if (id === 'attendanceCoachFilter') return select;
            if (id === 'attendanceCoachFilterGroup') return group;
            return null;
        },
    };

    const window = {
        attendanceRoleLock: {
            isCoachLocked: lock.isCoachLocked,
            coachSelectorVisibilityForBranch: () => ({
                hidden: false, disabled: false, allowedCoachIds: ['alex'],
            }),
            coachesAtBranch: () => [],
        },
        coaches: [{
            id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
            branchNames: [], branchIds: [],
        }],
        branches: [{ id: 'b-halyk', name: 'Halyk Arena' }],
        students: [],
    };

    let mobileSyncCalled = 0;
    invoke({
        window, document,
        attendanceRoleInfo: { isAdmin: false, coachId: 'alex' },
        attendanceCurrentBranch: 'Halyk Arena',
        attendanceCurrentCoach: 'alex',
        attendanceCurrentCoachName: 'Alex X',
        syncMobileCoachFilter: () => { mobileSyncCalled++; },
    });

    assertEqual(group.style.display, 'none',
        'filterGroup is hidden when branchCoaches=[] in locked path');
    assertEqual(select.disabled, true,
        'select is disabled (no options to choose from)');
    assertEqual(select.innerHTML, '',
        'select is cleared (no stale options left behind)');
    assertEqual(select._options.length, 0,
        'no <option> elements appended');
    assert(mobileSyncCalled === 1,
        'syncMobileCoachFilter() is called so the mobile filter mirrors desktop');

    const warned = warnings.some(w =>
        String(w[0]).includes('[attendance]') &&
        w.some(arg => arg === 'Halyk Arena')
    );
    assert(warned,
        'console.warn fires naming the empty branch (Halyk Arena)');
}

// ---------------------------------------------------------------------------
// (3) populateAttendanceCoachDropdown — admin always skips the locked path
//     (Case A defense-in-depth).
// ---------------------------------------------------------------------------
console.log('\n=== populateAttendanceCoachDropdown admin always skips locked path ===\n');

{
    const { invoke, warnings } = loadPopulate();
    warnings.length = 0;

    const select = makeSelect();
    const group = makeGroup('none');
    const document = {
        getElementById(id) {
            if (id === 'attendanceCoachFilter') return select;
            if (id === 'attendanceCoachFilterGroup') return group;
            return null;
        },
        createElement(tag) {
            return { tagName: tag, value: '', textContent: '', selected: false };
        },
    };

    // Adversarial roleInfo: isAdmin=true AND a coachId is set. Without the
    // explicit admin short-circuit, isCoachLocked already returns false here
    // (admin flag wins), but the source-pattern check below verifies the guard
    // is present. This functional check verifies admins ALWAYS see the
    // admin path's "All Coaches" seed regardless of how the lock module
    // interprets a hybrid roleInfo.
    const window = {
        attendanceRoleLock: lock,
        coaches: [{
            id: 'alex', firstName: 'Alex', lastName: 'X', fullName: 'Alex X',
            branchNames: ['Halyk Arena'], branchIds: ['b-halyk'],
        }, {
            id: 'bob', firstName: 'Bob', lastName: 'Y', fullName: 'Bob Y',
            branchNames: ['Halyk Arena'], branchIds: ['b-halyk'],
        }],
        branches: [{ id: 'b-halyk', name: 'Halyk Arena' }],
        students: [],
    };

    invoke({
        window, document,
        attendanceRoleInfo: { isAdmin: true, coachId: 'alex' }, // hybrid
        attendanceCurrentBranch: 'Halyk Arena',
        attendanceCurrentCoach: 'all',
        attendanceCurrentCoachName: null,
        syncMobileCoachFilter: () => {},
    });

    // Admin path seeds an "All Coaches" option. The locked path would have
    // wiped that and rendered the branch's coaches (or shown a blank box if
    // branchCoaches=[]). Asserting that the admin "all" option exists proves
    // the admin path ran.
    assert(/value="all"/.test(select.innerHTML),
        'admin path seeds <option value="all"> (locked path was skipped)');
}

// ---------------------------------------------------------------------------
// (4) Source-pattern guards — fast-failing checks so a future refactor that
//     removes the admin short-circuit or the empty-branchCoaches guard
//     trips this test instead of regressing in production.
// ---------------------------------------------------------------------------
console.log('\n=== source-pattern guards (admin-v2.js) ==============================\n');

{
    const populateSrc = extractFn(ADMIN_V2_SRC, 'populateAttendanceCoachDropdown');
    assert(populateSrc.length > 0,
        'populateAttendanceCoachDropdown located in admin-v2.js');

    // Explicit admin short-circuit on the locked-path gate.
    assert(/attendanceRoleInfo\s*&&\s*attendanceRoleInfo\.isAdmin/.test(populateSrc),
        'locked-path gate reads attendanceRoleInfo.isAdmin (explicit admin short-circuit)');
    assert(/!isAdminUser\s*&&\s*window\.attendanceRoleLock\s*&&\s*window\.attendanceRoleLock\.isCoachLocked/.test(populateSrc),
        'gate is `!isAdminUser && ... isCoachLocked(...)` (admin always skips locked path)');

    // Defensive empty-branchCoaches guard with console.warn.
    assert(/branchCoaches\.length\s*===\s*0/.test(populateSrc),
        'locked path guards branchCoaches.length === 0 explicitly');
    assert(/console\.warn\([^)]*\[attendance\]/.test(populateSrc),
        'console.warn fires with [attendance] tag when guard trips');
    assert(/filterGroup\.style\.display\s*=\s*'none'/.test(populateSrc),
        'guard hides filterGroup (display: none) — not the blank-box dead-end');

    // The fallback branches arg is threaded through to coachesAtBranch and
    // coachSelectorVisibilityForBranch so the fix actually engages at runtime.
    assert(/coachesAtBranch\(\s*window\.coaches\s*,\s*attendanceCurrentBranch\s*,\s*window\.branches\s*\)/.test(populateSrc),
        'coachesAtBranch is invoked with window.branches as the fallback source');
    assert(/coachSelectorVisibilityForBranch\([^)]*window\.branches\s*\)/.test(populateSrc),
        'coachSelectorVisibilityForBranch is invoked with window.branches threaded through');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
