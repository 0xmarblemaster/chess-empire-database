/**
 * Tests for coach-kpi.js — pure helpers, query builder, and fetch wrapper for
 * the Coach Performance dashboard (PRD_COACH_KPI.md, Phase 2).
 *
 * Run: node tests/test-coach-kpi.js
 */

const kpi = require('../coach-kpi.js');

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

const COACH = { isAdmin: false, coachId: 'coach-uuid-1' };
const ADMIN = { isAdmin: true, coachId: null };
const ANON  = { isAdmin: false, coachId: null };

const COACHES = [
    { id: 'coach-uuid-1', branchNames: ['Nish', 'Halyk Arena'] },
    { id: 'coach-uuid-2', branchNames: ['Debut'] },
];

console.log('\n=== smoke: API surface ================================================\n');
const apiNames = [
    'resolveTimeWindow', 'scoreColor', 'formatScore', 'formatHeroValue',
    'sortLeaderboard', 'filterLeaderboardByBranch', 'aggregateSchoolHero',
    'defaultFilterState', 'normalizeFilters',
    'buildKpiQuery', 'callKpiEndpoint', 'isKpiEmpty', 'fetchView',
    'loadDashboard', 'renderEmptyState', 'renderSchoolHero', 'renderLeaderboard',
    'renderFilters',
];
for (const name of apiNames) {
    assert(typeof kpi[name] === 'function', `${name} exported`);
}
assertEqual(kpi.TIME_WINDOWS, ['30d', '90d', 'ytd'], 'TIME_WINDOWS exported (no "all" — dropped Phase 2)');
assertEqual(kpi.DEFAULT_WINDOW, '90d', 'DEFAULT_WINDOW = 90d');
assertEqual(kpi.LEAGUES, ['all', 'B', 'C'],
    'LEAGUES exported (no League A — retired from internal tournament rotation)');
assertEqual(kpi.DEFAULT_LEAGUE, 'all', 'DEFAULT_LEAGUE = all');
assertEqual(kpi.DEFAULT_BRANCH, 'all', 'DEFAULT_BRANCH = all');
assertEqual(kpi.SCORE_THRESHOLDS, { red: 40, amber: 70 }, 'SCORE_THRESHOLDS exported');

console.log('\n=== resolveTimeWindow =================================================\n');
// Pin "now" to 2026-05-14 to keep the math deterministic.
const NOW = new Date(Date.UTC(2026, 4, 14, 12, 0, 0));

assertEqual(kpi.resolveTimeWindow('30d', NOW),
    { start: '2026-04-15', end: '2026-05-14', days: 30, preset: '30d' },
    '30d: last 30 days inclusive');
assertEqual(kpi.resolveTimeWindow('90d', NOW),
    { start: '2026-02-14', end: '2026-05-14', days: 90, preset: '90d' },
    '90d: last 90 days inclusive');
assertEqual(kpi.resolveTimeWindow('ytd', NOW),
    { start: '2026-01-01', end: '2026-05-14', days: 134, preset: 'ytd' },
    'ytd: Jan 1 of current year through today');
assertEqual(kpi.resolveTimeWindow('all', NOW).preset, '90d',
    'unsupported "all" preset → falls back to 90d default (All time was dropped Phase 2)');
assertEqual(kpi.resolveTimeWindow(undefined, NOW).preset, '90d',
    'undefined preset → default 90d');
assertEqual(kpi.resolveTimeWindow('bogus', NOW).preset, '90d',
    'unknown preset → default 90d');
assert(typeof kpi.resolveTimeWindow('30d').end === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(kpi.resolveTimeWindow('30d').end),
    'no `now` arg: end is a YYYY-MM-DD string');

console.log('\n=== scoreColor (PRD §4 thresholds) ====================================\n');
assertEqual(kpi.scoreColor(0),   'red',   '0 → red');
assertEqual(kpi.scoreColor(39),  'red',   '39 → red (just below 40)');
assertEqual(kpi.scoreColor(40),  'amber', '40 → amber (lower bound inclusive)');
assertEqual(kpi.scoreColor(55),  'amber', '55 → amber');
assertEqual(kpi.scoreColor(70),  'amber', '70 → amber (upper bound inclusive)');
assertEqual(kpi.scoreColor(70.5),'green', '70.5 → green (just above amber)');
assertEqual(kpi.scoreColor(100), 'green', '100 → green');
assertEqual(kpi.scoreColor(NaN),       'red', 'NaN → red (defensive)');
assertEqual(kpi.scoreColor(undefined), 'red', 'undefined → red (missing score never reads as success)');
assertEqual(kpi.scoreColor(null),      'red', 'null → red');
assertEqual(kpi.scoreColor('70'),      'red', 'string → red (no implicit coercion)');

console.log('\n=== formatScore =======================================================\n');
assertEqual(kpi.formatScore(0),    '0',   '0 → "0"');
assertEqual(kpi.formatScore(42.7), '43',  '42.7 → "43" (rounded)');
assertEqual(kpi.formatScore(100),  '100', '100 → "100"');
assertEqual(kpi.formatScore(150),  '100', '>100 clamped to 100');
assertEqual(kpi.formatScore(-5),   '0',   'negative clamped to 0');
assertEqual(kpi.formatScore(null), '—',   'null → em-dash');
assertEqual(kpi.formatScore(NaN),  '—',   'NaN → em-dash');

console.log('\n=== formatHeroValue ===================================================\n');
assertEqual(kpi.formatHeroValue(null),      '—',  'null → em-dash');
assertEqual(kpi.formatHeroValue(undefined), '—',  'undefined → em-dash');
assertEqual(kpi.formatHeroValue(''),        '—',  'empty string → em-dash');
assertEqual(kpi.formatHeroValue(0),         '0',  '0 stays 0 (not em-dash)');
assertEqual(kpi.formatHeroValue(42),        '42', 'plain integer');
assertEqual(kpi.formatHeroValue(3.14159),   '3.14', 'float rounded to 2dp');
assertEqual(kpi.formatHeroValue(75, { percent: true }), '75%', 'percent: trailing %');
assertEqual(kpi.formatHeroValue(75.5, { percent: true }), '75.5%', 'percent: 1dp rounding');
assertEqual(kpi.formatHeroValue(120, { signed: true }), '+120', 'signed: positive prepends +');
assertEqual(kpi.formatHeroValue(-12, { signed: true }), '-12', 'signed: negative passes through');
assertEqual(kpi.formatHeroValue(0,   { signed: true }), '0',    'signed: 0 has no sign');
assertEqual(kpi.formatHeroValue(NaN), '—', 'NaN → em-dash');
assertEqual(kpi.formatHeroValue('Aibek'), 'Aibek', 'string passthrough');

