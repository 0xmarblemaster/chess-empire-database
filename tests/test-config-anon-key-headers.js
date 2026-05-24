/**
 * Regression test for the Coach Effectiveness 401 bug.
 *
 * The analytics-tournaments edge function authenticates via TWO mechanisms:
 *   1. Supabase gateway expects `Authorization: Bearer <anon-JWT>`
 *   2. The edge function's internal check expects `x-api-key: <hardcoded edge key>`
 *
 * An earlier regression sent the same value in both headers, which the edge
 * function rejected with `{success:false, error:"Unauthorized"}`. This test
 * locks in the two-value behavior: call sites must read the hardcoded edge
 * key from `config.apiKey` and the anon JWT from `config.anonKey`, and emit
 * them in their respective headers — non-empty and DIFFERENT from each other.
 *
 * Run: node tests/test-config-anon-key-headers.js
 */

const path = require('path');

const HARDCODED_EDGE_KEY = 'ce-api-2026-k8x9m2p4q7w1';
const TEST_JWT = 'test-anon-jwt';

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

function assertSplitHeaders(headers, label) {
    assert(headers['x-api-key'] === HARDCODED_EDGE_KEY,
        `${label}: x-api-key carries the hardcoded edge key`);
    assert(headers['Authorization'] === `Bearer ${TEST_JWT}`,
        `${label}: Authorization carries 'Bearer <anonKey>'`);
    assert(typeof headers['x-api-key'] === 'string' && headers['x-api-key'].length > 0,
        `${label}: x-api-key is non-empty`);
    assert(typeof headers['Authorization'] === 'string' && headers['Authorization'].length > 0,
        `${label}: Authorization is non-empty`);
    assert(headers['x-api-key'] !== headers['Authorization'],
        `${label}: x-api-key and Authorization carry different values`);
}

(async function run() {
    console.log('\n=== coach-kpi callKpiEndpoint sends edge-key + anon JWT separately ===\n');
    {
        const stub = makeFetchStub();
        global.window = {
            supabaseConfig: { url: 'https://test', anonKey: TEST_JWT, apiKey: HARDCODED_EDGE_KEY }
        };
        global.fetch = stub.fn;
        delete require.cache[require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'))];
        const mod = loadFresh(path.join(__dirname, '..', 'coach-kpi.js'));

        await mod.callKpiEndpoint({ action: 'coach_leaderboard' });
        assert(stub.calls.length === 1, 'callKpiEndpoint issues exactly one fetch');
        assertSplitHeaders(stub.calls[0].init.headers, 'callKpiEndpoint');
    }

    console.log('\n=== coach-kpi callKpiEndpoint falls back to hardcoded edge key when apiKey missing ===\n');
    {
        const stub = makeFetchStub();
        global.window = {
            supabaseConfig: { url: 'https://test', anonKey: TEST_JWT }
        };
        global.fetch = stub.fn;
        delete require.cache[require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'))];
        const mod = loadFresh(path.join(__dirname, '..', 'coach-kpi.js'));

        await mod.callKpiEndpoint({ action: 'coach_leaderboard' });
        assert(stub.calls.length === 1, 'callKpiEndpoint issues exactly one fetch');
        assertSplitHeaders(stub.calls[0].init.headers, 'callKpiEndpoint fallback');
    }

    console.log('\n=== getBranchLeaderboard sends edge-key + anon JWT separately ====\n');
    {
        const stub = makeFetchStub();
        global.window = {
            supabaseConfig: { url: 'https://test', anonKey: TEST_JWT, apiKey: HARDCODED_EDGE_KEY }
        };
        global.fetch = stub.fn;
        const mod = loadFresh(path.join(__dirname, '..', 'supabase-data-tournaments.js'));

        await mod.getBranchLeaderboard('branch-1', 'A', {
            fetch: stub.fn,
            config: { url: 'https://test', anonKey: TEST_JWT, apiKey: HARDCODED_EDGE_KEY }
        });
        assert(stub.calls.length === 1, 'getBranchLeaderboard issues exactly one fetch for a single league');
        assertSplitHeaders(stub.calls[0].init.headers, 'getBranchLeaderboard');
    }

    console.log('\n=== getBranchLeaderboard falls back to hardcoded edge key when apiKey missing ===\n');
    {
        const stub = makeFetchStub();
        global.window = {
            supabaseConfig: { url: 'https://test', anonKey: TEST_JWT }
        };
        global.fetch = stub.fn;
        const mod = loadFresh(path.join(__dirname, '..', 'supabase-data-tournaments.js'));

        await mod.getBranchLeaderboard('branch-1', 'A', {
            fetch: stub.fn,
            config: { url: 'https://test', anonKey: TEST_JWT }
        });
        assert(stub.calls.length === 1, 'getBranchLeaderboard issues exactly one fetch for a single league');
        assertSplitHeaders(stub.calls[0].init.headers, 'getBranchLeaderboard fallback');
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
