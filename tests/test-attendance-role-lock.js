/**
 * Tests for attendance-role-lock.js — the pure policy module that decides
 * whether the attendance tab's coach filter should be pinned to the
 * signed-in coach.
 *
 * Run: node tests/test-attendance-role-lock.js
 *
 * Covers:
 *   - isCoachLocked: true only for non-admin coach with a resolved coachId
 *   - resolveCoachFilter: locked overrides 'all' / other coach id from storage
 *   - resolveCoachFilter: unlocked preserves caller's value
 *   - coachSelectorVisibility: locked → hidden+disabled; unlocked → visible
 *   - coachOnBranchChange: locked keeps coachId; unlocked resets to 'all'
 *   - Guards: null roleInfo, missing fields, admin without coachId
 */

const lock = require('../attendance-role-lock.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const COACH = { isAdmin: false, coachId: 'coach-uuid-1', email: 'coach@chessempire.kz' };
const ADMIN = { isAdmin: true, coachId: null, email: 'admin@chessempire.kz' };
const ANON = { isAdmin: false, coachId: null, email: null };

console.log('\n=== smoke ==============================================================\n');
assert(typeof lock.isCoachLocked === 'function', 'isCoachLocked exported');
assert(typeof lock.resolveCoachFilter === 'function', 'resolveCoachFilter exported');
assert(typeof lock.coachSelectorVisibility === 'function', 'coachSelectorVisibility exported');
assert(typeof lock.coachOnBranchChange === 'function', 'coachOnBranchChange exported');

console.log('\n=== isCoachLocked =====================================================\n');
assertEqual(lock.isCoachLocked(COACH), true, 'coach with id → locked');
assertEqual(lock.isCoachLocked(ADMIN), false, 'admin (isAdmin:true) → unlocked even if coachId set');
assertEqual(lock.isCoachLocked(ANON), false, 'anon (no coachId) → unlocked');
assertEqual(lock.isCoachLocked(null), false, 'null roleInfo → unlocked (safe default)');
assertEqual(lock.isCoachLocked(undefined), false, 'undefined roleInfo → unlocked');
assertEqual(lock.isCoachLocked({}), false, 'empty object → unlocked');
// Defense-in-depth: even if some caller fabricated {isAdmin:true, coachId:...},
// the admin flag wins. Admins are never locked.
assertEqual(lock.isCoachLocked({ isAdmin: true, coachId: 'x' }), false,
    'admin flag wins over coachId — admins are never locked');

console.log('\n=== resolveCoachFilter ================================================\n');
// Locked path — coach id always wins, regardless of saved value.
assertEqual(lock.resolveCoachFilter(COACH, 'all'), 'coach-uuid-1',
    'locked: saved "all" → coach id (the lock overrides localStorage)');
assertEqual(lock.resolveCoachFilter(COACH, 'other-coach-id'), 'coach-uuid-1',
    'locked: saved other-coach-id → coach id (a coach cannot view another coach)');
assertEqual(lock.resolveCoachFilter(COACH, 'unassigned'), 'coach-uuid-1',
    'locked: saved "unassigned" → coach id');
assertEqual(lock.resolveCoachFilter(COACH, null), 'coach-uuid-1',
    'locked: null current → coach id');
// Unlocked path — caller's value is preserved.
assertEqual(lock.resolveCoachFilter(ADMIN, 'all'), 'all',
    'admin: preserves "all"');
assertEqual(lock.resolveCoachFilter(ADMIN, 'some-coach-id'), 'some-coach-id',
    'admin: preserves chosen coach id');
assertEqual(lock.resolveCoachFilter(ADMIN, null), 'all',
    'admin: null current defaults to "all"');
assertEqual(lock.resolveCoachFilter(ANON, 'all'), 'all',
    'anon: defaults to "all"');
assertEqual(lock.resolveCoachFilter(null, 'all'), 'all',
    'null roleInfo: preserves "all"');

console.log('\n=== coachSelectorVisibility ===========================================\n');
assertEqual(lock.coachSelectorVisibility(COACH), { hidden: true, disabled: true },
    'locked: selector is hidden and disabled');
assertEqual(lock.coachSelectorVisibility(ADMIN), { hidden: false, disabled: false },
    'admin: selector left to existing visibility logic');
assertEqual(lock.coachSelectorVisibility(ANON), { hidden: false, disabled: false },
    'anon: selector left to existing visibility logic');
assertEqual(lock.coachSelectorVisibility(null), { hidden: false, disabled: false },
    'null: selector left to existing visibility logic');

console.log('\n=== coachOnBranchChange — survives branch change ======================\n');
// The original bug: on branch change, attendanceCurrentCoach was reset to 'all'
// for everyone — including coaches, who would briefly see another coach's data.
assertEqual(lock.coachOnBranchChange(COACH), 'coach-uuid-1',
    'locked: branch change keeps the coach id (does not reset to "all")');
assertEqual(lock.coachOnBranchChange(ADMIN), 'all',
    'admin: branch change resets to "all" (preserves existing UX)');
assertEqual(lock.coachOnBranchChange(ANON), 'all',
    'anon: branch change resets to "all"');
assertEqual(lock.coachOnBranchChange(null), 'all',
    'null: branch change resets to "all"');

console.log('\n=== end-to-end behavioral scenarios ===================================\n');
// Scenario: coach signs in, opens attendance with a localStorage value of 'all'
// (left over from when they previously used the tab as admin, or a fresh
// install). The lock must override localStorage on init.
{
    const role = COACH;
    let attendanceCurrentCoach = 'all'; // simulate localStorage
    attendanceCurrentCoach = lock.resolveCoachFilter(role, attendanceCurrentCoach);
    assertEqual(attendanceCurrentCoach, 'coach-uuid-1',
        'init: locked coach overrides "all" from localStorage');

    // Then the coach changes branch. Filter must stay pinned.
    attendanceCurrentCoach = lock.coachOnBranchChange(role);
    assertEqual(attendanceCurrentCoach, 'coach-uuid-1',
        'init → branch change: coach filter survives, still pinned to coach id');

    // Selector visibility holds for both.
    assertEqual(lock.coachSelectorVisibility(role), { hidden: true, disabled: true },
        'init: selector hidden+disabled');
}

// Scenario: admin user — existing UX unchanged.
{
    const role = ADMIN;
    let attendanceCurrentCoach = 'some-saved-coach'; // simulate localStorage
    attendanceCurrentCoach = lock.resolveCoachFilter(role, attendanceCurrentCoach);
    assertEqual(attendanceCurrentCoach, 'some-saved-coach',
        'admin: localStorage value preserved on init');

    attendanceCurrentCoach = lock.coachOnBranchChange(role);
    assertEqual(attendanceCurrentCoach, 'all',
        'admin: branch change resets to "all" (unchanged from prior behavior)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
