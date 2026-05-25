/**
 * Tests for the Coach dropdown filter (Phase C hybrid client-side cut)
 * in coach-kpi.js.
 *
 * Behavior pinned here:
 *   1. renderFilters({ view: 'school' }) mounts a 4th .filter-group with a
 *      .kpi-filter-coach <select>. The roster is read from opts.coaches —
 *      one option per coach plus the leading "All coaches" entry.
 *   2. Selecting a coach via the dropdown fires onChange with
 *      { coachId: <id> }; leaving branch alone.
 *   3. Changing the branch dropdown resets coachId to "all" (the visible
 *      coach roster may no longer make sense in the new branch scope).
 *   4. _renderDashboard filters the school leaderboard rows by both branch
 *      and coach selection (the helper filterLeaderboardByCoach is also
 *      directly tested for completeness).
 *   5. When a single coach is selected, the school hero re-aggregates from
 *      the filtered rows instead of trusting the school-wide totals.
 *   6. The Coach dropdown is absent on branch and coach views.
 *   7. initCoachKpi loads branches via window.supabaseData.getBranches and
 *      coaches via getCoaches in parallel (fixes the latent bug where the
 *      Branch dropdown was never populated because the loader was missing).
 *
 * Run: node tests/test-coach-kpi-coach-filter.js
 */

const path = require('path');

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

function makeClassList(el) {
    return {
        toggle(name, force) {
            const parts = (el.className || '').split(/\s+/).filter(Boolean);
            const has = parts.includes(name);
            const want = (force === undefined) ? !has : !!force;
            const next = parts.filter(c => c !== name);
            if (want) next.push(name);
            el.className = next.join(' ');
        },
        add(name) {
            const parts = (el.className || '').split(/\s+/).filter(Boolean).filter(c => c !== name);
            parts.push(name);
            el.className = parts.join(' ');
        },
        remove(name) {
            el.className = (el.className || '').split(/\s+/).filter(Boolean)
                .filter(c => c !== name).join(' ');
        },
        contains(name) {
            return (el.className || '').split(/\s+/).includes(name);
        },
    };
}

function makeMockEl(tag) {
    const el = {
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
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; },
        getAttribute(name) {
            return this.attributes[name] === undefined ? null : this.attributes[name];
        },
        hasAttribute(name) { return name in this.attributes; },
        addEventListener(name, fn) {
            (this._listeners[name] = this._listeners[name] || []).push(fn);
        },
        dispatch(name, event) {
            for (const fn of (this._listeners[name] || [])) fn(event);
        },
    };
    el.classList = makeClassList(el);
    return el;
}

function findAllByClass(root, cls) {
    const out = [];
    (function walk(node) {
        if (!node) return;
        if (typeof node.className === 'string' && node.className.split(/\s+/).includes(cls)) {
            out.push(node);
        }
        for (const c of (node.children || [])) walk(c);
    })(root);
    return out;
}

function findByClass(root, cls) {
    const all = findAllByClass(root, cls);
    return all.length ? all[0] : null;
}

function findByTag(root, tag) {
    if (!root) return null;
    if (root.tagName === tag) return root;
    for (const c of (root.children || [])) {
        const hit = findByTag(c, tag);
        if (hit) return hit;
    }
    return null;
}