console.log('\n=== sortLeaderboard ===================================================\n');
// total_tournaments is the default sort key after the Score column was retired.
const ROWS = [
    { coach_id: 'a', coach_name: 'Alice', total_tournaments: 5, top3_count: 4, total_rating_gained:  10, branches: ['b1'] },
    { coach_id: 'b', coach_name: 'Bob',   total_tournaments: 9, top3_count: 1, total_rating_gained: 120, branches: ['b1', 'b2'] },
    { coach_id: 'c', coach_name: 'Cara',  total_tournaments: 2, top3_count: 7, total_rating_gained: -40, branches: ['b2'] },
];

assertEqual(
    kpi.sortLeaderboard(ROWS).map(r => r.coach_id),
    ['b', 'a', 'c'],
    'default: total_tournaments desc');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'total_tournaments', 'asc').map(r => r.coach_id),
    ['c', 'a', 'b'],
    'total_tournaments asc when requested');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'top3_count').map(r => r.coach_id),
    ['c', 'a', 'b'],
    'top3_count desc by default (more is better)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'total_rating_gained').map(r => r.coach_id),
    ['b', 'a', 'c'],
    'total_rating_gained desc by default');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'coach_name').map(r => r.coach_id),
    ['a', 'b', 'c'],
    'coach_name asc by default (alphabetical, more is NOT better)');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'coach_name', 'desc').map(r => r.coach_id),
    ['c', 'b', 'a'],
    'coach_name desc when requested');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'bogus').map(r => r.coach_id),
    ['b', 'a', 'c'],
    'unknown sort key → fallback to total_tournaments desc');
assertEqual(kpi.sortLeaderboard([], 'total_tournaments'), [],
    'empty input → empty output');
assertEqual(kpi.sortLeaderboard(null, 'total_tournaments'), [],
    'null input → empty output');

// Null-handling: rows with a null sort value should sort LAST regardless of direction.
const ROWS_WITH_NULL = [
    { coach_id: 'x', total_tournaments: null },
    { coach_id: 'y', total_tournaments: 50 },
    { coach_id: 'z', total_tournaments: 10 },
];
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'total_tournaments', 'desc').map(r => r.coach_id),
    ['y', 'z', 'x'],
    'null values sort last when desc');
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'total_tournaments', 'asc').map(r => r.coach_id),
    ['z', 'y', 'x'],
    'null values still sort last when asc (never reads as best)');

// Stability: equal sort keys preserve input order.
const TIES = [
    { coach_id: 'first',  total_tournaments: 50 },
    { coach_id: 'second', total_tournaments: 50 },
    { coach_id: 'third',  total_tournaments: 50 },
];
assertEqual(
    kpi.sortLeaderboard(TIES, 'total_tournaments').map(r => r.coach_id),
    ['first', 'second', 'third'],
    'ties preserve original insertion order (stable sort)');

console.log('\n=== filterLeaderboardByBranch =========================================\n');
assertEqual(
    kpi.filterLeaderboardByBranch(ROWS, 'b1').map(r => r.coach_id),
    ['a', 'b'],
    'filter to b1 → coaches with b1 in branches');
assertEqual(
    kpi.filterLeaderboardByBranch(ROWS, 'b2').map(r => r.coach_id),
    ['b', 'c'],
    'filter to b2');
assertEqual(
    kpi.filterLeaderboardByBranch(ROWS, 'unknown'), [],
    'unknown branch → empty');
assertEqual(
    kpi.filterLeaderboardByBranch(ROWS, 'all').map(r => r.coach_id),
    ['a', 'b', 'c'],
    'branchId = "all" → input unchanged');
assertEqual(
    kpi.filterLeaderboardByBranch(ROWS, null).map(r => r.coach_id),
    ['a', 'b', 'c'],
    'null branch → input unchanged');
assertEqual(kpi.filterLeaderboardByBranch(null, 'b1'), [],
    'null rows → empty');

console.log('\n=== aggregateSchoolHero ===============================================\n');
assertEqual(kpi.aggregateSchoolHero([
    { active_students_count: 10, total_tournaments: 4, top3_count: 2, promotions_count: 1, new_razryads_count: 0 },
    { active_students_count:  6, total_tournaments: 3, top3_count: 1, promotions_count: 0, new_razryads_count: 2 },
]), {
    active_students_count: 16,
    total_tournaments:     7,
    top3_count:            3,
    promotions_count:      1,
    new_razryads_count:    2,
    // 0 entries / 16 active → 0% (no tournament_entries on the inputs)
    participation_pct:     0,
}, 'sums every numeric column (plus the participation_pct fallback key)');
assertEqual(kpi.aggregateSchoolHero([]), {
    active_students_count: 0,
    total_tournaments:     0,
    top3_count:            0,
    promotions_count:      0,
    new_razryads_count:    0,
    participation_pct:     0,
}, 'empty array → zeroed shape (no NaN/null leaks)');
assertEqual(kpi.aggregateSchoolHero(null).active_students_count, 0,
    'null input → zeroed shape (defensive)');
assertEqual(
    kpi.aggregateSchoolHero([{ active_students_count: 'oops' }]).active_students_count,
    0,
    'non-numeric column treated as 0 (never NaN)');

console.log('\n=== isKpiEmpty (empty-payload predicate) =============================\n');
// The edge function can come back null, 4xx (`success:false`), or an empty
// payload (no tournaments uploaded for the window). The predicate must catch
// all three so the renderer can fall back to a friendly "no data yet" card.
assertEqual(kpi.isKpiEmpty(null),                                       true,  'null → empty');
assertEqual(kpi.isKpiEmpty(undefined),                                  true,  'undefined → empty');
assertEqual(kpi.isKpiEmpty('not an object'),                            true,  'non-object → empty');
assertEqual(kpi.isKpiEmpty({ success: false, error: 'HTTP 404' }),      true,  '4xx envelope → empty');
assertEqual(kpi.isKpiEmpty({ success: false, error: 'HTTP 500' }),      true,  '5xx envelope → empty');
assertEqual(kpi.isKpiEmpty({ success: false, error: 'fetch unavailable' }), true, 'transport-error envelope → empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: null }),             true,  'success + null data → empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: undefined }),        true,  'success + undefined data → empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: [] }),               true,  'success + empty array → empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: {} }),               true,  'success + empty object → empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: [{ coach_id: 'x' }] }),       false, 'success + rows → not empty');
assertEqual(kpi.isKpiEmpty({ success: true,  data: { active_students_count: 0 } }), false,
    'success + zeroed hero object → not empty (zero is a real value, not absence)');

