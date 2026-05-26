/**
 * Tests for coach-kpi-role-lock.js — pure policy module that scopes the Coach
 * Performance dashboard's three views (School / Branch / Coach) according to
 * the PRD §6 role lock:
 *
 *   | Role  | School view | Branch view      | Coach view |
 *   |-------|-------------|------------------|------------|
 *   | Admin | ✅ all       | ✅ all            | ✅ all      |
 *   | Coach | ❌ hidden    | ✅ own branches   | ✅ self only|
 *
 * Run: node tests/test-coach-kpi-role-lock.js
 */

const lock = require('../coach-kpi-role-lock.js');

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

const COACHES = [
    { id: 'coach-uuid-1', firstName: 'Alice', lastName: 'A', fullName: 'Alice A',
      branchNames: ['Nish', 'Halyk Arena'] },
    { id: 'coach-uuid-2', firstName: 'Bob',   lastName: 'B', fullName: 'Bob B',
      branchNames: ['Debut'] },
    { id: 'coach-uuid-3', firstName: 'Cara',  lastName: 'C', fullName: 'Cara C',
      branchNames: [] },
];

console.log('\n=== smoke =============================================================\n');
const apiNames = [
    'isCoachLocked', 'isAdmin', 'allowedViews', 'canAccessView', 'defaultView',
    'navMenuVisibility', 'viewSwitcherVisibility', 'coachAllowedBranchNames',
    'coachAllowedCoachIds', 'filterBranchesForRole', 'filterCoachesForRole',
    'resolveSelectedBranch', 'resolveSelectedCoach', 'canAccessCoach',
    'canAccessBranch', 'kpiQueryScope',
    'canViewCoachKpi', 'getInitialBranchScope', 'getInitialCoachScope',
];
for (const name of apiNames) {
    assert(typeof lock[name] === 'function', `${name} exported`);
}
assertEqual(lock.VIEWS, ['school', 'branch', 'coach'], 'VIEWS constant exported');

console.log('\n=== isCoachLocked / isAdmin (gate primitives) =========================\n');
assertEqual(lock.isCoachLocked(COACH), true,  'coach with id → locked');
assertEqual(lock.isCoachLocked(ADMIN), false, 'admin → not locked (even if coachId set)');
assertEqual(lock.isCoachLocked(ANON),  false, 'anon → not locked');
assertEqual(lock.isCoachLocked(null),  false, 'null roleInfo → not locked (safe default)');
assertEqual(lock.isCoachLocked({}),    false, 'empty roleInfo → not locked');
assertEqual(lock.isCoachLocked({ isAdmin: true, coachId: 'x' }), false,
    'admin flag wins over coachId — admins are never locked');

assertEqual(lock.isAdmin(ADMIN), true,  'admin → isAdmin true');
assertEqual(lock.isAdmin(COACH), false, 'coach → isAdmin false');
assertEqual(lock.isAdmin(ANON),  false, 'anon → isAdmin false');
assertEqual(lock.isAdmin(null),  false, 'null → isAdmin false');

console.log('\n=== allowedViews (PRD §6 matrix) ======================================\n');
assertEqual(lock.allowedViews(ADMIN), { school: true,  branch: true,  coach: true  },
    'admin: all three views allowed');
assertEqual(lock.allowedViews(COACH), { school: false, branch: true,  coach: true  },
    'coach: school hidden, branch + coach allowed');
assertEqual(lock.allowedViews(ANON),  { school: false, branch: false, coach: false },
    'anon: nothing allowed');
assertEqual(lock.allowedViews(null),  { school: false, branch: false, coach: false },
    'null: nothing allowed');

console.log('\n=== canAccessView =====================================================\n');
assertEqual(lock.canAccessView(ADMIN, 'school'), true,  'admin → school');
assertEqual(lock.canAccessView(ADMIN, 'branch'), true,  'admin → branch');
assertEqual(lock.canAccessView(ADMIN, 'coach'),  true,  'admin → coach');
assertEqual(lock.canAccessView(COACH, 'school'), false, 'coach → school: hidden');
assertEqual(lock.canAccessView(COACH, 'branch'), true,  'coach → branch');
assertEqual(lock.canAccessView(COACH, 'coach'),  true,  'coach → coach');
assertEqual(lock.canAccessView(ANON,  'branch'), false, 'anon → branch: blocked');
assertEqual(lock.canAccessView(null,  'coach'),  false, 'null → coach: blocked');
assertEqual(lock.canAccessView(ADMIN, 'bogus'),  false, 'unknown view name → false');
assertEqual(lock.canAccessView(ADMIN, ''),       false, 'empty view name → false');
assertEqual(lock.canAccessView(ADMIN, null),     false, 'null view name → false');

