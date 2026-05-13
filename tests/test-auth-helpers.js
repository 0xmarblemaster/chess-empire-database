/**
 * Tests for auth-helpers.getRoleInfo.
 * Run: node tests/test-auth-helpers.js
 *
 * Covers:
 *   - authenticated coach → { isAdmin: false, coachId: <id> }
 *   - authenticated non-coach → { isAdmin: true, coachId: null }
 *   - no session → { isAdmin: false, coachId: null }
 *   - auth.getUser() error → { isAdmin: false, coachId: null }
 *   - user with no email → { isAdmin: false, coachId: null }
 *   - coaches query error → propagated
 *   - lookup uses the user's email verbatim
 */

const authHelpers = require('../auth-helpers.js');

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

// Minimal mock matching the surface getRoleInfo touches.
// authUser controls auth.getUser(); coaches is the coaches table; coachesError
// fires on the select chain to test error propagation.
function createMockClient({ authUser, authError, coaches, coachesError } = {}) {
    const lookups = [];

    return {
        auth: {
            getUser: async () => {
                if (authError) return { data: null, error: authError };
                return { data: { user: authUser || null }, error: null };
            },
        },
        from(table) {
            const state = { table, col: null, val: null };
            const api = {
                select() { return api; },
                eq(col, val) { state.col = col; state.val = val; return api; },
                maybeSingle: async () => {
                    lookups.push({ table, col: state.col, val: state.val });
                    if (coachesError) return { data: null, error: coachesError };
                    if (table !== 'coaches') return { data: null, error: null };
                    const match = (coaches || []).find(c => c[state.col] === state.val) || null;
                    return { data: match, error: null };
                },
            };
            return api;
        },
        _lookups: lookups,
    };
}

async function run() {
    console.log('\n=== getRoleInfo — authenticated coach =============================\n');
    {
        const client = createMockClient({
            authUser: { id: 'u1', email: 'coach@chessempire.kz' },
            coaches: [{ id: 'coach-uuid-1', email: 'coach@chessempire.kz' }],
        });
        const out = await authHelpers.getRoleInfo(client);
        assertEqual(out, { isAdmin: false, coachId: 'coach-uuid-1', email: 'coach@chessempire.kz' },
            'coach email resolves to { isAdmin:false, coachId:<id> }');
        assertEqual(client._lookups, [{ table: 'coaches', col: 'email', val: 'coach@chessempire.kz' }],
            'lookup performed against coaches.email');
    }

    console.log('\n=== getRoleInfo — authenticated non-coach is admin ================\n');
    {
        const client = createMockClient({
            authUser: { id: 'u2', email: 'admin@chessempire.kz' },
            coaches: [{ id: 'coach-uuid-1', email: 'someone-else@chessempire.kz' }],
        });
        const out = await authHelpers.getRoleInfo(client);
        assertEqual(out, { isAdmin: true, coachId: null, email: 'admin@chessempire.kz' },
            'non-coach email → { isAdmin:true, coachId:null }');
    }

    console.log('\n=== getRoleInfo — no session ======================================\n');
    {
        const client = createMockClient({ authUser: null });
        const out = await authHelpers.getRoleInfo(client);
        assertEqual(out, { isAdmin: false, coachId: null, email: null },
            'unauthenticated → safe defaults, no coach lookup');
        assertEqual(client._lookups, [], 'no coaches query when there is no user');
    }

    console.log('\n=== getRoleInfo — auth.getUser error ==============================\n');
    {
        const client = createMockClient({ authError: { message: 'token expired' } });
        const out = await authHelpers.getRoleInfo(client);
        assertEqual(out, { isAdmin: false, coachId: null, email: null },
            'auth error → safe defaults (never silently grant admin)');
    }

    console.log('\n=== getRoleInfo — user without email ==============================\n');
    {
        const client = createMockClient({ authUser: { id: 'u3' } });
        const out = await authHelpers.getRoleInfo(client);
        assertEqual(out, { isAdmin: false, coachId: null, email: null },
            'user with no email → safe defaults');
    }

    console.log('\n=== getRoleInfo — coaches query error propagates ==================\n');
    {
        const client = createMockClient({
            authUser: { id: 'u1', email: 'coach@chessempire.kz' },
            coachesError: { message: 'rls denied' },
        });
        let threw = false;
        try {
            await authHelpers.getRoleInfo(client);
        } catch (e) {
            threw = true;
            assertEqual(e.message, 'rls denied', 'coaches error surfaced unchanged');
        }
        assert(threw, 'coaches error rethrown to caller (do not mask DB failures as admin)');
    }

    console.log('\n=== getRoleInfo — missing client returns defaults =================\n');
    {
        const out = await authHelpers.getRoleInfo(null);
        assertEqual(out, { isAdmin: false, coachId: null, email: null },
            'no client → safe defaults');
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
