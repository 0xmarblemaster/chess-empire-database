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

    const api = {
        isCoachLocked,
        resolveCoachFilter,
        coachSelectorVisibility,
        coachOnBranchChange,
    };

    if (typeof window !== 'undefined') {
        window.attendanceRoleLock = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