console.log('\n=== defaultView =======================================================\n');
assertEqual(lock.defaultView(ADMIN), 'school', 'admin lands on school overview');
assertEqual(lock.defaultView(COACH), 'coach',  'coach lands on their own coach view');
assertEqual(lock.defaultView(ANON),  null,     'anon: no view (caller should not render)');
assertEqual(lock.defaultView(null),  null,     'null: no view');

console.log('\n=== navMenuVisibility =================================================\n');
assertEqual(lock.navMenuVisibility(ADMIN), { hidden: false, disabled: false },
    'admin: Coach KPI nav visible');
assertEqual(lock.navMenuVisibility(COACH), { hidden: false, disabled: false },
    'coach: Coach KPI nav visible (sees branch + coach views)');
assertEqual(lock.navMenuVisibility(ANON), { hidden: true, disabled: true },
    'anon: Coach KPI nav hidden');
assertEqual(lock.navMenuVisibility(null), { hidden: true, disabled: true },
    'null: Coach KPI nav hidden');

console.log('\n=== viewSwitcherVisibility ============================================\n');
assertEqual(lock.viewSwitcherVisibility(ADMIN), {
    school: { hidden: false, disabled: false },
    branch: { hidden: false, disabled: false },
    coach:  { hidden: false, disabled: false },
}, 'admin: every tab visible+enabled');
assertEqual(lock.viewSwitcherVisibility(COACH), {
    school: { hidden: true,  disabled: true  },
    branch: { hidden: false, disabled: false },
    coach:  { hidden: false, disabled: false },
}, 'coach: school tab hidden, branch + coach visible');
assertEqual(lock.viewSwitcherVisibility(ANON), {
    school: { hidden: true, disabled: true },
    branch: { hidden: true, disabled: true },
    coach:  { hidden: true, disabled: true },
}, 'anon: all tabs hidden');

console.log('\n=== coachAllowedBranchNames ===========================================\n');
assertEqual(lock.coachAllowedBranchNames(COACH, COACHES), ['Nish', 'Halyk Arena'],
    'locked: returns coach\'s branchNames');
assertEqual(lock.coachAllowedBranchNames({ isAdmin: false, coachId: 'coach-uuid-3' }, COACHES), [],
    'locked coach with zero assignments → empty array');
assertEqual(lock.coachAllowedBranchNames({ isAdmin: false, coachId: 'missing' }, COACHES), [],
    'locked: missing coach record → empty array (lock still applies)');
assertEqual(lock.coachAllowedBranchNames(COACH, []), [],
    'locked: empty coaches list → empty array');
assertEqual(lock.coachAllowedBranchNames(COACH, null), [],
    'locked: null coaches list → empty array (defensive)');
assertEqual(lock.coachAllowedBranchNames(ADMIN, COACHES), null,
    'admin: null (no restriction)');
assertEqual(lock.coachAllowedBranchNames(ANON, COACHES), null,
    'anon: null (no restriction; gated elsewhere)');
assertEqual(lock.coachAllowedBranchNames(null, COACHES), null,
    'null roleInfo: null');

console.log('\n=== coachAllowedCoachIds ==============================================\n');
assertEqual(lock.coachAllowedCoachIds(COACH), ['coach-uuid-1'],
    'locked: [self] — coach can only inspect their own KPI');
assertEqual(lock.coachAllowedCoachIds(ADMIN), null,
    'admin: null (no restriction)');
assertEqual(lock.coachAllowedCoachIds(ANON), null,
    'anon: null');
assertEqual(lock.coachAllowedCoachIds(null), null,
    'null roleInfo: null');

