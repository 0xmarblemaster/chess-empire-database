/**
 * Regression guard for the removal of the Score column from the Coach KPI
 * leaderboards. Asserts that neither renderLeaderboard nor
 * renderPhase2Leaderboard outputs:
 *
 *   - a Score column header (English "Score", Russian "Балл", Kazakh "Ұпай"),
 *   - a `.kpi-score` / `.kpi-score-{red|amber|green}` cell in any row, or
 *   - the i18n keys `coachKpiColScore` / `admin.coachKpi.colScore`.
 *
 * The composite_score field stays in the data model (the edge function still
 * computes it), so rows passed in carry it — we just assert it never reaches
 * the DOM.
 *
 * Run: node tests/test-coach-kpi-no-score-column.js
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
        _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener() {},
    };
}

function loadKpi() {
    const path = require('path');
    const modulePath = require.resolve(path.join(__dirname, '..', 'coach-kpi.js'));
    delete require.cache[modulePath];
    const roleLockPath = require.resolve(path.join(__dirname, '..', 'coach-kpi-role-lock.js'));
    delete require.cache[roleLockPath];
    global.document = { createElement: makeMockEl };
    global.window = {};
    return require(modulePath);
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

// Per-locale translations the production app would return — enough to cover
// every header key both renderers consult so we can prove the Score header
// never lands in the DOM in any language.
const TRANSLATIONS = {
    en: {
        coachKpiColCoach: 'Coach', coachKpiColActive: 'Active',
        coachKpiColActivePlayers: 'Active players', coachKpiColParticipation: 'Participation',
        coachKpiColTournaments: 'Tournaments', coachKpiColTop3: 'Top-3',
        coachKpiColPromotions: 'Promotions',
        coachKpiColRazryads: 'Razryads',
        'admin.coachKpi.rank': '#', 'admin.coachKpi.colCoach': 'Coach',
        'admin.coachKpi.colBranch': 'Branch', 'admin.coachKpi.colActive': 'Active students',
        'admin.coachKpi.colEntries': 'Tournament entries', 'admin.coachKpi.colAvgDelta': 'Avg rating delta',
        'admin.coachKpi.colTop3': 'Top-3 finishes', 'admin.coachKpi.colPromotions': 'Promotions',
        'admin.coachKpi.colRazryads': 'Razryads earned',
    },
    ru: {
        coachKpiColCoach: 'Тренер', coachKpiColActive: 'Активные',
        coachKpiColActivePlayers: 'Активные игроки', coachKpiColParticipation: 'Участие',
        coachKpiColTournaments: 'Турниры', coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Повышения',
        coachKpiColRazryads: 'Разряды',
        'admin.coachKpi.rank': '№', 'admin.coachKpi.colCoach': 'Тренер',
        'admin.coachKpi.colBranch': 'Филиал', 'admin.coachKpi.colActive': 'Активные ученики',
        'admin.coachKpi.colEntries': 'Турнирные участия', 'admin.coachKpi.colAvgDelta': 'Средний прирост рейтинга',
        'admin.coachKpi.colTop3': 'Топ-3 места', 'admin.coachKpi.colPromotions': 'Повышения лиги',
        'admin.coachKpi.colRazryads': 'Полученные разряды',
    },
    kk: {
        coachKpiColCoach: 'Жаттықтырушы', coachKpiColActive: 'Белсенді',
        coachKpiColActivePlayers: 'Белсенді ойыншылар', coachKpiColParticipation: 'Қатысу',
        coachKpiColTournaments: 'Турнирлер', coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Көтерілулер',
        coachKpiColRazryads: 'Разрядтар',
        'admin.coachKpi.rank': '№', 'admin.coachKpi.colCoach': 'Жаттықтырушы',
        'admin.coachKpi.colBranch': 'Бөлімше', 'admin.coachKpi.colActive': 'Белсенді оқушылар',
        'admin.coachKpi.colEntries': 'Турнирге қатысулар', 'admin.coachKpi.colAvgDelta': 'Орташа рейтинг өсімі',
        'admin.coachKpi.colTop3': 'Топ-3 орын', 'admin.coachKpi.colPromotions': 'Лига көтерілуі',
        'admin.coachKpi.colRazryads': 'Алынған разрядтар',
    },
};

// The localized "Score" strings we expect to NEVER see in the DOM.
const SCORE_LABELS = ['Score', 'Балл', 'Ұпай'];

function makeT(locale) {
    const dict = TRANSLATIONS[locale];
    return (key, fb) => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : (fb !== undefined ? fb : key));
}

const COACH_ROWS = [
    {
        coach_id: 'a', coach_name: 'Alice', active_students_count: 4,
        total_tournaments: 5, top3_count: 2, total_rating_gained: 40,
        promotions_count: 1, new_razryads_count: 1, composite_score: 70,
    },
    {
        coach_id: 'b', coach_name: 'Bob', active_students_count: 3,
        total_tournaments: 2, top3_count: 0, total_rating_gained: -5,
        promotions_count: 0, new_razryads_count: 0, composite_score: 30,
    },
];

const PHASE2_ROWS = [
    {
        coach_id: 'a', coach_name: 'Alice', branches: ['br-1'],
        active_students_count: 4, tournament_entries: 8, avg_rating_delta: 10,
        top3_count: 2, promotions_count: 1, new_razryads_count: 1,
        composite_score: 70, participation_rate: 0.6,
    },
    {
        coach_id: 'b', coach_name: 'Bob', branches: ['br-2'],
        active_students_count: 3, tournament_entries: 5, avg_rating_delta: 4,
        top3_count: 0, promotions_count: 0, new_razryads_count: 0,
        composite_score: 30, participation_rate: 0.3,
    },
];

console.log('\n=== renderLeaderboard never emits a Score header in any locale ========\n');
for (const locale of ['en', 'ru', 'kk']) {
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderLeaderboard(container, COACH_ROWS, { t: makeT(locale) });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assert(headers.length === 8, `[${locale}] exactly eight <th> headers render (Coach + 7 metrics, Score absent)`);
    for (const lbl of SCORE_LABELS) {
        assert(!headers.includes(lbl),
            `[${locale}] no <th> reads "${lbl}"`);
    }

    const scoreCells = findAllByClass(container, 'kpi-score');
    assert(scoreCells.length === 0,
        `[${locale}] no .kpi-score cell in renderLeaderboard output`);
    for (const tone of ['red', 'amber', 'green']) {
        const toned = findAllByClass(container, `kpi-score-${tone}`);
        assert(toned.length === 0,
            `[${locale}] no .kpi-score-${tone} cell in renderLeaderboard output`);
    }
}

console.log('\n=== renderPhase2Leaderboard never emits a Score header in any locale ==\n');
for (const locale of ['en', 'ru', 'kk']) {
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderPhase2Leaderboard(container, PHASE2_ROWS, { t: makeT(locale) });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assert(headers.length === 9, `[${locale}] exactly nine <th> headers render (Score removed)`);
    for (const lbl of SCORE_LABELS) {
        assert(!headers.includes(lbl),
            `[${locale}] no <th> reads "${lbl}" in school-view leaderboard`);
    }

    const scoreCells = findAllByClass(container, 'kpi-score');
    assert(scoreCells.length === 0,
        `[${locale}] no .kpi-score cell in renderPhase2Leaderboard output`);
}

console.log('\n=== i18n.js no longer ships the retired Score labels ===================\n');
(function testI18nKeysGone() {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
    assert(!/coachKpiColScore/.test(src),
        'coachKpiColScore is absent from i18n.js (all locales)');
    assert(!/admin\.coachKpi\.colScore/.test(src),
        '"admin.coachKpi.colScore" string key is absent from i18n.js');
    // Both nested-tree entries shared the bare `colScore:` line — make sure
    // none survive inside any locale.coachKpi block.
    assert(!/coachKpi:\s*\{[^}]*colScore\s*:/.test(src.replace(/\n/g, ' ')),
        'no `colScore:` entry remains inside any nested admin.coachKpi block');
})();

console.log('\n=== admin-styles.css no longer ships kpi-score color rules =============\n');
(function testCssGone() {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'admin-styles.css'), 'utf8');
    assert(!/\.kpi-score(?:-(?:red|amber|green))?\b/.test(src),
        '.kpi-score / .kpi-score-{red|amber|green} rules removed from admin-styles.css');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
