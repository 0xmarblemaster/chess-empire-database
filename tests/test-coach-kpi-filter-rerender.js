/**
 * Tests for the filter-pill rerender behavior in coach-kpi.js.
 *
 * Original bug: renderFilters() was only called once at init. Clicking a
 * different time window updated the parent's `state` and fired a refresh, but
 * the filter bar itself was never re-rendered — so the is-active /
 * aria-pressed pill stayed stuck on the initial 90d pill regardless of which
 * window the user actually selected.
 *
 * This file pins down the fixed behavior:
 *   - Clicking 30d moves is-active / aria-pressed onto the 30d button.
 *   - A second click on YTD moves the active state again.
 *   - onChange callbacks always see the latest state (league/branch) after
 *     an earlier filter change — no stale closure over the construction-time
 *     state snapshot.
 *
 * Run: node tests/test-coach-kpi-filter-rerender.js
 */

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

const HOST_IDS = [
    'coach-kpi-filters',
    'coach-kpi-school-hero',
    'coach-kpi-school-leaderboard',
    'coach-kpi-coach-hero',
    'coach-kpi-coach-students',
    'coach-kpi-coach-razryad-chart',
];

function findAllPills(root) {
    const out = [];
    function walk(node) {
        if (!node) return;
        if (typeof node.className === 'string' && /\bkpi-filter-pill\b/.test(node.className)) {
            out.push(node);
        }
        for (const c of (node.children || [])) walk(c);
    }
    walk(root);
    return out;
}

function findPillByWindow(filtersHost, win) {
    const root = filtersHost.children[0];
    return findAllPills(root).find(p => p.dataset && p.dataset.window === win) || null;
}

function findLeagueSelect(filtersHost) {
    const root = filtersHost.children[0];
    function walk(node) {
        if (!node) return null;
        if (node.tagName === 'select'
            && typeof node.className === 'string'
            && /\bkpi-filter-league\b/.test(node.className)) {
            return node;
        }
        for (const c of (node.children || [])) {
            const hit = walk(c);
            if (hit) return hit;
        }
        return null;
    }
    return walk(root);
}

function activeWindow(filtersHost) {
    const root = filtersHost.children[0];
    const pills = findAllPills(root);
    const active = pills.find(p => /\bis-active\b/.test(p.className));
    if (!active) return null;
    return active.dataset && active.dataset.window || null;
}

console.log('\n=== clicking a window pill re-renders the filter bar ==================\n');
(async function testWindowPillRerender() {
    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true });
    await flush();

    const filtersHost = dom.elements['coach-kpi-filters'];
    assert(filtersHost.children.length === 1, 'filter bar rendered on init');

    // Initial active pill = 90d (DEFAULT_WINDOW).
    assert(activeWindow(filtersHost) === '90d',
        'initial active window pill = 90d');
    const initialPill90 = findPillByWindow(filtersHost, '90d');
    assert(initialPill90 && initialPill90.attributes['aria-pressed'] === 'true',
        '90d pill carries aria-pressed=true on first render');

    // Click 30d.
    const pill30 = findPillByWindow(filtersHost, '30d');
    assert(pill30 !== null, '30d pill exists');
    pill30.dispatch('click', {});

    // After click, the filter bar must have been re-rendered. Re-grab the pills
    // because the previous nodes were torn down.
    assert(activeWindow(filtersHost) === '30d',
        'after clicking 30d: active pill is now 30d');
    const pill30After = findPillByWindow(filtersHost, '30d');
    const pill90After = findPillByWindow(filtersHost, '90d');
    assert(pill30After && pill30After.attributes['aria-pressed'] === 'true',
        '30d pill now carries aria-pressed=true');
    assert(pill90After && pill90After.attributes['aria-pressed'] === 'false',
        '90d pill no longer carries aria-pressed=true');
    assert(!/\bis-active\b/.test(pill90After.className),
        '90d pill no longer carries is-active class');

    // Second click on YTD — active state must move again.
    const pillYtd = findPillByWindow(filtersHost, 'ytd');
    assert(pillYtd !== null, 'ytd pill exists');
    pillYtd.dispatch('click', {});

    assert(activeWindow(filtersHost) === 'ytd',
        'after clicking YTD: active pill is now ytd');
    const pillYtdAfter = findPillByWindow(filtersHost, 'ytd');
    const pill30AfterYtd = findPillByWindow(filtersHost, '30d');
    assert(pillYtdAfter && pillYtdAfter.attributes['aria-pressed'] === 'true',
        'ytd pill now carries aria-pressed=true');
    assert(pill30AfterYtd && pill30AfterYtd.attributes['aria-pressed'] === 'false',
        '30d pill no longer carries aria-pressed=true after YTD click');

    // And the refresh fetch should have fired with windows that match each click.
    await new Promise((r) => setTimeout(r, 400));
    const fetchedWindows = stub.calls.map(c => c.url);
    assert(fetchedWindows.some(u => /window_start=\d{4}-\d{2}-\d{2}/.test(u)),
        'window clicks issued window-bearing fetches');
})()
.then(runStateClosureTest)
.catch((e) => { failed++; console.error(e); finish(); });

async function runStateClosureTest() {
    console.log('\n=== onChange sees latest state after an earlier filter change ========\n');

    const dom = makeDom(HOST_IDS);
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true });
    await flush();

    const filtersHost = dom.elements['coach-kpi-filters'];

    // 1) Change the league via the dropdown to 'B'. (League A was retired
    //    from the filter list; B and C are the only options now.)
    const leagueSelect = findLeagueSelect(filtersHost);
    assert(leagueSelect !== null, 'league <select> exists');
    if (leagueSelect) {
        leagueSelect.value = 'B';
        leagueSelect.dispatch('change', { target: { value: 'B' } });
    }
    // Debounce.
    await new Promise((r) => setTimeout(r, 400));

    // 2) Now click 30d. The new fetch URL must carry BOTH league=B AND the 30d window.
    const beforeClick = stub.calls.length;
    const pill30 = findPillByWindow(filtersHost, '30d');
    assert(pill30 !== null, '30d pill exists after league change');
    if (pill30) pill30.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 400));

    assert(stub.calls.length > beforeClick,
        'clicking 30d after a league change issues a fresh fetch');
    const lastUrl = stub.calls[stub.calls.length - 1].url;
    assert(/league=B/.test(lastUrl),
        'latest fetch URL retains league=B (no stale closure overwrote it)');
    // 30d window is 30 days end-inclusive.
    const m = /window_start=(\d{4}-\d{2}-\d{2})&window_end=(\d{4}-\d{2}-\d{2})/.exec(lastUrl);
    if (m) {
        const start = new Date(m[1] + 'T00:00:00Z').getTime();
        const end = new Date(m[2] + 'T00:00:00Z').getTime();
        const days = Math.round((end - start) / 86400000) + 1;
        assert(days === 30, `30d window produces a 30-day range (got ${days})`);
    }

    // 3) Active pill should now be 30d, and the league select should still be 'B'.
    assert(activeWindow(filtersHost) === '30d',
        'after league + 30d clicks: active window pill = 30d');
    const leagueSelectAfter = findLeagueSelect(filtersHost);
    assert(leagueSelectAfter && leagueSelectAfter.value === 'B',
        'after re-render: league <select> retains value="B"');

    finish();
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
