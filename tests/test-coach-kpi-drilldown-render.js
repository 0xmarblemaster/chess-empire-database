/**
 * Tests for renderDrilldown() — one render per metric, assert the column
 * contract is correct and the variant color class lands on the headline
 * metric cell.
 *
 * The render path uses the same _el-based mount pattern as renderLeaderboard,
 * so we mock just enough DOM to walk the result tree.
 *
 * Run: node tests/test-coach-kpi-drilldown-render.js
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
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(n, v) { this.attributes[n] = v; },
        removeAttribute(n) { delete this.attributes[n]; },
        addEventListener() {},
    };
}

function makeDom() {
    return {
        createElement(tag) { return makeMockEl(tag); },
    };
}

function loadModule() {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = makeDom();
    return require(modulePath);
}

function findAll(root, predicate) {
    const out = [];
    function walk(node) {
        if (!node) return;
        if (predicate(node)) out.push(node);
        for (const c of (node.children || [])) walk(c);
    }
    walk(root);
    return out;
}

const kpi = loadModule();

console.log('\n=== smoke: render API exists ==========================================\n');
assert(typeof kpi.renderDrilldown === 'function', 'renderDrilldown exported');
assert(typeof kpi.renderDrilldownHeader === 'function', 'renderDrilldownHeader exported');
assertEqual(Object.keys(kpi.METRIC_TO_VARIANT).sort(),
    ['active_players', 'new_razryads', 'promotions', 'top3'],
    'METRIC_TO_VARIANT covers exactly the 4 drillable metrics');

console.log('\n=== metric=active_players column contract + variant cell =============\n');
{
    const container = makeMockEl('div');
    container.id = 'host';
    const rows = [
        { student_id: 'S1', first_name: 'Daulet', last_name: 'A', branch_name: 'Almaty', coach_name: 'C', league: 'C', razryad: '4th', games_played: 12, tournaments_played: 2, rating_delta_total: 30 },
        { student_id: 'S2', first_name: 'Aigerim', last_name: 'B', branch_name: 'Almaty', coach_name: 'C', league: 'B', razryad: 'none', games_played: 6, tournaments_played: 1, rating_delta_total: -5 },
    ];
    kpi.renderDrilldown(container, 'active_players', rows, { window: '90d' });

    const tables = findAll(container, n => n.tagName === 'table');
    assertEqual(tables.length, 1, 'one table rendered');
    const table = tables[0];
    assert(/kpi-leaderboard/.test(table.className), 'table uses kpi-leaderboard class (alias)');
    assert(/kpi-drilldown-table/.test(table.className), 'table also carries kpi-drilldown-table class');

    const headerCells = findAll(table, n => n.tagName === 'th').map(n => n.textContent);
    assertEqual(headerCells,
        ['Student', 'Branch', 'Coach', 'League', 'Razryad', 'Games', 'Tournaments', 'Rating Δ'],
        'active_players columns match contract');

    const bodyRows = findAll(table, n => n.tagName === 'tr' && (n.children || []).some(c => c.tagName === 'td'));
    assertEqual(bodyRows.length, 2, 'two body rows');
    const strongCells = findAll(table, n => n.tagName === 'td' && /metric-cell-strong/.test(n.className));
    assertEqual(strongCells.length, 2, 'one variant-colored metric cell per row');
    assert(strongCells.every(c => /variant-active-players/.test(c.className)),
        'variant-active-players class on every metric-strong cell');
    assertEqual(strongCells.map(c => c.textContent), ['2', '1'],
        'metric-strong cell carries the tournaments_played count (the headline metric)');
}

console.log('\n=== metric=top3 column contract + variant cell =======================\n');
{
    const container = makeMockEl('div');
    const rows = [
        { tournament_id: 'T1', tournament_name: 'League C (2026-04-01)', occurred_at: '2026-04-01', placement: 1, student_id: 'S1', first_name: 'Daulet', last_name: 'A', coach_name: 'C', branch_name: 'Almaty' },
        { tournament_id: 'T2', tournament_name: 'League C (2026-04-08)', occurred_at: '2026-04-08', placement: 3, student_id: 'S1', first_name: 'Daulet', last_name: 'A', coach_name: 'C', branch_name: 'Almaty' },
    ];
    kpi.renderDrilldown(container, 'top3', rows, { window: '90d' });
    const table = findAll(container, n => n.tagName === 'table')[0];
    const headerCells = findAll(table, n => n.tagName === 'th').map(n => n.textContent);
    assertEqual(headerCells,
        ['Date', 'Tournament', 'Student', 'Branch', 'Coach', 'Placement'],
        'top3 columns match contract');
    const strongCells = findAll(table, n => n.tagName === 'td' && /metric-cell-strong/.test(n.className));
    assertEqual(strongCells.length, 2, 'one variant cell per row');
    assert(strongCells.every(c => /variant-top3/.test(c.className)),
        'variant-top3 class on every metric-strong cell');
    assertEqual(strongCells.map(c => c.textContent), ['1', '3'],
        'metric-strong cell carries placement');
}

console.log('\n=== metric=new_razryads column contract + variant cell ===============\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'Daulet', last_name: 'A', coach_name: 'C', branch_name: 'Almaty', old_razryad: 'none', new_razryad: '4', earned_at: '2026-05-02', tournament_name: '4th Razryad Qualifier (2026-05-02)' },
    ];
    kpi.renderDrilldown(container, 'new_razryads', rows, { window: '90d' });
    const table = findAll(container, n => n.tagName === 'table')[0];
    const headerCells = findAll(table, n => n.tagName === 'th').map(n => n.textContent);
    assertEqual(headerCells,
        ['Student', 'Branch', 'Coach', 'Old razryad', 'New razryad', 'Earned', 'Tournament'],
        'new_razryads columns match contract');
    const strongCells = findAll(table, n => n.tagName === 'td' && /metric-cell-strong/.test(n.className));
    assertEqual(strongCells.length, 1, 'one variant cell per row');
    assert(/variant-razryads/.test(strongCells[0].className),
        'variant-razryads class on metric-strong cell');
    assertEqual(strongCells[0].textContent, '4', 'metric-strong cell carries new_razryad value');
}

console.log('\n=== metric=promotions column contract + variant cell =================\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'Daulet', last_name: 'A', coach_name: 'C', branch_name: 'Almaty', from_league: 'B', to_league: 'A', occurred_at: '2026-04-25T00:00:00Z' },
        { student_id: 'S2', first_name: 'Aigerim', last_name: 'B', coach_name: 'C', branch_name: 'Almaty', from_league: 'C', to_league: 'B', occurred_at: '2026-04-12T00:00:00Z' },
    ];
    kpi.renderDrilldown(container, 'promotions', rows, { window: '90d' });
    const table = findAll(container, n => n.tagName === 'table')[0];
    const headerCells = findAll(table, n => n.tagName === 'th').map(n => n.textContent);
    assertEqual(headerCells,
        ['Student', 'Branch', 'Coach', 'From', 'To', 'Promoted'],
        'promotions columns match contract');
    const strongCells = findAll(table, n => n.tagName === 'td' && /metric-cell-strong/.test(n.className));
    assertEqual(strongCells.length, 2, 'one variant cell per row');
    assert(strongCells.every(c => /variant-promotions/.test(c.className)),
        'variant-promotions class on every metric-strong cell');
    assertEqual(strongCells.map(c => c.textContent), ['A', 'B'],
        'metric-strong cell carries to_league value');
}

console.log('\n=== empty students list falls through to empty state ==================\n');
{
    const container = makeMockEl('div');
    kpi.renderDrilldown(container, 'active_players', [], { window: '90d' });
    const emptyCards = findAll(container, n => /kpi-empty-state/.test(n.className || ''));
    assert(emptyCards.length > 0, 'empty list renders empty state (no broken table)');
}

console.log('\n=== drilldown header renders back button + variant title + count ======\n');
{
    const container = makeMockEl('div');
    kpi.renderDrilldownHeader(container, 'top3', 5, { onBack: () => {} });
    const back = findAll(container, n => /kpi-drilldown-back/.test(n.className || ''));
    assertEqual(back.length, 1, 'back button rendered');
    const title = findAll(container, n => /kpi-drilldown-title/.test(n.className || ''));
    assertEqual(title.length, 1, 'title rendered');
    assert(/variant-top3/.test(title[0].className), 'title carries variant-top3 class for color');
    const count = findAll(container, n => /kpi-drilldown-count/.test(n.className || ''));
    assertEqual(count.length, 1, 'count badge rendered');
    assert(/5/.test(count[0].textContent), 'count badge shows 5');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
