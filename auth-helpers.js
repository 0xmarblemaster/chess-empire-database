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
     * Looks up the user's email in the `coaches` table:
     *   - found     → { isAdmin: false, coachId: <uuid> }
     *   - not found → { isAdmin: true,  coachId: null   } (authenticated non-coach = admin)
     *   - no auth   → { isAdmin: false, coachId: null   }
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
        const { data: coach, error: coachError } = await sb
            .from('coaches')
            .select('id')
            .eq('email', email)
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