function makeKpiDom() {
    const buttons = ['school', 'branch', 'coach'].map((v, i) => {
        const b = makeMockEl('button');
        b.className = 'kpi-view-btn' + (i === 0 ? ' is-active' : '');
        b.dataset.kpiView = v;
        b.attributes['aria-selected'] = i === 0 ? 'true' : 'false';
        return b;
    });
    const panels = {
        school: (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-school-view'; p.className = 'kpi-subview is-active'; return p; })(),
        branch: (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-branch-view'; p.className = 'kpi-subview'; p.setAttribute('hidden', ''); return p; })(),
        coach:  (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-coach-view';  p.className = 'kpi-subview'; p.setAttribute('hidden', ''); return p; })(),
    };
    const section = makeMockEl('section');
    section.id = 'section-coach-kpi';
    section.querySelectorAll = (sel) => {
        if (sel === '.kpi-view-btn[data-kpi-view]') return buttons.slice();
        return [];
    };
    const elements = {
        'section-coach-kpi': section,
        'coach-kpi-filters': makeMockEl('div'),
        'coach-kpi-school-leaderboard': makeMockEl('div'),
        'coach-kpi-school-hero': makeMockEl('div'),
        'coach-kpi-coach-hero': makeMockEl('div'),
        'coach-kpi-coach-students': makeMockEl('div'),
        'coach-kpi-coach-razryad-chart': makeMockEl('div'),
        'coach-kpi-school-view': panels.school,
        'coach-kpi-branch-view': panels.branch,
        'coach-kpi-coach-view':  panels.coach,
    };
    return {
        elements,
        buttons,
        panels,
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeMockEl(tag); },
        querySelectorAll(sel) {
            if (sel === '#section-coach-kpi .kpi-view-btn[data-kpi-view]') return buttons.slice();
            return [];
        },
    };
}

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

const COACHES = [
    { id: 'co-1', firstName: 'Alice', lastName: 'Anderson' },
    { id: 'co-2', firstName: 'Bob',   lastName: 'Brown' },
    { id: 'co-3', first_name: 'Carol', last_name: 'Cardenas' },
];
const BRANCHES = [
    { id: 'br-1', name: 'Nish' },
    { id: 'br-2', name: 'Debut' },
];

function leaderboardRows() {
    return [
        { coach_id: 'co-1', coach_name: 'Alice Anderson', branches: ['br-1'],
          active_students_count: 5, active_players_count: 4, total_tournaments: 3, top3_count: 2,
          promotions_count: 1, new_razryads_count: 1, total_rating_gained: 80,
          composite_score: 75 },
        { coach_id: 'co-2', coach_name: 'Bob Brown', branches: ['br-2'],
          active_students_count: 4, active_players_count: 3, total_tournaments: 2, top3_count: 1,
          promotions_count: 0, new_razryads_count: 0, total_rating_gained: 30,
          composite_score: 55 },
        { coach_id: 'co-3', coach_name: 'Carol Cardenas', branches: ['br-1', 'br-2'],
          active_students_count: 6, active_players_count: 5, total_tournaments: 4, top3_count: 3,
          promotions_count: 2, new_razryads_count: 1, total_rating_gained: 90,
          composite_score: 80 },
    ];
}

// ── Unit: pure helpers ─────────────────────────────────────────────────────

console.log('\n=== filterLeaderboardByCoach helper ===================================\n');
(function testFilterByCoachHelper() {
    const kpi = loadModule({});
    const rows = leaderboardRows();

    assertEqual(kpi.filterLeaderboardByCoach(rows, 'all'), rows,
        'coachId="all" → returns the full list unchanged');
    assertEqual(kpi.filterLeaderboardByCoach(rows, undefined), rows,
        'undefined coachId → returns the full list unchanged');
    assertEqual(kpi.filterLeaderboardByCoach(rows, ''), rows,
        'empty coachId → returns the full list unchanged');

    const onlyAlice = kpi.filterLeaderboardByCoach(rows, 'co-1');
    assertEqual(onlyAlice.length, 1, 'coachId="co-1" → one row');
    assertEqual(onlyAlice[0].coach_id, 'co-1', 'coachId="co-1" → Alice');

    const noMatch = kpi.filterLeaderboardByCoach(rows, 'co-missing');
    assertEqual(noMatch, [], 'unknown coachId → empty list');

    assertEqual(kpi.filterLeaderboardByCoach(null, 'co-1'), [],
        'null rows → empty list (defensive)');
})();

console.log('\n=== defaultFilterState / normalizeFilters include coachId ============\n');
(function testStateShape() {
    const kpi = loadModule({});
    const def = kpi.defaultFilterState({ isAdmin: true });
    assertEqual(def.coachId, 'all', 'defaultFilterState carries coachId="all"');
    assertEqual(kpi.DEFAULT_COACH, 'all', 'DEFAULT_COACH = "all"');

    const norm = kpi.normalizeFilters({ coachId: '' });
    assertEqual(norm.coachId, 'all', 'empty coachId → normalized to "all"');
    const norm2 = kpi.normalizeFilters({ coachId: 'co-1' });
    assertEqual(norm2.coachId, 'co-1', 'string coachId passes through');
    const norm3 = kpi.normalizeFilters(undefined);
    assertEqual(norm3.coachId, 'all', 'no input → coachId="all"');
})();

// ── renderFilters: Coach select only on school view ────────────────────────

console.log('\n=== renderFilters mounts a Coach select on school view ===============\n');
(function testCoachSelectOnSchoolView() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });
    const container = makeMockEl('div');

    const root = kpi.renderFilters(container,
        { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
        { coaches: COACHES, branches: BRANCHES, view: 'school' });

    const groups = findAllByClass(root, 'filter-group');
    assertEqual(groups.length, 4,
        'school view: four .filter-group wrappers (window / league / branch / coach)');

    const coachSelect = findByClass(root, 'kpi-filter-coach');
    assert(coachSelect !== null,
        'school view: a .kpi-filter-coach <select> is mounted');
    assert(coachSelect && coachSelect.tagName === 'select',
        '.kpi-filter-coach is a <select> element');

    // 1 "All coaches" entry + 3 coach options.
    assertEqual(coachSelect && coachSelect.children.length, 4,
        '.kpi-filter-coach has one entry per coach plus "All coaches"');
    assertEqual(coachSelect && coachSelect.children[0].textContent, 'All coaches',
        'first option is the "All coaches" entry');
    assertEqual(coachSelect && coachSelect.children[0].attributes.value, 'all',
        '"All coaches" carries value="all"');

    const coachOpts = coachSelect.children.slice(1);
    assertEqual(coachOpts.map(o => o.attributes.value), ['co-1', 'co-2', 'co-3'],
        'one <option> per coach roster entry, in order');
    assertEqual(coachOpts.map(o => o.textContent),
        ['Alice Anderson', 'Bob Brown', 'Carol Cardenas'],
        'option label is "first_name last_name" (snake or camel)');
})();