console.log('\n=== renderEmptyState (DOM stub) =======================================\n');
// Minimal DOM stub — only the surface the renderer touches:
// createElement, appendChild, className, textContent, dataset, setAttribute,
// and innerHTML="" (resets children). Setting it as a global late is fine
// because every render fn does its `typeof document === 'undefined'` check
// at call time, not at module load.
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
        addEventListener(name, fn) {
            (this._listeners[name] = this._listeners[name] || []).push(fn);
        },
        dispatch(name, event) {
            for (const fn of (this._listeners[name] || [])) fn(event);
        },
    };
}
global.document = { createElement: (tag) => makeMockEl(tag) };

function _findHelper(card) {
    // The empty-state card mounts [icon-wrapper, title, helper-paragraph];
    // walk the tree to find the .kpi-empty-helper child for back-compat tests.
    if (!card || !Array.isArray(card.children)) return null;
    for (const c of card.children) {
        if (c && typeof c.className === 'string' && /\bkpi-empty-helper\b/.test(c.className)) {
            return c;
        }
    }
    return null;
}

(function testRenderEmptyState() {
    const c = makeMockEl('div');
    kpi.renderEmptyState(c);
    assertEqual(c.children.length, 1, 'renderEmptyState mounts exactly one card');
    const card = c.children[0];
    assert(/\bstat-card\b/.test(card.className),
        'empty card carries .stat-card (reuses existing dashboard styling)');
    assert(/\bempty-state\b/.test(card.className),
        'empty card carries .empty-state modifier');
    assert(/\bkpi-empty-state\b/.test(card.className),
        'empty card carries .kpi-empty-state for the polished design');
    assertEqual(card.attributes.role, 'status',
        'empty card has role="status" for assistive tech');
    const helper = _findHelper(card);
    assert(helper && /No data yet/i.test(helper.textContent),
        'empty card shows a generic "no data yet" helper line');
    assert(helper && !/migration|036|037|038/i.test(helper.textContent),
        'empty-state copy never leaks migration filenames to end users');
})();

(function testRenderEmptyStateCustomMessage() {
    const c = makeMockEl('div');
    kpi.renderEmptyState(c, 'No tournaments in this window.');
    const helper = _findHelper(c.children[0]);
    assertEqual(helper && helper.textContent,
        'No tournaments in this window.',
        'custom message overrides the default empty-state copy');
})();

(function testRenderEmptyStateNoContainer() {
    // Must not throw when container is missing — render fns are call-time safe.
    kpi.renderEmptyState(null);
    kpi.renderEmptyState(undefined);
    assert(true, 'renderEmptyState tolerates null/undefined container');
})();

(function testRenderEmptyStateConstantExported() {
    assert(typeof kpi.EMPTY_STATE_MESSAGE === 'string'
        && kpi.EMPTY_STATE_MESSAGE.length > 0
        && !/migration|036|037|038/i.test(kpi.EMPTY_STATE_MESSAGE),
        'EMPTY_STATE_MESSAGE exported and free of operator-facing migration notes');
})();

console.log('\n=== renderSchoolHero falls back to empty state ========================\n');
(function testHeroEmptyCases() {
    for (const [label, summary] of [['null', null], ['undefined', undefined], ['empty object', {}]]) {
        const c = makeMockEl('div');
        kpi.renderSchoolHero(c, summary);
        assertEqual(c.children.length, 1,
            `renderSchoolHero(${label}) collapses to a single empty card`);
        assert(/\bempty-state\b/.test(c.children[0].className),
            `renderSchoolHero(${label}) renders the empty-state card`);
    }
})();

(function testHeroNonEmpty() {
    const c = makeMockEl('div');
    kpi.renderSchoolHero(c, {
        active_students_count: 12,
        total_tournaments: 4,
        top3_count: 2,
        promotions_count: 1,
        new_razryads_count: 0,
        participation_pct: 75.5,
    });
    assertEqual(c.children.length, 6,
        'renderSchoolHero(data) builds the six PRD §5 hero cards');
    assert(c.children.every(card => !/\bempty-state\b/.test(card.className)),
        'no card carries the empty-state class when data is present');
})();

console.log('\n=== renderLeaderboard falls back to empty state =======================\n');
(function testLeaderboardEmptyCases() {
    for (const [label, rows] of [['null', null], ['undefined', undefined], ['empty array', []], ['non-array', 'oops']]) {
        const c = makeMockEl('div');
        kpi.renderLeaderboard(c, rows);
        assertEqual(c.children.length, 1,
            `renderLeaderboard(${label}) collapses to a single card`);
        assert(/\bempty-state\b/.test(c.children[0].className),
            `renderLeaderboard(${label}) renders the empty-state card (not an empty <table>)`);
    }
})();

(function testLeaderboardNonEmpty() {
    const c = makeMockEl('div');
    kpi.renderLeaderboard(c, [
        { coach_id: 'a', coach_name: 'Alice', composite_score: 55 },
        { coach_id: 'b', coach_name: 'Bob',   composite_score: 78 },
    ]);
    assertEqual(c.children.length, 1,
        'renderLeaderboard(rows) mounts one root element (the table)');
    const root = c.children[0];
    assertEqual(root.tagName, 'table', 'root is a <table>');
    assert(/\bkpi-leaderboard\b/.test(root.className),
        'table carries the .kpi-leaderboard class for styling hooks');
    assert(!/\bempty-state\b/.test(root.className),
        'table is not flagged as empty when rows are present');
})();

console.log('\n=== defaultFilterState / normalizeFilters =============================\n');
assertEqual(kpi.defaultFilterState(),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'default: 90d window, all leagues, all branches, all coaches');
assertEqual(kpi.defaultFilterState(ADMIN),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'roleInfo passed through: admin → same defaults (transparency model)');
assertEqual(kpi.defaultFilterState(COACH),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'roleInfo passed through: coach → same defaults');

assertEqual(kpi.normalizeFilters({ window: '30d', league: 'B', branchId: 'b-1' }),
    { window: '30d', league: 'B', branchId: 'b-1', coachId: 'all' },
    'normalizeFilters: valid input passes through unchanged');
