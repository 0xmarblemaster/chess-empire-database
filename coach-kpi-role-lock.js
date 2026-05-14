/**
 * Coach KPI Role Lock — view/branch/coach scoping for the Coach Performance dashboard.
 *
 * The Coach Performance dashboard has three drill-down views: School → Branch → Coach.
 * Per PRD §6:
 *
 *   | Role  | School view | Branch view      | Coach view |
 *   |-------|-------------|------------------|------------|
 *   | Admin | ✅ all       | ✅ all            | ✅ all      |
 *   | Coach | ❌ hidden    | ✅ own branches   | ✅ self only|
 *
 * This module is pure / DOM-free so it can be tested in Node. Wiring into the
 * DOM (nav menu, view switcher, branch/coach selectors, edge-function calls)
 * lives in admin.js / admin-v2.js and coach-kpi.js.
 */

(function () {
    'use strict';

    const VIEWS = Object.freeze(['school', 'branch', 'coach']);

    /**
     * True when the user is a non-admin coach with a resolved coach id.
     * Mirrors attendance-role-lock.isCoachLocked exactly so consumers can
     * share the same gate.
     */
    function isCoachLocked(roleInfo) {
        return !!(roleInfo && roleInfo.isAdmin === false && roleInfo.coachId);
    }

    /**
     * True when the user is an admin (regardless of coachId).
     */
    function isAdmin(roleInfo) {
        return !!(roleInfo && roleInfo.isAdmin === true);
    }

    /**
     * Which top-level views the user is allowed to see.
     *   - Admin → all three views.
     *   - Locked coach → branch + coach only (school view is hidden).
     *   - Anyone else (anon, missing role) → no views.
     */
    function allowedViews(roleInfo) {
        if (isAdmin(roleInfo)) {
            return { school: true, branch: true, coach: true };
        }
        if (isCoachLocked(roleInfo)) {
            return { school: false, branch: true, coach: true };
        }
        return { school: false, branch: false, coach: false };
    }

    /**
     * Gate for a specific view. Unknown view names always return false.
     */
    function canAccessView(roleInfo, view) {
        if (!VIEWS.includes(view)) return false;
        return allowedViews(roleInfo)[view];
    }

    /**
     * The view to land on when the dashboard first opens.
     *   - Admin → 'school' (matches PRD UI: school overview is the admin landing).
     *   - Locked coach → 'coach' (their self view; most personally relevant).
     *   - No access → null (caller should not render the dashboard at all).
     */
    function defaultView(roleInfo) {
        if (isAdmin(roleInfo)) return 'school';
        if (isCoachLocked(roleInfo)) return 'coach';
        return null;
    }

    /**
     * Top-level "Coach Performance" nav menu visibility.
     * Used by updateMenuVisibility() to decide whether to render the link.
     *   - Admin / locked coach → visible.
     *   - Anyone else → hidden.
     */
    function navMenuVisibility(roleInfo) {
        if (isAdmin(roleInfo) || isCoachLocked(roleInfo)) {
            return { hidden: false, disabled: false };
        }
        return { hidden: true, disabled: true };
    }

    /**
     * View-switcher visibility per tab. Tabs the user can't access are
     * hidden+disabled so the switcher renders only the allowed views.
     * Returns the same shape as allowedViews but with hidden/disabled flags
     * for direct DOM use.
     */
    function viewSwitcherVisibility(roleInfo) {
        const allowed = allowedViews(roleInfo);
        const out = {};
        for (const v of VIEWS) {
            out[v] = allowed[v]
                ? { hidden: false, disabled: false }
                : { hidden: true, disabled: true };
        }
        return out;
    }

    /**
     * Branch names the coach is assigned to (from coach_branches).
     *   - Locked → array of branch names from the matching coach record
     *     (empty array if the coach record or its assignments are missing).
     *   - Admin / unlocked → null (caller should treat as "no restriction").
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
     * Coach ids the user is allowed to inspect in the Coach view.
     *   - Locked → [self] (a coach may only see their own data).
     *   - Admin / unlocked → null (no restriction).
     */
    function coachAllowedCoachIds(roleInfo) {
        if (!isCoachLocked(roleInfo)) return null;
        return [roleInfo.coachId];
    }

    /**
     * Filter a list of branches down to those the user may inspect.
     * Branches are matched by name against coachAllowedBranchNames.
     *   - Admin / unlocked → returns the input list unchanged.
     *   - Locked coach → returns only branches whose `name` is in their scope.
     *
     * Accepts branches as either strings or objects with a `name` field.
     */
    function filterBranchesForRole(roleInfo, branches, coaches) {
        const list = Array.isArray(branches) ? branches : [];
        const allowed = coachAllowedBranchNames(roleInfo, coaches);
        if (allowed === null) return list.slice();
        const allowSet = new Set(allowed);
        return list.filter(b => {
            const name = typeof b === 'string' ? b : (b && b.name);
            return !!name && allowSet.has(name);
        });
    }

    /**
     * Filter a list of coaches down to those the user may inspect.
     *   - Admin / unlocked → returns the input list unchanged.
     *   - Locked coach → returns only the coach record matching roleInfo.coachId
     *     (empty array if the record is missing).
     */
    function filterCoachesForRole(roleInfo, coaches) {
        const list = Array.isArray(coaches) ? coaches : [];
        if (!isCoachLocked(roleInfo)) return list.slice();
        return list.filter(c => c && c.id === roleInfo.coachId);
    }

    /**
     * Pick the branch to land on, honoring the coach lock.
     *   - Locked + currentBranch in allowed → currentBranch (stable).
     *   - Locked + currentBranch invalid/null → first `available` that's also
     *     in allowed; null if no overlap (don't auto-jump out of scope).
     *   - Unlocked → currentBranch if truthy, else first of available, else null.
     *
     * `allowedBranchNames` is the result of `coachAllowedBranchNames` — null
     * means "no restriction" (admin / anon).
     */
    function resolveSelectedBranch(roleInfo, allowedBranchNames, currentBranch, available) {
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
     * Pick the coach to inspect in the Coach view.
     *   - Locked → always self (overrides any stored value).
     *   - Admin / unlocked → caller's existing value (or null).
     */
    function resolveSelectedCoach(roleInfo, currentCoachId) {
        if (isCoachLocked(roleInfo)) return roleInfo.coachId;
        return currentCoachId == null ? null : currentCoachId;
    }

    /**
     * Gate: may this user view this coach's KPI detail?
     *   - Admin → true (any coach).
     *   - Locked coach → only when targetCoachId === self.
     *   - Anyone else → false.
     */
    function canAccessCoach(roleInfo, targetCoachId) {
        if (isAdmin(roleInfo)) return !!targetCoachId;
        if (isCoachLocked(roleInfo)) return targetCoachId === roleInfo.coachId;
        return false;
    }

    /**
     * Gate: may this user view this branch's KPI detail?
     *   - Admin → true.
     *   - Locked coach → only when branchName is in the coach's allowed set.
     *   - Anyone else → false.
     */
    function canAccessBranch(roleInfo, branchName, coaches) {
        if (!branchName) return false;
        if (isAdmin(roleInfo)) return true;
        if (!isCoachLocked(roleInfo)) return false;
        const allowed = coachAllowedBranchNames(roleInfo, coaches) || [];
        return allowed.includes(branchName);
    }

    /**
     * Build the canonical scope params for an edge-function call.
     * Returns null when the user is not allowed to load the requested view;
     * callers should refuse to issue the request in that case.
     *
     * Shape:
     *   { action, branchName?, coachId? }
     *
     * Rules:
     *   - school view  → admin only.   { action: 'school_kpi_summary' }
     *   - branch view  → admin: any branch passes through.
     *                  → locked coach: branchName must be in scope.
     *                    { action: 'coach_leaderboard', branchName }
     *   - coach view   → admin: any coach passes through.
     *                  → locked coach: coachId is forced to self regardless
     *                    of input. { action: 'coach_kpi_summary', coachId }
     */
    function kpiQueryScope(roleInfo, view, params) {
        if (!canAccessView(roleInfo, view)) return null;
        const p = params || {};
        if (view === 'school') {
            return { action: 'school_kpi_summary' };
        }
        if (view === 'branch') {
            const branchName = p.branchName;
            if (!branchName) return null;
            if (isCoachLocked(roleInfo)) {
                const allowed = coachAllowedBranchNames(roleInfo, p.coaches) || [];
                if (!allowed.includes(branchName)) return null;
            }
            return { action: 'coach_leaderboard', branchName };
        }
        if (view === 'coach') {
            const coachId = isCoachLocked(roleInfo) ? roleInfo.coachId : p.coachId;
            if (!coachId) return null;
            return { action: 'coach_kpi_summary', coachId };
        }
        return null;
    }

    /**
     * Phase 2 dashboard gate — true when the user is allowed to open the
     * Coach Performance section at all. Per the Phase 2 transparency model,
     * both admins and coaches can view; anyone else cannot.
     *
     * Coach detection accepts either an explicit `isCoach` flag or the
     * `coachId` field that `auth-helpers.getRoleInfo` actually returns.
     */
    function canViewCoachKpi(roleInfo) {
        if (!roleInfo) return false;
        if (roleInfo.isAdmin === true) return true;
        if (roleInfo.isCoach === true) return true;
        if (roleInfo.coachId) return true;
        return false;
    }

    /**
     * Initial branch-filter value for the dashboard. Phase 2 uses a
     * transparency model: every viewer (admin or coach) lands on `'all'`
     * and may narrow down from there.
     */
    function getInitialBranchScope(_roleInfo) {
        return 'all';
    }

    /**
     * Initial coach-filter value for the dashboard. Same transparency model:
     * every viewer starts at `'all'`.
     */
    function getInitialCoachScope(_roleInfo) {
        return 'all';
    }

    const api = {
        VIEWS,
        isCoachLocked,
        isAdmin,
        allowedViews,
        canAccessView,
        defaultView,
        navMenuVisibility,
        viewSwitcherVisibility,
        coachAllowedBranchNames,
        coachAllowedCoachIds,
        filterBranchesForRole,
        filterCoachesForRole,
        resolveSelectedBranch,
        resolveSelectedCoach,
        canAccessCoach,
        canAccessBranch,
        kpiQueryScope,
        canViewCoachKpi,
        getInitialBranchScope,
        getInitialCoachScope,
    };

    if (typeof window !== 'undefined') {
        window.coachKpiRoleLock = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