console.log('\n=== renderFilters omits Coach select on branch/coach views ===========\n');
(function testCoachSelectHiddenOnNonSchool() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });

    for (const view of ['branch', 'coach', undefined]) {
        const container = makeMockEl('div');
        const root = kpi.renderFilters(container,
            { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
            { coaches: COACHES, branches: BRANCHES, view });
        const coachSelect = findByClass(root, 'kpi-filter-coach');
        assert(coachSelect === null,
            `view=${String(view)}: no .kpi-filter-coach select rendered`);
        const groups = findAllByClass(root, 'filter-group');
        assertEqual(groups.length, 3,
            `view=${String(view)}: only three .filter-group wrappers (no coach)`);
    }
})();

console.log('\n=== Coach select change fires onChange with coachId ==================\n');
(function testCoachChangeFiresOnChange() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });
    const container = makeMockEl('div');
    const events = [];

    const root = kpi.renderFilters(container,
        { window: '90d', league: 'all', branchId: 'br-1', coachId: 'all' },
        {
            coaches: COACHES, branches: BRANCHES, view: 'school',
            onChange: (next) => events.push(next),
        });

    const coachSelect = findByClass(root, 'kpi-filter-coach');
    coachSelect.value = 'co-1';
    coachSelect.dispatch('change', { target: { value: 'co-1' } });

    assert(events.length === 1, 'coach <select> change fires onChange exactly once');
    assertEqual(events[0].coachId, 'co-1', 'onChange carries the picked coachId');
    assertEqual(events[0].branchId, 'br-1',
        'coach change leaves branchId alone (was br-1, stays br-1)');
    assertEqual(events[0].window, '90d',
        'coach change leaves the window alone');
})();

