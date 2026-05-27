/**
 * Tests for the >=1 active student render-time filter on the Coach KPI
 * leaderboard (renderLeaderboard in coach-kpi.js).
 *
 * Behaviour pinned here:
 *   1. A coach with active_students_count = 0 is dropped from the table.
 *   2. A coach with active_students_count >= 1 is kept.
 *   3. The filter runs before sort — visible rows reorder among themselves
 *      with no holes from the hidden coach.
 *   4. Medals (rank-1/2/3) still apply on default sort, paint the visible
 *      rows, and never paint a row that was filtered out.
 *   5. All-zero input falls through to the empty state.
 *
 * Run: node tests/test-coach-kpi-leaderboard-active-filter.js
 */

const path = require('path');

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

function makeMockEl(tag) {
    const el = {
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
    return el;
}

function makeWindow() {
    const _listeners = {};
    return {
        _listeners,
        addEventListener(name, fn) {
            (_listeners[name] = _listeners[name] || []).push(fn);
        },
        removeEventListener(name, fn) {
            const arr = _listeners[name];
            if (!arr) return;
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        },
        dispatchEvent(event) {
            for (const fn of (_listeners[event.type] || [])) fn(event);
        },
    };
}

function makeDom() {
    const _listeners = {};
    return {
        _listeners,
        createElement(tag) { return makeMockEl(tag); },
        getElementById() { return null; },
        addEventListener(name, fn) {
            (_listeners[name] = _listeners[name] || []).push(fn);
        },
        removeEventListener(name, fn) {
            const arr = _listeners[name];
            if (!arr) return;
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        },
        dispatchEvent(event) {
            for (const fn of (_listeners[event.type] || [])) fn(event);
        },
    };
}

function findAllByTag(root, tag, out) {
    out = out || [];
    if (!root) return out;
    if (root.tagName === tag) out.push(root);
    if (Array.isArray(root.children)) {
        for (const c of root.children) findAllByTag(c, tag, out);
    }
    return out;
}

function findByTag(root, tag) {
    const all = findAllByTag(root, tag);
    return all.length ? all[0] : null;
}

function findAllByClass(root, cls, out) {
    out = out || [];
    if (!root) return out;
    if (typeof root.className === 'string' && new RegExp(`\\b${cls}\\b`).test(root.className)) {
        out.push(root);
    }
    if (Array.isArray(root.children)) {
        for (const c of root.children) findAllByClass(c, cls, out);
    }
    return out;
}

function findByClass(root, cls) {
    const all = findAllByClass(root, cls);
    return all.length ? all[0] : null;
}

function rowCoachNames(table) {
    const tbody = findByTag(table, 'tbody');
    if (!tbody) return [];
    return tbody.children.map((tr) => {
        const td = tr.children && tr.children[0];
        return td ? td.textContent : null;
    });
}

function rowRankClasses(table) {
    const tbody = findByTag(table, 'tbody');
    if (!tbody) return [];
    return tbody.children.map((tr) => tr.className || '');
}

function loadKpi() {
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = makeDom();
    global.window = makeWindow();
    return require(modulePath);
}

// ── 1: A coach with active_students_count = 0 is dropped ───────────────────

console.log('\n=== Coach with active_students_count = 0 is filtered out =============\n');
(function testZeroActiveDropped() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    // Empty-roster coach has the highest total_tournaments so under the
    // default sort it would lead the leaderboard if it were not filtered.
    const rows = [
        { coach_id: 'co-empty', coach_name: 'Empty Roster',
          active_students_count: 0, active_players_count: 0, total_tournaments: 99,
          top3_count: 5, promotions_count: 2, new_razryads_count: 1 },
        { coach_id: 'co-alice', coach_name: 'Alice Anderson',
          active_students_count: 5, active_players_count: 4, total_tournaments: 6,
          top3_count: 1, promotions_count: 3, new_razryads_count: 2 },
        { coach_id: 'co-bob', coach_name: 'Bob Brown',
          active_students_count: 6, active_players_count: 6, total_tournaments: 4,
          top3_count: 2, promotions_count: 2, new_razryads_count: 1 },
    ];
    kpi.renderLeaderboard(host, rows, {});

    const table = findByClass(host, 'kpi-leaderboard');
    assert(table !== null, 'leaderboard table is rendered');
    const names = rowCoachNames(table);
    assertEqual(names, ['Alice Anderson', 'Bob Brown'],
        'only coaches with >=1 active student appear; Empty Roster (0) is hidden');
    assert(!names.includes('Empty Roster'),
        'coach with active_students_count = 0 is not in the table');
})();

// ── 2: A coach with active_students_count >= 1 is kept ─────────────────────