assertEqual(kpi.normalizeFilters({ window: 'bogus', league: 'D', branchId: '' }),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters: bogus values fall back to defaults');
assertEqual(kpi.normalizeFilters({ league: 'A' }),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters: League A is no longer a valid filter — falls back to all');
assertEqual(kpi.normalizeFilters(null),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters(null) → defaults (no crash)');
assertEqual(kpi.normalizeFilters({}),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters({}) → defaults');
assertEqual(kpi.normalizeFilters({ window: 'ytd' }),
    { window: 'ytd', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters: partial update keeps requested field, defaults the rest');
assertEqual(kpi.normalizeFilters({ branchId: 123 }),
    { window: '90d', league: 'all', branchId: 'all', coachId: 'all' },
    'normalizeFilters: non-string branchId rejected');

console.log('\n=== renderFilters (DOM stub) ==========================================\n');

// Each .kpi-filters root now mounts three .filter-group wrappers (one per
// control). These helpers pull the actual control out of its wrapper so the
// assertions below stay readable.
function _windowGroup(root) {
    for (const g of root.children) {
        for (const c of g.children) {
            if (c && typeof c.className === 'string' && /\bkpi-filter-window\b/.test(c.className)) {
                return c;
            }
        }
    }
    return null;
}
function _leagueSelect(root) {
    for (const g of root.children) {
        for (const c of g.children) {
            if (c && typeof c.className === 'string' && /\bkpi-filter-league\b/.test(c.className)) {
                return c;
            }
        }
    }
    return null;
}
function _branchSelect(root) {
    for (const g of root.children) {
        for (const c of g.children) {
            if (c && typeof c.className === 'string' && /\bkpi-filter-branch\b/.test(c.className)) {
                return c;
            }
        }
    }
    return null;
}

(function testRenderFiltersDefaults() {
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, undefined, {});
    assertEqual(c.children.length, 1, 'mounts a single root');
    assert(/\bkpi-filters\b/.test(root.className), 'root carries .kpi-filters');
    // root.children now holds 3 .filter-group wrappers (window / league / branch).
    assertEqual(root.children.length, 3,
        'renders three .filter-group wrappers (window / league / branch)');
    for (const g of root.children) {
        assert(/\bfilter-group\b/.test(g.className),
            'each top-level child is a .filter-group wrapper');
    }

    const windowGroup = _windowGroup(root);
    assert(windowGroup && /\bkpi-filter-window\b/.test(windowGroup.className),
        'window group carries .kpi-filter-window');
    assertEqual(windowGroup.children.length, 3,
        'three pill buttons (30d / 90d / ytd — All time dropped Phase 2)');
    const pillWindows = windowGroup.children.map(b => b.dataset.window);
    assert(!pillWindows.includes('all'),
        'no pill carries data-window="all" (All time is no longer offered)');
    const pressed = windowGroup.children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed.length, 1, 'exactly one pill is pressed by default');
    assertEqual(pressed[0].dataset.window, '90d',
        'default pressed pill is the 90d window (PRD default)');

    const leagueSelect = _leagueSelect(root);
    assertEqual(leagueSelect.tagName, 'select', 'league control is a <select>');
    assertEqual(leagueSelect.value, 'all', 'league defaults to "all"');
    // League A was retired from the internal tournament rotation; only
    // all / B / C remain as filter options.
    assertEqual(leagueSelect.children.length, 3, 'league has all/B/C options (no League A)');
    const leagueValues = leagueSelect.children.map(o => o.attributes.value);
    assertEqual(leagueValues.includes('A'), false, 'no League A option in the league select');

    const branchSelect = _branchSelect(root);
    assertEqual(branchSelect.tagName, 'select', 'branch control is a <select>');
    assertEqual(branchSelect.value, 'all', 'branch defaults to "all"');
    assertEqual(branchSelect.children.length, 1,
        'branch select offers only "All branches" when no branches passed');
})();

(function testRenderFiltersWithBranches() {
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, { window: '30d', league: 'B', branchId: 'b-2' }, {
        branches: [{ id: 'b-1', name: 'Nish' }, { id: 'b-2', name: 'Debut' }],
    });
    const windowGroup = _windowGroup(root);
    const pressed = windowGroup.children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed[0].dataset.window, '30d', 'current window: 30d highlighted');

    const leagueSelect = _leagueSelect(root);
    assertEqual(leagueSelect.value, 'B', 'current league: B selected');

    const branchSelect = _branchSelect(root);
    assertEqual(branchSelect.value, 'b-2', 'current branch: b-2 selected');
    assertEqual(branchSelect.children.length, 3,
        '"All branches" + two branch options');
})();

(function testRenderFiltersOnChange() {
    const c = makeMockEl('div');
    const events = [];
    const root = kpi.renderFilters(c, { window: '90d', league: 'all', branchId: 'all' }, {
        branches: [{ id: 'b-1', name: 'Nish' }],
        onChange: (next) => events.push(next),
    });

    // Click the 30d pill.
    const pills = _windowGroup(root).children;
    const pill30d = pills.find(p => p.dataset.window === '30d');
    pill30d.dispatch('click');
    assertEqual(events[events.length - 1],
        { window: '30d', league: 'all', branchId: 'all', coachId: 'all' },
        'window pill click fires onChange with updated state');

    // Clicking the already-active pill should NOT re-fire onChange.
    const before = events.length;
    const pill90d = pills.find(p => p.dataset.window === '90d');
    pill90d.dispatch('click');
    // Active pill is still 30d (state is not mutated client-side until parent re-renders),
    // so 90d click *is* a change — verify it fires.
    assertEqual(events.length, before + 1,
        'clicking a different pill fires onChange (current state still 90d in initial render)');

    // Change the league select. (League A is no longer offered — use B.)
    const leagueSelect = _leagueSelect(root);
    leagueSelect.value = 'B';
    leagueSelect.dispatch('change', { target: { value: 'B' } });
    assertEqual(events[events.length - 1].league, 'B',
        'league select change fires onChange with new league');
    assertEqual(events[events.length - 1].window, '90d',
        'league change preserves window (parent owns state, child returns full snapshot)');

    // Change the branch select.
    const branchSelect = _branchSelect(root);
    branchSelect.value = 'b-1';
    branchSelect.dispatch('change', { target: { value: 'b-1' } });
    assertEqual(events[events.length - 1].branchId, 'b-1',
        'branch select change fires onChange with new branchId');
})();

(function testRenderFiltersOnChangeOmittedNoCrash() {
    // No onChange provided — events fire harmlessly.
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, undefined, {});
    const pill = _windowGroup(root).children[0];
    pill.dispatch('click');
    assert(true, 'no onChange supplied → click does not throw');
})();

(function testRenderFiltersNormalizesBogusInput() {
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, { window: 'xss', league: 'evil', branchId: '' }, {});
    const pressed = _windowGroup(root).children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed[0].dataset.window, '90d',
        'bogus window falls back to 90d default');
    assertEqual(_leagueSelect(root).value, 'all', 'bogus league falls back to all');
    assertEqual(_branchSelect(root).value, 'all', 'empty branchId falls back to all');
})();