console.log('\n=== Branch change resets coachId back to "all" ========================\n');
(function testBranchResetsCoach() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });
    const container = makeMockEl('div');
    const events = [];

    const root = kpi.renderFilters(container,
        { window: '90d', league: 'all', branchId: 'all', coachId: 'co-1' },
        {
            coaches: COACHES, branches: BRANCHES, view: 'school',
            onChange: (next) => events.push(next),
        });

    const branchSelect = findByClass(root, 'kpi-filter-branch');
    branchSelect.value = 'br-2';
    branchSelect.dispatch('change', { target: { value: 'br-2' } });

    assert(events.length === 1, 'branch change fires onChange exactly once');
    assertEqual(events[0].branchId, 'br-2',
        'branch change carries the new branchId');
    assertEqual(events[0].coachId, 'all',
        'branch change resets coachId to "all" (was co-1, becomes all)');
})();

// ── _renderDashboard end-to-end: filters + hero re-aggregation ─────────────

console.log('\n=== _renderDashboard filters school rows by branch + coach ===========\n');
(function testRenderDashboardFilters() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });

    const result = { success: true, data: leaderboardRows() };
    const t = (k, fb) => fb;

    // Filter to Alice (co-1, br-1) only.
    kpi._renderDashboard('school', result, t,
        { window: '90d', league: 'all', branchId: 'all', coachId: 'co-1' });

    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    const table = findByClass(lbHost, 'kpi-leaderboard');
    assert(table !== null, 'leaderboard table rendered when a coach is selected');
    const tbody = findByTag(table, 'tbody');
    assertEqual(tbody.children.length, 1,
        'leaderboard shows exactly one row when a single coach is selected');
    assertEqual(tbody.children[0].dataset.coachId, 'co-1',
        'the single row is the selected coach (co-1)');

    // Hero: when a coach is selected, the cards must re-aggregate from the
    // filtered row only (Alice: 5 active, 3 tournaments) — not from the
    // school-wide totals.
    const heroHost = dom.elements['coach-kpi-school-hero'];
    const cards = findAllByClass(heroHost, 'stat-card');
    assertEqual(cards.length, 7,
        'seven hero stat-cards rendered after coach filter (Active players added)');
    const values = cards.map(c => findByClass(c, 'stat-card-value').textContent);
    // Hero card order (locked): active students, active players, participation,
    // top-3, new razryads, promotions, tournaments. Alice's single row →
    // 5 / 4 / 80% (4/5) / 2 / 1 / 1 / 3.
    assertEqual(values[0], '5', 'active_students_count → 5 (Alice only)');
    assertEqual(values[1], '4', 'active_players_count → 4 (Alice only)');
    assertEqual(values[3], '2', 'top3_count → 2 (Alice only)');
    assertEqual(values[4], '1', 'new_razryads_count → 1 (Alice only)');
    assertEqual(values[5], '1', 'promotions_count → 1 (Alice only)');
    assertEqual(values[6], '3', 'total_tournaments → 3 (Alice only)');
})();

console.log('\n=== _renderDashboard: coach="all" keeps the full leaderboard ========\n');
(function testRenderDashboardCoachAll() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });

    const result = { success: true, data: leaderboardRows() };
    const t = (k, fb) => fb;

    kpi._renderDashboard('school', result, t,
        { window: '90d', league: 'all', branchId: 'all', coachId: 'all' });

    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    const tbody = findByTag(findByClass(lbHost, 'kpi-leaderboard'), 'tbody');
    assertEqual(tbody.children.length, 3,
        'coachId="all" → all three leaderboard rows rendered');
})();

