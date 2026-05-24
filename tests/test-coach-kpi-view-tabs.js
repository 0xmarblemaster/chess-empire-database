/**
 * Tests for the School/Branch/Coach view-tab wiring in coach-kpi.js.
 *
 * Original bug: the three .kpi-view-btn[data-kpi-view] buttons in
 * admin-v2.html / legacy-admin.html had no click handlers, so clicking
 * Branch or Coach did nothing — the active pill stayed on School and the
 * panels never swapped. initCoachKpi also captured `view` as a const, so
 * even if a handler had run it would not have flipped the closure used by
 * refresh() and the upload-commit subscriber.
 *
 * This file pins the fixed behavior:
 *   - Click Branch → School pill loses is-active / aria-selected=true, Branch
 *     gets them, school panel goes `hidden`, branch panel loses `hidden`.
 *   - Click Coach → same assertions for coach.
 *   - Click the already-active pill → no extra fetch (target === view guard).
 *   - Locked-coach: when roleLock.canAccessView refuses every non-current view
 *     the click handler is not wired (single allowed view, switching is off).
 *
 * Run: node tests/test-coach-kpi-view-tabs.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
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

// Build the slice of the admin-v2.html DOM that coach-kpi.js orchestrator
// touches: the section container with three .kpi-view-btn buttons, the three
// kpi-subview panels, and the filter / leaderboard hosts.
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

    const dom = {
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
    return dom;
}

function makeFetchStub() {
    const calls = [];
    const fn = (url) => {
        calls.push({ url });
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
    if (globals.document !== undefined) global.document = globals.document; else delete global.document;
    if (globals.window !== undefined) global.window = globals.window; else delete global.window;
    if (globals.fetch !== undefined) global.fetch = globals.fetch; else delete global.fetch;
    const mod = require(modulePath);
    const roleLockMod = require(roleLockPath);
    return { mod, roleLockMod };
}

function flush() {
    return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

function viewFromUrl(url) {
    // School view fetches go through _fetchSchoolLeaderboard (no branchName /
    // coachId on the URL). Branch/Coach views go through kpiQueryScope, which
    // our patched stub augments with view-distinguishing params.
    if (/[?&]coachId=/.test(url)) return 'coach';
    if (/[?&]branchName=/.test(url)) return 'branch';
    if (/action=coach_leaderboard/.test(url)) return 'school';
    return null;
}

// Patch kpiQueryScope on the loaded role-lock module so branch/coach view
// fetches actually fire with view-identifying params (admin's default state
// carries no branchName / coachId, so the un-patched scope returns null).
function patchRoleLockForFetch(roleLockMod) {
    const originalScope = roleLockMod.kpiQueryScope;
    roleLockMod.kpiQueryScope = function (roleInfo, view, params) {
        if (!roleLockMod.canAccessView(roleInfo, view)) return null;
        if (view === 'school') return { action: 'school_kpi_summary' };
        if (view === 'branch') return { action: 'coach_leaderboard', branchName: 'BR-TEST' };
        if (view === 'coach')  return { action: 'coach_kpi_summary', coachId: 'CO-TEST' };
        return originalScope(roleInfo, view, params);
    };
}

console.log('\n=== clicking Branch swaps tab + panel state, fires branch fetch ======\n');
(async function testBranchClick() {
    const dom = makeKpiDom();
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const { mod, roleLockMod } = loadModule({ document: dom, window: win, fetch: stub.fn });
    patchRoleLockForFetch(roleLockMod);

    mod.initCoachKpi({ isAdmin: true }, {});
    await flush();
    await new Promise((r) => setTimeout(r, 50));

    const [schoolBtn, branchBtn, coachBtn] = dom.buttons;
    assert(schoolBtn.classList.contains('is-active'),
        'school button starts is-active');
    assert(branchBtn.getAttribute('aria-selected') === 'false',
        'branch button starts aria-selected=false');

    // Click Branch.
    branchBtn.dispatch('click', {});
    // debouncedRefresh defaults to 250 ms — wait it out.
    await new Promise((r) => setTimeout(r, 350));

    assert(!schoolBtn.classList.contains('is-active'),
        'after Branch click: school button no longer is-active');
    assert(branchBtn.classList.contains('is-active'),
        'after Branch click: branch button is-active');
    assert(schoolBtn.getAttribute('aria-selected') === 'false',
        'after Branch click: school aria-selected=false');
    assert(branchBtn.getAttribute('aria-selected') === 'true',
        'after Branch click: branch aria-selected=true');

    assert(dom.panels.school.hasAttribute('hidden'),
        'after Branch click: school panel hidden');
    assert(!dom.panels.branch.hasAttribute('hidden'),
        'after Branch click: branch panel visible');
    assert(dom.panels.branch.classList.contains('is-active'),
        'after Branch click: branch panel carries is-active');
    assert(!dom.panels.school.classList.contains('is-active'),
        'after Branch click: school panel loses is-active');

    const branchFetches = stub.calls.filter(c => viewFromUrl(c.url) === 'branch');
    assert(branchFetches.length >= 1,
        'after Branch click: fetch invoked with view=branch');
})()
.then(runCoachClickTest)
.catch((e) => { failed++; console.error(e); finish(); });

async function runCoachClickTest() {
    console.log('\n=== clicking Coach swaps tab + panel state, fires coach fetch ========\n');

    const dom = makeKpiDom();
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const { mod, roleLockMod } = loadModule({ document: dom, window: win, fetch: stub.fn });
    patchRoleLockForFetch(roleLockMod);

    mod.initCoachKpi({ isAdmin: true }, {});
    await flush();
    await new Promise((r) => setTimeout(r, 50));

    const [schoolBtn, branchBtn, coachBtn] = dom.buttons;

    coachBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));

    assert(coachBtn.classList.contains('is-active'),
        'after Coach click: coach button is-active');
    assert(coachBtn.getAttribute('aria-selected') === 'true',
        'after Coach click: coach aria-selected=true');
    assert(!schoolBtn.classList.contains('is-active'),
        'after Coach click: school no longer is-active');
    assert(!branchBtn.classList.contains('is-active'),
        'after Coach click: branch not is-active');

    assert(dom.panels.school.hasAttribute('hidden'),
        'after Coach click: school panel hidden');
    assert(dom.panels.branch.hasAttribute('hidden'),
        'after Coach click: branch panel hidden');
    assert(!dom.panels.coach.hasAttribute('hidden'),
        'after Coach click: coach panel visible');
    assert(dom.panels.coach.classList.contains('is-active'),
        'after Coach click: coach panel carries is-active');

    const coachFetches = stub.calls.filter(c => viewFromUrl(c.url) === 'coach');
    assert(coachFetches.length >= 1,
        'after Coach click: fetch invoked with view=coach');

    return runActiveTabGuardTest();
}

async function runActiveTabGuardTest() {
    console.log('\n=== clicking the already-active tab fires no extra fetch =============\n');

    const dom = makeKpiDom();
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const { mod, roleLockMod } = loadModule({ document: dom, window: win, fetch: stub.fn });
    patchRoleLockForFetch(roleLockMod);

    mod.initCoachKpi({ isAdmin: true }, {});
    await flush();
    await new Promise((r) => setTimeout(r, 350));

    // First click on Branch establishes a new active view + fires a fetch.
    const [schoolBtn, branchBtn] = dom.buttons;
    branchBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));
    const after1 = stub.calls.length;
    assert(after1 > 0, 'Branch click produced at least one fetch');

    // Second click on the SAME Branch tab — the target === view guard must
    // short-circuit and skip the refresh.
    branchBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));
    assert(stub.calls.length === after1,
        're-clicking the active tab issues no extra fetch (target === view guard)');

    return runLockedCoachTest();
}

async function runLockedCoachTest() {
    console.log('\n=== locked-coach: school refused, switching off ======================\n');

    const dom = makeKpiDom();
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const { mod, roleLockMod } = loadModule({ document: dom, window: win, fetch: stub.fn });

    // Stub canAccessView so only 'coach' is allowed (mirrors locked-coach).
    roleLockMod.canAccessView = (_role, view) => view === 'coach';
    // _initialView uses defaultView; force it to 'coach'.
    roleLockMod.defaultView = () => 'coach';
    // canViewCoachKpi must let the locked coach in.
    roleLockMod.canViewCoachKpi = () => true;
    patchRoleLockForFetch(roleLockMod);
    // Re-stub canAccessView after patchRoleLockForFetch (patched kpiQueryScope
    // calls roleLockMod.canAccessView — we want it strict for this test).
    roleLockMod.canAccessView = (_role, view) => view === 'coach';

    mod.initCoachKpi({ isAdmin: false, isCoach: true, coachId: 'CO-TEST' }, {});
    await flush();
    await new Promise((r) => setTimeout(r, 350));

    const fetchesBefore = stub.calls.length;
    const [schoolBtn] = dom.buttons;
    schoolBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));

    // No view change: coach panel should still be the active one (the orchestrator
    // landed on 'coach' as the initial view), and no fetch should fire for school
    // because clicking school must be ignored.
    assert(stub.calls.length === fetchesBefore,
        'locked coach: clicking School issues no extra fetch (no wiring)');

    // canAccessView refused everything but 'coach', so reachable.length is 1 —
    // the click listener was never attached. Confirm that by checking the
    // button has no recorded 'click' listener.
    assert(!Array.isArray(schoolBtn._listeners['click']) || schoolBtn._listeners['click'].length === 0,
        'locked coach: no click listener wired on the School tab');

    return runAdminLockedViewTest();
}

async function runAdminLockedViewTest() {
    console.log('\n=== admin with role-lock refusing School: click is ignored ===========\n');

    const dom = makeKpiDom();
    const stub = makeFetchStub();
    const win = { supabaseConfig: { url: 'https://test', apiKey: 'k' } };
    const { mod, roleLockMod } = loadModule({ document: dom, window: win, fetch: stub.fn });

    // Admin lands on School by default. We allow Branch + Coach so the click
    // wiring fires (reachable.length > 1), but refuse School on click attempts.
    const realCanAccessView = roleLockMod.canAccessView;
    roleLockMod.canAccessView = (roleInfo, view) => {
        if (view === 'school' && roleInfo && roleInfo.__refuseSchool) return false;
        return realCanAccessView(roleInfo, view);
    };
    patchRoleLockForFetch(roleLockMod);
    roleLockMod.canAccessView = (roleInfo, view) => {
        if (view === 'school' && roleInfo && roleInfo.__refuseSchool) return false;
        return realCanAccessView(roleInfo, view);
    };

    const roleInfo = { isAdmin: true, __refuseSchool: true };
    mod.initCoachKpi(roleInfo, {});
    await flush();
    await new Promise((r) => setTimeout(r, 350));

    const [schoolBtn, branchBtn] = dom.buttons;

    // Move away to Branch first so School becomes inactive.
    branchBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));
    assert(branchBtn.classList.contains('is-active'),
        'admin: Branch click switched the view');

    const fetchesBefore = stub.calls.length;
    // Try to click School — canAccessView refuses it, so nothing changes.
    schoolBtn.dispatch('click', {});
    await new Promise((r) => setTimeout(r, 350));

    assert(branchBtn.classList.contains('is-active'),
        'admin: clicking refused School left Branch active');
    assert(!schoolBtn.classList.contains('is-active'),
        'admin: clicking refused School did not activate School');
    assert(stub.calls.length === fetchesBefore,
        'admin: clicking refused School issued no fetch');

    finish();
}

function finish() {
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}
