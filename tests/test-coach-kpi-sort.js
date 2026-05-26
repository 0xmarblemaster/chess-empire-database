/**
 * Tests for clickable column sorting on the Coach Performance leaderboard
 * (renderLeaderboard in coach-kpi.js).
 *
 * Behaviour pinned here:
 *   1. Clicking a metric header (Top-3) sorts by that column desc.
 *   2. Re-clicking the same header flips direction (desc → asc).
 *   3. Clicking the Coach header sorts alphabetically asc on first click.
 *   4. Sort state persists across re-render after a language change.
 *   5. Medals (rank-1/2/3) only paint when sort is total_tournaments desc.
 *
 * Run: node tests/test-coach-kpi-sort.js
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

function findThByKey(root, key) {
    const ths = findAllByTag(root, 'th');
    for (const th of ths) {
        if (th.attributes && th.attributes['data-sort-key'] === key) return th;
    }
    return null;
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

function leaderboardRows() {
    // Hand-picked numbers so each sort produces a different unique ordering —
    // makes assertions easy to read.
    return [
        { coach_id: 'co-1', coach_name: 'Carol Cardenas',
          active_students_count: 8, active_players_count: 5, total_tournaments: 2,
          top3_count: 4, promotions_count: 1, new_razryads_count: 0 },
        { coach_id: 'co-2', coach_name: 'Alice Anderson',
          active_students_count: 5, active_players_count: 4, total_tournaments: 6,
          top3_count: 1, promotions_count: 3, new_razryads_count: 2 },
        { coach_id: 'co-3', coach_name: 'Bob Brown',
          active_students_count: 6, active_players_count: 6, total_tournaments: 4,
          top3_count: 2, promotions_count: 2, new_razryads_count: 1 },
    ];
}

// ── 1: Clicking Top-3 sorts by top3_count desc ─────────────────────────────

console.log('\n=== Clicking the Top-3 header sorts by top3_count desc ===============\n');
(function testClickTop3() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    kpi.renderLeaderboard(host, leaderboardRows(), {});

    const tableBefore = findByClass(host, 'kpi-leaderboard');
    // Default sort: total_tournaments desc → Alice(6), Bob(4), Carol(2).
    assertEqual(rowCoachNames(tableBefore),
        ['Alice Anderson', 'Bob Brown', 'Carol Cardenas'],
        'default render is sorted by total_tournaments desc');

    const top3Th = findThByKey(tableBefore, 'top3_count');
    assert(top3Th !== null, 'Top-3 header carries data-sort-key="top3_count"');
    assertEqual(top3Th.attributes.role, 'button',
        'Top-3 header has role="button"');
    assertEqual(top3Th.attributes.tabindex, '0',
        'Top-3 header has tabindex="0"');

    top3Th.dispatch('click', {});

    const tableAfter = findByClass(host, 'kpi-leaderboard');
    // top3_count desc → Carol(4), Bob(2), Alice(1).
    assertEqual(rowCoachNames(tableAfter),
        ['Carol Cardenas', 'Bob Brown', 'Alice Anderson'],
        'after click on Top-3: rows sort by top3_count desc');

    const top3ThAfter = findThByKey(tableAfter, 'top3_count');
    assertEqual(top3ThAfter.attributes['aria-sort'], 'descending',
        'Top-3 header now has aria-sort="descending"');
    const arrow = findByClass(top3ThAfter, 'sort-arrow');
    assert(arrow !== null, 'Top-3 header shows a .sort-arrow span when active');
    assert(arrow && /▼/.test(arrow.textContent),
        'Top-3 sort-arrow renders ▼ (descending glyph)');

    // Inactive headers have aria-sort="none" and no sort-arrow child.
    const coachTh = findThByKey(tableAfter, 'coach_name');
    assertEqual(coachTh.attributes['aria-sort'], 'none',
        'Coach header aria-sort="none" while Top-3 is active');
    const coachArrow = findByClass(coachTh, 'sort-arrow');
    assert(coachArrow === null,
        'Coach header has no sort-arrow when inactive');
})();

// ── 2: Clicking same header twice flips to asc ─────────────────────────────

console.log('\n=== Clicking the same header twice flips direction (desc → asc) ======\n');
(function testFlipDirection() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    kpi.renderLeaderboard(host, leaderboardRows(), {});

    const top3Th1 = findThByKey(findByClass(host, 'kpi-leaderboard'), 'top3_count');
    top3Th1.dispatch('click', {});

    let table = findByClass(host, 'kpi-leaderboard');
    assertEqual(rowCoachNames(table),
        ['Carol Cardenas', 'Bob Brown', 'Alice Anderson'],
        'first click: top3_count desc');

    const top3Th2 = findThByKey(table, 'top3_count');
    top3Th2.dispatch('click', {});

    table = findByClass(host, 'kpi-leaderboard');
    // top3_count asc → Alice(1), Bob(2), Carol(4).
    assertEqual(rowCoachNames(table),
        ['Alice Anderson', 'Bob Brown', 'Carol Cardenas'],
        'second click on same header: top3_count asc');

    const top3ThAfter = findThByKey(table, 'top3_count');
    assertEqual(top3ThAfter.attributes['aria-sort'], 'ascending',
        'after second click: aria-sort="ascending"');
    const arrow = findByClass(top3ThAfter, 'sort-arrow');
    assert(arrow && /▲/.test(arrow.textContent),
        'arrow glyph flips to ▲ on ascending');
})();

// ── 3: Clicking Coach sorts alphabetically asc on first click ──────────────

console.log('\n=== Clicking Coach sorts alphabetically asc on first click ===========\n');
(function testCoachAsc() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    kpi.renderLeaderboard(host, leaderboardRows(), {});

    const coachTh = findThByKey(findByClass(host, 'kpi-leaderboard'), 'coach_name');
    assert(coachTh !== null, 'Coach header carries data-sort-key="coach_name"');
    coachTh.dispatch('click', {});

    const table = findByClass(host, 'kpi-leaderboard');
    assertEqual(rowCoachNames(table),
        ['Alice Anderson', 'Bob Brown', 'Carol Cardenas'],
        'after click on Coach: rows sort alphabetically asc');

    const coachThAfter = findThByKey(table, 'coach_name');
    assertEqual(coachThAfter.attributes['aria-sort'], 'ascending',
        'Coach header aria-sort="ascending" on first click');
})();

// ── 4: Sort state persists across re-render after language toggle ──────────

console.log('\n=== Sort state persists across re-render after language toggle =======\n');
(function testPersistsAcrossLanguageToggle() {
    const kpi = loadKpi();
    // Stub a window.i18n the module can consult after subscribing.
    let lang = 'en';
    const TRANSLATIONS = {
        en: { coachKpiColTop3: 'Top-3', coachKpiColCoach: 'Coach' },
        ru: { coachKpiColTop3: 'Топ-3', coachKpiColCoach: 'Тренер' },
    };
    global.window.i18n = {
        t(key) {
            const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
            return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
        },
    };

    const host = makeMockEl('div');
    const adapter = (key, fb) => {
        const v = global.window.i18n.t(key);
        return v && v !== key ? v : fb;
    };
    kpi.renderLeaderboard(host, leaderboardRows(), { t: adapter });

    // Click Top-3 → state becomes { top3_count, desc }.
    const top3Th = findThByKey(findByClass(host, 'kpi-leaderboard'), 'top3_count');
    top3Th.dispatch('click', {});

    let table = findByClass(host, 'kpi-leaderboard');
    assertEqual(rowCoachNames(table),
        ['Carol Cardenas', 'Bob Brown', 'Alice Anderson'],
        'pre-toggle: rows sorted by top3_count desc');

    // Subscribe and fire the language-change event the production dropdown
    // dispatches. _rerenderAll replays renderLeaderboard with a fresh `t`.
    kpi.subscribeLanguageEvents();
    lang = 'ru';
    const winListeners = global.window._listeners['languageChanged'] || [];
    assert(winListeners.length >= 1,
        'subscribeLanguageEvents attached a languageChanged listener');
    for (const fn of winListeners) fn({ type: 'languageChanged' });

    table = findByClass(host, 'kpi-leaderboard');
    // Sort order survives the re-render — still top3_count desc.
    assertEqual(rowCoachNames(table),
        ['Carol Cardenas', 'Bob Brown', 'Alice Anderson'],
        'after language toggle: sort by top3_count desc still applies');

    // Headers re-rendered in the new language — proves the re-render ran.
    const top3ThAfter = findThByKey(table, 'top3_count');
    assertEqual(top3ThAfter.textContent, 'Топ-3',
        'header text re-rendered to Russian after toggle');
    assertEqual(top3ThAfter.attributes['aria-sort'], 'descending',
        'aria-sort=descending preserved across language re-render');
})();

// ── 5: Medals only appear when sort is total_tournaments desc ──────────────

console.log('\n=== Medals (rank-1/2/3) only appear on total_tournaments desc ========\n');
(function testMedalsGuard() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    kpi.renderLeaderboard(host, leaderboardRows(), {});

    let classes = rowRankClasses(findByClass(host, 'kpi-leaderboard'));
    assert(/\brank-1\b/.test(classes[0]),
        'default render: first row has rank-1 class');
    assert(/\brank-2\b/.test(classes[1]),
        'default render: second row has rank-2 class');
    assert(/\brank-3\b/.test(classes[2]),
        'default render: third row has rank-3 class');

    // Click Top-3 → no longer the default sort, medals must disappear.
    findThByKey(findByClass(host, 'kpi-leaderboard'), 'top3_count').dispatch('click', {});
    classes = rowRankClasses(findByClass(host, 'kpi-leaderboard'));
    assert(!/\brank-1\b/.test(classes[0]),
        'after sort by Top-3: rank-1 class is gone');
    assert(!/\brank-2\b/.test(classes[1]),
        'after sort by Top-3: rank-2 class is gone');
    assert(!/\brank-3\b/.test(classes[2]),
        'after sort by Top-3: rank-3 class is gone');

    // Click Tournaments → state { total_tournaments, desc } (different key
    // resets to its default direction). Medals come back.
    findThByKey(findByClass(host, 'kpi-leaderboard'), 'total_tournaments').dispatch('click', {});
    classes = rowRankClasses(findByClass(host, 'kpi-leaderboard'));
    assert(/\brank-1\b/.test(classes[0]),
        'switching to total_tournaments (defaultDir=desc): rank-1 medal returns');
    assert(/\brank-2\b/.test(classes[1]),
        'switching to total_tournaments (defaultDir=desc): rank-2 medal returns');
    assert(/\brank-3\b/.test(classes[2]),
        'switching to total_tournaments (defaultDir=desc): rank-3 medal returns');

    // Click Tournaments again → flip to asc — medals must drop.
    findThByKey(findByClass(host, 'kpi-leaderboard'), 'total_tournaments').dispatch('click', {});
    classes = rowRankClasses(findByClass(host, 'kpi-leaderboard'));
    assert(!/\brank-1\b/.test(classes[0]),
        'flip total_tournaments to asc: medals gone (direction must be desc)');
    assert(!/\brank-2\b/.test(classes[1]),
        'flip total_tournaments to asc: rank-2 medal gone too');

    // Click once more → back to desc — medals return.
    findThByKey(findByClass(host, 'kpi-leaderboard'), 'total_tournaments').dispatch('click', {});
    classes = rowRankClasses(findByClass(host, 'kpi-leaderboard'));
    assert(/\brank-1\b/.test(classes[0]),
        'flip back to total_tournaments desc: rank-1 medal returns');
})();

// ── 6: keyboard activation (Enter / Space) wires the same handler ──────────

console.log('\n=== Keyboard Enter / Space activates a header ========================\n');
(function testKeyboardActivation() {
    const kpi = loadKpi();
    const host = makeMockEl('div');
    kpi.renderLeaderboard(host, leaderboardRows(), {});

    const coachTh = findThByKey(findByClass(host, 'kpi-leaderboard'), 'coach_name');
    let prevented = 0;
    const e = {
        key: 'Enter',
        preventDefault() { prevented++; },
    };
    coachTh.dispatch('keydown', e);

    const table = findByClass(host, 'kpi-leaderboard');
    assertEqual(rowCoachNames(table),
        ['Alice Anderson', 'Bob Brown', 'Carol Cardenas'],
        'Enter on Coach header sorts alphabetically asc');
    assert(prevented === 1,
        'Enter handler called preventDefault to suppress scroll/etc');

    const spaceEvent = {
        key: ' ',
        preventDefault() { prevented++; },
    };
    findThByKey(table, 'coach_name').dispatch('keydown', spaceEvent);
    const tableAfter = findByClass(host, 'kpi-leaderboard');
    assertEqual(rowCoachNames(tableAfter),
        ['Carol Cardenas', 'Bob Brown', 'Alice Anderson'],
        'Space on the same Coach header flips to desc');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