(function testRenderFiltersNoContainer() {
    // Must not throw — render fns are call-time safe.
    const result = kpi.renderFilters(null, undefined, {});
    assertEqual(result, null, 'null container → null return');
})();

(function testRenderFiltersI18n() {
    const c = makeMockEl('div');
    const translations = {
        coachKpiTimeWindow30d: '30 дней',
        coachKpiLeagueAll: 'Все лиги',
        coachKpiBranchAll: 'Все филиалы',
    };
    const t = (key, fallback) => translations[key] || fallback;
    const root = kpi.renderFilters(c, undefined, { t: t });
    const pill30d = _windowGroup(root).children.find(p => p.dataset.window === '30d');
    assertEqual(pill30d.textContent, '30 дней',
        'i18n: time-window labels resolved via t()');
    assertEqual(_leagueSelect(root).children[0].textContent, 'Все лиги',
        'i18n: league "all" option resolved via t()');
    assertEqual(_branchSelect(root).children[0].textContent, 'Все филиалы',
        'i18n: branch "all" option resolved via t()');
})();

console.log('\n=== buildKpiQuery =====================================================\n');
const BQ_ADMIN_SCHOOL = kpi.buildKpiQuery(ADMIN, 'school', { now: NOW });
assertEqual(BQ_ADMIN_SCHOOL, {
    action: 'school_kpi_summary',
    window_start: '2026-02-14',
    window_end: '2026-05-14',
}, 'admin + school + default window → school_kpi_summary with 90d range');

assertEqual(
    kpi.buildKpiQuery(ADMIN, 'school', { window: '30d', now: NOW }).window_start,
    '2026-04-15',
    'admin + school + 30d → window narrows to 30 days');
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'school', { window: 'all', now: NOW }).window_start,
    '2026-02-14',
    'admin + school + "all" → falls back to 90d (All time dropped Phase 2)');

const BQ_BRANCH = kpi.buildKpiQuery(ADMIN, 'branch', {
    branchName: 'Debut',
    branchId: 'branch-id-debut',
    window: '90d',
    now: NOW,
});
assertEqual(BQ_BRANCH, {
    action: 'coach_leaderboard',
    branchName: 'Debut',
    window_start: '2026-02-14',
    window_end: '2026-05-14',
    branch_id: 'branch-id-debut',
}, 'admin + branch → coach_leaderboard with branch_id + window');

const BQ_COACH = kpi.buildKpiQuery(ADMIN, 'coach', {
    coachId: 'coach-uuid-2',
    window: 'ytd',
    now: NOW,
});
assertEqual(BQ_COACH, {
    action: 'coach_kpi_summary',
    coachId: 'coach-uuid-2',
    window_start: '2026-01-01',
    window_end: '2026-05-14',
}, 'admin + coach → coach_kpi_summary with ytd range');

assertEqual(kpi.buildKpiQuery(COACH, 'school', { now: NOW }), null,
    'locked coach + school → null (role lock refuses)');
assertEqual(kpi.buildKpiQuery(ANON, 'branch', { branchName: 'Nish', now: NOW }), null,
    'anon → null');
assertEqual(kpi.buildKpiQuery(ADMIN, 'bogus', {}), null,
    'unknown view → null');

const BQ_LOCKED_SELF = kpi.buildKpiQuery(COACH, 'coach', {
    coachId: 'someone-else',
    now: NOW,
});
assertEqual(BQ_LOCKED_SELF.coachId, 'coach-uuid-1',
    'locked coach + stray coachId → forced to self');
const BQ_LOCKED_OWN_BRANCH = kpi.buildKpiQuery(COACH, 'branch', {
    branchName: 'Nish',
    branchId: 'branch-id-nish',
    coaches: COACHES,
    now: NOW,
});
assertEqual(BQ_LOCKED_OWN_BRANCH, {
    action: 'coach_leaderboard',
    branchName: 'Nish',
    window_start: '2026-02-14',
    window_end: '2026-05-14',
    branch_id: 'branch-id-nish',
}, 'locked coach + own branch → coach_leaderboard');
assertEqual(
    kpi.buildKpiQuery(COACH, 'branch', { branchName: 'Debut', coaches: COACHES, now: NOW }),
    null,
    'locked coach + out-of-scope branch → null');

console.log('\n=== buildKpiQuery filters (league + branch) ============================\n');
// League filter: passes through for every view when non-empty / non-'all'.
// (League A was retired from the filter; B and C are the remaining options.)
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'school', { league: 'B', now: NOW }).league,
    'B', 'school + league=B → league:"B" added to query');
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'coach', { coachId: 'coach-uuid-2', league: 'B', now: NOW }).league,
    'B', 'coach + league=B → league:"B" added to query');
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'branch', { branchName: 'Debut', branchId: 'b-id', league: 'C', now: NOW }).league,
    'C', 'branch + league=C → league:"C" added to query');
assert(
    !('league' in kpi.buildKpiQuery(ADMIN, 'school', { league: 'all', now: NOW })),
    'league=all → omitted from query (no filter)');
assert(
    !('league' in kpi.buildKpiQuery(ADMIN, 'school', { league: '', now: NOW })),
    'league="" → omitted from query');
assert(
    !('league' in kpi.buildKpiQuery(ADMIN, 'school', { now: NOW })),
    'league undefined → omitted from query');

// Branch filter: now flows through for every view (not just branch view) so
// the dashboard's branch picker reaches the edge function consistently.
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'school', { branchId: 'b-school', now: NOW }).branch_id,
    'b-school', 'school + branchId → branch_id propagated');
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'coach', { coachId: 'coach-uuid-2', branchId: 'b-coach', now: NOW }).branch_id,
    'b-coach', 'coach + branchId → branch_id propagated');
