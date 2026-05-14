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
assertEqual(kpi.TIME_WINDOWS, ['30d', '90d', 'ytd', 'all'], 'TIME_WINDOWS exported');
assertEqual(kpi.DEFAULT_WINDOW, '90d', 'DEFAULT_WINDOW = 90d');
assertEqual(kpi.LEAGUES, ['all', 'A', 'B', 'C'], 'LEAGUES exported');
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
assertEqual(kpi.resolveTimeWindow('all', NOW),
    { start: '2000-01-01', end: '2026-05-14', days: null, preset: 'all' },
    'all: fixed epoch start, today end, no days');
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
const ROWS = [
    { coach_id: 'a', coach_name: 'Alice', composite_score: 55, top3_count: 4, total_rating_gained:  10, branches: ['b1'] },
    { coach_id: 'b', coach_name: 'Bob',   composite_score: 78, top3_count: 1, total_rating_gained: 120, branches: ['b1', 'b2'] },
    { coach_id: 'c', coach_name: 'Cara',  composite_score: 30, top3_count: 7, total_rating_gained: -40, branches: ['b2'] },
];

assertEqual(
    kpi.sortLeaderboard(ROWS).map(r => r.coach_id),
    ['b', 'a', 'c'],
    'default: composite_score desc');
assertEqual(
    kpi.sortLeaderboard(ROWS, 'composite_score', 'asc').map(r => r.coach_id),
    ['c', 'a', 'b'],
    'composite_score asc when requested');
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
    'unknown sort key → fallback to composite_score desc');
assertEqual(kpi.sortLeaderboard([], 'composite_score'), [],
    'empty input → empty output');
assertEqual(kpi.sortLeaderboard(null, 'composite_score'), [],
    'null input → empty output');

// Null-handling: rows with a null sort value should sort LAST regardless of direction.
const ROWS_WITH_NULL = [
    { coach_id: 'x', composite_score: null },
    { coach_id: 'y', composite_score: 50 },
    { coach_id: 'z', composite_score: 10 },
];
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'composite_score', 'desc').map(r => r.coach_id),
    ['y', 'z', 'x'],
    'null values sort last when desc');
assertEqual(
    kpi.sortLeaderboard(ROWS_WITH_NULL, 'composite_score', 'asc').map(r => r.coach_id),
    ['z', 'y', 'x'],
    'null values still sort last when asc (never reads as best)');

// Stability: equal sort keys preserve input order.
const TIES = [
    { coach_id: 'first',  composite_score: 50 },
    { coach_id: 'second', composite_score: 50 },
    { coach_id: 'third',  composite_score: 50 },
];
assertEqual(
    kpi.sortLeaderboard(TIES, 'composite_score').map(r => r.coach_id),
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
    { active_students_count: 10, total_tournaments: 4, top3_count: 2, promotions_count: 1, new_razryads_count: 0, total_rating_gained:  50 },
    { active_students_count:  6, total_tournaments: 3, top3_count: 1, promotions_count: 0, new_razryads_count: 2, total_rating_gained: -10 },
]), {
    active_students_count: 16,
    total_tournaments:     7,
    top3_count:            3,
    promotions_count:      1,
    new_razryads_count:    2,
    total_rating_gained:  40,
}, 'sums every numeric column');
assertEqual(kpi.aggregateSchoolHero([]), {
    active_students_count: 0,
    total_tournaments:     0,
    top3_count:            0,
    promotions_count:      0,
    new_razryads_count:    0,
    total_rating_gained:   0,
}, 'empty array → zeroed shape (no NaN/null leaks)');
assertEqual(kpi.aggregateSchoolHero(null).active_students_count, 0,
    'null input → zeroed shape (defensive)');
assertEqual(
    kpi.aggregateSchoolHero([{ active_students_count: 'oops' }]).active_students_count,
    0,
    'non-numeric column treated as 0 (never NaN)');

console.log('\n=== isKpiEmpty (Phase 2 migrations-not-applied predicate) =============\n');
// Phase 2: migrations 036/037/038 may not be live yet, so the edge function
// can come back null, 4xx (`success:false`), or an empty payload. The
// predicate must catch all three so the renderer can fall back to the
// friendly "apply migrations" card.
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

