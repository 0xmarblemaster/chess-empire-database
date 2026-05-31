/**
 * Auth Helpers — role detection
 *
 * Pure-data helper that resolves the current authenticated user to a coach
 * row (when one exists) and reports whether they are an admin. Designed to be
 * called once per page load — no caching here, callers should memoize.
 *
 * Used by browser code via window.supabaseAuth.getRoleInfo; importable in
 * Node tests via module.exports.
 */

(function () {
    'use strict';

    /**
     * Resolve current auth user to {isAdmin, coachId}.
     *
     * Resolution order:
     *   1. user_roles.role for auth user.id → if 'admin', short-circuit to admin
     *      (even if the user also has a coach row).
     *   2. coaches.email lookup:
     *        found     → { isAdmin: false, coachId: <uuid> }
     *        not found → { isAdmin: true,  coachId: null   }
     *
     *   - no auth → { isAdmin: false, coachId: null }
     *
     * @param {object} client Supabase client (defaults to window.supabaseClient)
     * @returns {Promise<{isAdmin: boolean, coachId: string|null, email: string|null}>}
     */
    async function getRoleInfo(client) {
        const sb = client || (typeof window !== 'undefined' ? window.supabaseClient : null);
        if (!sb) {
            return { isAdmin: false, coachId: null, email: null };
        }

        const { data: userData, error: userError } = await sb.auth.getUser();
        if (userError || !userData || !userData.user || !userData.user.email) {
            return { isAdmin: false, coachId: null, email: null };
        }

        const email = userData.user.email;
        const userId = userData.user.id;

        const { data: roleRow, error: roleError } = await sb
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
            .maybeSingle();

        if (roleError) {
            // Surface query errors rather than silently misclassifying the user.
            throw roleError;
        }

        if (roleRow && roleRow.role === 'admin') {
            return { isAdmin: true, coachId: null, email };
        }

        const { data: coach, error: coachError } = await sb
            .from('coaches')
            .select('id')
            .ilike('email', email)
            .maybeSingle();

        if (coachError) {
            // Surface query errors rather than silently treating user as admin.
            throw coachError;
        }

        if (coach && coach.id) {
            return { isAdmin: false, coachId: coach.id, email };
        }
        return { isAdmin: true, coachId: null, email };
    }

    const authHelpers = { getRoleInfo };

    if (typeof window !== 'undefined') {
        window.authHelpers = authHelpers;
        // Extend the existing supabaseAuth surface if it has been initialized.
        if (window.supabaseAuth) {
            window.supabaseAuth.getRoleInfo = getRoleInfo;
        }
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = authHelpers;
    }
})();
