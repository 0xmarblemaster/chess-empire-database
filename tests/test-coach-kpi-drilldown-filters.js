/**
 * Tests for the drilldown filter-rerender wiring on the Coach Effectiveness
 * dashboard.
 *
 * The drilldown panel has its own renderFilters() instance. Changing a filter
 * inside it must:
 *   1. Issue a fresh school_student_drilldown fetch with the new param,
 *   2. NOT re-fire the school/coach view fetches (the main panels stay intact),
 *   3. Survive successive changes (the latest state is in the URL each time).
 *
 * Coach-locked viewers (non-admin coach) must always have coach_id forced to
 * self in the drilldown URL — even if state carries 'all' or another id.
 *
 * Run: node tests/test-coach-kpi-drilldown-filters.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

function loadModule() {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    return require(modulePath);
}

const kpi = loadModule();

function makeStubFetch() {
    const calls = [];
    const fn = (url) => {
        calls.push(url);
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
                success: true,
                data: { metric: 'active_players', window: { start: '2026-01-01', end: '2026-12-31' }, filters: {}, students: [] },
            }),
        });
    };
    return { fn, calls };
}

function parseUrl(url) {
    const u = new URL(url);
    const params = {};
    for (const [k, v] of u.searchParams.entries()) params[k] = v;
    return params;
}

const baseOpts = (fetchFn) => ({
    fetch: fetchFn,
    config: { url: 'https://test', apiKey: 'k', anonKey: 'a' },
});

console.log('\n=== _fetchDrilldown sends action + metric + window =====================\n');
(async () => {
    const stub = makeStubFetch();
    await kpi._fetchDrilldown({ isAdmin: true }, 'active_players', { window: '90d' }, baseOpts(stub.fn));
    assertEqual(stub.calls.length, 1, 'one fetch issued');
    const p = parseUrl(stub.calls[0]);
    assertEqual(p.action, 'school_student_drilldown', 'action=school_student_drilldown');
    assertEqual(p.metric, 'active_players', 'metric param echoed');
    assert(p.window_start, 'window_start in URL');
    assert(p.window_end, 'window_end in URL');
})()
.then(testFilterChangeIssuesNewFetch)
.then(testCoachLockOverridesCoachId)
.then(testFiltersPropagateToDrilldown)
.then(testNoLeakageIntoMainPanels)
.then(finish)
.catch((e) => { failed++; console.error(e); finish(); });

async function testFilterChangeIssuesNewFetch() {
    console.log('\n=== changing a filter in drilldown issues a fresh fetch ==============\n');
    const stub = makeStubFetch();
    const roleInfo = { isAdmin: true };

    // Initial call (window=90d, league=all, branch=all).
    await kpi._fetchDrilldown(roleInfo, 'top3', { window: '90d' }, baseOpts(stub.fn));
    // Change time window 90d → 30d.
    await kpi._fetchDrilldown(roleInfo, 'top3', { window: '30d' }, baseOpts(stub.fn));
    // Change league all → B.
    await kpi._fetchDrilldown(roleInfo, 'top3', { window: '30d', league: 'B' }, baseOpts(stub.fn));
    // Change branch all → B123.
    await kpi._fetchDrilldown(roleInfo, 'top3', { window: '30d', league: 'B', branchId: 'B123' }, baseOpts(stub.fn));

    assertEqual(stub.calls.length, 4, 'four fetches issued (one per filter change)');
    const last = parseUrl(stub.calls[3]);
    assertEqual(last.action, 'school_student_drilldown', 'still hitting the drilldown action');
    assertEqual(last.metric, 'top3', 'metric stays pinned to top3 across filter changes');
    assertEqual(last.league, 'B', 'final URL has league=B');
    assertEqual(last.branch_id, 'B123', 'final URL has branch_id=B123');
    // 30d window is 30 days end-inclusive.
    const m = /^\d{4}-\d{2}-\d{2}$/.test(last.window_start) && /^\d{4}-\d{2}-\d{2}$/.test(last.window_end);
    assert(m, 'window_start + window_end are ISO dates after 30d change');
}

async function testCoachLockOverridesCoachId() {
    console.log('\n=== non-admin coach viewer: coach_id locked to self in drilldown =====\n');
    const stub = makeStubFetch();
    const lockedCoach = { isAdmin: false, coachId: 'COACH_SELF' };
    // State carries a different coachId — must be IGNORED.
    await kpi._fetchDrilldown(lockedCoach, 'active_players',
        { window: '90d', coachId: 'COACH_OTHER' }, baseOpts(stub.fn));
    const p = parseUrl(stub.calls[0]);
    assertEqual(p.coach_id, 'COACH_SELF',
        'coach_id forced to self (COACH_SELF), not the COACH_OTHER from state');

    // State carries 'all' — same rule, still locked to self.
    await kpi._fetchDrilldown(lockedCoach, 'top3',
        { window: '90d', coachId: 'all' }, baseOpts(stub.fn));
    const p2 = parseUrl(stub.calls[1]);
    assertEqual(p2.coach_id, 'COACH_SELF',
        'coach_id forced to self even when state.coachId === "all"');

    // Admin viewer: state's coachId passes through.
    const stub2 = makeStubFetch();
    await kpi._fetchDrilldown({ isAdmin: true }, 'promotions',
        { window: '90d', coachId: 'COACH_ARBITRARY' }, baseOpts(stub2.fn));
    const p3 = parseUrl(stub2.calls[0]);
    assertEqual(p3.coach_id, 'COACH_ARBITRARY',
        'admin viewer: state.coachId passes through unmodified');

    // Admin viewer + coachId=all: no coach_id param.
    const stub3 = makeStubFetch();
    await kpi._fetchDrilldown({ isAdmin: true }, 'promotions',
        { window: '90d', coachId: 'all' }, baseOpts(stub3.fn));
    const p4 = parseUrl(stub3.calls[0]);
    assert(!('coach_id' in p4),
        'admin viewer: coachId="all" → no coach_id param in URL');
}

async function testFiltersPropagateToDrilldown() {
    console.log('\n=== window/branch/league/coach all propagate into drilldown URL ======\n');
    const stub = makeStubFetch();
    await kpi._fetchDrilldown({ isAdmin: true }, 'new_razryads',
        { window: 'ytd', branchId: 'B-uuid', league: 'C', coachId: 'COACH-X' },
        baseOpts(stub.fn));
    const p = parseUrl(stub.calls[0]);
    assertEqual(p.action, 'school_student_drilldown', 'action');
    assertEqual(p.metric, 'new_razryads', 'metric');
    assertEqual(p.branch_id, 'B-uuid', 'branch_id propagated');
    assertEqual(p.league, 'C', 'league propagated');
    assertEqual(p.coach_id, 'COACH-X', 'coach_id propagated');
    assertEqual(p.window_start, '2026-01-01', 'ytd window_start = Jan 1');
}

async function testNoLeakageIntoMainPanels() {
    console.log('\n=== drilldown fetch only hits the drilldown action ====================\n');
    const stub = makeStubFetch();
    await kpi._fetchDrilldown({ isAdmin: true }, 'promotions', { window: '90d' }, baseOpts(stub.fn));
    await kpi._fetchDrilldown({ isAdmin: true }, 'promotions', { window: '30d' }, baseOpts(stub.fn));
    await kpi._fetchDrilldown({ isAdmin: true }, 'promotions', { window: 'ytd' }, baseOpts(stub.fn));
    const actions = stub.calls.map(u => parseUrl(u).action);
    assert(actions.every(a => a === 'school_student_drilldown'),
        'every drilldown URL uses school_student_drilldown — main panel actions never touched');
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
