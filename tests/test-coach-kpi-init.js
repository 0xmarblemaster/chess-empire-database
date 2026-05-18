/**
 * Tests for the initCoachKpi orchestrator in coach-kpi.js.
 *
 * showCoachPerformance() in admin(-v2).js hands off rendering to
 * window.initCoachKpi(roleInfo, supabaseClient). The orchestrator must:
 *   1. Refuse callers the role lock rejects (canViewCoachKpi gate).
 *   2. Render filters into #coach-kpi-filters.
 *   3. Render the leaderboard into #coach-kpi-school-leaderboard.
 *   4. Render the upload launcher into #coach-kpi-upload-host — but only
 *      when window.coachKpiUpload has been loaded.
 *   5. Be installed as window.initCoachKpi so the admin handlers find it.
 *
 * Run: node tests/test-coach-kpi-init.js
 */

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

// Fresh module load with stubbed globals so window.initCoachKpi assignment
// is observable end-to-end. Globals stay set after load so that initCoachKpi's
// own `typeof document === 'undefined'` checks (run at call time, not load
// time) see the stub when the test invokes it.
function loadModule(globals) {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];

    if (globals.document !== undefined) global.document = globals.document;
    else delete global.document;
    if (globals.window !== undefined) global.window = globals.window;
    else delete global.window;

    return require(modulePath);
}

console.log('\n=== smoke: initCoachKpi exported and installed on window ==============\n');
(function testApiSurface() {
    const win = {};
    const mod = loadModule({
        document: { createElement: (t) => makeMockEl(t) },
        window: win,
    });
    assert(typeof mod.initCoachKpi === 'function',
        'initCoachKpi exported from coach-kpi.js api');
    assert(typeof win.initCoachKpi === 'function',
        'window.initCoachKpi installed for admin(-v2).js to call');
    assert(win.initCoachKpi === mod.initCoachKpi,
        'window.initCoachKpi is the same function as the api export');
})();

console.log('\n=== happy path: admin → filters + leaderboard rendered ===============\n');
(function testAdminRendersFiltersAndLeaderboard() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard', 'coach-kpi-upload-host']);
    const win = {};
    const mod = loadModule({ document: dom, window: win });

    mod.initCoachKpi({ isAdmin: true }, { __stub: 'sb' });

    const filtersHost = dom.elements['coach-kpi-filters'];
    assert(filtersHost.children.length === 1,
        'filters host gains one root after initCoachKpi');
    assert(/\bkpi-filters\b/.test(filtersHost.children[0].className),
        'filters root carries .kpi-filters');

    const lbHost = dom.elements['coach-kpi-school-leaderboard'];
    assert(lbHost.children.length === 1,
        'leaderboard host gains one card (empty-state, no data yet)');
    assert(/\bempty-state\b/.test(lbHost.children[0].className),
        'leaderboard renders the empty-state card when no rows passed');
})();

console.log('\n=== upload launcher only when window.coachKpiUpload is present ========\n');
(function testNoUploadWhenUploadModuleMissing() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard', 'coach-kpi-upload-host']);
    const win = {}; // no coachKpiUpload
    const mod = loadModule({ document: dom, window: win });

    mod.initCoachKpi({ isAdmin: true });

    const uploadHost = dom.elements['coach-kpi-upload-host'];
    assert(uploadHost.children.length === 0,
        'upload host stays empty when window.coachKpiUpload is not loaded');
})();

(function testUploadLauncherRendersWhenModulePresent() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard', 'coach-kpi-upload-host']);
    let modalCalls = 0;
    const win = {
        coachKpiUpload: {
            renderUploadModal(container) {
                modalCalls++;
                container.appendChild(makeMockEl('div'));
            },
        },
    };
    const mod = loadModule({ document: dom, window: win });

    mod.initCoachKpi({ isAdmin: true });

    const uploadHost = dom.elements['coach-kpi-upload-host'];
    assert(uploadHost.children.length === 1,
        'upload host gains the launcher button when coachKpiUpload is loaded');
    const btn = uploadHost.children[0];
    assert(/\bkpi-upload-launcher\b/.test(btn.className),
        'launcher button carries .kpi-upload-launcher class');

    btn.dispatch('click');
    assert(modalCalls === 1,
        'clicking the launcher invokes coachKpiUpload.renderUploadModal');
})();

console.log('\n=== role gate: canViewCoachKpi must let the caller through ===========\n');
(function testAnonRejected() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard', 'coach-kpi-upload-host']);
    const mod = loadModule({ document: dom, window: {} });

    mod.initCoachKpi(null);
    mod.initCoachKpi({});
    mod.initCoachKpi({ isAdmin: false });

    assert(dom.elements['coach-kpi-filters'].children.length === 0,
        'no roleInfo / not-allowed → filters host left untouched');
    assert(dom.elements['coach-kpi-school-leaderboard'].children.length === 0,
        'no roleInfo / not-allowed → leaderboard host left untouched');
    assert(dom.elements['coach-kpi-upload-host'].children.length === 0,
        'no roleInfo / not-allowed → upload host left untouched');
})();

(function testCoachAllowed() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard', 'coach-kpi-upload-host']);
    const mod = loadModule({ document: dom, window: {} });

    mod.initCoachKpi({ isAdmin: false, isCoach: true, coachId: 'c-1' });
    assert(dom.elements['coach-kpi-filters'].children.length === 1,
        'locked coach passes canViewCoachKpi gate (filters rendered)');
})();

console.log('\n=== robust to a partially-scaffolded DOM ==============================\n');
(function testPartialDom() {
    // No leaderboard / upload host — only filters.
    const dom = makeDom(['coach-kpi-filters']);
    const mod = loadModule({ document: dom, window: { coachKpiUpload: {} } });

    let threw = false;
    try { mod.initCoachKpi({ isAdmin: true }); }
    catch (e) { threw = true; }
    assert(!threw, 'initCoachKpi does not throw when some host containers are missing');
    assert(dom.elements['coach-kpi-filters'].children.length === 1,
        'filters still rendered when other hosts are missing');
})();

console.log('\n=== call-signature parity with admin(-v2).js handlers =================\n');
(function testTwoArgSignature() {
    // The admin handler calls window.initCoachKpi(roleInfo, window.supabaseClient).
    // The orchestrator must accept (and ignore) the second arg without throwing.
    const dom = makeDom(['coach-kpi-filters']);
    const mod = loadModule({ document: dom, window: {} });

    let threw = false;
    try {
        mod.initCoachKpi({ isAdmin: true }, { __stub: 'sb' });
    } catch (e) { threw = true; }
    assert(!threw, 'initCoachKpi(roleInfo, supabaseClient) does not throw on the 2-arg call');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
