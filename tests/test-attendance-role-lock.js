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

console.log('\n=== admin keeps current behavior: full visibility + working dropdown ==\n');
// Ralph PRD attendance-fix-1 item: "Admins keep current behavior: full
// visibility and the working dropdown." This block ties the admin assertions
// together as a single integrated scenario so the requirement is traceable to
// the policy module. None of the lock policies may narrow the admin's view.
{
    const role = ADMIN;

    // Gate — the lock is the single switch every consumer checks first.
    assertEqual(lock.isCoachLocked(role), false,
        'admin: lock is off (every downstream check short-circuits to existing UX)');

    // Full visibility — branch filter is null, so admin.js / admin-v2.js
    // skip the `if (Array.isArray(allowedBranches))` branch and render every
    // branch. The dropdown reflects window.students, unfiltered.
    const allowed = lock.coachAllowedBranchNames(role, COACHES);
    assertEqual(allowed, null,
        'admin: coachAllowedBranchNames is null (consumers treat as "no restriction")');
    const filteredAvailable = AVAILABLE.filter(b => !allowed || allowed.includes(b));
    assertEqual(filteredAvailable, AVAILABLE,
        'admin: branch dropdown contains every available branch (full visibility)');

    // Working dropdown — coach selector is visible and enabled. The signed-in
    // admin sees the full coach list with the "All" option intact.
    assertEqual(lock.coachSelectorVisibility(role), { hidden: false, disabled: false },
        'admin: coach selector is visible and enabled (working dropdown)');

    // localStorage values for both coach and branch must survive init —
    // resolveCoachFilter does not override admin saves, resolveBranchSelection
    // keeps the admin's previous branch.
    assertEqual(lock.resolveCoachFilter(role, 'all'), 'all',
        'admin: saved "all" coach filter survives init');
    assertEqual(lock.resolveCoachFilter(role, 'some-coach-id'), 'some-coach-id',
        'admin: saved specific coach id survives init');
    assertEqual(lock.resolveBranchSelection(role, allowed, 'Debut', AVAILABLE), 'Debut',
        'admin: saved branch "Debut" survives init (no coach-scope rewrite)');

    // Existing UX preserved — branch change resets the coach filter to "all".
    // This is the original behavior; the lock must not change it for admins.
    assertEqual(lock.coachOnBranchChange(role), 'all',
        'admin: branch change resets coach filter to "all" (unchanged from prior behavior)');

    // Coverage check: nothing in this scenario should accidentally exercise the
    // locked branch. If any policy ever flips on for an admin, this scenario
    // shouts before the UI does.
    assert(allowed === null
        && !lock.isCoachLocked(role)
        && lock.coachSelectorVisibility(role).hidden === false
        && lock.coachOnBranchChange(role) === 'all',
        'admin: every policy returns its unlocked default — no admin path is ever scoped');
}

console.log('\n=== consumer audit: `=== \'all\'` checks must not break for coaches ===\n');
// The lock changed `attendanceCurrentCoach` from 'all' to the coach's UUID for
// coaches. Every consumer in admin.js / admin-v2.js that branches on
// `=== 'all'` / `!== 'all'` must keep working with a UUID. This block pins the
// known consumer patterns to the lock's output so a future change to either
// side can't silently regress.
{
    // The patterns below mirror live consumer code (see admin.js, admin-v2.js).
    // Each consumer is exercised against the locked value produced by the
    // policy module — i.e. exactly what would flow through at runtime.
    const lockedCoach = lock.resolveCoachFilter(COACH, 'all');
    assertEqual(lockedCoach, 'coach-uuid-1',
        'precondition: locked coach resolves to UUID (not "all")');

    // Consumer #1 — getAttendanceCalendarData coach argument
    //   admin-v2.js:5957 / admin.js:5735
    //   `attendanceCurrentCoach === 'all' ? null : attendanceCurrentCoach`
    // For a locked coach this must pass the coach's UUID, not null (or the
    // server would return every coach's students).
    const calendarCoachArg = lockedCoach === 'all' ? null : lockedCoach;
    assertEqual(calendarCoachArg, 'coach-uuid-1',
        'consumer: calendar query receives coach UUID for locked coach (not null)');

    // Consumer #2 — coach-name lookup gate
    //   admin-v2.js:5084 / admin-v2.js:5454 / admin.js:4875 / admin.js:5245
    //   `attendanceCurrentCoach !== 'all' && attendanceCurrentCoach !== 'unassigned'`
    // Must be true for a locked coach so the name lookup actually runs (used by
    // getTimeSlotsForBranch to pick coach-specific time slots).
    const nameLookupRuns = lockedCoach !== 'all' && lockedCoach !== 'unassigned';
    assertEqual(nameLookupRuns, true,
        'consumer: coach-name lookup gate is open for locked coach');

    // Consumer #3 — branch-change reset is policy-driven, not hard-coded
    //   admin-v2.js:5397 / admin-v2.js:5658 / admin.js:5188 / admin.js:5436
    //   `coachOnBranchChange(roleInfo)` replaces `attendanceCurrentCoach = 'all'`.
    // After a branch change, the locked value must still be the coach's UUID,
    // and Consumer #1 must still flow the UUID (not null) to the query.
    const afterBranchChange = lock.coachOnBranchChange(COACH);
    assertEqual(afterBranchChange, 'coach-uuid-1',
        'consumer: branch-change reset keeps coach UUID');
    const calendarAfterBranchChange = afterBranchChange === 'all' ? null : afterBranchChange;
    assertEqual(calendarAfterBranchChange, 'coach-uuid-1',
        'consumer: calendar query still receives coach UUID after branch change');

    // Admin side — same consumer patterns, opposite outcome. These guard the
    // unchanged-UX promise for admins.
    const adminCoach = lock.resolveCoachFilter(ADMIN, 'all');
    const adminCalendarArg = adminCoach === 'all' ? null : adminCoach;
    assertEqual(adminCalendarArg, null,
        'consumer: admin with "all" filter still sends null (no coach restriction)');
    const adminNameLookupRuns = adminCoach !== 'all' && adminCoach !== 'unassigned';
    assertEqual(adminNameLookupRuns, false,
        'consumer: admin with "all" filter skips coach-name lookup');
}