console.log('\n=== filterBranchesForRole (strings + objects) =========================\n');
const BRANCH_STRINGS = ['Nish', 'Debut', 'Halyk Arena', 'Aktobe'];
const BRANCH_OBJS = [
    { name: 'Nish' }, { name: 'Debut' }, { name: 'Halyk Arena' }, { name: 'Aktobe' },
];

assertEqual(lock.filterBranchesForRole(COACH, BRANCH_STRINGS, COACHES),
    ['Nish', 'Halyk Arena'],
    'locked + strings: only coach\'s assigned branches survive');
assertEqual(lock.filterBranchesForRole(COACH, BRANCH_OBJS, COACHES),
    [{ name: 'Nish' }, { name: 'Halyk Arena' }],
    'locked + objects: filters by name field');
assertEqual(lock.filterBranchesForRole(ADMIN, BRANCH_STRINGS, COACHES),
    BRANCH_STRINGS, 'admin: every branch passes through unchanged');
assertEqual(lock.filterBranchesForRole(ADMIN, BRANCH_OBJS, COACHES),
    BRANCH_OBJS, 'admin: every branch object passes through unchanged');
assertEqual(lock.filterBranchesForRole(COACH, [], COACHES), [],
    'locked: empty input → empty output');
assertEqual(lock.filterBranchesForRole(COACH, null, COACHES), [],
    'locked: null input → empty output (defensive)');
assertEqual(lock.filterBranchesForRole(COACH, BRANCH_OBJS, []), [],
    'locked + missing coach record → empty output');
assertEqual(
    lock.filterBranchesForRole(COACH, [{ noName: true }, { name: 'Nish' }], COACHES),
    [{ name: 'Nish' }],
    'locked: objects without a name field are dropped');

console.log('\n=== filterCoachesForRole ==============================================\n');
assertEqual(lock.filterCoachesForRole(COACH, COACHES),
    [COACHES[0]],
    'locked: only the signed-in coach\'s record survives');
assertEqual(lock.filterCoachesForRole(ADMIN, COACHES),
    COACHES, 'admin: full coach list passes through');
assertEqual(lock.filterCoachesForRole(ANON, COACHES),
    COACHES, 'anon: full list (gated elsewhere — filter is a no-op for unlocked)');
assertEqual(lock.filterCoachesForRole(COACH, []), [],
    'locked + empty list → empty');
assertEqual(lock.filterCoachesForRole(COACH, null), [],
    'locked + null list → empty (defensive)');

console.log('\n=== resolveSelectedBranch =============================================\n');
const ALLOWED = ['Nish', 'Halyk Arena'];
const AVAILABLE = ['Debut', 'Nish', 'Halyk Arena'];

assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, 'Nish', AVAILABLE), 'Nish',
    'locked: currentBranch in allowed → keep it');
assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, 'Halyk Arena', AVAILABLE), 'Halyk Arena',
    'locked: another allowed currentBranch → keep it');
assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, 'Debut', AVAILABLE), 'Nish',
    'locked: currentBranch NOT in allowed → first allowed-and-available');
assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, null, AVAILABLE), 'Nish',
    'locked: no current → first allowed-and-available');
assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, '', AVAILABLE), 'Nish',
    'locked: empty current → first allowed-and-available');
assertEqual(lock.resolveSelectedBranch(COACH, [], 'Nish', AVAILABLE), null,
    'locked + zero allowed → null (do not auto-jump anywhere)');
assertEqual(lock.resolveSelectedBranch(COACH, ['Other'], null, AVAILABLE), null,
    'locked + no overlap → null');
assertEqual(lock.resolveSelectedBranch(COACH, ALLOWED, null, []), null,
    'locked + no available → null');

assertEqual(lock.resolveSelectedBranch(ADMIN, null, 'Debut', AVAILABLE), 'Debut',
    'admin: currentBranch preserved (no restriction)');
assertEqual(lock.resolveSelectedBranch(ADMIN, null, null, AVAILABLE), 'Debut',
    'admin: no current → first available');
assertEqual(lock.resolveSelectedBranch(ADMIN, null, null, []), null,
    'admin: no available → null');
assertEqual(lock.resolveSelectedBranch(null, null, 'Nish', AVAILABLE), 'Nish',
    'null roleInfo: behaves like unlocked');

