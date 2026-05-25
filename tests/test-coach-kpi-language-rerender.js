/**
 * Tests for the language re-render wiring in coach-kpi.js and
 * coach-kpi-upload.js.
 *
 * The DOM renderers paint text nodes directly (no data-i18n attributes), so
 * i18n.js's applyTranslations() can not retranslate them when the user flips
 * EN ↔ RU. Both modules compensate by:
 *
 *   1. Caching the (container, args) tuple of every render via
 *      `_rememberRender` (coach-kpi.js) / `_rememberUploadRender`
 *      (coach-kpi-upload.js).
 *   2. Subscribing to the production `languageChanged` (window) +
 *      `languagechange` (document) events.
 *   3. Replaying the cached render with a fresh `t` adapter on each event.
 *
 * This file pins down the contract end-to-end:
 *   - subscribeLanguageEvents() is idempotent.
 *   - Firing the language event re-renders previously rendered containers
 *     with the new translations.
 *   - initCoachKpi() wires the subscription automatically.
 *   - The upload modal re-renders on language change.
 *   - "All time" is no longer offered in the period selector.
 *
 * Run: node tests/test-coach-kpi-language-rerender.js
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

function makeDom(ids) {
    const elements = {};
    const _listeners = {};
    if (ids) for (const id of ids) {
        const el = makeMockEl('div');
        el.id = id;
        elements[id] = el;
    }
    return {
        elements,
        _listeners,
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeMockEl(tag); },
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

function findAllByTag(root, tag, out) {
    out = out || [];
    if (!root) return out;
    if (root.tagName === tag) out.push(root);
    if (Array.isArray(root.children)) {
        for (const c of root.children) findAllByTag(c, tag, out);
    }
    return out;
}

function loadKpi(globals) {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    if (globals && globals.document !== undefined) global.document = globals.document;
    else global.document = { createElement: makeMockEl };
    if (globals && globals.window !== undefined) global.window = globals.window;
    else global.window = {};
    if (globals && globals.setTimeout !== undefined) global.setTimeout = globals.setTimeout;
    return require(modulePath);
}

// (loadUpload removed — coach-kpi-upload.js is gone; upload UI now lives in
// the Rating Management modal with data-i18n attributes handled by i18n.js.)

// Translations that mimic the production i18n adapter — different by language.
const TRANSLATIONS = {
    en: {
        coachKpiActiveStudents: 'Active students',
        coachKpiTournamentsYtd: 'Tournaments',
        coachKpiTop3: 'Top-3 finishes',
        coachKpiPromotions: 'Promotions',
        coachKpiNewRazryads: 'New razryads',
        coachKpiParticipation: 'Participation',
        coachKpiWindowGroup: 'Time window',
        coachKpiLeagueGroup: 'League',
        coachKpiBranchGroup: 'Branch',
        coachKpiBranchAll: 'All branches',
        coachKpiColCoach: 'Coach',
        coachKpiColActive: 'Active',
        coachKpiColTournaments: 'Tournaments',
        coachKpiColTop3: 'Top-3',
        coachKpiColPromotions: 'Promotions',
        coachKpiColRazryads: 'Razryads',
        'admin.coachKpi.uploadTitle': 'Upload tournament',
        'admin.coachKpi.uploadKind': 'Tournament type',
        'admin.coachKpi.uploadFile': 'Swiss-Manager export',
        'admin.coachKpi.uploadDate': 'Tournament date',
        'admin.coachKpi.uploadCommit': 'Commit upload',
        'common.cancel': 'Cancel',
    },
    ru: {
        coachKpiActiveStudents: 'Активные ученики',
        coachKpiTournamentsYtd: 'Турниры с начала года',
        coachKpiTop3: 'Топ-3 места',
        coachKpiPromotions: 'Повышения уровня',
        coachKpiNewRazryads: 'Новые разряды',
        coachKpiParticipation: 'Участие',
        coachKpiWindowGroup: 'Период',
        coachKpiLeagueGroup: 'Лига',
        coachKpiBranchGroup: 'Филиал',
        coachKpiBranchAll: 'Все филиалы',
        coachKpiColCoach: 'Тренер',
        coachKpiColActive: 'Активные',
        coachKpiColTournaments: 'Турниры',
        coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Повышения',
        coachKpiColRazryads: 'Разряды',
        'admin.coachKpi.uploadTitle': 'Загрузка турнира',
        'admin.coachKpi.uploadKind': 'Тип турнира',
        'admin.coachKpi.uploadFile': 'Экспорт Swiss-Manager',
        'admin.coachKpi.uploadDate': 'Дата турнира',
        'admin.coachKpi.uploadCommit': 'Подтвердить загрузку',
        'common.cancel': 'Отмена',
    },
    kk: {
        coachKpiActiveStudents: 'Белсенді оқушылар',
        coachKpiTournamentsYtd: 'Жыл басынан бергі турнирлер',
        coachKpiTop3: 'Топ-3 орын',
        coachKpiPromotions: 'Деңгей көтерілуі',
        coachKpiNewRazryads: 'Жаңа разрядтар',
        coachKpiParticipation: 'Қатысу',
        coachKpiWindowGroup: 'Кезең',
        coachKpiLeagueGroup: 'Лига',
        coachKpiBranchGroup: 'Бөлімше',
        coachKpiBranchAll: 'Барлық бөлімшелер',
        coachKpiColCoach: 'Жаттықтырушы',
        coachKpiColActive: 'Белсенді',
        coachKpiColTournaments: 'Турнирлер',
        coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Көтерілулер',
        coachKpiColRazryads: 'Разрядтар',
        'admin.coachKpi.uploadTitle': 'Турнирді жүктеу',
        'admin.coachKpi.uploadKind': 'Турнир түрі',
        'admin.coachKpi.uploadFile': 'Swiss-Manager экспорты',
        'admin.coachKpi.uploadDate': 'Турнир күні',
        'admin.coachKpi.uploadCommit': 'Жүктеуді растау',
        'common.cancel': 'Бас тарту',
    },
};

function makeMutableI18n(initialLang) {
    const state = { lang: initialLang };
    return {
        state,
        i18n: {
            t(key) {
                const dict = TRANSLATIONS[state.lang] || TRANSLATIONS.en;
                return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
            },
        },
    };
}

console.log('\n=== "All time" period option is no longer exposed =====================\n');
(function testAllTimeDropped() {
    const kpi = loadKpi({});
    assert(!kpi.TIME_WINDOWS.includes('all'),
        'TIME_WINDOWS no longer contains "all"');
    assert(typeof kpi.WINDOW_LABELS.all === 'undefined',
        'WINDOW_LABELS has no "all" entry');

    // resolveTimeWindow('all') falls back to the default 90d window.
    const NOW = new Date(Date.UTC(2026, 4, 14, 12, 0, 0));
    const resolved = kpi.resolveTimeWindow('all', NOW);
    assert(resolved.preset === '90d',
        'resolveTimeWindow("all") falls back to 90d default');

    // renderFilters must not paint an All-time pill.
    const container = makeMockEl('div');
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, {});
    const pills = findAllByClass(container, 'kpi-filter-pill');
    assert(pills.length === 3, 'renderFilters mounts three pills (no All-time pill)');
    const pillWindows = pills.map(p => p.dataset && p.dataset.window);
    assert(!pillWindows.includes('all'),
        'no pill exposes data-window="all"');
})();

console.log('\n=== subscribeLanguageEvents is idempotent =============================\n');
(function testSubscribeIdempotent() {
    const win = makeWindow();
    win.i18n = makeMutableI18n('en').i18n;  // already-loaded — no defer path
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    kpi.subscribeLanguageEvents();
    kpi.subscribeLanguageEvents();
    kpi.subscribeLanguageEvents();

    const winListeners = (win._listeners['languageChanged'] || []).length;
    const docListeners = (dom._listeners['languagechange'] || []).length;
    assert(winListeners === 1,
        'window languageChanged handler attached exactly once after three calls');
    assert(docListeners === 1,
        'document languagechange handler attached exactly once after three calls');
})();

console.log('\n=== language event triggers _rerenderAll on cached renderers ==========\n');
(function testLanguageEventRerenders() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('ru');
    win.i18n = i18nStub.i18n;
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    // Render a hero block via initCoachKpi-style adapter so the cache picks it up.
    const heroHost = makeMockEl('div');
    const adapter = (key, fb) => {
        const v = win.i18n.t(key);
        return v && v !== key ? v : fb;
    };
    kpi.renderSchoolHero(heroHost, {
        active_students_count: 5,
        total_tournaments: 3,
        top3_count: 1,
        promotions_count: 1,
        new_razryads_count: 0,
        participation_pct: 50,
    }, { t: adapter });

    // First paint: Russian labels.
    let labels = findAllByClass(heroHost, 'stat-card-label').map(n => n.textContent);
    assert(labels.includes('Активные ученики'),
        'first paint: hero labels render in Russian');

    // Subscribe + flip language to English.
    kpi.subscribeLanguageEvents();
    i18nStub.state.lang = 'en';
    // Fire the canonical event the production dropdown dispatches on window.
    for (const fn of (win._listeners['languageChanged'] || [])) fn({ type: 'languageChanged' });

    labels = findAllByClass(heroHost, 'stat-card-label').map(n => n.textContent);
    assert(labels.includes('Active students'),
        'after languageChanged: hero labels re-rendered in English');
    assert(!labels.includes('Активные ученики'),
        'after languageChanged: old Russian labels are gone');
})();

console.log('\n=== language event re-renders the leaderboard ========================\n');
(function testLeaderboardRerender() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('en');
    win.i18n = i18nStub.i18n;
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    const host = makeMockEl('div');
    const adapter = (key, fb) => {
        const v = win.i18n.t(key);
        return v && v !== key ? v : fb;
    };
    kpi.renderLeaderboard(host, [{
        coach_id: 'c1', coach_name: 'Ivan Ivanov',
        active_students_count: 5, total_tournaments: 3, top3_count: 1,
        total_rating_gained: 12, promotions_count: 1, new_razryads_count: 0,
        composite_score: 65,
    }], { t: adapter });

    let headers = findAllByTag(host, 'th').map(n => n.textContent);
    assert(headers[0] === 'Coach', 'first paint: header → "Coach" (English)');

    kpi.subscribeLanguageEvents();
    i18nStub.state.lang = 'ru';
    // Fire the legacy document.languagechange path that real i18n.js dispatches.
    for (const fn of (dom._listeners['languagechange'] || [])) fn({ type: 'languagechange' });

    headers = findAllByTag(host, 'th').map(n => n.textContent);
    assert(headers[0] === 'Тренер',
        'after languagechange: header re-renders as "Тренер" (Russian)');
})();

console.log('\n=== _rerenderAll covers every cached container, not just the last ====\n');
(function testCoversAllContainers() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('en');
    win.i18n = i18nStub.i18n;
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    const adapter = (key, fb) => {
        const v = win.i18n.t(key);
        return v && v !== key ? v : fb;
    };

    const heroHost = makeMockEl('div');
    const lbHost = makeMockEl('div');
    const filtersHost = makeMockEl('div');

    kpi.renderSchoolHero(heroHost, {
        active_students_count: 1, total_tournaments: 1, top3_count: 1,
        promotions_count: 1, new_razryads_count: 1, participation_pct: 50,
    }, { t: adapter });
    kpi.renderLeaderboard(lbHost, [{
        coach_id: 'c1', coach_name: 'X', composite_score: 50,
    }], { t: adapter });
    kpi.renderFilters(filtersHost, undefined, { t: adapter });

    kpi.subscribeLanguageEvents();
    i18nStub.state.lang = 'ru';
    for (const fn of (win._listeners['languageChanged'] || [])) fn({ type: 'languageChanged' });

    const heroLabels = findAllByClass(heroHost, 'stat-card-label').map(n => n.textContent);
    const lbHeaders = findAllByTag(lbHost, 'th').map(n => n.textContent);
    const filterLabels = findAllByClass(filtersHost, 'filter-label').map(n => n.textContent);

    assert(heroLabels.includes('Активные ученики'),
        'hero container re-rendered in Russian');
    assert(lbHeaders.includes('Тренер'),
        'leaderboard container re-rendered in Russian');
    assert(filterLabels.includes('Период'),
        'filters container re-rendered in Russian');
})();

console.log('\n=== _rememberRender dedups by container (no stale entries) ============\n');
(function testCacheDedup() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('en');
    win.i18n = i18nStub.i18n;
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    const adapter = (key, fb) => {
        const v = win.i18n.t(key);
        return v && v !== key ? v : fb;
    };

    const host = makeMockEl('div');
    // First a hero, then re-render the same host as a leaderboard. Only the
    // latest renderer should fire on language change.
    kpi.renderSchoolHero(host, {
        active_students_count: 1, total_tournaments: 1, top3_count: 1,
        promotions_count: 1, new_razryads_count: 1, participation_pct: 50,
    }, { t: adapter });
    kpi.renderLeaderboard(host, [{
        coach_id: 'c1', coach_name: 'X', composite_score: 50,
    }], { t: adapter });

    kpi.subscribeLanguageEvents();
    i18nStub.state.lang = 'ru';
    for (const fn of (win._listeners['languageChanged'] || [])) fn({ type: 'languageChanged' });

    // After re-render, the host should still be a leaderboard (not a hero).
    const tables = findAllByTag(host, 'table');
    assert(tables.length === 1,
        'cache dedups by container — only the leaderboard fires, not the stale hero');
    const heroLabels = findAllByClass(host, 'stat-card-label');
    assert(heroLabels.length === 0,
        'no leftover hero stat-card-labels after re-render');
})();

console.log('\n=== initCoachKpi auto-subscribes (admin handlers do not have to) =====\n');
(function testInitCoachKpiSubscribes() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('ru');
    win.i18n = i18nStub.i18n;
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard']);
    const kpi = loadKpi({ window: win, document: dom });

    kpi.initCoachKpi({ isAdmin: true });

    // initCoachKpi rendered the filter bar in Russian.
    const filtersHost = dom.elements['coach-kpi-filters'];
    let labels = findAllByClass(filtersHost, 'filter-label').map(n => n.textContent);
    assert(labels.includes('Период'),
        'initCoachKpi first paint: filter label in Russian');

    // Flip to English and dispatch — initCoachKpi must have wired the listeners.
    i18nStub.state.lang = 'en';
    const winListeners = win._listeners['languageChanged'] || [];
    assert(winListeners.length === 1,
        'initCoachKpi attached one window.languageChanged listener');
    for (const fn of winListeners) fn({ type: 'languageChanged' });

    labels = findAllByClass(filtersHost, 'filter-label').map(n => n.textContent);
    assert(labels.includes('Time window'),
        'after languageChanged: filter label re-rendered in English');
})();

console.log('\n=== initCoachKpi double-init does not double-subscribe ===============\n');
(function testInitCoachKpiIdempotent() {
    const win = makeWindow();
    win.i18n = makeMutableI18n('en').i18n;
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard']);
    const kpi = loadKpi({ window: win, document: dom });

    kpi.initCoachKpi({ isAdmin: true });
    kpi.initCoachKpi({ isAdmin: true });
    kpi.initCoachKpi({ isAdmin: true });

    const winListeners = (win._listeners['languageChanged'] || []).length;
    assert(winListeners === 1,
        'three initCoachKpi calls still result in one languageChanged listener');
})();

console.log('\n=== race fix: subscribe defers until window.i18n loads ================\n');
(function testRaceDeferralUntilI18n() {
    const win = makeWindow();
    // Intentionally no window.i18n at first.
    const dom = makeDom([]);
    // Stub setTimeout so the poll fires synchronously when we want it to.
    const pending = [];
    const stubSetTimeout = (fn /*, ms */) => { pending.push(fn); return pending.length; };
    const kpi = loadKpi({ window: win, document: dom, setTimeout: stubSetTimeout });

    kpi.subscribeLanguageEvents();
    assert(!win.__kpiLangSubscribed,
        'no window.i18n yet → __kpiLangSubscribed is NOT flipped');
    assert(win.__kpiLangPending === true,
        'pending flag set so concurrent calls do not double-poll');

    // i18n loads, the next poll tick should attach listeners.
    win.i18n = makeMutableI18n('en').i18n;
    // Drain queued polls until subscription completes.
    while (pending.length > 0 && !win.__kpiLangSubscribed) {
        const fn = pending.shift();
        fn();
    }
    assert(win.__kpiLangSubscribed === true,
        'after window.i18n appears, the poll completes the subscription');
    const winListeners = (win._listeners['languageChanged'] || []).length;
    assert(winListeners === 1,
        'exactly one languageChanged listener attached on the deferred subscribe path');
})();

