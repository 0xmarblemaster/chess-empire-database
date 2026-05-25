/**
 * Regression guard for the removal of the Rating Gained column from the v1
 * Coach KPI leaderboard. Asserts that renderLeaderboard never outputs:
 *
 *   - a Rating gained column header (English "Rating gained", Russian
 *     "Прирост рейтинга", Kazakh "Рейтинг өсімі"),
 *   - the i18n key `coachKpiColRatingGained` anywhere in i18n.js.
 *
 * The v2 (Phase 2) school-view leaderboard still surfaces Avg rating delta
 * (`admin.coachKpi.colAvgDelta`) — this guard does NOT touch that column.
 * `total_rating_gained` continues to flow through the data layer (edge
 * function, sortLeaderboard) — we just assert it never paints a v1 column.
 *
 * Run: node tests/test-coach-kpi-no-rating-gained-column.js
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

// Per-locale translations the production app would return. Every header key
// renderLeaderboard consults is covered so we can prove the Rating gained
// header never lands in the DOM in any language — even though the rows still
// carry total_rating_gained values from the edge function.
const TRANSLATIONS = {
    en: {
        coachKpiColCoach: 'Coach', coachKpiColActive: 'Active',
        coachKpiColActivePlayers: 'Active players', coachKpiColParticipation: 'Participation',
        coachKpiColTournaments: 'Tournaments', coachKpiColTop3: 'Top-3',
        coachKpiColPromotions: 'Promotions', coachKpiColRazryads: 'Razryads',
    },
    ru: {
        coachKpiColCoach: 'Тренер', coachKpiColActive: 'Активные',
        coachKpiColActivePlayers: 'Активные игроки', coachKpiColParticipation: 'Участие',
        coachKpiColTournaments: 'Турниры', coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Повышения', coachKpiColRazryads: 'Разряды',
    },
    kk: {
        coachKpiColCoach: 'Жаттықтырушы', coachKpiColActive: 'Белсенді',
        coachKpiColActivePlayers: 'Белсенді ойыншылар', coachKpiColParticipation: 'Қатысу',
        coachKpiColTournaments: 'Турнирлер', coachKpiColTop3: 'Топ-3',
        coachKpiColPromotions: 'Көтерілулер', coachKpiColRazryads: 'Разрядтар',
    },
};

// The localized "Rating gained" strings we expect to NEVER see in the DOM.
const RATING_GAINED_LABELS = ['Rating gained', 'Прирост рейтинга', 'Рейтинг өсімі'];

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

console.log('\n=== renderLeaderboard never emits a Rating gained header in any locale =\n');
for (const locale of ['en', 'ru', 'kk']) {
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderLeaderboard(container, COACH_ROWS, { t: makeT(locale) });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assert(headers.length === 8, `[${locale}] exactly eight <th> headers render (Coach + 7 metrics, Rating gained absent)`);
    for (const lbl of RATING_GAINED_LABELS) {
        assert(!headers.includes(lbl),
            `[${locale}] no <th> reads "${lbl}"`);
    }

    // Each data row should have the same number of <td>s as headers.
    const rows = findAllByTag(container, 'tr').filter(r =>
        Array.isArray(r.children) && r.children.length > 0 && r.children[0].tagName === 'td');
    for (const row of rows) {
        assert(row.children.length === 8,
            `[${locale}] data row has eight <td>s (no Rating gained cell)`);
    }
}

console.log('\n=== i18n.js no longer ships the retired Rating gained label ============\n');
(function testI18nKeyGone() {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
    assert(!/coachKpiColRatingGained/.test(src),
        'coachKpiColRatingGained is absent from i18n.js (all locales)');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