console.log('\n=== _renderDashboard: branch + coach compose ========================\n');
(function testRenderDashboardBranchAndCoach() {
    const dom = makeKpiDom();
    global.document = dom;
    const kpi = loadModule({ document: dom });

    // Branch=br-1 filters to Alice (co-1) and Carol (co-3); coach=co-3 narrows further.
    const result = { success: true, data: leaderboardRows() };
    const t = (k, fb) => fb;
    kpi._renderDashboard('school', result, t,
        { window: '90d', league: 'all', branchId: 'br-1', coachId: 'co-3' });

    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    const tbody = findByTag(findByClass(lbHost, 'kpi-leaderboard'), 'tbody');
    assertEqual(tbody.children.length, 1,
        'branch=br-1 + coach=co-3 → exactly Carol');
    assertEqual(tbody.children[0].dataset.coachId, 'co-3',
        'the single row is Carol (co-3)');
})();

// ── initCoachKpi: loads branches + coaches in parallel ─────────────────────

console.log('\n=== initCoachKpi loads branches + coaches via window.supabaseData ====\n');
(async function testInitLoadsRosters() {
    const dom = makeKpiDom();
    const stub = makeFetchStub(() => ({ success: true, data: [] }));
    let branchCalls = 0;
    let coachCalls = 0;
    const win = {
        supabaseConfig: { url: 'https://test', apiKey: 'k' },
        supabaseData: {
            getBranches() {
                branchCalls++;
                return Promise.resolve(BRANCHES);
            },
            getCoaches() {
                coachCalls++;
                return Promise.resolve(COACHES);
            },
        },
    };
    const kpi = loadModule({ document: dom, window: win, fetch: stub.fn });
    kpi.initCoachKpi({ isAdmin: true }, {});
    await flush();
    // Give the roster Promise.all + re-render a microtask to settle.
    await flush();

    assertEqual(branchCalls, 1, 'getBranches called exactly once during init');
    assertEqual(coachCalls, 1, 'getCoaches called exactly once during init');

    const filtersHost = dom.elements['coach-kpi-filters'];
    const root = filtersHost.children[0];
    const branchSelect = findByClass(root, 'kpi-filter-branch');
    assert(branchSelect !== null, 'branch select rendered after roster load');
    // 1 "All branches" + 2 branch options = 3.
    assertEqual(branchSelect.children.length, 3,
        'branch select carries the loaded branches (fixes the latent bug)');

    const coachSelect = findByClass(root, 'kpi-filter-coach');
    assert(coachSelect !== null,
        'coach select rendered on the default school view after roster load');
    assertEqual(coachSelect.children.length, 4,
        'coach select carries the loaded coaches plus "All coaches"');
})().then(runMissingDataAccess).catch((e) => { failed++; console.error(e); finish(); });

async function runMissingDataAccess() {
    console.log('\n=== initCoachKpi tolerates a missing data access layer ==============\n');

    const dom = makeKpiDom();
    const stub = makeFetchStub(() => ({ success: true, data: [] }));
    // No window.supabaseData — the loader must default to empty rosters and
    // must not throw.
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const kpi = loadModule({ document: dom, window: win, fetch: stub.fn });

    let threw = false;
    try {
        kpi.initCoachKpi({ isAdmin: true }, {});
        await flush();
        await flush();
    } catch (_) { threw = true; }
    assert(!threw, 'initCoachKpi does not throw when window.supabaseData is missing');

    const filtersHost = dom.elements['coach-kpi-filters'];
    const root = filtersHost.children[0];
    const branchSelect = findByClass(root, 'kpi-filter-branch');
    assertEqual(branchSelect.children.length, 1,
        'missing data access → branch select offers only "All branches"');
    const coachSelect = findByClass(root, 'kpi-filter-coach');
    assertEqual(coachSelect.children.length, 1,
        'missing data access → coach select offers only "All coaches"');

    finish();
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
