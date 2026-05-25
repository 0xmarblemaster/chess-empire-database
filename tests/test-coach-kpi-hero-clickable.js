/**
 * Tests for clickable hero cards on the Coach Effectiveness dashboard.
 *
 * Contract: the 4 drillable cards (active-players, top3, razryads, promotions)
 * MUST carry role="button" + tabindex="0" + .is-clickable + a click handler
 * AND a keydown handler that fires on Enter/Space. The 3 non-drillable cards
 * (active-students, participation, tournaments) MUST NOT carry any of those.
 *
 * Run: node tests/test-coach-kpi-hero-clickable.js
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

function makeMockEl(tag) {
    return {
        tagName: tag,
        children: [],
        attributes: {},
        dataset: {},
        className: '',
        textContent: '',
        _innerHTML: '',
        _listeners: {},
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(n, v) { this.attributes[n] = v; },
        removeAttribute(n) { delete this.attributes[n]; },
        addEventListener(n, fn) { (this._listeners[n] = this._listeners[n] || []).push(fn); },
        dispatch(n, e) { for (const fn of (this._listeners[n] || [])) fn(e); },
    };
}

function loadModule() {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = { createElement(tag) { return makeMockEl(tag); } };
    return require(modulePath);
}

const kpi = loadModule();

const SUMMARY = {
    active_students_count: 50,
    active_players_count: 30,
    participation_pct: 60,
    top3_count: 8,
    new_razryads_count: 4,
    promotions_count: 6,
    total_tournaments: 5,
};

function renderAndCollect(onCardClick) {
    const container = makeMockEl('div');
    kpi.renderSchoolHero(container, SUMMARY, onCardClick ? { onCardClick } : {});
    const cards = (container.children || []).filter(c => /kpi-hero-card/.test(c.className || ''));
    const byVariant = {};
    for (const c of cards) {
        const m = /variant-([a-z0-9-]+)/.exec(c.className || '');
        if (m) byVariant[m[1]] = c;
    }
    return { container, cards, byVariant };
}

console.log('\n=== smoke: all 7 hero cards rendered ==================================\n');
{
    const { cards, byVariant } = renderAndCollect(() => {});
    assertEqual(cards.length, 7, '7 hero cards rendered');
    for (const v of ['active-students', 'active-players', 'participation', 'top3', 'razryads', 'promotions', 'tournaments']) {
        assert(byVariant[v], `card variant-${v} present`);
    }
}

console.log('\n=== 4 drillable cards carry role=button + tabindex=0 + is-clickable ===\n');
{
    const { byVariant } = renderAndCollect(() => {});
    const DRILLABLE = ['active-players', 'top3', 'razryads', 'promotions'];
    for (const v of DRILLABLE) {
        const c = byVariant[v];
        assert(c, `card variant-${v} exists`);
        if (!c) continue;
        assert(/\bis-clickable\b/.test(c.className), `variant-${v}: is-clickable class present`);
        assertEqual(c.attributes.role, 'button', `variant-${v}: role="button" attribute`);
        assertEqual(c.attributes.tabindex, '0', `variant-${v}: tabindex="0" attribute`);
        assert(c.dataset.metric, `variant-${v}: data-metric set on card`);
        assert(Array.isArray(c._listeners.click) && c._listeners.click.length > 0,
            `variant-${v}: click handler attached`);
        assert(Array.isArray(c._listeners.keydown) && c._listeners.keydown.length > 0,
            `variant-${v}: keydown handler attached`);
    }
}

console.log('\n=== 3 NON-drillable cards have NO clickable affordance ===============\n');
{
    const { byVariant } = renderAndCollect(() => {});
    const NON_DRILLABLE = ['active-students', 'participation', 'tournaments'];
    for (const v of NON_DRILLABLE) {
        const c = byVariant[v];
        assert(c, `card variant-${v} exists`);
        if (!c) continue;
        assert(!/\bis-clickable\b/.test(c.className), `variant-${v}: NO is-clickable class`);
        assert(c.attributes.role !== 'button', `variant-${v}: NO role="button" attribute`);
        assert(c.attributes.tabindex !== '0', `variant-${v}: NO tabindex="0" attribute`);
        assert(!c._listeners.click || c._listeners.click.length === 0,
            `variant-${v}: NO click handler`);
        assert(!c._listeners.keydown || c._listeners.keydown.length === 0,
            `variant-${v}: NO keydown handler`);
    }
}

console.log('\n=== click fires onCardClick with the correct metric name =============\n');
{
    const calls = [];
    const { byVariant } = renderAndCollect((metric) => calls.push(metric));
    byVariant['active-players'].dispatch('click', {});
    byVariant['top3'].dispatch('click', {});
    byVariant['razryads'].dispatch('click', {});
    byVariant['promotions'].dispatch('click', {});
    assertEqual(calls, ['active_players', 'top3', 'new_razryads', 'promotions'],
        'click on each card fires onCardClick with the metric name (not the variant)');
}

console.log('\n=== Enter and Space keys both trigger onCardClick =====================\n');
{
    const calls = [];
    const { byVariant } = renderAndCollect((metric) => calls.push(metric));
    byVariant['active-players'].dispatch('keydown', { key: 'Enter', preventDefault: () => {} });
    byVariant['top3'].dispatch('keydown', { key: ' ', preventDefault: () => {} });
    byVariant['razryads'].dispatch('keydown', { keyCode: 13, preventDefault: () => {} });
    byVariant['promotions'].dispatch('keydown', { keyCode: 32, preventDefault: () => {} });
    assertEqual(calls, ['active_players', 'top3', 'new_razryads', 'promotions'],
        'Enter (key/keyCode) and Space (key/keyCode) both trigger drilldown');
    // Other keys do NOT trigger.
    const before = calls.length;
    byVariant['active-players'].dispatch('keydown', { key: 'Tab', preventDefault: () => {} });
    byVariant['active-players'].dispatch('keydown', { key: 'a', preventDefault: () => {} });
    assertEqual(calls.length, before, 'unrelated keys do NOT fire onCardClick');
}

console.log('\n=== absent onCardClick → cards stay inert (no attrs, no handlers) =====\n');
{
    const { byVariant } = renderAndCollect(null);
    for (const v of ['active-players', 'top3', 'razryads', 'promotions']) {
        const c = byVariant[v];
        assert(!/\bis-clickable\b/.test(c.className),
            `variant-${v}: without onCardClick, no is-clickable class`);
        assert(c.attributes.role !== 'button',
            `variant-${v}: without onCardClick, no role=button`);
        assert(!c._listeners.click || c._listeners.click.length === 0,
            `variant-${v}: without onCardClick, no click handler`);
    }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
