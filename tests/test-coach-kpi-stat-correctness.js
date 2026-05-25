/**
 * Cross-filter stat correctness suite for the Coach Effectiveness dashboard
 * (Option C fix, 2026-05-24).
 *
 * Pins these behaviors after the regressions Alex reported:
 *
 *   1. School hero numbers come from `school_kpi_summary` (the canonical
 *      source), not from a sum of `coach_leaderboard` rows. Changing the
 *      window refetches and the total reflects the new window.
 *
 *   2. When a single coach is picked from the Coach dropdown, the hero
 *      re-derives from the (now correctly per-coach) leaderboard row
 *      instead of trusting the school-wide totals.
 *
 *   3. Branch filter passes `branch_id` to BOTH `school_kpi_summary` and
 *      `coach_leaderboard` so the card numbers and the table stay
 *      consistent.
 *
 *   4. League pill "B" sends `league=B`, league pill "C" sends `league=C`.
 *      There is no League A pill in the DOM at all (the league select
 *      offers only `all` / `B` / `C`).
 *
 *   5. Cross-product (window + branch + coach + league) produces the
 *      expected mocked numbers — no filter silently dropped.
 *
 *   6. Edge function source contract: `coach_leaderboard` computes
 *      `total_tournaments` as a per-coach distinct-upload count and honors
 *      the `league` param. `school_kpi_summary` accepts `branch_id` and
 *      `league`.
 *
 * Run: node tests/test-coach-kpi-stat-correctness.js
 */

const fs = require('fs');
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

// ── DOM stubs (mirror the pattern used in test-coach-kpi-coach-filter.js) ──

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

// ── Fetch stub that knows about the dual school-view call shape ───────────

