/**
 * Tests for the initCoachKpi orchestrator's data-loading wiring in
 * coach-kpi.js. Covers the Phase A fixes to the Coach Effectiveness
 * Dashboard's empty-state bug:
 *
 *   1. initCoachKpi fires an initial fetch for the default view.
 *   2. The filter onChange callback re-fetches + re-renders.
 *   3. The school view rolls coach_leaderboard rows up via
 *      aggregateSchoolHero — never reads school_kpi_summary directly.
 *   4. The upload-committed listener uses the actual current view
 *      ('school' / 'coach'), not the literal string 'coach_kpi_view'.
 *
 * Run: node tests/test-coach-kpi-init-fetch.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function makeMockEl(tag) {
    return {
        tagName: tag,
        children: [],
        attributes: {},
        dataset: {},
        className: '',
        textContent: '',
        value: '',
        _innerHTML: '',
        _listeners: {},
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener(name, fn) {
            (this._listeners[name] = this._listeners[name] || []).push(fn);
        },
        dispatch(name, event) {
            for (const fn of (this._listeners[name] || [])) fn(event);
        },
    };
}

function makeDom(ids) {
    const elements = {};
    for (const id of ids) {
        const el = makeMockEl('div');
        el.id = id;
        elements[id] = el;
    }
    return {
        elements,
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeMockEl(tag); },
    };
}

const HOST_IDS = [
    'coach-kpi-filters',
    'coach-kpi-school-hero',
    'coach-kpi-school-leaderboard',
    'coach-kpi-coach-hero',
    'coach-kpi-coach-students',
    'coach-kpi-coach-razryad-chart',
];

// Stubbed fetch + supabaseConfig so callKpiEndpoint resolves through our
// captured URLs without touching the network.
function makeFetchStub(responseFn) {
    const calls = [];
    const fn = (url, init) => {
        calls.push({ url, init });
        const body = (typeof responseFn === 'function')
            ? responseFn(url, init)
            : { success: true, data: [] };
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(body),
        });
    };
    return { fn, calls };
}

function loadModule(globals) {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];

    if (globals.document !== undefined) global.document = globals.document;
    else delete global.document;
    if (globals.window !== undefined) global.window = globals.window;
    else delete global.window;
    if (globals.fetch !== undefined) global.fetch = globals.fetch;
    else delete global.fetch;
    return require(modulePath);
}

function flush() {
    return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

console.log('\n=== initCoachKpi issues an initial fetch for the default view ===========\n');
(async function testInitialFetch() {
    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub((url) => {
        if (/action=school_kpi_summary/.test(url)) {
            return {
                success: true,
                data: {
                    window: { start: '2026-02-14', end: '2026-05-14' },
                    active_students_count: 4, active_players_count: 3,
                    participation_pct: 75, total_tournaments: 2,
                    top3_count: 3, promotions_count: 1, new_razryads_count: 0,
                    total_rating_gained: 100,
                },
            };
        }
        return {
            success: true,
            data: [
                {
                    coach_id: 'c-1', coach_name: 'Alice', branches: ['Debut'],
                    active_students_count: 4, total_tournaments: 2,
                    tournament_entries: 8, avg_rating_delta: 12,
                    top3_count: 3, total_rating_gained: 100,
                    promotions_count: 1, new_razryads_count: 0,
                    composite_score: 65.0, participation_rate: 0.5,
                },
            ],
        };
    });
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true });
    await flush();
    await flush();

    assert(stub.calls.length >= 1,
        'admin → initCoachKpi triggers at least one edge-function call');
    const initialUrls = stub.calls.map(c => c.url);
    assert(initialUrls.some(u => /action=school_kpi_summary/.test(u)),
        'admin default (school) view fetches school_kpi_summary as the hero source');
    assert(initialUrls.some(u => /action=coach_leaderboard/.test(u)),
        'admin default (school) view also fetches coach_leaderboard for the per-coach table');
    assert(/window_start=\d{4}-\d{2}-\d{2}/.test(stub.calls[0].url),
        'initial fetch carries a resolved window_start');

    // Hero card should appear (rows non-empty), not the empty-state card.
    const heroHost = dom.elements['coach-kpi-school-hero'];
    assert(heroHost.children.length > 0,
        'school hero host gains at least one card after initial fetch');
    assert(heroHost.children.some(c => !/\bempty-state\b/.test(c.className)),
        'school hero is NOT the empty-state when rows arrive');

    // Leaderboard table should also render (no longer the empty-state card).
    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    assert(lbHost.children.length === 1 && /\bkpi-leaderboard\b/.test(lbHost.children[0].className),
        'school leaderboard host renders the kpi-leaderboard table from fetched rows');
})().then(runFilterChangeTest).catch((e) => { failed++; console.error(e); });

async function runFilterChangeTest() {
    console.log('\n=== filter onChange triggers re-fetch + re-render ======================\n');

    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub(() => ({ success: true, data: [] }));
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true });
    await flush();
    const initialCallCount = stub.calls.length;
    assert(initialCallCount >= 1, 'sanity: at least one fetch on init');

    // The renderFilters call buried in initCoachKpi gave us a window-pill
    // button list — clicking one of them must invoke onChange and re-fetch.
    const filtersHost = dom.elements['coach-kpi-filters'];
    const root = filtersHost.children[0];
    // Walk children to find a kpi-filter-pill we can click.
    function findPill(node) {
        if (!node) return null;
        if (node.className && /kpi-filter-pill/.test(node.className)
            && node.dataset && node.dataset.window === '30d') return node;
        for (const c of (node.children || [])) {
            const found = findPill(c);
            if (found) return found;
        }
        return null;
    }
    const pill = findPill(root);
    assert(pill !== null, 'filter bar exposes a 30d window pill we can click');

    if (pill) {
        // Simulate a click; the wired onChange should normalize + re-fetch.
        pill.dispatch('click', {});
        // Wait for debounce + microtasks.
        await new Promise((r) => setTimeout(r, 400));
        assert(stub.calls.length > initialCallCount,
            'changing the time window triggers an additional fetch');
        const lastUrl = stub.calls[stub.calls.length - 1].url;
        const winLen = /window_start=(\d{4}-\d{2}-\d{2})&window_end=(\d{4}-\d{2}-\d{2})/.exec(lastUrl);
        // 30d preset → end - start ≈ 29 days
        if (winLen) {
            const start = new Date(winLen[1] + 'T00:00:00Z').getTime();
            const end = new Date(winLen[2] + 'T00:00:00Z').getTime();
            const days = Math.round((end - start) / 86400000) + 1;
            assert(days === 30,
                `30d window pill produces a 30-day window (got ${days})`);
        }
    }

    await runSchoolFallbackTest();
}

async function runSchoolFallbackTest() {
    console.log('\n=== school view sources hero from school_kpi_summary, table from coach_leaderboard ===\n');

    // The school view now fires both school_kpi_summary (canonical hero) and
    // coach_leaderboard (per-coach rows) in parallel — they share the same
    // window / branch_id / league filters so the card numbers always reflect
    // what the table is showing.
    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub((url) => {
        if (/action=school_kpi_summary/.test(url)) {
            return {
                success: true,
                data: {
                    window: { start: '2026-02-14', end: '2026-05-14' },
                    active_students_count: 8, active_players_count: 6,
                    participation_pct: 75, total_tournaments: 3,
                    top3_count: 2, promotions_count: 1, new_razryads_count: 1,
                    total_rating_gained: 60,
                },
            };
        }
        // coach_leaderboard rows for the table below.
        return {
            success: true,
            data: [
                { coach_id: 'c-1', coach_name: 'A', branches: [],
                  active_students_count: 5, total_tournaments: 2,
                  top3_count: 1, promotions_count: 1, new_razryads_count: 1,
                  total_rating_gained: 50, composite_score: 60 },
                { coach_id: 'c-2', coach_name: 'B', branches: [],
                  active_students_count: 3, total_tournaments: 1,
                  top3_count: 0, promotions_count: 0, new_razryads_count: 0,
                  total_rating_gained: 10, composite_score: 30 },
            ],
        };
    });
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true });
    await flush();
    // Two parallel calls + render = needs a microtask round to settle.
    await flush();

    // Direct unit on the helper: aggregateSchoolHero still rolls up the right
    // totals — it's the coach-filter fallback now (single-coach view).
    const rolled = mod.aggregateSchoolHero([
        { active_students_count: 5, total_tournaments: 2, top3_count: 1,
          promotions_count: 1, new_razryads_count: 1 },
        { active_students_count: 3, total_tournaments: 1, top3_count: 0,
          promotions_count: 0, new_razryads_count: 0 },
    ]);
    assert(rolled.active_students_count === 8 && rolled.total_tournaments === 3,
        'aggregateSchoolHero sums per-coach counts (5+3=8, 2+1=3)');
    assert(rolled.top3_count === 1 && rolled.promotions_count === 1
        && rolled.new_razryads_count === 1,
        'aggregateSchoolHero sums top3, promotions, razryads');
    assert(typeof rolled.participation_pct === 'number',
        'aggregateSchoolHero now emits participation_pct so the card is never blank');

    const calledEndpoints = stub.calls.map(c => c.url);
    assert(calledEndpoints.some(u => /action=school_kpi_summary/.test(u)),
        'school view hits school_kpi_summary as the canonical hero source');
    assert(calledEndpoints.some(u => /action=coach_leaderboard/.test(u)),
        'school view also hits coach_leaderboard for the per-coach table');

    const heroHost = dom.elements['coach-kpi-school-hero'];
    assert(heroHost.children.length === 7,
        'school hero renders 7 stat cards from the school_kpi_summary payload (Active players added)');

    await runUploadEventViewName();
}

async function runUploadEventViewName() {
    console.log('\n=== coach_kpi_view string is no longer used as a view name ============\n');

    // The upload-committed handler must use the resolved view ('school' for
    // admin, 'coach' for locked coach) — never the literal 'coach_kpi_view'.
    const src = fs.readFileSync(path.join(__dirname, '..', 'coach-kpi.js'), 'utf8');
    assert(!/['"]coach_kpi_view['"]/.test(src),
        "coach-kpi.js no longer contains the string literal 'coach_kpi_view'");

    // End-to-end: dispatch coachKpiUploadCommitted and inspect the URL fired.
    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub(() => ({ success: true, data: [] }));
    const winListeners = {};
    const win = {
        supabaseConfig: { url: 'https://test', apiKey: 'k' },
        addEventListener(name, fn) { (winListeners[name] = winListeners[name] || []).push(fn); },
    };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });
    mod.initCoachKpi({ isAdmin: true });
    await flush();
    const beforeUpload = stub.calls.length;
    const handler = (winListeners['coachKpiUploadCommitted'] || [])[0];
    assert(typeof handler === 'function',
        'coachKpiUploadCommitted handler is registered after initCoachKpi');
    if (handler) {
        handler({ type: 'coachKpiUploadCommitted' });
        await flush();
        await flush();
        assert(stub.calls.length > beforeUpload,
            'coachKpiUploadCommitted handler issues a refresh fetch');
        // School view refreshes BOTH school_kpi_summary and coach_leaderboard
        // in parallel — check the most recent call window covers both, not
        // just the very last URL.
        const fresh = stub.calls.slice(beforeUpload).map(c => c.url);
        assert(fresh.some(u => /action=coach_leaderboard/.test(u)),
            'admin upload refresh fetches coach_leaderboard for the table');
        assert(fresh.some(u => /action=school_kpi_summary/.test(u)),
            'admin upload refresh fetches school_kpi_summary for the hero');
        assert(fresh.every(u => !/action=coach_kpi_view/.test(u)),
            'refresh URLs never carry the bogus coach_kpi_view action');
    }

    await runLockedCoachInit();
}

async function runLockedCoachInit() {
    console.log('\n=== locked coach default view = coach (not school) =====================\n');

    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub(() => ({
        success: true,
        data: {
            coach: { id: 'c-1', name: 'Self' },
            window: { start: '2026-01-01', end: '2026-05-23' },
            hero: { active_students_count: 5, total_tournaments: 1, top3_count: 0,
                    promotions_count: 0, new_razryads_count: 0,
                    total_rating_gained: 0 },
            students: [],
        },
    }));
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });
    mod.initCoachKpi({ isAdmin: false, isCoach: true, coachId: 'c-1' });
    await flush();
    assert(stub.calls.length >= 1,
        'locked coach → initCoachKpi triggers at least one edge-function call');
    assert(/action=coach_kpi_summary/.test(stub.calls[0].url),
        'locked coach default (coach view) fetches coach_kpi_summary');
    assert(/coachId=c-1/.test(stub.calls[0].url),
        'locked coach forces coachId=self in the initial fetch URL');

    finish();
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
