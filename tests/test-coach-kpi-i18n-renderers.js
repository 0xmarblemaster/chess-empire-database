/**
 * Tests for the Coach KPI dashboard renderer-level i18n wiring.
 *
 * The Phase-2 redesign threaded an `opts.t(key, fallback)` adapter through
 * every renderer in coach-kpi.js and coach-kpi-upload.js. These tests pin
 * down the contract:
 *
 *   - renderSchoolHero, renderLeaderboard, renderFilters honour opts.t for
 *     hero labels, column headers, and filter group labels.
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

// (Upload modal loader removed — the standalone upload module was deleted when
// the upload UI moved into the Rating Management modal in admin-v2.html.)

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
    coachKpiActiveStudentsL2: 'Активные Ступень 2+',
    coachKpiActivePlayers: 'Активные игроки',
    coachKpiTournamentsYtd: 'Турниры с начала года',
    coachKpiTop3: 'Топ-3 места',
    coachKpiPromotions: 'Повышения уровня',
    coachKpiNewRazryads: 'Новые разряды',
    coachKpiParticipation: 'Участие',
    coachKpiWindowGroup: 'Период',
    coachKpiLeagueGroup: 'Турнир',
    coachKpiLeagueAll: 'Все турниры',
    coachKpiLeagueB: 'Лига B',
    coachKpiLeagueC: 'Лига C',
    coachKpiLeagueR3: '3 разряд',
    coachKpiLeagueR4: '4 разряд',
    coachKpiBranchGroup: 'Филиал',
    coachKpiBranchAll: 'Все филиалы',
    coachKpiEmptyTitle: 'Данных пока нет',
    coachKpiNoDataYet: 'За выбранный период данных пока нет.',
    coachKpiChartUnavailable: 'Chart.js не загружен',
    coachKpiColCoach: 'Тренер',
    coachKpiColActive: 'Активные',
    coachKpiColActiveL2: 'Активные Ступень 2+',
    coachKpiColActivePlayers: 'Активные игроки',
    coachKpiColParticipation: 'Участие',
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
};
function ruT(key, fb) { return Object.prototype.hasOwnProperty.call(RU, key) ? RU[key] : fb; }

console.log('\n=== renderSchoolHero localizes its seven hero labels ===================\n');
(function testSchoolHero() {
    const kpi = loadKpi({});
    const container = makeContainer();
    const summary = {
        active_students_count: 12,
        active_players_count: 9,
        total_tournaments: 4,
        top3_count: 7,
        promotions_count: 2,
        new_razryads_count: 1,
        participation_pct: 0.75,
    };
    kpi.renderSchoolHero(container, summary, { t: ruT });

    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    assert(labels.length === 7, 'seven hero cards render (one label per metric, Active players added)');
    assert(labels.includes('Активные Ступень 2+'),
        'Active students label translated via coachKpiActiveStudentsL2 (L2+ scoping)');
    assert(labels.includes('Активные игроки'),
        'Active players label translated via coachKpiActivePlayers');
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
        active_players_count: 1,
        total_tournaments: 1,
        top3_count: 1,
        promotions_count: 1,
        new_razryads_count: 1,
        participation_pct: 0.5,
    });
    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    assert(labels.includes('Active Lvl 2+'),
        'English fallback "Active Lvl 2+" rendered when no opts.t supplied');
    assert(labels.includes('Active players'),
        'English fallback "Active players" rendered when no opts.t supplied');
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
        active_students_count: 5, active_players_count: 4, total_tournaments: 3,
        top3_count: 1,
        promotions_count: 1, new_razryads_count: 0,
        composite_score: 65,
    }];
    kpi.renderLeaderboard(container, rows, { t: ruT });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assert(headers.length === 8, 'eight <th> headers render (Coach + 7 metrics)');
    assert(headers[0] === 'Тренер', 'Coach column → Тренер');
    assert(headers[1] === 'Активные Ступень 2+', 'Active column → Активные Ступень 2+ (L2+ scoping)');
    assert(headers[2] === 'Активные игроки', 'Active players column → Активные игроки');
    assert(headers[3] === 'Участие', 'Participation column → Участие');
    assert(headers[4] === 'Топ-3', 'Top-3 column → Топ-3');
    assert(headers[5] === 'Разряды', 'Razryads column → Разряды');
    assert(headers[6] === 'Повышения', 'Promotions column → Повышения');
    assert(headers[7] === 'Турниры', 'Tournaments column → Турниры');
    assert(!headers.includes('Балл'), 'Score column header is gone');
    assert(!headers.includes('Прирост рейтинга'), 'Rating gained column header is gone');
})();

console.log('\n=== renderFilters localizes the three filter-group labels =============\n');
(function testFilterLabels() {
    const kpi = loadKpi({});
    const container = makeContainer();
    kpi.renderFilters(container, { window: '90d', league: 'all', branchId: 'all' }, { t: ruT });
    const labels = findAllByClass(container, 'filter-label').map(n => n.textContent);
    assert(labels.includes('Период'), 'window-group label → Период');
    assert(labels.includes('Турнир'), 'league-group label → Турнир');
    assert(labels.includes('Филиал'), 'branch-group label → Филиал');

    // The "All branches" option in the branch <select> should also be localized.
    const branchSelect = findByClass(container, 'kpi-filter-branch');
    assert(branchSelect !== null, '.kpi-filter-branch mounted');
    const optionTexts = (branchSelect && branchSelect.children || []).map(o => o.textContent);
    assert(optionTexts.includes('Все филиалы'),
        '"All branches" option translated via coachKpiBranchAll');

    // The league <select> must mount five options — all, B, C, R3, R4. League A
    // is intentionally absent (retired from rotation) and razryad qualifiers
    // were added so the filter can scope the dashboard to 3rd/4th-razryad
    // tournaments alongside Leagues B and C.
    const leagueSelect = findByClass(container, 'kpi-filter-league');
    assert(leagueSelect !== null, '.kpi-filter-league mounted');
    const leagueOptionTexts = (leagueSelect && leagueSelect.children || []).map(o => o.textContent);
    assert(leagueOptionTexts.length === 5,
        'league <select> exposes 5 options (all + B + C + R3 + R4)');
    assert(leagueOptionTexts.includes('Все турниры'),
        '"All tournaments" option translated via coachKpiLeagueAll');
    assert(leagueOptionTexts.includes('3 разряд'),
        '"3rd razryad" option translated via coachKpiLeagueR3');
    assert(leagueOptionTexts.includes('4 разряд'),
        '"4th razryad" option translated via coachKpiLeagueR4');
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
    assert(helper && /No data yet/i.test(helper.textContent),
        'empty-state helper falls back to English coachKpiEmptyState when t() returns the key');
})();

console.log('\n=== Chart fallback ("Chart.js not loaded") is localized ===============\n');
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

// ---------------------------------------------------------------------------
// Drilldown panel — zero English leakage in ru / kk renders.
//
// The drilldown was the most recent surface added to the dashboard and is the
// likely culprit for an untranslated string in production. We render the four
// metrics' tables + headers under each locale and assert no header / cell text
// matches an English-only token we'd recognise from the EN fallback. Per
// COACH_KPI_PHASE2_SPEC: dates render numerically (DD.MM.YYYY), so they don't
// count as English leakage either.
// ---------------------------------------------------------------------------

// Russian + Kazakh stubs covering every coachKpiDrill* + filter key the
// drilldown reads. Mirrors the production i18n.js values closely enough that
// a real English string falling through is an obvious failure.
function makeLocaleStub(map) {
    return (key, fb) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fb;
}
const DRILL_RU = {
    coachKpiDrillStudent: 'Ученик', coachKpiDrillBranch: 'Филиал', coachKpiDrillCoach: 'Тренер',
    coachKpiDrillLeague: 'Лига', coachKpiDrillRazryad: 'Разряд',
    coachKpiDrillTournament: 'Турнир', coachKpiDrillDate: 'Дата',
    coachKpiDrillBack: '← Назад', coachKpiDrillRow: 'строка', coachKpiDrillRows: 'строк',
    coachKpiDrillGames: 'Партии', coachKpiDrillTournamentsPlayed: 'Турниры',
    coachKpiDrillRatingDelta: 'Прирост рейтинга', coachKpiDrillPlacement: 'Место',
    coachKpiDrillOldRazryad: 'Старый разряд', coachKpiDrillNewRazryad: 'Новый разряд',
    coachKpiDrillEarnedAt: 'Получен', coachKpiDrillFrom: 'Из', coachKpiDrillTo: 'В',
    coachKpiDrillOccurredAt: 'Повышен',
    coachKpiDrillTitle_active_players: 'Активные игроки',
    coachKpiDrillTitle_top3: 'Топ-3 места',
    coachKpiDrillTitle_new_razryads: 'Новые разряды',
    coachKpiDrillTitle_promotions: 'Повышения уровня',
    coachKpiLeagueA: 'Лига A', coachKpiLeagueB: 'Лига B', coachKpiLeagueC: 'Лига C',
    coachKpiRazryadKMS: 'КМС', coachKpiRazryad1st: '1-й разряд', coachKpiRazryad2nd: '2-й разряд',
    coachKpiRazryad3rd: '3-й разряд', coachKpiRazryad4th: '4-й разряд', coachKpiRazryadNone: 'Нет',
};
const DRILL_KK = {
    coachKpiDrillStudent: 'Оқушы', coachKpiDrillBranch: 'Бөлімше', coachKpiDrillCoach: 'Жаттықтырушы',
    coachKpiDrillLeague: 'Лига', coachKpiDrillRazryad: 'Разряд',
    coachKpiDrillTournament: 'Турнир', coachKpiDrillDate: 'Күні',
    coachKpiDrillBack: '← Артқа', coachKpiDrillRow: 'жол', coachKpiDrillRows: 'жол',
    coachKpiDrillGames: 'Партиялар', coachKpiDrillTournamentsPlayed: 'Турнирлер',
    coachKpiDrillRatingDelta: 'Рейтинг өсімі', coachKpiDrillPlacement: 'Орын',
    coachKpiDrillOldRazryad: 'Ескі разряд', coachKpiDrillNewRazryad: 'Жаңа разряд',
    coachKpiDrillEarnedAt: 'Алынды', coachKpiDrillFrom: 'Қайдан', coachKpiDrillTo: 'Қайда',
    coachKpiDrillOccurredAt: 'Көтерілді',
    coachKpiDrillTitle_active_players: 'Белсенді ойыншылар',
    coachKpiDrillTitle_top3: 'Топ-3 орын',
    coachKpiDrillTitle_new_razryads: 'Жаңа разрядтар',
    coachKpiDrillTitle_promotions: 'Деңгей көтерілуі',
    coachKpiLeagueA: 'A лигасы', coachKpiLeagueB: 'B лигасы', coachKpiLeagueC: 'C лигасы',
    coachKpiRazryadKMS: 'ХШҚ', coachKpiRazryad1st: '1-разряд', coachKpiRazryad2nd: '2-разряд',
    coachKpiRazryad3rd: '3-разряд', coachKpiRazryad4th: '4-разряд', coachKpiRazryadNone: 'Жоқ',
};

// English-only tokens that should NEVER appear in a ru/kk drilldown render.
const ENGLISH_LEAK_TOKENS = [
    'Student', 'Branch', 'Coach', 'League', 'Razryad', 'Tournament', 'Tournaments',
    'Date', 'Games', 'Placement', 'Old razryad', 'New razryad', 'Earned',
    'From', 'To', 'Promoted', '← Back',
    // Drilldown titles — the English fallbacks shipped in METRIC_TITLES.
    'Active players', 'Top-3 finishes', 'New razryads', 'Promotions',
    'row', 'rows',
];

function collectAllText(root, out) {
    out = out || [];
    if (!root) return out;
    if (typeof root.textContent === 'string' && root.textContent.length > 0
        && (!root.children || root.children.length === 0)) {
        out.push(root.textContent);
    }
    if (Array.isArray(root.children)) {
        for (const c of root.children) collectAllText(c, out);
    }
    return out;
}

const DRILLDOWN_FIXTURES = {
    active_players: [
        { student_id: 'S1', first_name: 'X', last_name: 'Y', branch_name: 'BR', coach_name: 'CO',
          league: 'A', razryad: 'kms', games_played: 5, tournaments_played: 1, rating_delta_total: 10 },
    ],
    top3: [
        { tournament_id: 'T1', tournament_name: 'L', occurred_at: '2026-03-15', placement: 1,
          student_id: 'S1', first_name: 'X', last_name: 'Y', branch_name: 'BR', coach_name: 'CO' },
    ],
    new_razryads: [
        { student_id: 'S1', first_name: 'X', last_name: 'Y', branch_name: 'BR', coach_name: 'CO',
          old_razryad: 'none', new_razryad: '4th', earned_at: '2026-04-01', tournament_name: 'L' },
    ],
    promotions: [
        { student_id: 'S1', first_name: 'X', last_name: 'Y', branch_name: 'BR', coach_name: 'CO',
          from_league: 'B', to_league: 'A', occurred_at: '2026-04-25' },
    ],
};

for (const [localeName, stubMap] of [['ru', DRILL_RU], ['kk', DRILL_KK]]) {
    console.log(`\n=== drilldown render has zero English leakage (${localeName}) =============\n`);
    const tStub = makeLocaleStub(stubMap);
    for (const metric of Object.keys(DRILLDOWN_FIXTURES)) {
        const kpi = loadKpi({});
        const table = makeContainer();
        const header = makeContainer();
        kpi.renderDrilldown(table, metric, DRILLDOWN_FIXTURES[metric], { window: '90d' }, { t: tStub });
        kpi.renderDrilldownHeader(header, metric, DRILLDOWN_FIXTURES[metric].length, { t: tStub, onBack: () => {} });

        const texts = [].concat(collectAllText(table), collectAllText(header));
        for (const token of ENGLISH_LEAK_TOKENS) {
            const hit = texts.find(s => s === token || s === `1 ${token}` || s === `${DRILLDOWN_FIXTURES[metric].length} ${token}`);
            assert(!hit,
                `[${localeName} / ${metric}] no leaf text equals English token "${token}"`);
        }
    }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