assert(
    !('branch_id' in kpi.buildKpiQuery(ADMIN, 'school', { branchId: 'all', now: NOW })),
    'branchId=all → branch_id omitted (no filter)');

// All filters combined on a leaderboard call.
const BQ_FULL = kpi.buildKpiQuery(ADMIN, 'branch', {
    branchName: 'Debut',
    branchId: 'branch-id-debut',
    league: 'B',
    window: '30d',
    now: NOW,
});
assertEqual(BQ_FULL, {
    action: 'coach_leaderboard',
    branchName: 'Debut',
    window_start: '2026-04-15',
    window_end: '2026-05-14',
    branch_id: 'branch-id-debut',
    league: 'B',
}, 'all filters combined: action + time window + branch + league');

console.log('\n=== callKpiEndpoint (fetch wrapper) ===================================\n');
async function runFetchTests() {
    // Happy path: success body comes back from the stub.
    let captured;
    const okFetch = (url, init) => {
        captured = { url, init };
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, data: { hero: { active_students_count: 12 } } }),
        });
    };
    const okResp = await kpi.callKpiEndpoint(
        { action: 'school_kpi_summary', window_start: '2026-02-14', window_end: '2026-05-14' },
        { fetch: okFetch, config: { url: 'https://test.example', apiKey: 'k-1' } },
    );
    assertEqual(okResp.success, true, 'happy path returns success:true');
    assertEqual(okResp.data.hero.active_students_count, 12,
        'happy path forwards parsed JSON body');
    assert(captured.url.startsWith('https://test.example/functions/v1/analytics-tournaments?'),
        'endpoint URL prefixed with configured Supabase URL');
    assert(captured.url.includes('action=school_kpi_summary'),
        'action propagated to query string');
    assert(captured.url.includes('window_start=2026-02-14'),
        'window_start url-encoded into query string');
    assertEqual(captured.init.headers['x-api-key'], 'k-1',
        'x-api-key header populated from config');

    // Non-200 → error envelope.
    const badResp = await kpi.callKpiEndpoint(
        { action: 'school_kpi_summary' },
        {
            fetch: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
            config: { url: 'https://x', apiKey: 'k' },
        },
    );
    assertEqual(badResp.success, false, 'non-200 → success:false');
    assert(/503/.test(badResp.error), 'non-200 error mentions status code');

    // fetch throws → error envelope, no propagation.
    const throwResp = await kpi.callKpiEndpoint(
        { action: 'school_kpi_summary' },
        {
            fetch: () => Promise.reject(new Error('network down')),
            config: { url: 'https://x', apiKey: 'k' },
        },
    );
    assertEqual(throwResp.success, false, 'thrown fetch → success:false (caller never sees raise)');
    assertEqual(throwResp.error, 'network down', 'thrown error message is forwarded');

    // No fetch available → graceful error envelope. We pass an explicit
    // fetch that returns a rejection so the assertion is platform-stable
    // (Node 18+ exposes a global fetch, which would otherwise be picked up
    // when `opts.fetch` is null).
    const noFetchResp = await kpi.callKpiEndpoint(
        { action: 'school_kpi_summary' },
        { fetch: () => Promise.reject(new Error('no fetch')), config: { url: 'https://x', apiKey: 'k' } },
    );
    assertEqual(noFetchResp.success, false, 'missing fetch → success:false');
    assert(typeof noFetchResp.error === 'string' && noFetchResp.error.length > 0,
        'missing fetch reports a non-empty error string');

    // Empty / null params are skipped from the URL so the edge function does
    // not parse `&branch_id=` as a literal empty string.
    let urlSeen = '';
    await kpi.callKpiEndpoint(
        { action: 'coach_leaderboard', branchName: 'Nish', branch_id: '', empty: null },
        {
            fetch: (u) => { urlSeen = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) }); },
            config: { url: 'https://x', apiKey: 'k' },
        },
    );
    assert(!/branch_id=/.test(urlSeen), 'empty-string param is dropped from URL');
    assert(!/empty=/.test(urlSeen), 'null param is dropped from URL');

    console.log('\n=== fetchView (role-lock + endpoint) ================================\n');
    let fetchedUrl = '';
    const okFetch2 = (url) => {
        fetchedUrl = url;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) });
    };

    const view = await kpi.fetchView(ADMIN, 'school', { now: NOW }, {
        fetch: okFetch2,
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(view.success, true, 'admin + school: fetchView resolves to success');
    assert(/school_kpi_summary/.test(fetchedUrl),
        'admin + school: school_kpi_summary action issued');

    const refused = await kpi.fetchView(COACH, 'school', { now: NOW }, {
        fetch: okFetch2,
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(refused, null,
        'locked coach + school → fetchView returns null and never calls fetch');

    // Locked coach forced to self when fetching the coach view.
    let coachUrl = '';
    await kpi.fetchView(COACH, 'coach', { coachId: 'someone-else', now: NOW }, {
        fetch: (u) => { coachUrl = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) }); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assert(/coachId=coach-uuid-1/.test(coachUrl),
        'locked coach + stray coachId → forced to self in actual URL');

    // League + branch filters surface in the actual URL for every action.
    let leaderboardUrl = '';
    await kpi.fetchView(ADMIN, 'branch', {
        branchName: 'Debut', branchId: 'b-debut', league: 'B', window: '30d', now: NOW,
    }, {
        fetch: (u) => { leaderboardUrl = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) }); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assert(/action=coach_leaderboard/.test(leaderboardUrl),
        'branch view fetch issues coach_leaderboard action');
    assert(/branch_id=b-debut/.test(leaderboardUrl),
        'branch view fetch includes branch_id in URL');
    assert(/league=B/.test(leaderboardUrl),
        'branch view fetch includes league filter in URL');
    assert(/window_start=2026-04-15/.test(leaderboardUrl),
        'branch view fetch includes resolved window_start (30d preset)');

    // league=all is treated as "no filter" and stays out of the URL.
    let unfilteredUrl = '';
    await kpi.fetchView(ADMIN, 'school', { league: 'all', branchId: 'all', now: NOW }, {
        fetch: (u) => { unfilteredUrl = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) }); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assert(!/league=/.test(unfilteredUrl), 'league=all stays out of the URL');
    assert(!/branch_id=/.test(unfilteredUrl), 'branchId=all stays out of the URL');
    assert(/action=school_kpi_summary/.test(unfilteredUrl),
        'school view fetch issues school_kpi_summary action');

    // Coach view with league filter still issues coach_kpi_summary and carries the filter.
    let coachSummaryUrl = '';
    await kpi.fetchView(ADMIN, 'coach', { coachId: 'coach-uuid-2', league: 'B', now: NOW }, {
        fetch: (u) => { coachSummaryUrl = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) }); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assert(/action=coach_kpi_summary/.test(coachSummaryUrl),
        'coach view fetch issues coach_kpi_summary action');
    assert(/league=B/.test(coachSummaryUrl),
        'coach view fetch carries league filter');

    console.log('\n=== loadDashboard (gate + fetch) ====================================\n');
    const dashAdmin = await kpi.loadDashboard(ADMIN, 'school', { now: NOW }, {
        fetch: okFetch2,
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(dashAdmin.success, true, 'admin: loadDashboard resolves');
    const dashAnon = await kpi.loadDashboard(ANON, 'school', { now: NOW }, {
        fetch: okFetch2,
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(dashAnon, null, 'anon: loadDashboard returns null (canViewCoachKpi gate)');
    const dashCoachSchool = await kpi.loadDashboard(COACH, 'school', { now: NOW }, {
        fetch: okFetch2,
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(dashCoachSchool, null,
        'locked coach + school: loadDashboard returns null (canAccessView gate)');
}

console.log('\n=== aggregateRazryadFromStudents ======================================\n');
assertEqual(kpi.aggregateRazryadFromStudents([
    { razryad: 'KMS' },
    { razryad: '1st' },
    { razryad: '1' },   // legacy spelling
    { razryad: '2nd' },
    { razryad: '3rd' },
    { razryad: '3' },   // legacy
    { razryad: '4th' },
    { razryad: null },
    { razryad: undefined },
    {},
]), { KMS: 1, '1st': 2, '2nd': 1, '3rd': 2, '4th': 1, None: 3 },
    'tallies KMS/1st/.../4th and rolls unknown into None');
assertEqual(kpi.aggregateRazryadFromStudents([]),
    { KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, '4th': 0, None: 0 },
    'empty list → zeroed slots (no NaN leak)');
assertEqual(kpi.aggregateRazryadFromStudents(null),
    { KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, '4th': 0, None: 0 },
    'null input → zeroed slots');

// Regression: the DB CHECK constraint stores razryad lowercase
// ('none', '4th', '3rd', '2nd', '1st', 'kms' — see migrations/update_razryad_constraint.sql).
// The bucketing must match the actual storage so a kms student doesn't get
// silently dropped into "None" on the doughnut.
assertEqual(kpi.aggregateRazryadFromStudents([
    { razryad: 'kms' },
    { razryad: 'KMS' },
    { razryad: '1st' },
    { razryad: '2nd' },
    { razryad: '3rd' },
    { razryad: '4th' },
    { razryad: 'none' },
]), { KMS: 2, '1st': 1, '2nd': 1, '3rd': 1, '4th': 1, None: 1 },
    'DB-style lowercase razryads bucket correctly (kms → KMS, none → None)');

console.log('\n=== chart renderers (PRD §5: school 2 charts, coach 3 charts) =========\n');
// Capture Chart.js constructor calls without pulling the real lib in.
const chartCalls = [];
function MockChart(ctx, config) {
    chartCalls.push({ ctx, config });
    this.ctx = ctx;
    this.config = config;
    this.destroyed = false;
}
MockChart.prototype.destroy = function () { this.destroyed = true; };
global.Chart = MockChart;

function lastCall() { return chartCalls[chartCalls.length - 1]; }

// ---- renderRazryadDoughnut --------------------------------------------------
(function testRazryadEmpty() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    const ret = kpi.renderRazryadDoughnut(c, null);
    assertEqual(ret, null, 'null counts → null return');
    assertEqual(chartCalls.length, 0, 'null counts → no Chart constructor call');
    assert(/\bempty-state\b/.test(c.children[0].className),
        'null counts → empty-state card rendered');

    const c2 = makeMockEl('div');
    kpi.renderRazryadDoughnut(c2, { KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, '4th': 0, None: 0 });
    assertEqual(chartCalls.length, 0, 'all-zero counts → no chart created');
    assert(/\bempty-state\b/.test(c2.children[0].className),
        'all-zero counts → empty-state card rendered');
})();

(function testRazryadHappy() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    const inst = kpi.renderRazryadDoughnut(c, { KMS: 1, '1st': 2, '2nd': 3, '3rd': 1, '4th': 0, None: 4 });
    assertEqual(chartCalls.length, 1, 'one Chart instance per render');
    assert(inst instanceof MockChart, 'returns the Chart instance');
    const call = lastCall();
    assertEqual(call.config.type, 'doughnut', 'razryad chart type = doughnut');
    assertEqual(call.config.data.labels, ['KMS', '1st', '2nd', '3rd', '4th', 'None'],
        'razryad labels in canonical order');
    assertEqual(call.config.data.datasets[0].data, [1, 2, 3, 1, 0, 4],
        'razryad data mirrors RAZRYAD_ORDER');
    assertEqual(call.config.data.datasets[0].backgroundColor.length, 6,
        'six segment colors (one per razryad slot)');
    assertEqual(call.ctx.tagName, 'canvas', 'chart mounted on a <canvas>');
    assertEqual(c.children.length, 1, 'container holds the canvas only (no leftover empty-state)');
})();

(function testRazryadCanvasReset() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    c.appendChild(makeMockEl('p'));  // stale child
    kpi.renderRazryadDoughnut(c, { KMS: 5 });
    assertEqual(c.children.length, 1, 'render clears prior container content');
    assertEqual(c.children[0].tagName, 'canvas', 'after clear, only the canvas remains');
})();

(function testRazryadNoChartLib() {
    chartCalls.length = 0;
    delete global.Chart;
    const c = makeMockEl('div');
    const ret = kpi.renderRazryadDoughnut(c, { KMS: 1 });
    assertEqual(ret, null, 'no Chart.js → null return');
    assert(/\bempty-state\b/.test(c.children[0].className),
        'no Chart.js → empty-state fallback (does not crash)');
    global.Chart = MockChart;
})();

(function testRazryadI18n() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderRazryadDoughnut(c, { KMS: 1, '1st': 1 }, {
        t: (key, fb) => key === 'coachKpiRazryadKMS' ? 'КМС' : fb,
    });
    assertEqual(lastCall().config.data.labels[0], 'КМС',
        'i18n: razryad label resolved via t()');
})();

// ---- renderTournamentsByLeagueStackedBar (school view) ----------------------
(function testStackedEmpty() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueStackedBar(c, []);
    assertEqual(chartCalls.length, 0, 'empty branches → no chart');
    assert(/\bempty-state\b/.test(c.children[0].className),
        'empty branches → empty-state card');

    const c2 = makeMockEl('div');
    kpi.renderTournamentsByLeagueStackedBar(c2, null);
    assert(/\bempty-state\b/.test(c2.children[0].className),
        'null branches → empty-state card');
})();

(function testStackedHappy() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueStackedBar(c, [
        { branch_name: 'Nish',        league_counts: { A: 3, B: 2, C: 1 } },
        { branch_name: 'Halyk Arena', league_counts: { A: 1, B: 0, C: 4 } },
        { branch_name: 'Debut',       league_counts: { A: 0, B: 5, C: 2 } },
    ]);
    const call = lastCall();
    assertEqual(call.config.type, 'bar', 'stacked chart type = bar');
    assertEqual(call.config.data.labels, ['Nish', 'Halyk Arena', 'Debut'],
        'x-axis labels are branch names in input order');
    assertEqual(call.config.data.datasets.length, 3, 'one dataset per league (A/B/C)');
    assertEqual(call.config.data.datasets[0].data, [3, 1, 0], 'A dataset');
    assertEqual(call.config.data.datasets[1].data, [2, 0, 5], 'B dataset');
    assertEqual(call.config.data.datasets[2].data, [1, 4, 2], 'C dataset');
    assertEqual(call.config.options.scales.x.stacked, true, 'x axis stacked');
    assertEqual(call.config.options.scales.y.stacked, true, 'y axis stacked');
    assertEqual(call.config.options.scales.y.beginAtZero, true, 'y axis begins at zero');
})();

(function testStackedCamelCaseKeys() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueStackedBar(c, [
        { branchName: 'Nish', leagueCounts: { A: 1, B: 1, C: 1 } },
    ]);
    assertEqual(lastCall().config.data.labels, ['Nish'],
        'accepts camelCase branchName key');
    assertEqual(lastCall().config.data.datasets[0].data, [1],
        'accepts camelCase leagueCounts key');
})();

(function testStackedMissingLeague() {
    // Missing keys count as zero — chart never renders NaN bars.
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueStackedBar(c, [
        { branch_name: 'X', league_counts: { A: 5 } },  // B/C missing
    ]);
    assertEqual(lastCall().config.data.datasets[1].data, [0], 'missing B → 0');
    assertEqual(lastCall().config.data.datasets[2].data, [0], 'missing C → 0');
})();

// ---- renderTournamentsByLeagueBar (coach view) ------------------------------
(function testLeagueBarEmpty() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueBar(c, { A: 0, B: 0, C: 0 });
    assertEqual(chartCalls.length, 0, 'all-zero counts → no chart');
    assert(/\bempty-state\b/.test(c.children[0].className),
        'all-zero counts → empty-state card');
})();

(function testLeagueBarHappy() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderTournamentsByLeagueBar(c, { A: 4, B: 2, C: 7 });
    const call = lastCall();
    assertEqual(call.config.type, 'bar', 'league bar type = bar');
    assertEqual(call.config.data.datasets.length, 1, 'single dataset (not stacked)');
    assertEqual(call.config.data.datasets[0].data, [4, 2, 7],
        'data follows LEAGUE_PLOT_ORDER (A/B/C)');
    assertEqual(call.config.options.plugins.legend.display, false,
        'single-series bar hides the legend');
    assert(!call.config.options.scales || !call.config.options.scales.x || !call.config.options.scales.x.stacked,
        'coach view bar is NOT stacked');
})();