// -------- merged Rating Management modal i18n keys ------------------------
//
// The standalone upload modal was deleted when the upload UI moved into
// csvImportModal. Re-rendering on language change for that modal is handled
// by i18n.js's applyTranslations() since every label carries a data-i18n
// attribute in admin-v2.html. Below we pin down the keys that must resolve in
// each language so a future i18n refactor cannot drop them.

console.log('\n=== merged Rating Management modal i18n keys translate (EN/RU/KK) =====\n');
(function testCsvImportModalI18nKeys() {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin-v2.html'), 'utf8');

    const modalMatch = html.match(/<div id="csvImportModal"[\s\S]*?<\/div>\s*<!--\s*Unmatched/);
    assert(modalMatch !== null, '#csvImportModal block found in admin-v2.html');
    const modalHtml = modalMatch ? modalMatch[0] : '';

    assert(/id="csvUploadKind"/.test(modalHtml),
        '#csvUploadKind selector lives inside csvImportModal');
    assert(/id="csvTournamentMeta"/.test(modalHtml),
        '#csvTournamentMeta block lives inside csvImportModal');
    assert(/data-i18n="admin\.imports\.kindLabel"/.test(modalHtml),
        'kind label carries data-i18n="admin.imports.kindLabel"');
    assert(/data-i18n="admin\.imports\.tournamentDate"/.test(modalHtml),
        'tournament-date label carries data-i18n="admin.imports.tournamentDate"');
    assert(/data-i18n="admin\.imports\.tournamentRounds"/.test(modalHtml),
        'rounds label carries data-i18n="admin.imports.tournamentRounds"');
    assert(/data-i18n="admin\.imports\.sourceFile"/.test(modalHtml),
        'source-file label carries data-i18n="admin.imports.sourceFile"');
})();