console.log('\n=== resolveSelectedCoach ==============================================\n');
assertEqual(lock.resolveSelectedCoach(COACH, null), 'coach-uuid-1',
    'locked + null → self');
assertEqual(lock.resolveSelectedCoach(COACH, 'coach-uuid-1'), 'coach-uuid-1',
    'locked + self → self');
assertEqual(lock.resolveSelectedCoach(COACH, 'someone-else'), 'coach-uuid-1',
    'locked + other coach id → forced to self (lock overrides any stored value)');
assertEqual(lock.resolveSelectedCoach(ADMIN, 'some-coach-id'), 'some-coach-id',
    'admin: caller value preserved');
assertEqual(lock.resolveSelectedCoach(ADMIN, null), null,
    'admin + null → null (caller may default elsewhere)');
assertEqual(lock.resolveSelectedCoach(ANON, 'x'), 'x',
    'anon: caller value preserved (gated elsewhere)');

console.log('\n=== canAccessCoach (per-coach gate) ===================================\n');
assertEqual(lock.canAccessCoach(ADMIN, 'any-coach-uuid'), true,
    'admin: any coach allowed');
assertEqual(lock.canAccessCoach(ADMIN, ''),  false, 'admin: empty target → false');
assertEqual(lock.canAccessCoach(ADMIN, null), false, 'admin: null target → false');
assertEqual(lock.canAccessCoach(COACH, 'coach-uuid-1'), true,
    'locked: self allowed');
assertEqual(lock.canAccessCoach(COACH, 'coach-uuid-2'), false,
    'locked: other coach blocked');
assertEqual(lock.canAccessCoach(COACH, null), false,
    'locked: null target → false');
assertEqual(lock.canAccessCoach(ANON, 'coach-uuid-1'), false,
    'anon: blocked');
assertEqual(lock.canAccessCoach(null, 'coach-uuid-1'), false,
    'null roleInfo: blocked');

console.log('\n=== canAccessBranch (per-branch gate) =================================\n');
assertEqual(lock.canAccessBranch(ADMIN, 'Debut', COACHES), true,
    'admin: any branch allowed');
assertEqual(lock.canAccessBranch(ADMIN, '', COACHES), false,
    'admin: empty branch → false');
assertEqual(lock.canAccessBranch(ADMIN, null, COACHES), false,
    'admin: null branch → false');
assertEqual(lock.canAccessBranch(COACH, 'Nish', COACHES), true,
    'locked: own branch allowed');
assertEqual(lock.canAccessBranch(COACH, 'Halyk Arena', COACHES), true,
    'locked: another own branch allowed');
assertEqual(lock.canAccessBranch(COACH, 'Debut', COACHES), false,
    'locked: out-of-scope branch blocked');
assertEqual(lock.canAccessBranch(COACH, 'Ghost', COACHES), false,
    'locked: unknown branch blocked');
assertEqual(lock.canAccessBranch(ANON, 'Nish', COACHES), false,
    'anon: blocked even for valid branch');

console.log('\n=== kpiQueryScope (edge-function scope builder) =======================\n');
// School view
assertEqual(lock.kpiQueryScope(ADMIN, 'school', {}), { action: 'school_kpi_summary' },
    'admin + school → school_kpi_summary');
assertEqual(lock.kpiQueryScope(COACH, 'school', {}), null,
    'coach + school → null (PRD: school view hidden for coach)');
assertEqual(lock.kpiQueryScope(ANON, 'school', {}), null,
    'anon + school → null');

// Branch view
assertEqual(lock.kpiQueryScope(ADMIN, 'branch', { branchName: 'Debut' }),
    { action: 'coach_leaderboard', branchName: 'Debut' },
    'admin + branch → coach_leaderboard scoped to chosen branch');
assertEqual(lock.kpiQueryScope(ADMIN, 'branch', {}), null,
    'admin + branch with no branchName → null');
assertEqual(lock.kpiQueryScope(COACH, 'branch', { branchName: 'Nish', coaches: COACHES }),
    { action: 'coach_leaderboard', branchName: 'Nish' },
    'locked coach + branch in scope → coach_leaderboard');