// ---- renderAvgPlaceTrendLine (coach view) -----------------------------------
(function testTrendEmpty() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderAvgPlaceTrendLine(c, []);
    assertEqual(chartCalls.length, 0, 'empty points → no chart');
    assert(/\bempty-state\b/.test(c.children[0].className),
        'empty points → empty-state card');
})();

(function testTrendHappy() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderAvgPlaceTrendLine(c, [
        { month: '2025-12', avg_place: 4.2 },
        { month: '2026-01', avg_place: 3.8 },
        { month: '2026-02', avg_place: null }, // gap
        { month: '2026-03', avg_place: 2.5 },
    ]);
    const call = lastCall();
    assertEqual(call.config.type, 'line', 'trend chart type = line');
    assertEqual(call.config.data.labels, ['2025-12', '2026-01', '2026-02', '2026-03'],
        'x labels follow input order');
    assertEqual(call.config.data.datasets[0].data, [4.2, 3.8, null, 2.5],
        'non-finite avg_place becomes null (Chart.js renders gap)');
    assertEqual(call.config.options.scales.y.reverse, true,
        'y axis reversed (lower place = better → upward visual trend)');
    assertEqual(call.config.data.datasets[0].spanGaps, true,
        'spanGaps true so null months do not break the line entirely');
})();

