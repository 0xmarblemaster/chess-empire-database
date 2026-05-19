/**
 * Tests for the Coach KPI dashboard visual polish.
 *
 * After the design pass that aligned the KPI dashboard with the rest of the
 * app (Students Overview / Branches), `renderFilters` wraps each control in
 * a `.filter-group` with a `<label class="filter-label">`, and
 * `renderEmptyState` mounts a proper icon + title + helper card instead of
 * a bare table row.
 *
 * Asserts:
 *   - renderFilters mounts `.kpi-filter-window` segmented control
 *   - renderFilters marks the active window pill with `.is-active`
 *   - renderFilters wraps the league / branch selects in `.filter-group`
 *     blocks with a `<label class="filter-label">` above each control
 *   - renderEmptyState mounts a `.kpi-empty-state` card with an icon,
 *     title, and helper paragraph (lucide bar-chart-3)
 *
 * Run: node tests/test-coach-kpi-design-polish.js
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

function makeContainer() {
    return makeMockEl('div');
}

function makeDom() {
    return {
        createElement(tag) { return makeMockEl(tag); },
    };
}

function loadModule() {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = makeDom();
    global.window = {};
    return require(modulePath);
}

// Walk the synthetic element tree looking for a node whose className contains
// the requested token. Returns the first match (depth-first) or null.
function findByClass(root, token) {
    if (!root) return null;
    if (typeof root.className === 'string' && new RegExp(`\\b${token}\\b`).test(root.className)) {
        return root;
    }
    if (Array.isArray(root.children)) {
        for (const c of root.children) {
            const hit = findByClass(c, token);
            if (hit) return hit;
        }
    }
    return null;
}

function findAllByClass(root, token, out) {
    out = out || [];
    if (!root) return out;
    if (typeof root.className === 'string' && new RegExp(`\\b${token}\\b`).test(root.className)) {
        out.push(root);
    }
    if (Array.isArray(root.children)) {
        for (const c of root.children) findAllByClass(c, token, out);
    }
    return out;
}

function findByTag(root, tag) {
    if (!root) return null;
    if (root.tagName === tag) return root;
    if (Array.isArray(root.children)) {
        for (const c of root.children) {
            const hit = findByTag(c, tag);
            if (hit) return hit;
        }
    }
    return null;
}

console.log('\n=== renderFilters mounts the segmented window control =================\n');
(function testWindowSegmentedControl() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, {});

    const windowGroup = findByClass(container, 'kpi-filter-window');
    assert(windowGroup !== null,
        'renderFilters mounts a .kpi-filter-window segmented control');
    assert(windowGroup && windowGroup.attributes && windowGroup.attributes.role === 'tablist',
        '.kpi-filter-window carries role="tablist"');

    const pills = findAllByClass(container, 'kpi-filter-pill');
    assert(pills.length === 3,
        'renderFilters mounts one .kpi-filter-pill per preset (30d / 90d / ytd — All time dropped)');
    const pillWindows = pills.map(p => p.dataset && p.dataset.window);
    assert(!pillWindows.includes('all'),
        'no pill exposes data-window="all" (All time is no longer offered)');

    const active = findAllByClass(container, 'is-active');
    assert(active.length === 1,
        'exactly one pill is marked .is-active for the current window');
    assert(active[0] && /\bkpi-filter-pill\b/.test(active[0].className),
        '.is-active sits on a .kpi-filter-pill (not on a different control)');
    assert(active[0] && active[0].dataset && active[0].dataset.window === '90d',
        '.is-active marks the 90d pill when state.window = "90d"');
})();

console.log('\n=== renderFilters re-marks .is-active when the selection changes =====\n');
(function testActivePillFollowsState() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderFilters(container, { window: '30d', league: 'all', branchId: 'all' }, {});
    const active = findAllByClass(container, 'is-active');
    assert(active.length === 1 && active[0].dataset.window === '30d',
        '.is-active pill follows state.window = "30d"');
})();

console.log('\n=== renderFilters wraps each control in a .filter-group + label =======\n');
(function testFilterGroupWrapping() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, {});

    const groups = findAllByClass(container, 'filter-group');
    assert(groups.length === 3,
        'renderFilters mounts three .filter-group blocks (window / league / branch)');

    const labels = findAllByClass(container, 'filter-label');
    assert(labels.length === 3,
        'each filter group carries a <label class="filter-label">');
    for (const lbl of labels) {
        assert(lbl.tagName === 'label',
            '.filter-label is rendered as a <label> element');
    }

    // The window-group .filter-group must contain the segmented control.
    const windowGroupWrapper = groups.find(g => findByClass(g, 'kpi-filter-window'));
    assert(windowGroupWrapper !== undefined,
        'one .filter-group wraps the .kpi-filter-window control');

    // i18n fallbacks — when no t() is provided, English fallbacks are used.
    const labelTexts = labels.map(l => l.textContent);
    assert(labelTexts.includes('Time window'),
        'window-group label falls back to "Time window" when i18n missing');
    assert(labelTexts.includes('League'),
        'league-group label falls back to "League" when i18n missing');
    assert(labelTexts.includes('Branch'),
        'branch-group label falls back to "Branch" when i18n missing');
})();

console.log('\n=== renderFilters honors i18n keys when t() is supplied ==============\n');
(function testFilterLabelsUseI18n() {
    const kpi = loadModule();
    const container = makeContainer();
    const calls = [];
    const t = (key, fb) => {
        calls.push(key);
        const map = {
            coachKpiWindowGroup: 'Период',
            coachKpiLeagueGroup: 'Лига',
            coachKpiBranchGroup: 'Филиал',
        };
        return map[key] || fb;
    };
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, { t });

    const labels = findAllByClass(container, 'filter-label').map(l => l.textContent);
    assert(labels.includes('Период'),
        'window label resolves via coachKpiWindowGroup when t() returns a value');
    assert(labels.includes('Лига'),
        'league label resolves via coachKpiLeagueGroup when t() returns a value');
    assert(labels.includes('Филиал'),
        'branch label resolves via coachKpiBranchGroup when t() returns a value');
})();

console.log('\n=== renderEmptyState mounts the polished card ========================\n');
(function testEmptyStateCard() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderEmptyState(container);

    const card = findByClass(container, 'kpi-empty-state');
    assert(card !== null,
        'renderEmptyState mounts a .kpi-empty-state card');
    assert(card && /\bempty-state\b/.test(card.className),
        'card keeps the legacy .empty-state class (back-compat with init tests)');
    assert(card && card.attributes && card.attributes.role === 'status',
        'card carries role="status" so screen readers announce it');

    const icon = findByClass(container, 'kpi-empty-icon');
    assert(icon !== null,
        '.kpi-empty-icon wrapper exists for the lucide glyph');
    const iconChild = icon && icon.children && icon.children[0];
    assert(iconChild && iconChild.tagName === 'i'
        && iconChild.attributes && iconChild.attributes['data-lucide'] === 'bar-chart-3',
        'icon mounts a <i data-lucide="bar-chart-3"> so lucide.replaceAll() can paint it');

    const title = findByClass(container, 'kpi-empty-title');
    assert(title !== null && typeof title.textContent === 'string' && title.textContent.length > 0,
        '.kpi-empty-title is mounted with non-empty text');

    const helper = findByClass(container, 'kpi-empty-helper');
    assert(helper !== null && helper.tagName === 'p',
        '.kpi-empty-helper is a <p> paragraph');
    assert(helper && typeof helper.textContent === 'string' && helper.textContent.length > 0,
        '.kpi-empty-helper carries the explanatory copy');
})();

console.log('\n=== renderEmptyState back-compat: positional message → helper text ===\n');
(function testEmptyStateLegacyMessage() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderEmptyState(container, 'Chart.js not loaded');

    const helper = findByClass(container, 'kpi-empty-helper');
    assert(helper !== null,
        '.kpi-empty-helper still mounts when a positional message is passed');
    assert(helper && helper.textContent === 'Chart.js not loaded',
        'positional message lands in the helper paragraph (legacy callers preserved)');
})();

console.log('\n=== renderEmptyState honors opts.t for the default title/helper ======\n');
(function testEmptyStateI18n() {
    const kpi = loadModule();
    const container = makeContainer();
    kpi.renderEmptyState(container, undefined, {
        t: (key, fb) => key === 'coachKpiEmptyTitle' ? 'Нет данных'
            : key === 'coachKpiEmptyState' ? 'Данные ещё недоступны'
            : fb,
    });
    const title = findByClass(container, 'kpi-empty-title');
    const helper = findByClass(container, 'kpi-empty-helper');
    assert(title && title.textContent === 'Нет данных',
        'opts.t resolves the title via coachKpiEmptyTitle');
    assert(helper && helper.textContent === 'Данные ещё недоступны',
        'opts.t resolves the helper via coachKpiEmptyState when no positional message');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