console.log('\n=== coachesAtBranch ===================================================\n');
// Branch-scoped coach roster, sourced from coach_branches (coach.branchNames).
// Each coach appears once per branchName they're assigned to.
const MULTI_COACHES = [
    { id: 'c1', firstName: 'Alice', lastName: 'A', fullName: 'Alice A',
      branchNames: ['Debut', 'Halyk Arena'] },
    { id: 'c2', firstName: 'Bob', lastName: 'B', fullName: 'Bob B',
      branchNames: ['Debut'] },
    { id: 'c3', firstName: 'Cara', lastName: 'C', fullName: 'Cara C',
      branchNames: ['Halyk Arena'] },
    { id: 'c4', firstName: 'Dan', lastName: 'D', fullName: 'Dan D',
      branchNames: ['Nish'] }, // single-coach branch
    { id: 'c5', firstName: 'Eve', lastName: 'E', fullName: 'Eve E',
      branchNames: [] }, // unassigned
];

assertEqual(lock.coachesAtBranch(MULTI_COACHES, 'Debut'),
    [{ id: 'c1', name: 'Alice A' }, { id: 'c2', name: 'Bob B' }],
    'Debut has Alice + Bob (two coaches)');
assertEqual(lock.coachesAtBranch(MULTI_COACHES, 'Halyk Arena'),
    [{ id: 'c1', name: 'Alice A' }, { id: 'c3', name: 'Cara C' }],
    'Halyk Arena has Alice + Cara (two coaches)');
assertEqual(lock.coachesAtBranch(MULTI_COACHES, 'Nish'),
    [{ id: 'c4', name: 'Dan D' }],
    'Nish has only Dan (single-coach branch)');
assertEqual(lock.coachesAtBranch(MULTI_COACHES, 'Ghost'), [],
    'unknown branch → empty array');
assertEqual(lock.coachesAtBranch(MULTI_COACHES, ''), [],
    'empty branch → empty array');
assertEqual(lock.coachesAtBranch(MULTI_COACHES, null), [],
    'null branch → empty array');
assertEqual(lock.coachesAtBranch(null, 'Debut'), [],
    'null coaches → empty array');
assertEqual(lock.coachesAtBranch([], 'Debut'), [],
    'empty coaches → empty array');
// Coach with falsy fullName falls back to "first last"; missing parts trim cleanly.
assertEqual(
    lock.coachesAtBranch(
        [{ id: 'c9', firstName: 'Only', lastName: 'Name', branchNames: ['X'] }],
        'X'
    ),
    [{ id: 'c9', name: 'Only Name' }],
    'fullName missing → derived from firstName + lastName');

console.log('\n=== isMultiCoachBranchForCoach =======================================\n');
const COACH_C1 = { isAdmin: false, coachId: 'c1', email: 'alice@chessempire.kz' };
const COACH_C4 = { isAdmin: false, coachId: 'c4', email: 'dan@chessempire.kz' };

assertEqual(lock.isMultiCoachBranchForCoach(COACH_C1, MULTI_COACHES, 'Debut'), true,
    'coach at Debut (Alice + Bob) → multi-coach branch');
assertEqual(lock.isMultiCoachBranchForCoach(COACH_C1, MULTI_COACHES, 'Halyk Arena'), true,
    'coach at Halyk Arena (Alice + Cara) → multi-coach branch');