assertEqual(lock.kpiQueryScope(COACH, 'branch', { branchName: 'Debut', coaches: COACHES }),
    null,
    'locked coach + branch OUT of scope → null (refuses request)');
assertEqual(lock.kpiQueryScope(COACH, 'branch', { branchName: 'Nish' }),
    null,
    'locked coach + branch w/o coaches data → null (defensive: cannot prove scope)');

// Coach view
assertEqual(lock.kpiQueryScope(ADMIN, 'coach', { coachId: 'coach-uuid-2' }),
    { action: 'coach_kpi_summary', coachId: 'coach-uuid-2' },
    'admin + coach → coach_kpi_summary for the chosen coach');
assertEqual(lock.kpiQueryScope(ADMIN, 'coach', {}), null,
    'admin + coach with no coachId → null');
assertEqual(lock.kpiQueryScope(COACH, 'coach', { coachId: 'coach-uuid-1' }),
    { action: 'coach_kpi_summary', coachId: 'coach-uuid-1' },
    'locked coach + own coachId → coach_kpi_summary');
assertEqual(lock.kpiQueryScope(COACH, 'coach', { coachId: 'coach-uuid-2' }),
    { action: 'coach_kpi_summary', coachId: 'coach-uuid-1' },
    'locked coach + other coachId → forced to self (lock overrides input)');
assertEqual(lock.kpiQueryScope(COACH, 'coach', {}),
    { action: 'coach_kpi_summary', coachId: 'coach-uuid-1' },
    'locked coach + no coachId → defaults to self');
assertEqual(lock.kpiQueryScope(ANON, 'coach', { coachId: 'anything' }), null,
    'anon + coach → null');
assertEqual(lock.kpiQueryScope(ADMIN, 'bogus', {}), null,
    'unknown view → null');

console.log('\n=== canViewCoachKpi (Phase 2 dashboard gate) ==========================\n');
// Task §2 coverage matrix: admin → true; coach → true;
// viewer → false (defensive — getRoleInfo does not emit an isViewer flag today,
// but the gate must still reject a viewer-shaped roleInfo if one ever shows up);
// unauthenticated / null → false.
assertEqual(lock.canViewCoachKpi(ADMIN), true,  'admin → can view dashboard');
assertEqual(lock.canViewCoachKpi(COACH), true,  'coach (coachId set) → can view dashboard');
assertEqual(lock.canViewCoachKpi({ isAdmin: false, isCoach: true }), true,
    'explicit isCoach flag → can view dashboard');
assertEqual(lock.canViewCoachKpi(ANON),  false, 'anon → blocked');
assertEqual(lock.canViewCoachKpi(null),  false, 'null roleInfo → blocked');
assertEqual(lock.canViewCoachKpi(undefined), false, 'undefined roleInfo → blocked');
assertEqual(lock.canViewCoachKpi({}),    false, 'empty roleInfo → blocked');
assertEqual(lock.canViewCoachKpi({ isAdmin: false, isCoach: false, coachId: null }),
    false, 'viewer-like role (no admin, no coach) → blocked');
// Defensive: a viewer-shaped roleInfo carrying the literal `role: 'viewer'`
// string used by supabase-schema.sql / supabase-client.js must NOT bypass
// the gate. Today no caller passes such a shape, but if `getRoleInfo` ever
// starts surfacing role strings, this assertion catches accidental allow-list.
assertEqual(lock.canViewCoachKpi({ role: 'viewer' }), false,
    'defensive: { role: "viewer" } literal → blocked');
assertEqual(lock.canViewCoachKpi({ isAdmin: false, role: 'viewer', coachId: null }),
    false, 'defensive: viewer role with explicit non-admin + null coachId → blocked');
assertEqual(lock.canViewCoachKpi({ isAdmin: false, isCoach: false, role: 'viewer', coachId: null }),
    false, 'defensive: viewer role with both isAdmin/isCoach explicitly false → blocked');