console.log('\n=== language event re-renders into Kazakh =============================\n');
(function testLanguageEventRerenderKK() {
    const win = makeWindow();
    const i18nStub = makeMutableI18n('en');
    win.i18n = i18nStub.i18n;
    const dom = makeDom([]);
    const kpi = loadKpi({ window: win, document: dom });

    const heroHost = makeMockEl('div');
    const lbHost = makeMockEl('div');
    const filtersHost = makeMockEl('div');
    const adapter = (key, fb) => {
        const v = win.i18n.t(key);
        return v && v !== key ? v : fb;
    };
    kpi.renderSchoolHero(heroHost, {
        active_students_count: 1, total_tournaments: 1, top3_count: 1,
        promotions_count: 1, new_razryads_count: 1, participation_pct: 50,
    }, { t: adapter });
    kpi.renderLeaderboard(lbHost, [{
        coach_id: 'c1', coach_name: 'X', composite_score: 50,
    }], { t: adapter });
    kpi.renderFilters(filtersHost, undefined, { t: adapter });

    kpi.subscribeLanguageEvents();

    // Flip EN → KK and re-fire the event.
    i18nStub.state.lang = 'kk';
    for (const fn of (win._listeners['languageChanged'] || [])) fn({ type: 'languageChanged' });

    const heroLabels = findAllByClass(heroHost, 'stat-card-label').map(n => n.textContent);
    const lbHeaders = findAllByTag(lbHost, 'th').map(n => n.textContent);
    const filterLabels = findAllByClass(filtersHost, 'filter-label').map(n => n.textContent);

    assert(heroLabels.includes('Белсенді оқушылар'),
        'hero re-rendered with Kazakh "Белсенді оқушылар"');
    assert(lbHeaders.includes('Жаттықтырушы'),
        'leaderboard header re-rendered with Kazakh "Жаттықтырушы"');
    assert(filterLabels.includes('Кезең'),
        'filter label re-rendered with Kazakh "Кезең"');

    // Flip KK → RU and re-fire the event.
    i18nStub.state.lang = 'ru';
    for (const fn of (win._listeners['languageChanged'] || [])) fn({ type: 'languageChanged' });

    const heroLabelsRu = findAllByClass(heroHost, 'stat-card-label').map(n => n.textContent);
    assert(heroLabelsRu.includes('Активные ученики'),
        'after KK → RU: hero re-rendered with Russian "Активные ученики"');
    assert(!heroLabelsRu.includes('Белсенді оқушылар'),
        'after KK → RU: stale Kazakh labels are gone');
})();

