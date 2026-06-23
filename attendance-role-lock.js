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

    /**
     * Coaches assigned to a specific branch (by branch name, from coach_branches).
     *   - Returns an array of {id, name} for every coach whose branchNames
     *     contains `branchName`.
     *   - Fallback: when no coach matches by branchNames AND `branches` (the live
     *     branch list) is supplied, the branch is resolved to an id and coaches
     *     are matched by `branchIds`. This protects against stale or missing
     *     branchNames data without losing the locked-coach selector.
     *   - Empty array if no match, or if inputs are missing/malformed.
     *
     * @param {Array<{id: string, firstName?: string, lastName?: string, fullName?: string, branchNames?: string[], branchIds?: string[]}>} coaches
     * @param {string} branchName
     * @param {Array<{id: string, name: string}>} [branches]
     * @returns {Array<{id: string, name: string}>}
     */
    function coachesAtBranch(coaches, branchName, branches) {
        if (!branchName) return [];
        const list = Array.isArray(coaches) ? coaches : [];
        let matched = list.filter(
            c => c && Array.isArray(c.branchNames) && c.branchNames.includes(branchName)
        );
        if (matched.length === 0 && Array.isArray(branches)) {
            const branchObj = branches.find(b => b && b.name === branchName);
            if (branchObj && branchObj.id) {
                matched = list.filter(
                    c => c && Array.isArray(c.branchIds) && c.branchIds.includes(branchObj.id)
                );
            }
        }
        return matched.map(c => ({
            id: c.id,
            name: c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        }));
    }

    /**
     * True when the user is a locked coach AND the selected branch has at least
     * two coaches assigned (i.e. the coach is allowed to switch among peers at
     * this branch). Admins and unlocked users return false.
     */
    function isMultiCoachBranchForCoach(roleInfo, coaches, branchName, branches) {
        if (!isCoachLocked(roleInfo)) return false;
        return coachesAtBranch(coaches, branchName, branches).length >= 2;
    }

    /**
     * Branch-aware selector visibility for the attendance coach dropdown.
     *   - Admin / unlocked → fully visible, allowedCoachIds = null (no restriction).
     *   - Locked coach at multi-coach branch → visible + enabled, allowedCoachIds
     *     is every coach id at that branch (so the coach can switch among peers).
     *   - Locked coach at single-coach branch → hidden + disabled, allowedCoachIds
     *     = [self] (the original lock — only the signed-in coach is allowed).
     *
     * @returns {{hidden: boolean, disabled: boolean, allowedCoachIds: string[]|null}}
     */
    function coachSelectorVisibilityForBranch(roleInfo, coaches, branchName, branches) {
        if (!isCoachLocked(roleInfo)) {
            return { hidden: false, disabled: false, allowedCoachIds: null };
        }
        const branchCoaches = coachesAtBranch(coaches, branchName, branches);
        if (branchCoaches.length >= 2) {
            return {
                hidden: false,
                disabled: false,
                allowedCoachIds: branchCoaches.map(c => c.id),
            };
        }
        return { hidden: true, disabled: true, allowedCoachIds: [roleInfo.coachId] };
    }

    /**
     * Pick the coach-filter value, honoring the branch-scoped lock.
     *   - Admin / unlocked → caller's existing value (or 'all').
     *   - Locked coach at single-coach branch → coach's own id.
     *   - Locked coach at multi-coach branch:
     *       * keep `currentValue` if it's a coach id at this branch (so a
     *         previously-selected peer survives a branch hop);
     *       * otherwise fall back to the coach's own id.
     */
    function resolveCoachFilterForBranch(roleInfo, coaches, branchName, currentValue, branches) {
        if (!isCoachLocked(roleInfo)) {
            return currentValue == null ? 'all' : currentValue;
        }
        const branchCoaches = coachesAtBranch(coaches, branchName, branches);
        if (branchCoaches.length >= 2) {
            const allowed = branchCoaches.map(c => c.id);
            if (currentValue && allowed.includes(currentValue)) return currentValue;
            return roleInfo.coachId;
        }
        return roleInfo.coachId;
    }

    const api = {
        isCoachLocked,
        resolveCoachFilter,
        coachOnBranchChange,
        coachAllowedBranchNames,
        resolveBranchSelection,
        coachesAtBranch,
        isMultiCoachBranchForCoach,
        coachSelectorVisibilityForBranch,
        resolveCoachFilterForBranch,
    };

    if (typeof window !== 'undefined') {
        window.attendanceRoleLock = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