console.log('\n=== getInitialBranchScope (transparency model) ========================\n');
// Task §2 coverage: admin and coach must both land on `'all'` so the Phase 2
// dashboard opens with the full school in view. The function is intentionally
// role-agnostic (the argument is `_roleInfo`) — these assertions cement that
// contract across every plausible role shape so a future "personalize the
// landing scope" refactor cannot quietly regress the transparency model.
assertEqual(lock.getInitialBranchScope(ADMIN), 'all',  'admin → \'all\'');
assertEqual(lock.getInitialBranchScope(COACH), 'all',  'coach (coachId set) → \'all\'');
assertEqual(lock.getInitialBranchScope({ isAdmin: true, coachId: 'coach-uuid-7' }), 'all',
    'admin who also has a coachId → \'all\' (admin still sees everything)');
assertEqual(lock.getInitialBranchScope({ isAdmin: false, isCoach: true }), 'all',
    'coach via explicit isCoach flag → \'all\'');
assertEqual(lock.getInitialBranchScope({ isAdmin: false, isCoach: true, coachId: 'coach-uuid-2' }), 'all',
    'coach with both isCoach flag and coachId → \'all\'');
assertEqual(lock.getInitialBranchScope({ isAdmin: false, coachId: 'coach-uuid-2' }), 'all',
    'a different coach id still → \'all\' (the specific id must not change the answer)');
assertEqual(lock.getInitialBranchScope(ANON),  'all',  'anon → \'all\' (gated by canViewCoachKpi)');
assertEqual(lock.getInitialBranchScope(null),  'all',  'null → \'all\'');
assertEqual(lock.getInitialBranchScope(undefined), 'all', 'undefined → \'all\'');
assertEqual(lock.getInitialBranchScope({}),    'all',  'empty roleInfo → \'all\'');
assertEqual(lock.getInitialBranchScope({ role: 'viewer' }), 'all',
    'defensive: viewer-shaped roleInfo → \'all\' (transparency; gating is in canViewCoachKpi)');

console.log('\n=== getInitialCoachScope (transparency model) =========================\n');
// Same matrix as getInitialBranchScope: both initial-scope helpers share the
// transparency contract, so they share the test shape.
assertEqual(lock.getInitialCoachScope(ADMIN), 'all',  'admin → \'all\'');
assertEqual(lock.getInitialCoachScope(COACH), 'all',  'coach (coachId set) → \'all\'');
assertEqual(lock.getInitialCoachScope({ isAdmin: true, coachId: 'coach-uuid-7' }), 'all',
    'admin who also has a coachId → \'all\' (admin still sees everything)');
assertEqual(lock.getInitialCoachScope({ isAdmin: false, isCoach: true }), 'all',
    'coach via explicit isCoach flag → \'all\'');
assertEqual(lock.getInitialCoachScope({ isAdmin: false, isCoach: true, coachId: 'coach-uuid-2' }), 'all',
    'coach with both isCoach flag and coachId → \'all\'');
assertEqual(lock.getInitialCoachScope({ isAdmin: false, coachId: 'coach-uuid-2' }), 'all',
    'a different coach id still → \'all\' (the specific id must not change the answer)');
assertEqual(lock.getInitialCoachScope(ANON),  'all',  'anon → \'all\' (gated by canViewCoachKpi)');
assertEqual(lock.getInitialCoachScope(null),  'all',  'null → \'all\'');
assertEqual(lock.getInitialCoachScope(undefined), 'all', 'undefined → \'all\'');
assertEqual(lock.getInitialCoachScope({}),    'all',  'empty roleInfo → \'all\'');
assertEqual(lock.getInitialCoachScope({ role: 'viewer' }), 'all',
    'defensive: viewer-shaped roleInfo → \'all\' (transparency; gating is in canViewCoachKpi)');

console.log('\n=== end-to-end scenarios ==============================================\n');

// Scenario 1: admin opens the dashboard fresh.
{
    const role = ADMIN;
    assertEqual(lock.defaultView(role), 'school',
        'admin opens dashboard → lands on school overview');
    assertEqual(lock.navMenuVisibility(role), { hidden: false, disabled: false },
        'admin: nav visible');
    const tabs = lock.viewSwitcherVisibility(role);
    assert(!tabs.school.hidden && !tabs.branch.hidden && !tabs.coach.hidden,
        'admin: every view tab visible');
    // Admin picks a branch.
    const branchScope = lock.kpiQueryScope(role, 'branch', { branchName: 'Debut' });
    assertEqual(branchScope.branchName, 'Debut',
        'admin: branch query passes the chosen branch through');
    // Admin drills into another coach.
    const coachScope = lock.kpiQueryScope(role, 'coach', { coachId: 'coach-uuid-2' });
    assertEqual(coachScope.coachId, 'coach-uuid-2',
        'admin: coach query passes the chosen coach through');
}

