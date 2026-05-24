/**
 * Regression test for the 401 UNAUTHORIZED_NO_AUTH_HEADER bug.
 *
 * supabase-config.js exposes the anon JWT as `anonKey`, not `apiKey`. Two
 * call sites (coach-kpi.js callKpiEndpoint and supabase-data-tournaments.js
 * getBranchLeaderboard) used to read `config.apiKey` directly and ended up
 * sending empty `x-api-key` / `Authorization` headers, which the Supabase
 * edge gateway rejects with 401.
 *
 * This test wires up a config with ONLY `anonKey` set (no `apiKey`) and
 * asserts both call sites emit the JWT in both header slots.
 *
 * Run: node tests/test-config-anon-key-headers.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function makeFetchStub() {
    const calls = [];
    const fn = (url, init) => {
        calls.push({ url, init });
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: [] }),
        });
    };
    return { fn, calls };
}

function loadFresh(modulePath) {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    return require(resolved);
}

(async function run() {
    console.log('\n=== coach-kpi callKpiEndpoint reads config.anonKey ====================\n');
    {
        const stub = makeFetchStub();
        global.window = { supabaseConfig: { url: 'https://test', anonKey: 'test-jwt' } };
        global.fetch = stub.fn;
        // coach-kpi-role-lock is required transitively; clear it too so the
        // fresh load of coach-kpi.js picks up our stubbed globals cleanly.
        delete require.cache[require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'))];
        const mod = loadFresh(path.join(__dirname, '..', 'coach-kpi.js'));

        await mod.callKpiEndpoint({ action: 'coach_leaderboard' });
        assert(stub.calls.length === 1, 'callKpiEndpoint issues exactly one fetch');
        const headers = stub.calls[0].init.headers;
        assert(headers['x-api-key'] === 'test-jwt',
            "x-api-key falls back to anonKey when apiKey is absent");
        assert(headers['Authorization'] === 'Bearer test-jwt',
            "Authorization carries 'Bearer <anonKey>' when apiKey is absent");
    }

    console.log('\n=== getBranchLeaderboard reads config.anonKey =========================\n');
    {
        const stub = makeFetchStub();
        // Tournaments module reads window.supabaseConfig lazily inside the
        // function call, so just reset it before invoking.
        global.window = { supabaseConfig: { url: 'https://test', anonKey: 'test-jwt' } };
        global.fetch = stub.fn;
        const mod = loadFresh(path.join(__dirname, '..', 'supabase-data-tournaments.js'));

        await mod.getBranchLeaderboard('branch-1', 'A', { fetch: stub.fn,
            config: { url: 'https://test', anonKey: 'test-jwt' } });
        assert(stub.calls.length === 1, 'getBranchLeaderboard issues exactly one fetch for a single league');
        const headers = stub.calls[0].init.headers;
        assert(headers['x-api-key'] === 'test-jwt',
            "x-api-key falls back to anonKey when apiKey is absent");
        assert(headers['Authorization'] === 'Bearer test-jwt',
            "Authorization carries 'Bearer <anonKey>' when apiKey is absent");
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