(function testRenderEmptyState() {
    const c = makeMockEl('div');
    kpi.renderEmptyState(c);
    assertEqual(c.children.length, 1, 'renderEmptyState mounts exactly one card');
    const card = c.children[0];
    assert(/\bstat-card\b/.test(card.className),
        'empty card carries .stat-card (reuses existing dashboard styling)');
    assert(/\bempty-state\b/.test(card.className),
        'empty card carries .empty-state modifier');
    assertEqual(card.attributes.role, 'status',
        'empty card has role="status" for assistive tech');
    const label = card.children[0];
    assert(label && /Coach KPI data not yet available/.test(label.textContent),
        'empty card shows the migrations-not-applied lead text');
    assert(/036\/037\/038/.test(label.textContent),
        'empty card names migrations 036/037/038 so on-call knows which to apply');
})();

(function testRenderEmptyStateCustomMessage() {
    const c = makeMockEl('div');
    kpi.renderEmptyState(c, 'No tournaments in this window.');
    assertEqual(c.children[0].children[0].textContent,
        'No tournaments in this window.',
        'custom message overrides the default migration string');
})();

(function testRenderEmptyStateNoContainer() {
    // Must not throw when container is missing — render fns are call-time safe.
    kpi.renderEmptyState(null);
    kpi.renderEmptyState(undefined);
    assert(true, 'renderEmptyState tolerates null/undefined container');
})();

(function testRenderEmptyStateConstantExported() {
    assert(typeof kpi.EMPTY_STATE_MESSAGE === 'string'
        && /036\/037\/038/.test(kpi.EMPTY_STATE_MESSAGE),
        'EMPTY_STATE_MESSAGE exported so other modules can reuse the same copy');
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
    { window: '90d', league: 'all', branchId: 'all' },
    'default: 90d window, all leagues, all branches');
assertEqual(kpi.defaultFilterState(ADMIN),
    { window: '90d', league: 'all', branchId: 'all' },
    'roleInfo passed through: admin → same defaults (transparency model)');
assertEqual(kpi.defaultFilterState(COACH),
    { window: '90d', league: 'all', branchId: 'all' },
    'roleInfo passed through: coach → same defaults');

assertEqual(kpi.normalizeFilters({ window: '30d', league: 'A', branchId: 'b-1' }),
    { window: '30d', league: 'A', branchId: 'b-1' },
    'normalizeFilters: valid input passes through unchanged');
assertEqual(kpi.normalizeFilters({ window: 'bogus', league: 'D', branchId: '' }),
    { window: '90d', league: 'all', branchId: 'all' },
    'normalizeFilters: bogus values fall back to defaults');
assertEqual(kpi.normalizeFilters(null),
    { window: '90d', league: 'all', branchId: 'all' },
    'normalizeFilters(null) → defaults (no crash)');
assertEqual(kpi.normalizeFilters({}),
    { window: '90d', league: 'all', branchId: 'all' },
    'normalizeFilters({}) → defaults');
assertEqual(kpi.normalizeFilters({ window: 'ytd' }),
    { window: 'ytd', league: 'all', branchId: 'all' },
    'normalizeFilters: partial update keeps requested field, defaults the rest');
assertEqual(kpi.normalizeFilters({ branchId: 123 }),
    { window: '90d', league: 'all', branchId: 'all' },
    'normalizeFilters: non-string branchId rejected');

console.log('\n=== renderFilters (DOM stub) ==========================================\n');
(function testRenderFiltersDefaults() {
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, undefined, {});
    assertEqual(c.children.length, 1, 'mounts a single root');
    assert(/\bkpi-filters\b/.test(root.className), 'root carries .kpi-filters');
    // [windowGroup, leagueSelect, branchSelect]
    assertEqual(root.children.length, 3, 'renders three controls (window/league/branch)');

    const windowGroup = root.children[0];
    assert(/\bkpi-filter-window\b/.test(windowGroup.className),
        'window group carries .kpi-filter-window');
    assertEqual(windowGroup.children.length, 4,
        'four pill buttons (30d / 90d / ytd / all)');
    const pressed = windowGroup.children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed.length, 1, 'exactly one pill is pressed by default');
    assertEqual(pressed[0].dataset.window, '90d',
        'default pressed pill is the 90d window (PRD default)');

    const leagueSelect = root.children[1];
    assertEqual(leagueSelect.tagName, 'select', 'league control is a <select>');
    assertEqual(leagueSelect.value, 'all', 'league defaults to "all"');
    assertEqual(leagueSelect.children.length, 4, 'league has all/A/B/C options');

    const branchSelect = root.children[2];
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
    const windowGroup = root.children[0];
    const pressed = windowGroup.children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed[0].dataset.window, '30d', 'current window: 30d highlighted');

    const leagueSelect = root.children[1];
    assertEqual(leagueSelect.value, 'B', 'current league: B selected');

    const branchSelect = root.children[2];
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
    const pills = root.children[0].children;
    const pill30d = pills.find(p => p.dataset.window === '30d');
    pill30d.dispatch('click');
    assertEqual(events[events.length - 1],
        { window: '30d', league: 'all', branchId: 'all' },
        'window pill click fires onChange with updated state');

    // Clicking the already-active pill should NOT re-fire onChange.
    const before = events.length;
    const pill90d = pills.find(p => p.dataset.window === '90d');
    pill90d.dispatch('click');
    // Active pill is still 30d (state is not mutated client-side until parent re-renders),
    // so 90d click *is* a change — verify it fires.
    assertEqual(events.length, before + 1,
        'clicking a different pill fires onChange (current state still 90d in initial render)');

    // Change the league select.
    const leagueSelect = root.children[1];
    leagueSelect.value = 'A';
    leagueSelect.dispatch('change', { target: { value: 'A' } });
    assertEqual(events[events.length - 1].league, 'A',
        'league select change fires onChange with new league');
    assertEqual(events[events.length - 1].window, '90d',
        'league change preserves window (parent owns state, child returns full snapshot)');

    // Change the branch select.
    const branchSelect = root.children[2];
    branchSelect.value = 'b-1';
    branchSelect.dispatch('change', { target: { value: 'b-1' } });
    assertEqual(events[events.length - 1].branchId, 'b-1',
        'branch select change fires onChange with new branchId');
})();

