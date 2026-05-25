/**
 * Tests that the drilldown table renders dates in the numeric DD.MM.YYYY
 * format across all locales. Spec call (Q2: b) — keep dates locale-neutral
 * so we don't need to translate month names per language.
 *
 * Run: node tests/test-coach-kpi-drilldown-date-format.js
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

function loadKpi() {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = { createElement: makeMockEl };
    global.window = {};
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

const kpi = loadKpi();

console.log('\n=== formatDrilldownDate produces DD.MM.YYYY for ISO date strings =====\n');
assertEqual(kpi.formatDrilldownDate('2026-03-15'), '15.03.2026',
    'ISO yyyy-mm-dd → DD.MM.YYYY');
assertEqual(kpi.formatDrilldownDate('2026-04-25T00:00:00Z'), '25.04.2026',
    'ISO with timestamp → DD.MM.YYYY (timezone-stable via UTC)');
assertEqual(kpi.formatDrilldownDate('2026-12-01'), '01.12.2026',
    'single-digit month/day are zero-padded');
assertEqual(kpi.formatDrilldownDate(null), '—',
    'null → em-dash placeholder');
assertEqual(kpi.formatDrilldownDate(undefined), '—',
    'undefined → em-dash placeholder');
assertEqual(kpi.formatDrilldownDate(''), '—',
    'empty string → em-dash placeholder');
assertEqual(kpi.formatDrilldownDate('not-a-date'), 'not-a-date',
    'invalid string → raw input fallback');

console.log('\n=== top3 drilldown row renders occurred_at via formatDrilldownDate ===\n');
{
    const container = makeMockEl('div');
    const rows = [
        { tournament_id: 'T1', tournament_name: 'L', occurred_at: '2026-03-15', placement: 1,
          student_id: 'S', first_name: 'A', last_name: 'A', coach_name: 'C', branch_name: 'B' },
    ];
    kpi.renderDrilldown(container, 'top3', rows, { window: '90d' });
    const tds = findAll(container, n => n.tagName === 'td');
    // 0:Date 1:Tournament 2:Student 3:Branch 4:Coach 5:Placement
    assertEqual(tds[0].textContent, '15.03.2026',
        'top3 occurred_at column renders DD.MM.YYYY');
}

console.log('\n=== new_razryads drilldown row renders earned_at via formatDrilldownDate ==\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S', first_name: 'A', last_name: 'A', branch_name: 'B', coach_name: 'C',
          old_razryad: 'none', new_razryad: '4th', earned_at: '2026-05-02', tournament_name: 'T' },
    ];
    kpi.renderDrilldown(container, 'new_razryads', rows, { window: '90d' });
    const tds = findAll(container, n => n.tagName === 'td');
    // 0:Student 1:Branch 2:Coach 3:Old 4:New 5:Earned 6:Tournament
    assertEqual(tds[5].textContent, '02.05.2026',
        'new_razryads earned_at column renders DD.MM.YYYY');
}

console.log('\n=== promotions drilldown row renders occurred_at via formatDrilldownDate ==\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S', first_name: 'A', last_name: 'A', branch_name: 'B', coach_name: 'C',
          from_league: 'B', to_league: 'A', occurred_at: '2026-04-25T00:00:00Z' },
    ];
    kpi.renderDrilldown(container, 'promotions', rows, { window: '90d' });
    const tds = findAll(container, n => n.tagName === 'td');
    // 0:Student 1:Branch 2:Coach 3:From 4:To 5:Promoted
    assertEqual(tds[5].textContent, '25.04.2026',
        'promotions occurred_at column renders DD.MM.YYYY');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