console.log('\n=== Coach with active_students_count = 1 is kept =====================\n');
(function testOneActiveKept() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    const rows = [
        { coach_id: 'co-just-one', coach_name: 'Just One',
          active_students_count: 1, active_players_count: 0, total_tournaments: 0,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(host, rows, {});

    const table = findByClass(host, 'kpi-leaderboard');
    assert(table !== null,
        'a coach with exactly one active student renders the table');
    assertEqual(rowCoachNames(table), ['Just One'],
        'the lone qualifying coach appears as the single row');
})();

// ── 3: Filter runs before sort — visible rows compact, no hole ─────────────

console.log('\n=== Filter runs before sort — no positional gap from hidden rows =====\n');
(function testFilterBeforeSort() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    // Two zero-roster coaches are interleaved; default sort = total_tournaments
    // desc. After filtering, visible rows must appear back-to-back, sorted on
    // their own values (Alice 6 → Bob 4).
    const rows = [
        { coach_id: 'co-zero-a', coach_name: 'Zero A',
          active_students_count: 0, active_players_count: 0, total_tournaments: 50,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'co-alice', coach_name: 'Alice',
          active_students_count: 5, active_players_count: 4, total_tournaments: 6,
          top3_count: 1, promotions_count: 3, new_razryads_count: 2 },
        { coach_id: 'co-zero-b', coach_name: 'Zero B',
          active_students_count: 0, active_players_count: 0, total_tournaments: 40,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'co-bob', coach_name: 'Bob',
          active_students_count: 6, active_players_count: 6, total_tournaments: 4,
          top3_count: 2, promotions_count: 2, new_razryads_count: 1 },
    ];
    kpi.renderLeaderboard(host, rows, {});

    const table = findByClass(host, 'kpi-leaderboard');
    const tbody = findByTag(table, 'tbody');
    assertEqual(tbody.children.length, 2,
        'tbody has exactly 2 rows — the two zero-roster coaches are dropped');
    assertEqual(rowCoachNames(table), ['Alice', 'Bob'],
        'visible rows sort by total_tournaments desc among themselves');
})();

// ── 4: Medal guard intact, paints visible rows only ────────────────────────

console.log('\n=== Medals paint visible rows only on default sort ===================\n');
(function testMedalGuard() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    const rows = [
        { coach_id: 'co-zero', coach_name: 'Zero',
          active_students_count: 0, active_players_count: 0, total_tournaments: 99,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'co-alice', coach_name: 'Alice',
          active_students_count: 5, active_players_count: 4, total_tournaments: 6,
          top3_count: 1, promotions_count: 3, new_razryads_count: 2 },
        { coach_id: 'co-bob', coach_name: 'Bob',
          active_students_count: 6, active_players_count: 6, total_tournaments: 4,
          top3_count: 2, promotions_count: 2, new_razryads_count: 1 },
        { coach_id: 'co-carol', coach_name: 'Carol',
          active_students_count: 8, active_players_count: 5, total_tournaments: 2,
          top3_count: 4, promotions_count: 1, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(host, rows, {});

    let table = findByClass(host, 'kpi-leaderboard');
    let classes = rowRankClasses(table);
    let names = rowCoachNames(table);
    assertEqual(names, ['Alice', 'Bob', 'Carol'],
        'default sort: hidden coach absent, others sorted by total_tournaments desc');
    assert(/\brank-1\b/.test(classes[0]),
        'visible first row (Alice) carries rank-1 — medal not stolen by hidden Zero');
    assert(/\brank-2\b/.test(classes[1]), 'visible second row carries rank-2');
    assert(/\brank-3\b/.test(classes[2]), 'visible third row carries rank-3');

    // Switching sort drops medals — same guard as before the filter change.
    const top3Th = (function () {
        const ths = findAllByTag(table, 'th');
        for (const th of ths) {
            if (th.attributes && th.attributes['data-sort-key'] === 'top3_count') return th;
        }
        return null;
    })();
    top3Th.dispatch('click', {});
    table = findByClass(host, 'kpi-leaderboard');
    classes = rowRankClasses(table);
    assert(!/\brank-1\b/.test(classes[0]),
        'after sort by Top-3: rank-1 medal is dropped (guard intact)');
    assert(!/\brank-2\b/.test(classes[1]),
        'after sort by Top-3: rank-2 medal is dropped');
})();

// ── 5: All rows filtered out → empty state ─────────────────────────────────

console.log('\n=== All zero-roster coaches falls through to empty state =============\n');
(function testAllFilteredEmpty() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    const rows = [
        { coach_id: 'co-a', coach_name: 'A',
          active_students_count: 0, active_players_count: 0, total_tournaments: 5,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
        { coach_id: 'co-b', coach_name: 'B',
          active_students_count: 0, active_players_count: 0, total_tournaments: 3,
          top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ];
    kpi.renderLeaderboard(host, rows, {});

    const table = findByClass(host, 'kpi-leaderboard');
    assert(table === null,
        'no table rendered when every coach has zero active students');
    const empty = findByClass(host, 'kpi-empty-state');
    assert(empty !== null,
        'empty-state placeholder is rendered instead of an empty table');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