(function testTrendCamelCaseKeys() {
    chartCalls.length = 0;
    const c = makeMockEl('div');
    kpi.renderAvgPlaceTrendLine(c, [{ month: '2026-01', avgPlace: 3.0 }]);
    assertEqual(lastCall().config.data.datasets[0].data, [3.0],
        'accepts camelCase avgPlace key');
})();

console.log('\n=== chart renderers — exports + constants =============================\n');
assertEqual(kpi.RAZRYAD_ORDER, ['KMS', '1st', '2nd', '3rd', '4th', 'None'],
    'RAZRYAD_ORDER exported in canonical order');
assertEqual(kpi.LEAGUE_PLOT_ORDER, ['A', 'B', 'C'],
    'LEAGUE_PLOT_ORDER exported (matches league filter set, minus "all")');
assert(Array.isArray(kpi.RAZRYAD_COLORS) && kpi.RAZRYAD_COLORS.length === 6,
    'RAZRYAD_COLORS exported with one color per razryad slot');
assert(kpi.LEAGUE_COLORS && kpi.LEAGUE_COLORS.A && kpi.LEAGUE_COLORS.B && kpi.LEAGUE_COLORS.C,
    'LEAGUE_COLORS exported for A/B/C');

(async () => {
    try {
        await runFetchTests();
    } catch (e) {
        failed++;
        console.error('  ✗ FAIL: unexpected error in async tests:', e);
    }
    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})();