assertEqual(lock.isMultiCoachBranchForCoach(COACH_C4, MULTI_COACHES, 'Nish'), false,
    'coach at Nish (Dan only) → NOT a multi-coach branch');
assertEqual(lock.isMultiCoachBranchForCoach(ADMIN, MULTI_COACHES, 'Debut'), false,
    'admin: never multi-coach scoped (uses full admin UI)');
assertEqual(lock.isMultiCoachBranchForCoach(ANON, MULTI_COACHES, 'Debut'), false,
    'anon: never multi-coach scoped');
assertEqual(lock.isMultiCoachBranchForCoach(null, MULTI_COACHES, 'Debut'), false,
    'null roleInfo: never multi-coach scoped');
assertEqual(lock.isMultiCoachBranchForCoach(COACH_C1, MULTI_COACHES, 'Ghost'), false,
    'unknown branch: not multi-coach (no coaches assigned)');

console.log('\n=== coachSelectorVisibilityForBranch =================================\n');
// Locked coach at multi-coach branch → visible + enabled, allowedCoachIds set.
assertEqual(
    lock.coachSelectorVisibilityForBranch(COACH_C1, MULTI_COACHES, 'Debut'),
    { hidden: false, disabled: false, allowedCoachIds: ['c1', 'c2'] },
    'locked coach at multi-coach branch (Debut) → visible+enabled, allowed=[c1,c2]');
assertEqual(
    lock.coachSelectorVisibilityForBranch(COACH_C1, MULTI_COACHES, 'Halyk Arena'),
    { hidden: false, disabled: false, allowedCoachIds: ['c1', 'c3'] },
    'locked coach at multi-coach branch (Halyk Arena) → visible+enabled, allowed=[c1,c3]');
// Locked coach at single-coach branch → original behavior (hidden + pinned).
assertEqual(
    lock.coachSelectorVisibilityForBranch(COACH_C4, MULTI_COACHES, 'Nish'),
    { hidden: true, disabled: true, allowedCoachIds: ['c4'] },
    'locked coach at single-coach branch (Nish) → hidden+disabled, allowed=[self]');
// Admin / unlocked → no restriction.
assertEqual(
    lock.coachSelectorVisibilityForBranch(ADMIN, MULTI_COACHES, 'Debut'),
    { hidden: false, disabled: false, allowedCoachIds: null },
    'admin: visible, no allowed-id restriction (null)');
assertEqual(
    lock.coachSelectorVisibilityForBranch(ADMIN, MULTI_COACHES, 'Nish'),
    { hidden: false, disabled: false, allowedCoachIds: null },
    'admin at single-coach branch: still no restriction (null)');
assertEqual(
    lock.coachSelectorVisibilityForBranch(ANON, MULTI_COACHES, 'Debut'),
    { hidden: false, disabled: false, allowedCoachIds: null },
    'anon: no restriction');
assertEqual(
    lock.coachSelectorVisibilityForBranch(null, MULTI_COACHES, 'Debut'),
    { hidden: false, disabled: false, allowedCoachIds: null },
    'null roleInfo: no restriction');

console.log('\n=== resolveCoachFilterForBranch ======================================\n');
// Locked coach at single-coach branch → always pin to self.
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C4, MULTI_COACHES, 'Nish', 'c4'),
    'c4',
    'locked coach at single-coach branch → self');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C4, MULTI_COACHES, 'Nish', 'someone-else'),
    'c4',
    'locked coach at single-coach branch: stray value → self');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C4, MULTI_COACHES, 'Nish', null),
    'c4',
    'locked coach at single-coach branch: null current → self');

// Locked coach at multi-coach branch — default = self; previous peer preserved.
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', null),
    'c1',
    'locked coach at multi-coach branch, null current → self');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', 'c2'),
    'c2',
    'locked coach at multi-coach branch: previously selected peer (c2) at this branch → preserved');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', 'c1'),
    'c1',
    'locked coach at multi-coach branch: previously self → self');
// Branch hop where previous peer is NOT at the new branch.
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Halyk Arena', 'c2'),
    'c1',
    'locked coach, branch hop: previous peer (c2) is NOT at new branch → fall back to self');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Halyk Arena', 'c3'),
    'c3',
    'locked coach, branch hop: previous peer (c3) IS at new branch → preserved');
// Stale / bogus currentValue.
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', 'unassigned'),
    'c1',
    'locked coach at multi-coach branch: "unassigned" rejected → self');
assertEqual(
    lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', 'all'),
    'c1',
    'locked coach at multi-coach branch: "all" rejected → self');

// Admin / unlocked — caller's value preserved.
assertEqual(
    lock.resolveCoachFilterForBranch(ADMIN, MULTI_COACHES, 'Debut', 'all'),
    'all',
    'admin: preserves "all"');
assertEqual(
    lock.resolveCoachFilterForBranch(ADMIN, MULTI_COACHES, 'Debut', 'c1'),
    'c1',
    'admin: preserves chosen coach id');