// Scenario 2: locked coach opens the dashboard fresh.
{
    const role = COACH;
    assertEqual(lock.defaultView(role), 'coach',
        'locked coach opens dashboard → lands on their own coach view');
    assertEqual(lock.navMenuVisibility(role), { hidden: false, disabled: false },
        'locked coach: nav visible (PRD: branch + coach views available)');
    const tabs = lock.viewSwitcherVisibility(role);
    assertEqual(tabs.school, { hidden: true, disabled: true },
        'locked coach: school tab hidden (PRD §6: ❌ school view)');
    assert(!tabs.branch.hidden && !tabs.coach.hidden,
        'locked coach: branch + coach tabs visible');

    // The coach view always loads the coach's own data, even if a stale URL
    // param or stored value tries to send another coachId.
    const coachScope = lock.kpiQueryScope(role, 'coach', { coachId: 'coach-uuid-2' });
    assertEqual(coachScope, { action: 'coach_kpi_summary', coachId: 'coach-uuid-1' },
        'locked coach: stray coachId in URL → forced to self');

    // Branch dropdown is filtered to the coach's own branches.
    const visibleBranches = lock.filterBranchesForRole(role,
        ['Nish', 'Debut', 'Halyk Arena'], COACHES);
    assertEqual(visibleBranches, ['Nish', 'Halyk Arena'],
        'locked coach: branch dropdown filtered to own branches');

    // Picking an out-of-scope branch from a deep link refuses the request.
    const blocked = lock.kpiQueryScope(role, 'branch',
        { branchName: 'Debut', coaches: COACHES });
    assertEqual(blocked, null,
        'locked coach: deep-link to out-of-scope branch → query refused');
}

// Scenario 3: anon / missing roleInfo — the dashboard must not render at all.
{
    const role = ANON;
    assertEqual(lock.defaultView(role), null,
        'anon: no default view (caller should not render dashboard)');
    assertEqual(lock.navMenuVisibility(role), { hidden: true, disabled: true },
        'anon: nav hidden');
    assert(lock.kpiQueryScope(role, 'school', {}) === null
        && lock.kpiQueryScope(role, 'branch', { branchName: 'Debut' }) === null
        && lock.kpiQueryScope(role, 'coach', { coachId: 'x' }) === null,
        'anon: every kpiQueryScope returns null (no edge-function call allowed)');
}

// Scenario 4: PRD §6 row-by-row matrix proof.
{
    // Admin row: school, branch, coach all ✅.
    assertEqual(
        [
            lock.canAccessView(ADMIN, 'school'),
            lock.canAccessView(ADMIN, 'branch'),
            lock.canAccessView(ADMIN, 'coach'),
        ],
        [true, true, true],
        'PRD matrix: admin row = [✅ school, ✅ branch, ✅ coach]');

    // Coach row: school ❌, branch ✅ (own), coach ✅ (self).
    assertEqual(
        [
            lock.canAccessView(COACH, 'school'),
            lock.canAccessView(COACH, 'branch'),
            lock.canAccessView(COACH, 'coach'),
        ],
        [false, true, true],
        'PRD matrix: coach row = [❌ school, ✅ branch, ✅ coach]');

    // "Own branches": coach sees only their assigned branches in the branch view.
    const branchList = lock.filterBranchesForRole(COACH,
        ['Nish', 'Debut', 'Halyk Arena', 'Aktobe'], COACHES);
    assertEqual(branchList, ['Nish', 'Halyk Arena'],
        'PRD matrix: coach branch view = own branches only');

    // "Self only": coach sees only their own record in the coach view.
    const coachList = lock.filterCoachesForRole(COACH, COACHES);
    assertEqual(coachList.length, 1,
        'PRD matrix: coach coach view = self only (1 record)');
    assertEqual(coachList[0].id, 'coach-uuid-1',
        'PRD matrix: coach coach view = self only (correct id)');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