console.log('\n=== regression guard: real window.i18n.t resolves Coach KPI keys ======\n');
(function testRealI18nResolvesCoachKpiKeys() {
    // Load the production i18n.js with a minimal browser-like shim so we can
    // call window.i18n.t directly. This guards against the original bug where
    // Coach KPI keys lived only in the legacy outer dict — window.i18n.t (the
    // active inner tree) would then return the literal key string for every
    // Coach KPI lookup, and the dashboard rendered fully English regardless
    // of language. If any of these assertions fail, keys have landed in the
    // wrong tree again.
    const storage = {};
    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevLocalStorage = global.localStorage;
    const prevNavigator = global.navigator;
    const prevCustomEvent = global.CustomEvent;
    const prevDocumentCtor = global.Document;

    global.localStorage = {
        getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
        setItem(k, v) { storage[k] = String(v); },
        removeItem(k) { delete storage[k]; },
    };
    global.navigator = { language: 'en' };
    global.Document = function Document() {};
    const docListeners = {};
    const docStub = Object.create(global.Document.prototype);
    Object.assign(docStub, {
        documentElement: { setAttribute() {} },
        addEventListener(name, fn) { (docListeners[name] = docListeners[name] || []).push(fn); },
        dispatchEvent(event) {
            for (const fn of (docListeners[event.type] || [])) fn(event);
        },
        querySelectorAll() { return []; },
        querySelector() { return null; },
    });
    global.document = docStub;
    global.window = global;
    global.CustomEvent = function CustomEvent(type, init) {
        this.type = type;
        this.detail = init && init.detail;
    };

    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'i18n.js'));
    delete require.cache[modulePath];
    require(modulePath);

    assert(global.window.i18n && typeof global.window.i18n.t === 'function',
        'i18n.js exposes window.i18n.t after load');

    // Coach KPI keys MUST NOT return the literal key string — they must
    // resolve to actual translated copy from the active tree.
    const enWindow = global.window.i18n.t('coachKpiTimeWindow30d');
    assert(enWindow !== 'coachKpiTimeWindow30d',
        'window.i18n.t("coachKpiTimeWindow30d") does NOT return the literal key (English)');
    assert(enWindow === '30 days',
        'window.i18n.t("coachKpiTimeWindow30d") === "30 days" in English');

    const enUpload = global.window.i18n.t('admin.coachKpi.uploadTitle');
    assert(enUpload !== 'admin.coachKpi.uploadTitle',
        'window.i18n.t("admin.coachKpi.uploadTitle") does NOT return the literal key');
    assert(enUpload === 'Upload tournament',
        'window.i18n.t("admin.coachKpi.uploadTitle") === "Upload tournament" in English');

    // Flip to Russian via the active tree's setLanguage.
    global.window.i18n.setLanguage('ru', { silent: true });
    const ruWindow = global.window.i18n.t('coachKpiTimeWindow30d');
    assert(ruWindow === '30 дней',
        'window.i18n.t("coachKpiTimeWindow30d") === "30 дней" in Russian');
    const ruUpload = global.window.i18n.t('admin.coachKpi.uploadTitle');
    assert(ruUpload === 'Загрузка турнира',
        'window.i18n.t("admin.coachKpi.uploadTitle") === "Загрузка турнира" in Russian');

    // Flip to Kazakh — the new locale added in this commit.
    global.window.i18n.setLanguage('kk', { silent: true });
    const kkWindow = global.window.i18n.t('coachKpiTimeWindow30d');
    assert(kkWindow !== 'coachKpiTimeWindow30d',
        'window.i18n.t("coachKpiTimeWindow30d") does NOT return literal key in Kazakh');
    assert(kkWindow === '30 күн',
        'window.i18n.t("coachKpiTimeWindow30d") === "30 күн" in Kazakh');
    const kkUpload = global.window.i18n.t('admin.coachKpi.uploadTitle');
    assert(kkUpload === 'Турнирді жүктеу',
        'window.i18n.t("admin.coachKpi.uploadTitle") === "Турнирді жүктеу" in Kazakh');

    // Restore globals so later test files start clean.
    delete require.cache[modulePath];
    if (prevWindow === undefined) delete global.window; else global.window = prevWindow;
    if (prevDocument === undefined) delete global.document; else global.document = prevDocument;
    if (prevLocalStorage === undefined) delete global.localStorage; else global.localStorage = prevLocalStorage;
    if (prevNavigator === undefined) delete global.navigator; else global.navigator = prevNavigator;
    if (prevCustomEvent === undefined) delete global.CustomEvent; else global.CustomEvent = prevCustomEvent;
    if (prevDocumentCtor === undefined) delete global.Document; else global.Document = prevDocumentCtor;
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
