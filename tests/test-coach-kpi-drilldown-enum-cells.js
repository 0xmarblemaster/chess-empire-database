/**
 * Tests that renderDrilldown translates league + razryad enum cells through
 * the existing coachKpiLeague* / coachKpiRazryad* lookup keys — the same
 * keys the filter dropdown uses. Before the i18n sweep these cells rendered
 * the raw DB enum ("A" / "kms"); the dashboard now reads "Лига A" / "КМС"
 * in a Russian session.
 *
 * Run: node tests/test-coach-kpi-drilldown-enum-cells.js
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

// Stub the production i18n dictionary for the keys the drilldown consults.
// Keeping this in-line (rather than loading i18n.js) so a translation drift
// in i18n.js is caught by test-coach-kpi-i18n-drilldown-keys.js — this test
// only verifies the renderer's lookup wiring, not the strings themselves.
const RU = {
    coachKpiLeagueA: 'Лига A',
    coachKpiLeagueB: 'Лига B',
    coachKpiLeagueC: 'Лига C',
    coachKpiRazryadKMS: 'КМС',
    coachKpiRazryad1st: '1-й разряд',
    coachKpiRazryad2nd: '2-й разряд',
    coachKpiRazryad3rd: '3-й разряд',
    coachKpiRazryad4th: '4-й разряд',
    coachKpiRazryadNone: 'Нет',
};
const ruT = (key, fb) => Object.prototype.hasOwnProperty.call(RU, key) ? RU[key] : fb;

const kpi = loadKpi();

console.log('\n=== active_players drilldown localizes league + razryad cells (ru) ===\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'A', last_name: 'A', branch_name: 'Almaty', coach_name: 'Coach',
          league: 'A', razryad: 'kms', games_played: 12, tournaments_played: 2, rating_delta_total: 30 },
        { student_id: 'S2', first_name: 'B', last_name: 'B', branch_name: 'Almaty', coach_name: 'Coach',
          league: 'B', razryad: '1st', games_played: 8, tournaments_played: 1, rating_delta_total: 5 },
        { student_id: 'S3', first_name: 'C', last_name: 'C', branch_name: 'Almaty', coach_name: 'Coach',
          league: 'C', razryad: '4th', games_played: 4, tournaments_played: 1, rating_delta_total: 0 },
    ];
    kpi.renderDrilldown(container, 'active_players', rows, { window: '90d' }, { t: ruT });

    const tds = findAll(container, n => n.tagName === 'td');
    // Cell layout per row (active_players):
    //   0:Student 1:Branch 2:Coach 3:League 4:Razryad 5:Games 6:Tournaments 7:Δ
    const leagueCells = [tds[3].textContent, tds[11].textContent, tds[19].textContent];
    const razryadCells = [tds[4].textContent, tds[12].textContent, tds[20].textContent];
    assertEqual(leagueCells, ['Лига A', 'Лига B', 'Лига C'],
        'league cells localized via coachKpiLeague{A,B,C}');
    assertEqual(razryadCells, ['КМС', '1-й разряд', '4-й разряд'],
        'razryad cells localized via coachKpiRazryad{KMS,1st,4th}');
    // The raw enum values must NOT appear.
    assert(!leagueCells.includes('A'), 'no raw "A" league cell');
    assert(!razryadCells.includes('kms'), 'no raw "kms" razryad cell');
    assert(!razryadCells.includes('1st'), 'no raw "1st" razryad cell');
}

console.log('\n=== new_razryads drilldown localizes old/new razryad cells (ru) ======\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'A', last_name: 'A', branch_name: 'B', coach_name: 'C',
          old_razryad: 'none', new_razryad: '4th', earned_at: '2026-05-02', tournament_name: 'T' },
        { student_id: 'S2', first_name: 'B', last_name: 'B', branch_name: 'B', coach_name: 'C',
          old_razryad: '3rd',  new_razryad: '2nd', earned_at: '2026-05-04', tournament_name: 'T' },
    ];
    kpi.renderDrilldown(container, 'new_razryads', rows, { window: '90d' }, { t: ruT });

    const tds = findAll(container, n => n.tagName === 'td');
    // 0:Student 1:Branch 2:Coach 3:Old 4:New 5:Earned 6:Tournament
    const oldCells = [tds[3].textContent, tds[10].textContent];
    const newCells = [tds[4].textContent, tds[11].textContent];
    assertEqual(oldCells, ['Нет', '3-й разряд'],
        'old_razryad cells localized via coachKpiRazryad{None,3rd}');
    assertEqual(newCells, ['4-й разряд', '2-й разряд'],
        'new_razryad cells localized via coachKpiRazryad{4th,2nd}');
}

console.log('\n=== promotions drilldown localizes from/to league cells (ru) =========\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'A', last_name: 'A', branch_name: 'B', coach_name: 'C',
          from_league: 'B', to_league: 'A', occurred_at: '2026-04-25' },
        { student_id: 'S2', first_name: 'B', last_name: 'B', branch_name: 'B', coach_name: 'C',
          from_league: 'C', to_league: 'B', occurred_at: '2026-04-12' },
    ];
    kpi.renderDrilldown(container, 'promotions', rows, { window: '90d' }, { t: ruT });

    const tds = findAll(container, n => n.tagName === 'td');
    // 0:Student 1:Branch 2:Coach 3:From 4:To 5:Promoted
    const fromCells = [tds[3].textContent, tds[9].textContent];
    const toCells = [tds[4].textContent, tds[10].textContent];
    assertEqual(fromCells, ['Лига B', 'Лига C'], 'from_league cells localized');
    assertEqual(toCells, ['Лига A', 'Лига B'], 'to_league cells localized');
}

console.log('\n=== english fallback still works when t() is not supplied ============\n');
{
    const container = makeMockEl('div');
    const rows = [
        { student_id: 'S1', first_name: 'A', last_name: 'A', branch_name: 'B', coach_name: 'C',
          league: 'A', razryad: 'kms', games_played: 1, tournaments_played: 1, rating_delta_total: 0 },
    ];
    kpi.renderDrilldown(container, 'active_players', rows, { window: '90d' });
    const tds = findAll(container, n => n.tagName === 'td');
    // The raw value is the fallback when no t() is supplied — proves the
    // renderer never strips data when i18n is unwired.
    assertEqual(tds[3].textContent, 'A', 'league cell falls back to raw value');
    assertEqual(tds[4].textContent, 'kms', 'razryad cell falls back to raw value');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
