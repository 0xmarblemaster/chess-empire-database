/**
 * Attendance Role Lock — coach scoping for the attendance tab.
 *
 * When the authenticated user is a coach (not an admin), the attendance tab
 * must be locked to that coach's own data: the coach selector is fixed to
 * their id, branch changes do not reset it back to 'all', and the dropdown
 * is hidden/disabled so they cannot pick another coach or 'all'.
 *
 * This module is pure / DOM-free so it can be tested in Node. Wiring into
 * the DOM lives in admin.js / admin-v2.js.
 */

(function () {
    'use strict';

    /**
     * True when the role helper says the user is a coach (not admin) and has
     * a resolved coach id. Anything else (admin, unauthenticated, no roleInfo)
     * is unlocked.
     */
    function isCoachLocked(roleInfo) {
        return !!(roleInfo && roleInfo.isAdmin === false && roleInfo.coachId);
    }

    /**
     * Pick the coach-filter value, honoring the lock.
     *   - Locked → always the coach's own id (overrides saved 'all'/other coach).
     *   - Unlocked → caller's existing value (or 'all' default).
     */
    function resolveCoachFilter(roleInfo, currentValue) {
        if (isCoachLocked(roleInfo)) return roleInfo.coachId;
        return currentValue == null ? 'all' : currentValue;
    }

    /**
     * What to do with the coach selector dropdown(s).
     *   - Locked → hide and disable; coach can't switch.
     *   - Unlocked → leave it to the existing visibility logic.
     */
    function coachSelectorVisibility(roleInfo) {
        if (isCoachLocked(roleInfo)) {
            return { hidden: true, disabled: true };
        }
        return { hidden: false, disabled: false };
    }

    /**
     * Decide what attendanceCurrentCoach becomes when the branch changes.
     *   - Locked → keep coach id (do NOT reset to 'all').
     *   - Unlocked → reset to 'all' (preserves existing branch-change UX).
     */
    function coachOnBranchChange(roleInfo) {
        if (isCoachLocked(roleInfo)) return roleInfo.coachId;
        return 'all';
    }

    /**
     * Branch names the locked coach is assigned to (from coach_branches).
     *   - Locked → array of branch names from the matching coach record
     *     (empty array if record / assignments are missing).
     *   - Unlocked → null (caller should treat this as "no restriction").
     *
     * @param {object} roleInfo
     * @param {Array<{id: string, branchNames?: string[]}>} coaches
     * @returns {string[]|null}
     */
    function coachAllowedBranchNames(roleInfo, coaches) {
        if (!isCoachLocked(roleInfo)) return null;
        const list = Array.isArray(coaches) ? coaches : [];
        const coach = list.find(c => c && c.id === roleInfo.coachId);
        if (!coach || !Array.isArray(coach.branchNames)) return [];
        return coach.branchNames.slice();
    }

    /**
     * Pick the branch to land on, honoring the coach lock.
     *   - Locked + currentBranch in allowed → currentBranch (stable).
     *   - Locked + currentBranch invalid (or null) → first `available` that's
     *     also in allowed; null if no overlap (don't auto-jump elsewhere).
     *   - Unlocked → currentBranch if truthy, else first of available, else null.
     *
     * `allowedBranchNames` is the result of `coachAllowedBranchNames` — null
     * means "no restriction" (admin / anon).
     */
    function resolveBranchSelection(roleInfo, allowedBranchNames, currentBranch, available) {
        const avail = Array.isArray(available) ? available : [];
        if (isCoachLocked(roleInfo)) {
            const allowed = Array.isArray(allowedBranchNames) ? allowedBranchNames : [];
            if (currentBranch && allowed.includes(currentBranch)) return currentBranch;
            const fallback = avail.find(b => allowed.includes(b));
            return fallback || null;
        }
        if (currentBranch) return currentBranch;
        return avail[0] || null;
    }

    const api = {
        isCoachLocked,
        resolveCoachFilter,
        coachSelectorVisibility,
        coachOnBranchChange,
        coachAllowedBranchNames,
        resolveBranchSelection,
    };

    if (typeof window !== 'undefined') {
        window.attendanceRoleLock = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
