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
 *   - coachAllowedBranchNames: returns coach's branchNames (from coach_branches)
 *     when locked, null when unlocked
 *   - resolveBranchSelection: locked stays in scope; unlocked picks any
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
assert(typeof lock.coachAllowedBranchNames === 'function', 'coachAllowedBranchNames exported');
assert(typeof lock.resolveBranchSelection === 'function', 'resolveBranchSelection exported');

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

console.log('\n=== coachAllowedBranchNames ===========================================\n');
// Simulates the shape from supabase-data.js getCoaches(): each coach has
// branchNames (the array sourced from coach_branches).
const COACHES = [
    { id: 'coach-uuid-1', branchNames: ['Nish', 'Halyk Arena'] },
    { id: 'coach-uuid-2', branchNames: ['Debut'] },
    { id: 'coach-uuid-3', branchNames: [] }, // assigned to no branches
];

assertEqual(lock.coachAllowedBranchNames(COACH, COACHES), ['Nish', 'Halyk Arena'],
    'locked: returns the coach\'s branchNames from coach_branches');
assertEqual(lock.coachAllowedBranchNames({ isAdmin: false, coachId: 'coach-uuid-3' }, COACHES), [],
    'locked: coach with zero branch assignments → empty array (not null)');
assertEqual(lock.coachAllowedBranchNames({ isAdmin: false, coachId: 'missing' }, COACHES), [],
    'locked: missing coach record → empty array (lock still applies, but no scope)');
assertEqual(lock.coachAllowedBranchNames(COACH, []), [],
    'locked: empty coaches list → empty array');
assertEqual(lock.coachAllowedBranchNames(COACH, null), [],
    'locked: null coaches list → empty array (defensive)');
assertEqual(lock.coachAllowedBranchNames(ADMIN, COACHES), null,
    'admin: returns null (no restriction)');
assertEqual(lock.coachAllowedBranchNames(ANON, COACHES), null,
    'anon: returns null (no restriction)');
assertEqual(lock.coachAllowedBranchNames(null, COACHES), null,
    'null roleInfo: returns null');

console.log('\n=== resolveBranchSelection ============================================\n');
// Locked path — must stay inside coach's branch scope.
const ALLOWED = ['Nish', 'Halyk Arena'];
const AVAILABLE = ['Debut', 'Nish', 'Halyk Arena']; // dropdown options before filtering

assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, 'Nish', AVAILABLE), 'Nish',
    'locked: currentBranch in allowed → keep it');
assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, 'Halyk Arena', AVAILABLE), 'Halyk Arena',
    'locked: another allowed currentBranch → keep it');
assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, 'Debut', AVAILABLE), 'Nish',
    'locked: currentBranch NOT in allowed → DO NOT keep it; fall back to first allowed-and-available');
assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, null, AVAILABLE), 'Nish',
    'locked: no currentBranch → first allowed-and-available branch');
assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, '', AVAILABLE), 'Nish',
    'locked: empty-string currentBranch → first allowed-and-available branch');
assertEqual(lock.resolveBranchSelection(COACH, [], 'Nish', AVAILABLE), null,
    'locked: coach has zero allowed branches → null (do not auto-jump anywhere)');
assertEqual(lock.resolveBranchSelection(COACH, ['Other'], null, AVAILABLE), null,
    'locked: coach\'s allowed branches have no overlap with available → null (no auto-jump)');
assertEqual(lock.resolveBranchSelection(COACH, ALLOWED, null, []), null,
    'locked: no available branches → null');

// Unlocked path — preserve existing UX exactly.
assertEqual(lock.resolveBranchSelection(ADMIN, null, 'Debut', AVAILABLE), 'Debut',
    'admin: currentBranch preserved (no restriction)');
assertEqual(lock.resolveBranchSelection(ADMIN, null, null, AVAILABLE), 'Debut',
    'admin: no current → first available');
assertEqual(lock.resolveBranchSelection(ADMIN, null, null, []), null,
    'admin: no available → null');
assertEqual(lock.resolveBranchSelection(ANON, null, 'Nish', AVAILABLE), 'Nish',
    'anon: preserves currentBranch');
assertEqual(lock.resolveBranchSelection(null, null, null, AVAILABLE), 'Debut',
    'null roleInfo: behaves like unlocked, falls back to first available');

console.log('\n=== end-to-end: branch-change scenarios honor coach_branches ==========\n');
// Scenario: coach has stored 'Debut' in localStorage (e.g. from a prior admin
// session or because they were reassigned away from it). On load, the helper
// should drop the stale branch and pick a current allowed one.
{
    const role = COACH;
    const allowed = lock.coachAllowedBranchNames(role, COACHES);
    let attendanceCurrentBranch = 'Debut'; // simulate localStorage
    // Pretend the available dropdown after filtering.
    const filteredAvailable = AVAILABLE.filter(b => !allowed || allowed.includes(b));
    attendanceCurrentBranch = lock.resolveBranchSelection(
        role, allowed, attendanceCurrentBranch, filteredAvailable
    );
    assertEqual(attendanceCurrentBranch, 'Nish',
        'stale branch from localStorage that the coach is no longer in → first valid branch');
}

// Scenario: navigateToGlobalStudent for a student in 'Debut' when the coach
// is only in 'Nish' / 'Halyk Arena'. The helper should refuse the jump.
{
    const role = COACH;
    const allowed = lock.coachAllowedBranchNames(role, COACHES);
    const studentBranch = 'Debut';
    const allow = Array.isArray(allowed) && allowed.includes(studentBranch);
    assertEqual(allow, false,
        'navigate to out-of-scope student branch: helper reports not allowed');
}

// Scenario: admin / unlocked — branch change behaves exactly as before.
{
    const role = ADMIN;
    const allowed = lock.coachAllowedBranchNames(role, COACHES);
    assertEqual(allowed, null, 'admin: allowed is null (no restriction)');
    assertEqual(lock.resolveBranchSelection(role, allowed, 'Debut', AVAILABLE), 'Debut',
        'admin: can land on any branch');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