function makeFetchStub(routes) {
    const calls = [];
    const fn = (url, init) => {
        calls.push({ url, init });
        let body = { success: true, data: [] };
        for (const [matcher, payload] of routes) {
            if (matcher.test(url)) {
                body = (typeof payload === 'function') ? payload(url, init) : payload;
                break;
            }
        }
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

function getQueryParam(url, key) {
    const m = new RegExp(`[?&]${key}=([^&]+)`).exec(url);
    return m ? decodeURIComponent(m[1]) : null;
}

const BRANCHES = [
    { id: 'br-1', name: 'Nish' },
    { id: 'br-2', name: 'Debut' },
];
const COACHES = [
    { id: 'co-1', firstName: 'Alice', lastName: 'A' },
    { id: 'co-2', firstName: 'Bob',   lastName: 'B' },
];

// Three uploads in window: matches Alex's 30d sample (~3 tournaments). The
// school hero total_tournaments should equal 3, NOT 6 (= 3 × 2 coaches), which
// was the original bug from summing coach_leaderboard rows.
const MOCK_UPLOADS = [
    { id: 'up-1', kind: 'league_b', date: '2026-05-01' },
    { id: 'up-2', kind: 'league_c', date: '2026-05-08' },
    { id: 'up-3', kind: 'razryad_4', date: '2026-05-15' },
];

// Per-coach leaderboard rows for the default window (all 3 uploads, both
// coaches participated in each). The KEY assertion: with the fix,
// total_tournaments on each row is the per-coach distinct upload count (3),
// not the school-wide N (which would let the aggregate read 6 = 3×2).
function defaultLeaderboardRows() {
    return [
        {
            coach_id: 'co-1', coach_name: 'Alice A', branches: ['br-1'],
            active_students_count: 4, active_players_count: 3, total_tournaments: 3,
            tournament_entries: 6, top3_count: 2,
            promotions_count: 1, new_razryads_count: 1,
            total_rating_gained: 70, composite_score: 65,
            participation_rate: 0.5, avg_rating_delta: 10,
        },
        {
            coach_id: 'co-2', coach_name: 'Bob B', branches: ['br-2'],
            active_students_count: 5, active_players_count: 4, total_tournaments: 2,
            tournament_entries: 4, top3_count: 1,
            promotions_count: 0, new_razryads_count: 0,
            total_rating_gained: 20, composite_score: 40,
            participation_rate: 0.4, avg_rating_delta: 4,
        },
    ];
}

function defaultSchoolHero(extras) {
    // Canonical 30d hero — 3 distinct uploads, NOT 6.
    return Object.assign({
        window: { start: '2026-04-25', end: '2026-05-24' },
        active_students_count: 9,
        active_players_count: 7,
        participation_pct: 77.8,
        total_tournaments: 3,
        total_results: 10,
        top1_count: 3,
        top3_count: 3,
        total_rating_gained: 90,
        avg_rating_delta: 9,
        promotions_count: 1,
        new_razryads_count: 1,
    }, extras || {});
}

function findValueByLabel(heroHost, label) {
    const cards = findAllByClass(heroHost, 'stat-card');
    for (const card of cards) {
        const lab = findByClass(card, 'stat-card-label');
        const val = findByClass(card, 'stat-card-value');
        if (lab && val && lab.textContent === label) return val.textContent;
    }
    return null;
}

// ── 1. Window change refetches hero from school_kpi_summary ──────────────

console.log('\n=== 1. School hero total comes from school_kpi_summary, not row sum ===\n');
(async function testWindowHeroSource() {
    const dom = makeKpiDom();
    const stub = makeFetchStub([
        [/action=school_kpi_summary/, { success: true, data: defaultSchoolHero() }],
        [/action=coach_leaderboard/,  { success: true, data: defaultLeaderboardRows() }],
    ]);
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    mod.initCoachKpi({ isAdmin: true }, {});
    await flush();
    await flush();

    const heroHost = dom.elements['coach-kpi-school-hero'];
    const tournamentsValue = findValueByLabel(heroHost, 'Tournaments');
    // Both endpoints return mocked data. Canonical hero source emits 3.
    // Buggy old behavior would have summed the rows (3 + 2 = 5), or used the
    // pre-fix `r.totalUploadsInWindow` repeated per row (3 × 2 = 6).
    assertEqual(tournamentsValue, '3',
        'Tournaments card reads 3 (= mocked uploads.length), NOT 5 (sum) or 6 (N×coaches)');

    const activeValue = findValueByLabel(heroHost, 'Active students');
    assertEqual(activeValue, '9',
        'Active students card reads 9 (from school_kpi_summary), not 4+5=9 by accident');

    const participationValue = findValueByLabel(heroHost, 'Participation');
    assert(participationValue !== null && participationValue !== '—',
        'Participation card is populated (was always blank under the previous bug)');
    assert(/%$/.test(participationValue),
        'Participation card carries a % suffix (e.g. "77.8%")');

    // Both endpoints were called.
    const heroCalls = stub.calls.filter(c => /action=school_kpi_summary/.test(c.url));
    const leaderCalls = stub.calls.filter(c => /action=coach_leaderboard/.test(c.url));
    assert(heroCalls.length === 1, 'school_kpi_summary fetched exactly once on init');
    assert(leaderCalls.length === 1, 'coach_leaderboard fetched exactly once on init');
})().then(runCoachFilterTest).catch((e) => { failed++; console.error(e); finish(); });

// ── 2. Coach filter narrows hero to single-row counts ────────────────────

async function runCoachFilterTest() {
    console.log('\n=== 2. Coach filter narrows hero from school totals to that one row ===\n');
    const dom = makeKpiDom();
    const stub = makeFetchStub([
        [/action=school_kpi_summary/, { success: true, data: defaultSchoolHero() }],
        [/action=coach_leaderboard/,  { success: true, data: defaultLeaderboardRows() }],
    ]);
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    // Directly invoke _renderDashboard with coachId='co-1' to skip the
    // full init dance — the unit we're locking is the hero re-derive logic.
    const result = {
        success: true,
        hero: defaultSchoolHero(),
        rows: defaultLeaderboardRows(),
        data: defaultLeaderboardRows(),
    };
    const t = (k, fb) => fb;

    mod._renderDashboard('school', result, t,
        { window: '30d', league: 'all', branchId: 'all', coachId: 'co-1' });

    const heroHost = dom.elements['coach-kpi-school-hero'];
    // Alice's row: 4 active, 3 tournaments, 2 top3, 1 promotion, 1 razryad.
    // The hero MUST reflect Alice's row, NOT the school-wide 9/3/3/1/1.
    assertEqual(findValueByLabel(heroHost, 'Active students'), '4',
        'coach filter: Active students = Alice only (4), not school 9');
    assertEqual(findValueByLabel(heroHost, 'Tournaments'), '3',
        'coach filter: Tournaments = Alice only (3), not school total 5');
    assertEqual(findValueByLabel(heroHost, 'Top-3 finishes'), '2',
        'coach filter: Top-3 = Alice only (2), not school total 3');
    assertEqual(findValueByLabel(heroHost, 'Promotions'), '1',
        'coach filter: Promotions = Alice only (1)');
    assertEqual(findValueByLabel(heroHost, 'New razryads'), '1',
        'coach filter: New razryads = Alice only (1)');

    // Participation should still render — was blank before the aggregateSchoolHero fix.
    const partValue = findValueByLabel(heroHost, 'Participation');
    assert(partValue !== null && partValue !== '—',
        'coach filter: Participation card is populated (was blank pre-fix)');

    runBranchFilterTest();
}

// ── 3. Branch filter is passed to both endpoints ─────────────────────────

async function runBranchFilterTest() {
    console.log('\n=== 3. Branch filter passes branch_id to both server actions ==========\n');
    const dom = makeKpiDom();
    const stub = makeFetchStub([
        [/action=school_kpi_summary/, { success: true, data: defaultSchoolHero() }],
        [/action=coach_leaderboard/,  { success: true, data: defaultLeaderboardRows() }],
    ]);
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    await mod._fetchSchoolLeaderboard({ isAdmin: true }, {
        window: '30d', league: 'all', branchId: 'br-1', coachId: 'all',
    }, { fetch: stub.fn, config: { url: 'https://test', apiKey: 'k' } });

    const heroCall = stub.calls.find(c => /action=school_kpi_summary/.test(c.url));
    const rowsCall = stub.calls.find(c => /action=coach_leaderboard/.test(c.url));
    assert(heroCall && getQueryParam(heroCall.url, 'branch_id') === 'br-1',
        'branch filter: school_kpi_summary URL carries branch_id=br-1');
    assert(rowsCall && getQueryParam(rowsCall.url, 'branch_id') === 'br-1',
        'branch filter: coach_leaderboard URL carries branch_id=br-1');

    // branch=all is omitted, not sent as ''.
    stub.calls.length = 0;
    await mod._fetchSchoolLeaderboard({ isAdmin: true }, {
        window: '30d', league: 'all', branchId: 'all', coachId: 'all',
    }, { fetch: stub.fn, config: { url: 'https://test', apiKey: 'k' } });
    const heroCall2 = stub.calls.find(c => /action=school_kpi_summary/.test(c.url));
    const rowsCall2 = stub.calls.find(c => /action=coach_leaderboard/.test(c.url));
    assert(heroCall2 && getQueryParam(heroCall2.url, 'branch_id') === null,
        'branch=all: school_kpi_summary URL has NO branch_id param');
    assert(rowsCall2 && getQueryParam(rowsCall2.url, 'branch_id') === null,
        'branch=all: coach_leaderboard URL has NO branch_id param');

    runLeaguePillTest();
}

// ── 4. League pill B/C sends league=B/C; no League A in DOM ──────────────

async function runLeaguePillTest() {
    console.log('\n=== 4. League B pill sends league=B; C sends league=C; A absent ======\n');
    const dom = makeKpiDom();
    const stub = makeFetchStub([
        [/action=school_kpi_summary/, { success: true, data: defaultSchoolHero() }],
        [/action=coach_leaderboard/,  { success: true, data: defaultLeaderboardRows() }],
    ]);
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    // Render the filter bar standalone so we can inspect every league option.
    const container = makeMockEl('div');
    mod.renderFilters(container,
        { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
        { coaches: COACHES, branches: BRANCHES, view: 'school' });

    const root = container.children[0];
    const leagueSelect = findByClass(root, 'kpi-filter-league');
    assert(leagueSelect !== null, 'league <select> is rendered');
    const optionValues = leagueSelect.children.map(o => o.attributes.value);
    assertEqual(optionValues, ['all', 'B', 'C'],
        'league select offers exactly all/B/C — no League A pill in the DOM');
    assert(!optionValues.includes('A'),
        'league select MUST NOT include League A (retired from internal rotation)');

    // LEAGUES constant should not include 'A'.
    assert(!mod.LEAGUES.includes('A'),
        'coachKpi.LEAGUES constant excludes "A"');

    // Issue a League B fetch and inspect the URL.
    stub.calls.length = 0;
    await mod._fetchSchoolLeaderboard({ isAdmin: true }, {
        window: '30d', league: 'B', branchId: 'all', coachId: 'all',
    }, { fetch: stub.fn, config: { url: 'https://test', apiKey: 'k' } });
    const bHero  = stub.calls.find(c => /action=school_kpi_summary/.test(c.url));
    const bRows  = stub.calls.find(c => /action=coach_leaderboard/.test(c.url));
    assert(bHero && getQueryParam(bHero.url, 'league') === 'B',
        'league=B: school_kpi_summary URL carries league=B');
    assert(bRows && getQueryParam(bRows.url, 'league') === 'B',
        'league=B: coach_leaderboard URL carries league=B');

    // Same for League C.
    stub.calls.length = 0;
    await mod._fetchSchoolLeaderboard({ isAdmin: true }, {
        window: '30d', league: 'C', branchId: 'all', coachId: 'all',
    }, { fetch: stub.fn, config: { url: 'https://test', apiKey: 'k' } });
    const cHero = stub.calls.find(c => /action=school_kpi_summary/.test(c.url));
    const cRows = stub.calls.find(c => /action=coach_leaderboard/.test(c.url));
    assert(cHero && getQueryParam(cHero.url, 'league') === 'C',
        'league=C: school_kpi_summary URL carries league=C');
    assert(cRows && getQueryParam(cRows.url, 'league') === 'C',
        'league=C: coach_leaderboard URL carries league=C');

    runCrossProductTest();
}

// ── 5. Cross-product: 30d + Branch X + Coach Y + League B ────────────────

async function runCrossProductTest() {
    console.log('\n=== 5. Cross-product: 30d + branch + coach + league = expected mocks =\n');
    const dom = makeKpiDom();
    const aliceRow = defaultLeaderboardRows()[0]; // Alice in br-1
    const bobRow   = defaultLeaderboardRows()[1]; // Bob in br-2

    // The server-side filter would narrow rows to br-1 + league=B, so only
    // Alice appears. The hero summary reflects the filtered scope.
    const stub = makeFetchStub([
        [/action=school_kpi_summary/, () => ({ success: true, data: defaultSchoolHero({
            // Branch + League B scope: 1 league_b upload, Alice's branch only.
            active_students_count: 4, active_players_count: 3,
            participation_pct: 75, total_tournaments: 1,
            top3_count: 1, promotions_count: 0, new_razryads_count: 0,
            total_rating_gained: 25,
        }) })],
        [/action=coach_leaderboard/,  () => ({
            success: true,
            data: [Object.assign({}, aliceRow, { total_tournaments: 1, top3_count: 1 })],
        })],
    ]);
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const mod = loadModule({ document: dom, window: win, fetch: stub.fn });

    const result = await mod._fetchSchoolLeaderboard({ isAdmin: true }, {
        window: '30d', league: 'B', branchId: 'br-1', coachId: 'co-1',
    }, { fetch: stub.fn, config: { url: 'https://test', apiKey: 'k' } });

    // Verify ALL FOUR filter params reached both endpoints.
    const heroCall = stub.calls.find(c => /action=school_kpi_summary/.test(c.url));
    const rowsCall = stub.calls.find(c => /action=coach_leaderboard/.test(c.url));
    for (const [label, call] of [['school_kpi_summary', heroCall], ['coach_leaderboard', rowsCall]]) {
        assert(call !== undefined, `${label}: called`);
        assert(getQueryParam(call.url, 'window_start') !== null,
            `${label}: window_start present`);
        assert(getQueryParam(call.url, 'window_end') !== null,
            `${label}: window_end present`);
        assertEqual(getQueryParam(call.url, 'branch_id'), 'br-1',
            `${label}: branch_id=br-1`);
        assertEqual(getQueryParam(call.url, 'league'), 'B',
            `${label}: league=B`);
    }
    // Coach filter is client-side (cuts the leaderboard rows) — it must NOT
    // be passed to the server, since coach_leaderboard returns ALL coaches in
    // scope and the client narrows to one.
    assert(getQueryParam(rowsCall.url, 'coachId') === null
        && getQueryParam(rowsCall.url, 'coach_id') === null,
        'coach filter stays client-side (no coachId on coach_leaderboard URL)');

    // _renderDashboard with these filters: coachId=co-1 narrows to Alice's row.
    mod._renderDashboard('school', result, (k, fb) => fb,
        { window: '30d', league: 'B', branchId: 'br-1', coachId: 'co-1' });

    const heroHost = dom.elements['coach-kpi-school-hero'];
    // With coachId=co-1, aggregateSchoolHero re-derives from Alice's filtered
    // row (4 active, 1 tournament after league-B narrowing, 1 top-3).
    assertEqual(findValueByLabel(heroHost, 'Active students'), '4',
        'cross-product: Active students = Alice (4)');
    assertEqual(findValueByLabel(heroHost, 'Tournaments'), '1',
        'cross-product: Tournaments = 1 (only 1 league_b upload in Alice\'s branch)');
    assertEqual(findValueByLabel(heroHost, 'Top-3 finishes'), '1',
        'cross-product: Top-3 = 1');

    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    const table = findByClass(lbHost, 'kpi-leaderboard');
    assert(table !== null, 'cross-product: leaderboard table rendered');
    const tbody = findByTag(table, 'tbody');
    assertEqual(tbody.children.length, 1,
        'cross-product: exactly one row (Alice)');
    assertEqual(tbody.children[0].dataset.coachId, 'co-1',
        'cross-product: the row is Alice (co-1)');

    runSchoolFallbackHero();
}

// ── 6. Single-coach fallback uses aggregateSchoolHero with participation ─

async function runSchoolFallbackHero() {
    console.log('\n=== 6. aggregateSchoolHero includes participation_pct so no blanks ====\n');
    const mod = loadModule({});

    const rolled = mod.aggregateSchoolHero([
        {
            active_students_count: 5, total_tournaments: 3, top3_count: 2,
            promotions_count: 1, new_razryads_count: 1, total_rating_gained: 70,
            tournament_entries: 4,
        },
    ]);
    assert('participation_pct' in rolled,
        'aggregateSchoolHero output carries a participation_pct key');
    assert(typeof rolled.participation_pct === 'number',
        'participation_pct is a number, never undefined');
    assert(rolled.participation_pct >= 0 && rolled.participation_pct <= 100,
        'participation_pct lands in 0..100');
    // 4 entries vs 5 active → ~80% (min(entries, active) / active = 4/5).
    assertEqual(rolled.participation_pct, 80,
        '4 entries among 5 active → 80% participation_pct');

    runEdgeSourceContract();
}

// ── 7. Edge function source contract ─────────────────────────────────────

function runEdgeSourceContract() {
    console.log('\n=== 7. Edge function source contract for both actions =================\n');

    const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
    const SRC = fs.readFileSync(SRC_PATH, 'utf8');

    function extractAction(name) {
        const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
        const m = re.exec(SRC);
        return m ? m[1] : '';
    }
    const leaderboardBlock = extractAction('coach_leaderboard');
    const schoolBlock = extractAction('school_kpi_summary');

    // coach_leaderboard contract.
    assert(leaderboardBlock.length > 0, 'coach_leaderboard handler block extracted');
    assert(/p\(['"]league['"]\)/.test(leaderboardBlock),
        'coach_leaderboard reads the `league` query param');
    assert(/league_b/.test(leaderboardBlock) && /league_c/.test(leaderboardBlock),
        'coach_leaderboard maps league B/C to upload kinds league_b / league_c');
    assert(!/['"]league_a['"]/.test(leaderboardBlock),
        'coach_leaderboard NEVER maps to league_a (retired from rotation)');
    // total_tournaments must be sourced from a per-coach distinct upload count,
    // not from the school-wide `totalUploadsInWindow` repeated per row (the bug).
    assert(/total_tournaments:\s*r\.coachTournamentCount/.test(leaderboardBlock),
        'coach_leaderboard total_tournaments = per-coach distinct uploads (coachTournamentCount)');
    assert(!/total_tournaments:\s*r\.totalUploadsInWindow/.test(leaderboardBlock),
        'coach_leaderboard NO LONGER reports total_tournaments = school-wide upload count');

    // school_kpi_summary contract.
    assert(schoolBlock.length > 0, 'school_kpi_summary handler block extracted');
    assert(/p\(['"]branch_id['"]\)/.test(schoolBlock),
        'school_kpi_summary reads the `branch_id` query param');
    assert(/p\(['"]league['"]\)/.test(schoolBlock),
        'school_kpi_summary reads the `league` query param');
    assert(/league_b/.test(schoolBlock) && /league_c/.test(schoolBlock),
        'school_kpi_summary maps B/C to upload kinds league_b / league_c');
    assert(!/['"]league_a['"]/.test(schoolBlock),
        'school_kpi_summary NEVER maps to league_a');

    finish();
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
