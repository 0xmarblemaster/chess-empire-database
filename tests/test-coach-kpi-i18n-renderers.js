/**
 * Tests for the Coach KPI dashboard renderer-level i18n wiring.
 *
 * The Phase-2 redesign threaded an `opts.t(key, fallback)` adapter through
 * every renderer in coach-kpi.js and coach-kpi-upload.js. These tests pin
 * down the contract:
 *
 *   - renderSchoolHero, renderLeaderboard, renderFilters honour opts.t for
 *     hero labels, column headers, and filter group labels.
 *   - renderPhase2Leaderboard honours opts.t for its "no data yet" empty
 *     state and column headers.
 *   - The chart renderers' "Chart.js not loaded" fallback honours opts.t.
 *   - renderUploadModal localizes its title, kind label, file label,
 *     date label, cancel and commit buttons.
 *   - When a renderer is called without opts.t, the upload modal still
 *     pulls strings from window.i18n.t if available; otherwise English
 *     fallbacks are used so the modal never renders empty.
 *
 * Run: node tests/test-coach-kpi-i18n-renderers.js
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

function makeDom(ids) {
    const elements = {};
    if (ids) for (const id of ids) {
        const el = makeMockEl('div');
        el.id = id;
        elements[id] = el;
    }
    return {
        elements,
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeMockEl(tag); },
    };
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
    return require(modulePath);
}

function loadUpload(globals) {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi-upload.js'));
    delete require.cache[modulePath];
    if (globals && globals.document !== undefined) global.document = globals.document;
    else global.document = { createElement: makeMockEl };
    if (globals && globals.window !== undefined) global.window = globals.window;
    else global.window = {};
    return require(modulePath);
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

// Russian translations the production app would return for every key the
// renderers consult. Anything not listed falls back to the English string
// passed by the renderer — that's the contract we're verifying.
const RU = {
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
    coachKpiEmptyTitle: 'Данных пока нет',
    coachKpiNoDataYet: 'За выбранный период данных пока нет.',
    coachKpiChartUnavailable: 'Chart.js не загружен',
    coachKpiColCoach: 'Тренер',
    coachKpiColActive: 'Активные',
    coachKpiColTournaments: 'Турниры',
    coachKpiColTop3: 'Топ-3',
    coachKpiColRatingGained: 'Прирост рейтинга',
    coachKpiColPromotions: 'Повышения',
    coachKpiColRazryads: 'Разряды',
    coachKpiColScore: 'Балл',
    'admin.coachKpi.uploadTitle': 'Загрузка турнира',
    'admin.coachKpi.uploadKind': 'Тип турнира',
    'admin.coachKpi.uploadFile': 'Экспорт Swiss-Manager',
    'admin.coachKpi.uploadDate': 'Дата турнира',
    'admin.coachKpi.uploadCommit': 'Подтвердить загрузку',
    'common.cancel': 'Отмена',
};
function ruT(key, fb) { return Object.prototype.hasOwnProperty.call(RU, key) ? RU[key] : fb; }

console.log('\n=== renderSchoolHero localizes its six hero labels =====================\n');
(function testSchoolHero() {
    const kpi = loadKpi({});
    const container = makeContainer();
    const summary = {
        active_students_count: 12,
        total_tournaments: 4,
        top3_count: 7,
        promotions_count: 2,
        new_razryads_count: 1,
        participation_pct: 0.75,
    };
    kpi.renderSchoolHero(container, summary, { t: ruT });

    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    assert(labels.length === 6, 'six hero cards render (one label per metric)');
    assert(labels.includes('Активные ученики'),
        'Active students label translated via coachKpiActiveStudents');
    assert(labels.includes('Турниры с начала года'),
        'Tournaments label translated via coachKpiTournamentsYtd');
    assert(labels.includes('Топ-3 места'),
        'Top-3 finishes label translated via coachKpiTop3');
    assert(labels.includes('Повышения уровня'),
        'Promotions label translated via coachKpiPromotions');
    assert(labels.includes('Новые разряды'),
        'New razryads label translated via coachKpiNewRazryads');
    assert(labels.includes('Участие'),
        'Participation label translated via coachKpiParticipation');
})();

console.log('\n=== renderSchoolHero falls back to English without opts.t ============\n');
(function testSchoolHeroFallback() {
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderSchoolHero(container, {
        active_students_count: 1,
        total_tournaments: 1,
        top3_count: 1,
        promotions_count: 1,
        new_razryads_count: 1,
        participation_pct: 0.5,
    });
    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    assert(labels.includes('Active students'),
        'English fallback "Active students" rendered when no opts.t supplied');
    assert(labels.includes('Tournaments'),
        'English fallback "Tournaments" rendered when no opts.t supplied');
    assert(labels.includes('Participation'),
        'English fallback "Participation" rendered when no opts.t supplied');
})();

console.log('\n=== renderLeaderboard localizes its eight column headers ==============\n');
(function testLeaderboardHeaders() {
    const kpi = loadKpi({});
    const container = makeContainer();
    const rows = [{
        coach_id: 'c1', coach_name: 'Ivan Ivanov',
        active_students_count: 5, total_tournaments: 3,
        top3_count: 1, total_rating_gained: 12,
        promotions_count: 1, new_razryads_count: 0,
        composite_score: 65,
    }];
    kpi.renderLeaderboard(container, rows, { t: ruT });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assert(headers.length === 8, 'eight <th> headers render');
    assert(headers[0] === 'Тренер', 'Coach column → Тренер');
    assert(headers[1] === 'Активные', 'Active column → Активные');
    assert(headers[2] === 'Турниры', 'Tournaments column → Турниры');
    assert(headers[3] === 'Топ-3', 'Top-3 column → Топ-3');
    assert(headers[4] === 'Прирост рейтинга', 'Rating gained column → Прирост рейтинга');
    assert(headers[5] === 'Повышения', 'Promotions column → Повышения');
    assert(headers[6] === 'Разряды', 'Razryads column → Разряды');
    assert(headers[7] === 'Балл', 'Score column → Балл');
})();

console.log('\n=== renderFilters localizes the three filter-group labels =============\n');
(function testFilterLabels() {
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, { t: ruT });
    const labels = findAllByClass(container, 'filter-label').map(n => n.textContent);
    assert(labels.includes('Период'), 'window-group label → Период');
    assert(labels.includes('Лига'), 'league-group label → Лига');
    assert(labels.includes('Филиал'), 'branch-group label → Филиал');

    // The "All branches" option in the branch <select> should also be localized.
    const branchSelect = findByClass(container, 'kpi-filter-branch');
    assert(branchSelect !== null, '.kpi-filter-branch mounted');
    const optionTexts = (branchSelect && branchSelect.children || []).map(o => o.textContent);
    assert(optionTexts.includes('Все филиалы'),
        '"All branches" option translated via coachKpiBranchAll');
})();

console.log('\n=== renderEmptyState helper + title localize through opts.t ===========\n');
(function testEmptyStateI18n() {
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderEmptyState(container, undefined, { t: ruT });
    const title = findByClass(container, 'kpi-empty-title');
    const helper = findByClass(container, 'kpi-empty-helper');
    assert(title && title.textContent === 'Данных пока нет',
        'empty-state title resolves via coachKpiEmptyTitle');
    // The default helper resolves via coachKpiEmptyState, which we deliberately
    // do not stub in RU — so the English fallback should land here. (Russian
    // copy is verified end-to-end in test-coach-kpi-i18n.js.)
    assert(helper && /Coach KPI data not yet available/.test(helper.textContent),
        'empty-state helper falls back to English coachKpiEmptyState when t() returns the key');
})();

console.log('\n=== renderPhase2Leaderboard empty + Chart fallback are localized ======\n');
(function testPhase2Empty() {
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderPhase2Leaderboard(container, [], { t: ruT });
    const helper = findByClass(container, 'kpi-empty-helper');
    assert(helper && helper.textContent === 'За выбранный период данных пока нет.',
        'phase-2 empty helper resolves via coachKpiNoDataYet');
})();

(function testChartUnavailable() {
    // Force Chart.js to be unavailable by leaving window/global Chart unset.
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderRazryadDoughnut(container, { KMS: 0, '1st': 1, '2nd': 0, '3rd': 0, '4th': 0, None: 0 }, { t: ruT });
    const helper = findByClass(container, 'kpi-empty-helper');
    assert(helper && helper.textContent === 'Chart.js не загружен',
        '"Chart.js not loaded" fallback localized via coachKpiChartUnavailable');
})();

console.log('\n=== initCoachKpi builds a window.i18n adapter and threads it through ===\n');
(function testInitCoachKpiAdapter() {
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard']);
    const calls = [];
    const win = {
        i18n: {
            t(key) {
                calls.push(key);
                if (Object.prototype.hasOwnProperty.call(RU, key)) return RU[key];
                return key; // mimic real i18n.t — returns the key when missing
            },
        },
    };
    const kpi = loadKpi({ document: dom, window: win });
    kpi.initCoachKpi({ isAdmin: true });

    // renderFilters in #coach-kpi-filters should have asked window.i18n for
    // coachKpiWindowGroup / coachKpiLeagueGroup / coachKpiBranchGroup.
    assert(calls.indexOf('coachKpiWindowGroup') !== -1,
        'initCoachKpi adapter consulted window.i18n for coachKpiWindowGroup');
    assert(calls.indexOf('coachKpiLeagueGroup') !== -1,
        'initCoachKpi adapter consulted window.i18n for coachKpiLeagueGroup');
    assert(calls.indexOf('coachKpiBranchGroup') !== -1,
        'initCoachKpi adapter consulted window.i18n for coachKpiBranchGroup');

    // The branch-all option should now read "Все филиалы".
    const branchSelect = findByClass(dom.elements['coach-kpi-filters'], 'kpi-filter-branch');
    const optionTexts = (branchSelect && branchSelect.children || []).map(o => o.textContent);
    assert(optionTexts.includes('Все филиалы'),
        'branch-all option rendered Russian copy via the i18n adapter');
})();

(function testInitCoachKpiFallbackWhenI18nMissing() {
    // No window.i18n at all → fallbacks must still land (string contract).
    const dom = makeDom(['coach-kpi-filters', 'coach-kpi-school-leaderboard']);
    const kpi = loadKpi({ document: dom, window: {} });

    let threw = false;
    try { kpi.initCoachKpi({ isAdmin: true }); }
    catch (e) { threw = true; }
    assert(!threw, 'initCoachKpi does not throw when window.i18n is absent');

    const labels = findAllByClass(dom.elements['coach-kpi-filters'], 'filter-label').map(n => n.textContent);
    assert(labels.includes('Time window'),
        'filter label falls back to English "Time window" when window.i18n is absent');
})();

console.log('\n=== renderUploadModal localizes every visible label ====================\n');
(function testUploadModal() {
    const upload = loadUpload({});
    const container = makeContainer();
    upload.renderUploadModal(container, { t: ruT });

    const title = findByClass(container, 'kpi-upload-title');
    assert(title && title.textContent === 'Загрузка турнира',
        'modal title resolves via admin.coachKpi.uploadTitle');

    const rowLabels = [];
    const rows = findAllByClass(container, 'kpi-upload-row');
    for (const row of rows) {
        for (const child of row.children) {
            if (child.tagName === 'label') rowLabels.push(child.textContent);
        }
    }
    assert(rowLabels.includes('Тип турнира'),
        'kind row label resolves via admin.coachKpi.uploadKind');
    assert(rowLabels.includes('Экспорт Swiss-Manager'),
        'file row label resolves via admin.coachKpi.uploadFile');
    assert(rowLabels.includes('Дата турнира'),
        'date row label resolves via admin.coachKpi.uploadDate');

    const buttons = findByClass(container, 'kpi-upload-buttons');
    const btnTexts = (buttons && buttons.children || []).map(b => b.textContent);
    assert(btnTexts.includes('Отмена'),
        'cancel button resolves via common.cancel');
    assert(btnTexts.includes('Подтвердить загрузку'),
        'commit button resolves via admin.coachKpi.uploadCommit');
})();

console.log('\n=== renderUploadModal defaults to window.i18n when opts.t is missing ===\n');
(function testUploadModalDefaultsToWindowI18n() {
    const win = {
        i18n: {
            t(key) {
                return Object.prototype.hasOwnProperty.call(RU, key) ? RU[key] : key;
            },
        },
    };
    const upload = loadUpload({ window: win });
    const container = makeContainer();
    upload.renderUploadModal(container, {}); // no opts.t — should fall back to window.i18n

    const title = findByClass(container, 'kpi-upload-title');
    assert(title && title.textContent === 'Загрузка турнира',
        'modal title resolves from window.i18n when caller omits opts.t');

    const buttons = findByClass(container, 'kpi-upload-buttons');
    const btnTexts = (buttons && buttons.children || []).map(b => b.textContent);
    assert(btnTexts.includes('Подтвердить загрузку'),
        'commit button resolves from window.i18n when caller omits opts.t');
})();

(function testUploadModalEnglishFallback() {
    // Neither opts.t nor window.i18n — every visible string is the English
    // fallback the renderer passes as the second arg to label(...).
    const upload = loadUpload({ window: {} });
    const container = makeContainer();
    upload.renderUploadModal(container, {});

    const title = findByClass(container, 'kpi-upload-title');
    assert(title && title.textContent === 'Upload tournament',
        'modal title falls back to English "Upload tournament"');
    const buttons = findByClass(container, 'kpi-upload-buttons');
    const btnTexts = (buttons && buttons.children || []).map(b => b.textContent);
    assert(btnTexts.includes('Cancel'),
        'cancel button falls back to English "Cancel"');
    assert(btnTexts.includes('Commit upload'),
        'commit button falls back to English "Commit upload"');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