assertEqual(
    lock.resolveCoachFilterForBranch(ADMIN, MULTI_COACHES, 'Debut', null),
    'all',
    'admin: null current → "all"');
assertEqual(
    lock.resolveCoachFilterForBranch(ANON, MULTI_COACHES, 'Debut', null),
    'all',
    'anon: null current → "all"');
assertEqual(
    lock.resolveCoachFilterForBranch(null, MULTI_COACHES, 'Debut', 'all'),
    'all',
    'null roleInfo: preserves "all"');

console.log('\n=== end-to-end: multi-coach branch unlocks dropdown ==================\n');
// Acceptance scenarios from the task spec.
{
    // 1. Coach at single-coach branch → selector hidden, pinned to self.
    const vis = lock.coachSelectorVisibilityForBranch(COACH_C4, MULTI_COACHES, 'Nish');
    assertEqual(vis.hidden, true, 'single-coach branch: hidden=true (original lock preserved)');
    assertEqual(vis.disabled, true, 'single-coach branch: disabled=true');
    const val = lock.resolveCoachFilterForBranch(COACH_C4, MULTI_COACHES, 'Nish', 'c4');
    assertEqual(val, 'c4', 'single-coach branch: value pinned to self');
}
{
    // 2. Coach at multi-coach branch → selector visible+enabled, allowedCoachIds
    //    contains all coaches at that branch, default value = self.
    const vis = lock.coachSelectorVisibilityForBranch(COACH_C1, MULTI_COACHES, 'Debut');
    assertEqual(vis.hidden, false, 'multi-coach branch: hidden=false');
    assertEqual(vis.disabled, false, 'multi-coach branch: disabled=false');
    assertEqual(vis.allowedCoachIds, ['c1', 'c2'],
        'multi-coach branch: allowedCoachIds = all coaches at branch');
    const val = lock.resolveCoachFilterForBranch(COACH_C1, MULTI_COACHES, 'Debut', null);
    assertEqual(val, 'c1', 'multi-coach branch: default value = self (signed-in coach)');
}
{
    // 3. Branch hop: switching to a multi-coach branch where previously selected
    //    coach is also present → selection preserved.
    // Alice (c1) is at both Debut + Halyk Arena. She picked Cara (c3) at Halyk
    // Arena, then hops back to Halyk Arena later — selection preserved.
    const preserved = lock.resolveCoachFilterForBranch(
        COACH_C1, MULTI_COACHES, 'Halyk Arena', 'c3'
    );
    assertEqual(preserved, 'c3',
        'branch hop: previously-selected peer at new branch → preserved');
}
{
    // 4. Branch hop where previously selected coach is NOT present → self.
    // Alice picked Bob (c2) at Debut; she hops to Halyk Arena where Bob isn't.
    const fallback = lock.resolveCoachFilterForBranch(
        COACH_C1, MULTI_COACHES, 'Halyk Arena', 'c2'
    );
    assertEqual(fallback, 'c1',
        'branch hop: previously-selected peer NOT at new branch → fall back to self');
}
{
    // 5. Defense in depth: onAttendanceCoachChange must reject ids outside the
    //    allowed set for the current branch. The policy module surfaces this via
    //    coachSelectorVisibilityForBranch.allowedCoachIds — admin.js checks it.
    const vis = lock.coachSelectorVisibilityForBranch(COACH_C1, MULTI_COACHES, 'Debut');
    const incomingChange = 'c3'; // Cara — not at Debut
    const allowed = Array.isArray(vis.allowedCoachIds)
        && vis.allowedCoachIds.includes(incomingChange);
    assertEqual(allowed, false,
        'onAttendanceCoachChange: rejects coach id not in allowedCoachIds for current branch');
    // And the valid case keeps working.
    const validChange = 'c2';
    const allowedValid = Array.isArray(vis.allowedCoachIds)
        && vis.allowedCoachIds.includes(validChange);
    assertEqual(allowedValid, true,
        'onAttendanceCoachChange: accepts coach id in allowedCoachIds for current branch');
}
{
    // 6. Admin is entirely unaffected by the new functions.
    const vis = lock.coachSelectorVisibilityForBranch(ADMIN, MULTI_COACHES, 'Debut');
    assertEqual(vis, { hidden: false, disabled: false, allowedCoachIds: null },
        'admin: branch-aware visibility is fully open, no allowed-id restriction');
    assertEqual(lock.resolveCoachFilterForBranch(ADMIN, MULTI_COACHES, 'Debut', 'all'), 'all',
        'admin: branch-aware coach filter preserves "all" exactly');
    assertEqual(lock.isMultiCoachBranchForCoach(ADMIN, MULTI_COACHES, 'Debut'), false,
        'admin: never enters multi-coach branch logic');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