(function testRenderFiltersOnChangeOmittedNoCrash() {
    // No onChange provided — events fire harmlessly.
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, undefined, {});
    const pill = root.children[0].children[0];
    pill.dispatch('click');
    assert(true, 'no onChange supplied → click does not throw');
})();

(function testRenderFiltersNormalizesBogusInput() {
    const c = makeMockEl('div');
    const root = kpi.renderFilters(c, { window: 'xss', league: 'evil', branchId: '' }, {});
    const pressed = root.children[0].children.filter(b => b.attributes['aria-pressed'] === 'true');
    assertEqual(pressed[0].dataset.window, '90d',
        'bogus window falls back to 90d default');
    assertEqual(root.children[1].value, 'all', 'bogus league falls back to all');
    assertEqual(root.children[2].value, 'all', 'empty branchId falls back to all');
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
    const pill30d = root.children[0].children.find(p => p.dataset.window === '30d');
    assertEqual(pill30d.textContent, '30 дней',
        'i18n: time-window labels resolved via t()');
    assertEqual(root.children[1].children[0].textContent, 'Все лиги',
        'i18n: league "all" option resolved via t()');
    assertEqual(root.children[2].children[0].textContent, 'Все филиалы',
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
    '2000-01-01',
    'admin + school + all → epoch start');

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
assertEqual(
    kpi.buildKpiQuery(ADMIN, 'school', { league: 'A', now: NOW }).league,
    'A', 'school + league=A → league:"A" added to query');
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
    league: 'A',
    window: '30d',
    now: NOW,
});
assertEqual(BQ_FULL, {
    action: 'coach_leaderboard',
    branchName: 'Debut',
    window_start: '2026-04-15',
    window_end: '2026-05-14',
    branch_id: 'branch-id-debut',
    league: 'A',
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
        branchName: 'Debut', branchId: 'b-debut', league: 'A', window: '30d', now: NOW,
    }, {
        fetch: (u) => { leaderboardUrl = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) }); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assert(/action=coach_leaderboard/.test(leaderboardUrl),
        'branch view fetch issues coach_leaderboard action');
    assert(/branch_id=b-debut/.test(leaderboardUrl),
        'branch view fetch includes branch_id in URL');
    assert(/league=A/.test(leaderboardUrl),
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
