/**
 * Tests for "Open Attendance Dashboard editing to all dashboard users"
 * (migration 079_open_attendance_editing_to_dashboard_users.sql + admin-v2.js).
 *
 * Layered like test-add-time-slot-versioned.js:
 *   1. Source-contract regex checks on the migration and admin-v2.js
 *      (catches accidental drift back to the per-coach / admin-only model).
 *   2. A JS port of the two new RLS predicates exercised against simulated
 *      user_roles rows:
 *        - coach A can add/edit/delete a slot belonging to coach B
 *        - a coach WITHOUT can_edit_students can manage assignments
 *        - a user with NO user_roles row is rejected for both tables
 *   3. A JS port of canEditCurrentSlots() / editButtonHiddenReason() proving
 *      the own-coach + admin-only branches are gone but the "coach selected"
 *      requirement stays.
 *
 * Run: node tests/test-open-attendance-editing.js
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
    const s = src.indexOf(`function ${name}(`);
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

// ============================================================================
// 1. Migration 079 — source contract
// ============================================================================
console.log('\n=== migration 079_open_attendance_editing_to_dashboard_users.sql ======\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/079_open_attendance_editing_to_dashboard_users.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/079_open_attendance_editing_to_dashboard_users.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/DROP POLICY IF EXISTS "Coaches manage own time_slots" ON time_slots/.test(MIG),
    'drops the per-coach "Coaches manage own time_slots" policy');
assert(/CREATE POLICY "Dashboard users manage time_slots"\s+ON time_slots FOR ALL/.test(MIG),
    'creates "Dashboard users manage time_slots" FOR ALL on time_slots');
assert(/DROP POLICY IF EXISTS "Authorized users can manage time slot assignments" ON student_time_slot_assignments/.test(MIG),
    'drops the admin/can_edit_students assignments policy');
assert(/CREATE POLICY "Dashboard users manage time slot assignments"\s+ON student_time_slot_assignments FOR ALL/.test(MIG),
    'creates "Dashboard users manage time slot assignments" FOR ALL');

// Both new policies must use the "any user_roles row" predicate, with NO
// coach_id, no role='admin', no can_edit_students narrowing. Scope to the SQL
// body between the first CREATE POLICY and the trailing COMMENT statements so
// the header/COMMENT prose (which references the old policies) is excluded.
const bodyStart = MIG.indexOf('CREATE POLICY "Dashboard users manage time_slots"');
const bodyEnd = MIG.indexOf('COMMENT ON POLICY');
const newPolicyRegion = MIG.slice(bodyStart, bodyEnd);
assert(/WHERE user_roles\.user_id = auth\.uid\(\)\s*\)/.test(newPolicyRegion),
    'predicate is EXISTS(user_roles WHERE user_id = auth.uid()) — any row');
assert(!/coach_id\s*=\s*time_slots\.coach_id/.test(newPolicyRegion),
    'new policies drop the own-coach (coach_id = time_slots.coach_id) check');
assert(!/can_edit_students/.test(newPolicyRegion),
    'new policy bodies drop the can_edit_students narrowing');
assert(!/role\s*=\s*'admin'/.test(newPolicyRegion),
    'new policy bodies do not narrow on role = admin');
assert((newPolicyRegion.match(/WITH CHECK/g) || []).length === 2,
    'both new policies carry a WITH CHECK (write path covered)');

// Untouched policies must NOT be DROP'd or (re)CREATE'd by this migration.
assert(!/(DROP|CREATE) POLICY[^\n]*"Admins manage time_slots"/.test(MIG),
    'leaves "Admins manage time_slots" untouched');
assert(!/(DROP|CREATE) POLICY[^\n]*"Anyone can read time_slots"/.test(MIG),
    'leaves "Anyone can read time_slots" untouched');
assert(!/(DROP|CREATE) POLICY[^\n]*"Anyone can read time slot assignments"/.test(MIG),
    'leaves "Anyone can read time slot assignments" untouched');
assert(!/\bON attendance\b|attendance_records|ON students\b/.test(MIG),
    'does not touch attendance-marking or students table policies');

// ============================================================================
// 2. admin-v2.js — canEditCurrentSlots / editButtonHiddenReason relaxed
// ============================================================================
console.log('\n=== admin-v2.js UI gates =============================================\n');

const canEditBody = fnBody(ADMIN_JS, 'canEditCurrentSlots');
assert(canEditBody.length > 0, 'located canEditCurrentSlots');
assert(/!attendanceCurrentCoachName/.test(canEditBody),
    'still requires a concrete coach to be selected');
assert(!/attendanceRoleInfo\.isAdmin/.test(canEditBody),
    'drops the admin-only branch');
assert(!/attendanceRoleInfo\.coachId/.test(canEditBody) &&
       !/attendanceCurrentCoach === attendanceRoleInfo\.coachId/.test(canEditBody),
    'drops the own-coach (coachId === current) check');

const hiddenBody = fnBody(ADMIN_JS, 'editButtonHiddenReason');
assert(hiddenBody.length > 0, 'located editButtonHiddenReason');
assert(!/attendanceRoleInfo\.isAdmin/.test(hiddenBody),
    'no-coach hint is no longer admin-only');
assert(/'no_coach_selected'/.test(hiddenBody),
    'returns generic no_coach_selected reason');
assert(/editButtonHiddenReason\(\) === 'no_coach_selected'/.test(ADMIN_JS),
    'render path matches the renamed no_coach_selected reason');
assert(!/'admin_no_coach_selected'/.test(ADMIN_JS),
    'no lingering admin_no_coach_selected string');

// ============================================================================
// 3. JS port of the new RLS predicates
// ============================================================================
console.log('\n=== new RLS predicates (JS port) =====================================\n');

// EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid())
// applied to BOTH tables. `roles` is the user_roles table; a caller is
// authorized iff at least one row has user_id === callerUid.
function canManageAsDashboardUser(roles, callerUid) {
    return roles.some(r => r.user_id === callerUid);
}

// user_roles fixtures
const USER_ROLES = [
    { user_id: 'admin-uid', role: 'admin',  coach_id: null,       can_edit_students: true  },
    { user_id: 'coachA-uid', role: 'coach', coach_id: 'coachA',   can_edit_students: false },
    { user_id: 'coachB-uid', role: 'coach', coach_id: 'coachB',   can_edit_students: false },
];

// (a) coach A can add/edit/delete a slot belonging to coach B.
{
    const slotOfCoachB = { coach_id: 'coachB', branch_id: 'b1', schedule_type: 'mon_wed', slot_index: 0 };
    // Under the OLD "Coaches manage own time_slots" policy this was false.
    const oldOwnCoach = USER_ROLES.some(r => r.user_id === 'coachA-uid' && r.coach_id === slotOfCoachB.coach_id);
    assert(oldOwnCoach === false, 'sanity: old own-coach policy blocked coach A on coach B slot');
    assert(canManageAsDashboardUser(USER_ROLES, 'coachA-uid') === true,
        'coach A can manage (add/edit/delete) coach B\'s time_slot');
}

// (b) a coach WITHOUT can_edit_students can manage student_time_slot_assignments.
{
    const coachA = USER_ROLES.find(r => r.user_id === 'coachA-uid');
    assert(coachA.can_edit_students === false, 'sanity: coach A has can_edit_students = false');
    const oldAssignmentPolicy = coachA.role === 'admin' || coachA.can_edit_students === true;
    assert(oldAssignmentPolicy === false, 'sanity: old assignments policy blocked coach A');
    assert(canManageAsDashboardUser(USER_ROLES, 'coachA-uid') === true,
        'coach A (no can_edit_students) can manage student_time_slot_assignments');
}

// (c) a user with NO user_roles row is rejected for BOTH tables.
{
    assert(canManageAsDashboardUser(USER_ROLES, 'stranger-uid') === false,
        'user with no user_roles row is rejected for time_slots');
    assert(canManageAsDashboardUser(USER_ROLES, 'stranger-uid') === false,
        'user with no user_roles row is rejected for student_time_slot_assignments');
    assert(canManageAsDashboardUser(USER_ROLES, null) === false,
        'unauthenticated (null uid) is rejected');
}

// (d) admin still authorized (untouched "Admins manage" plus the new predicate).
{
    assert(canManageAsDashboardUser(USER_ROLES, 'admin-uid') === true,
        'admin still authorized under the new predicate');
}

// ============================================================================
// 4. JS port of canEditCurrentSlots / editButtonHiddenReason
// ============================================================================
console.log('\n=== canEditCurrentSlots / editButtonHiddenReason (JS port) ===========\n');

function canEditCurrentSlots(roleInfo, currentCoachName) {
    if (!roleInfo) return false;
    if (!currentCoachName) return false;
    return true;
}
function editButtonHiddenReason(roleInfo, currentCoachName) {
    if (!roleInfo) return null;
    if (!currentCoachName) return 'no_coach_selected';
    return null;
}

const adminRole  = { isAdmin: true,  coachId: null };
const coachARole = { isAdmin: false, coachId: 'coachA' };

// A plain coach viewing ANOTHER coach's calendar can now edit.
assert(canEditCurrentSlots(coachARole, 'Coach B') === true,
    'coach A can edit slots on coach B\'s calendar (own-coach gate gone)');
// Admin still can, once a coach is selected.
assert(canEditCurrentSlots(adminRole, 'Coach B') === true,
    'admin can edit with a coach selected');
// No concrete coach selected -> still blocked, for everyone.
assert(canEditCurrentSlots(coachARole, null) === false,
    'coach blocked when no concrete coach selected');
assert(canEditCurrentSlots(adminRole, '') === false,
    'admin blocked when no concrete coach selected');
// No role info at all -> blocked.
assert(canEditCurrentSlots(null, 'Coach B') === false,
    'no role info -> cannot edit');

// Hidden reason is generic (not admin-only) and only fires with no coach.
assertEqual(editButtonHiddenReason(coachARole, null), 'no_coach_selected',
    'coach with no coach selected gets the no_coach_selected hint');
assertEqual(editButtonHiddenReason(adminRole, null), 'no_coach_selected',
    'admin with no coach selected gets the same hint');
assertEqual(editButtonHiddenReason(coachARole, 'Coach B'), null,
    'no hint once a coach is selected');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
