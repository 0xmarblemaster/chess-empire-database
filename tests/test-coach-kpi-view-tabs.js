/**
 * Tests for the retired School/Branch/Coach view-tab switcher in admin-v2.html.
 *
 * The three .kpi-view-btn[data-kpi-view] buttons in the Coach Performance
 * header were removed because the inline filter dropdowns (period / league /
 * branch / coach) now cover the same parameters. View routing is still
 * role-driven: admin lands on the school panel, locked coach lands on the
 * coach panel — there is just no clickable tab UI.
 *
 * This file pins:
 *   - admin-v2.html no longer carries any data-kpi-view buttons or the
 *     "Coach KPI view" tablist inside #section-coach-kpi.
 *   - initCoachKpi(admin) shows the school panel and hides branch + coach.
 *   - initCoachKpi(locked coach) shows the coach panel and hides school +
 *     branch (role lock's defaultView drives the swap).
 *
 * Run: node tests/test-coach-kpi-view-tabs.js
 */

const fs = require('fs');
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
    };
    el.classList = makeClassList(el);
    return el;
}

function makePanelDom() {
    // Mirrors the post-fix admin-v2.html: three panels still exist with the
    // school panel pre-flagged is-active (the HTML default), and the others
    // hidden. No tab buttons.
    const panels = {
        school: (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-school-view'; p.className = 'kpi-subview is-active'; return p; })(),
        branch: (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-branch-view'; p.className = 'kpi-subview'; p.setAttribute('hidden', ''); return p; })(),
        coach:  (() => { const p = makeMockEl('div'); p.id = 'coach-kpi-coach-view';  p.className = 'kpi-subview'; p.setAttribute('hidden', ''); return p; })(),
    };
    const elements = {
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
        panels,
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeMockEl(tag); },
    };
}

function loadModule(globals) {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    if (globals.document !== undefined) global.document = globals.document; else delete global.document;
    if (globals.window !== undefined) global.window = globals.window; else delete global.window;
    if (globals.fetch !== undefined) global.fetch = globals.fetch; else delete global.fetch;
    return require(modulePath);
}

// ── HTML guard: tabs are gone ────────────────────────────────────────────────
console.log('\n=== admin-v2.html: Coach KPI view-switcher tabs are gone ==============\n');
(function testHtmlNoTabs() {
    const ROOT = path.resolve(__dirname, '..');
    const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');

    const sectionMatch = HTML.match(
        /<section[^>]*id="section-coach-kpi"[^>]*>[\s\S]*?<\/section>/
    );
    assert(sectionMatch !== null, '#section-coach-kpi block found');
    const section = sectionMatch ? sectionMatch[0] : '';

    assert(!/data-kpi-view=/.test(section),
        'no data-kpi-view attributes inside #section-coach-kpi');
    assert(!/aria-label="Coach KPI view"/.test(section),
        'no role="tablist" with aria-label="Coach KPI view" inside #section-coach-kpi');
    assert(!/data-i18n="admin\.coachKpi\.viewSchool"/.test(section),
        'no admin.coachKpi.viewSchool label inside #section-coach-kpi');
    assert(!/data-i18n="admin\.coachKpi\.viewBranch"/.test(section),
        'no admin.coachKpi.viewBranch label inside #section-coach-kpi');
    assert(!/data-i18n="admin\.coachKpi\.viewCoach"/.test(section),
        'no admin.coachKpi.viewCoach label inside #section-coach-kpi');

    // Ratings view-switcher stays — it's a separate feature.
    assert(/aria-label="Ratings view"/.test(HTML),
        'Ratings view-switcher (separate feature) is still present');
    assert(/data-ratings-view="main"/.test(HTML),
        'Ratings main pill remains wired');
})();

// ── Role-based default view: admin → school panel visible ────────────────────
console.log('\n=== admin → school panel visible, branch + coach hidden ==============\n');
(function testAdminLandsOnSchool() {
    const dom = makePanelDom();
    const mod = loadModule({ document: dom, window: {} });

    mod.initCoachKpi({ isAdmin: true }, {});

    assert(!dom.panels.school.hasAttribute('hidden'),
        'admin: school panel visible after init');
    assert(dom.panels.school.classList.contains('is-active'),
        'admin: school panel carries is-active');
    assert(dom.panels.branch.hasAttribute('hidden'),
        'admin: branch panel hidden after init');
    assert(!dom.panels.branch.classList.contains('is-active'),
        'admin: branch panel does NOT carry is-active');
    assert(dom.panels.coach.hasAttribute('hidden'),
        'admin: coach panel hidden after init');
    assert(!dom.panels.coach.classList.contains('is-active'),
        'admin: coach panel does NOT carry is-active');
})();

// ── Role-based default view: locked coach → coach panel visible ─────────────
console.log('\n=== locked coach → coach panel visible, school + branch hidden =======\n');
(function testCoachLandsOnCoach() {
    const dom = makePanelDom();
    const mod = loadModule({ document: dom, window: {} });

    mod.initCoachKpi({ isAdmin: false, isCoach: true, coachId: 'CO-1' }, {});

    assert(dom.panels.school.hasAttribute('hidden'),
        'locked coach: school panel hidden after init');
    assert(!dom.panels.school.classList.contains('is-active'),
        'locked coach: school panel does NOT carry is-active');
    assert(dom.panels.branch.hasAttribute('hidden'),
        'locked coach: branch panel hidden after init');
    assert(!dom.panels.coach.hasAttribute('hidden'),
        'locked coach: coach panel visible after init');
    assert(dom.panels.coach.classList.contains('is-active'),
        'locked coach: coach panel carries is-active');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
