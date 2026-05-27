/**
 * Locks the new "Active players" hero card / leaderboard column added to the
 * Coach Effectiveness dashboard.
 *
 * Spec (Coach KPI data refresh, 2026-05-25):
 *   - School hero renders 7 cards in this exact order:
 *       Active students, Active players, Participation, Top-3 finishes,
 *       New razryads, Promotions, Tournaments.
 *   - Coach leaderboard renders 8 columns: leading Coach name, then the same
 *     7 metrics in the same order.
 *   - aggregateSchoolHero sums `active_players_count` across rows.
 *   - i18n.js ships coachKpiActivePlayers in en/ru/kk.
 *   - Edge function (analytics-tournaments/index.ts) exposes
 *     `active_players_count` on each coach_leaderboard row and dedupes
 *     `promotions_count` by student_id in coach_leaderboard,
 *     school_kpi_summary, and coach_kpi_summary.
 *
 * Run: node tests/test-coach-kpi-active-players-column.js
 */

const fs = require('fs');
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

// Three locales the production app ships. Each maps every key both renderers
// touch, so we can prove the new column / card lands in the DOM in every
// language.
const TRANSLATIONS = {
    en: {
        coachKpiActiveStudents: 'Active students',
        coachKpiActiveStudentsL2: 'Active Lvl 2+',
        coachKpiActivePlayers: 'Active players',
        coachKpiParticipation: 'Participation',
        coachKpiTop3: 'Top-3 finishes',
        coachKpiNewRazryads: 'New razryads',
        coachKpiPromotions: 'Promotions',
        coachKpiTournamentsYtd: 'Tournaments',
        coachKpiColCoach: 'Coach',
        coachKpiColActive: 'Active',
        coachKpiColActiveL2: 'Active Lvl 2+',
        coachKpiColActivePlayers: 'Active players',
        coachKpiColParticipation: 'Participation',
        coachKpiColTop3: 'Top-3',
        coachKpiColRazryads: 'Razryads',
        coachKpiColPromotions: 'Promotions',
        coachKpiColTournaments: 'Tournaments',
    },
    ru: {
        coachKpiActiveStudents: 'Активные ученики',
        coachKpiActiveStudentsL2: 'Активные ур. 2+',
        coachKpiActivePlayers: 'Активные игроки',
        coachKpiParticipation: 'Участие',
        coachKpiTop3: 'Топ-3 места',
        coachKpiNewRazryads: 'Новые разряды',
        coachKpiPromotions: 'Повышения уровня',
        coachKpiTournamentsYtd: 'Турниры с начала года',
        coachKpiColCoach: 'Тренер',
        coachKpiColActive: 'Активные',
        coachKpiColActiveL2: 'Активные ур. 2+',
        coachKpiColActivePlayers: 'Активные игроки',
        coachKpiColParticipation: 'Участие',
        coachKpiColTop3: 'Топ-3',
        coachKpiColRazryads: 'Разряды',
        coachKpiColPromotions: 'Повышения',
        coachKpiColTournaments: 'Турниры',
    },
    kk: {
        coachKpiActiveStudents: 'Белсенді оқушылар',
        coachKpiActiveStudentsL2: 'Белсенді 2+ деңг.',
        coachKpiActivePlayers: 'Белсенді ойыншылар',
        coachKpiParticipation: 'Қатысу',
        coachKpiTop3: 'Топ-3 орын',
        coachKpiNewRazryads: 'Жаңа разрядтар',
        coachKpiPromotions: 'Деңгей көтерілуі',
        coachKpiTournamentsYtd: 'Жыл басынан бергі турнирлер',
        coachKpiColCoach: 'Жаттықтырушы',
        coachKpiColActive: 'Белсенді',
        coachKpiColActiveL2: 'Белсенді 2+ деңг.',
        coachKpiColActivePlayers: 'Белсенді ойыншылар',
        coachKpiColParticipation: 'Қатысу',
        coachKpiColTop3: 'Топ-3',
        coachKpiColRazryads: 'Разрядтар',
        coachKpiColPromotions: 'Көтерілулер',
        coachKpiColTournaments: 'Турнирлер',
    },
};

function makeT(locale) {
    const dict = TRANSLATIONS[locale];
    return (key, fb) => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : (fb !== undefined ? fb : key));
}

console.log('\n=== renderSchoolHero: 7 cards in spec-locked order ====================\n');
{
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderSchoolHero(container, {
        active_students_count: 12,
        active_players_count: 9,
        participation_pct: 75,
        top3_count: 4,
        new_razryads_count: 2,
        promotions_count: 1,
        total_tournaments: 5,
    }, { t: makeT('en') });

    assertEqual(container.children.length, 7,
        'renderSchoolHero builds exactly seven hero cards');

    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    const values = findAllByClass(container, 'stat-card-value').map(n => n.textContent);

    assertEqual(labels, [
        'Active Lvl 2+',
        'Active players',
        'Participation',
        'Top-3 finishes',
        'New razryads',
        'Promotions',
        'Tournaments',
    ], 'hero labels match the spec-locked order (Active card now reads "Active Lvl 2+")');

    assertEqual(values, ['12', '9', '75%', '4', '2', '1', '5'],
        'hero values follow the same order; participation rendered as percent');
}

console.log('\n=== renderSchoolHero: Active players card present in every locale =====\n');
for (const locale of ['en', 'ru', 'kk']) {
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderSchoolHero(container, {
        active_students_count: 10,
        active_players_count: 7,
        participation_pct: 70,
        top3_count: 0,
        new_razryads_count: 0,
        promotions_count: 0,
        total_tournaments: 0,
    }, { t: makeT(locale) });

    const labels = findAllByClass(container, 'stat-card-label').map(n => n.textContent);
    assert(labels.includes(TRANSLATIONS[locale].coachKpiActivePlayers),
        `[${locale}] "Active players" hero card label rendered (${TRANSLATIONS[locale].coachKpiActivePlayers})`);
    assertEqual(labels[1], TRANSLATIONS[locale].coachKpiActivePlayers,
        `[${locale}] "Active players" card sits in slot 2 (right after Active students)`);
}

console.log('\n=== renderLeaderboard: 8 columns with Active players in slot 3 ========\n');
const COACH_ROWS = [
    {
        coach_id: 'a', coach_name: 'Alice',
        active_students_count: 8, active_players_count: 6,
        total_tournaments: 4, top3_count: 3,
        promotions_count: 2, new_razryads_count: 1,
    },
    {
        coach_id: 'b', coach_name: 'Bob',
        active_students_count: 4, active_players_count: 0,
        total_tournaments: 1, top3_count: 0,
        promotions_count: 0, new_razryads_count: 0,
    },
];

for (const locale of ['en', 'ru', 'kk']) {
    const kpi = loadKpi();
    const container = makeMockEl('div');
    kpi.renderLeaderboard(container, COACH_ROWS, { t: makeT(locale) });

    const headers = findAllByTag(container, 'th').map(n => n.textContent);
    assertEqual(headers.length, 8,
        `[${locale}] leaderboard renders eight <th> headers`);

    // Header order: Coach + 7 metric columns matching the hero order.
    const expected = [
        TRANSLATIONS[locale].coachKpiColCoach,
        TRANSLATIONS[locale].coachKpiColActiveL2,
        TRANSLATIONS[locale].coachKpiColActivePlayers,
        TRANSLATIONS[locale].coachKpiColParticipation,
        TRANSLATIONS[locale].coachKpiColTop3,
        TRANSLATIONS[locale].coachKpiColRazryads,
        TRANSLATIONS[locale].coachKpiColPromotions,
        TRANSLATIONS[locale].coachKpiColTournaments,
    ];
    assertEqual(headers, expected,
        `[${locale}] header order: Coach, Active Lvl 2+, Active players, Participation, Top-3, Razryads, Promotions, Tournaments`);

    // Each body row has 8 <td>s and slot 2 = active_players_count value.
    const rows = findAllByTag(container, 'tr').filter(r =>
        Array.isArray(r.children) && r.children.length > 0 && r.children[0].tagName === 'td');
    for (const row of rows) {
        assertEqual(row.children.length, 8,
            `[${locale}] data row carries eight <td>s`);
    }
    // Alice: 8 active, 6 active players → participation 75% in slot 4.
    const alice = rows.find(r => r.dataset.coachId === 'a');
    assertEqual(alice.children[2].textContent, '6',
        `[${locale}] Alice row column 3 = active_players_count (6)`);
    assertEqual(alice.children[3].textContent, '75%',
        `[${locale}] Alice row column 4 = participation_pct as percent (6/8 = 75%)`);
    const bob = rows.find(r => r.dataset.coachId === 'b');
    assertEqual(bob.children[2].textContent, '0',
        `[${locale}] Bob row column 3 = 0 active players (had no players in window)`);
    assertEqual(bob.children[3].textContent, '0%',
        `[${locale}] Bob row column 4 = 0% participation when no players`);
}

console.log('\n=== aggregateSchoolHero sums active_players_count ======================\n');
{
    const kpi = loadKpi();
    const out = kpi.aggregateSchoolHero([
        { active_students_count: 10, active_players_count: 7, total_tournaments: 3, top3_count: 1, promotions_count: 1, new_razryads_count: 0 },
        { active_students_count:  5, active_players_count: 4, total_tournaments: 2, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ]);
    assertEqual(out.active_players_count, 11,
        'aggregateSchoolHero sums active_players_count across rows (7 + 4 = 11)');
    assertEqual(out.active_students_count, 15,
        'aggregateSchoolHero still sums active_students_count (10 + 5 = 15)');
}
{
    const kpi = loadKpi();
    const out = kpi.aggregateSchoolHero([
        // Row without active_players_count — must default to 0, not NaN.
        { active_students_count: 4, total_tournaments: 1, top3_count: 0, promotions_count: 0, new_razryads_count: 0 },
    ]);
    assertEqual(out.active_players_count, 0,
        'missing active_players_count → 0 (defensive default)');
}

console.log('\n=== i18n.js carries coachKpiActivePlayers in en/ru/kk =================\n');
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
    assert(/coachKpiActivePlayers:\s*'Active players'/.test(src),
        'i18n.js: en coachKpiActivePlayers = "Active players"');
    assert(/coachKpiActivePlayers:\s*'Активные игроки'/.test(src),
        'i18n.js: ru coachKpiActivePlayers = "Активные игроки"');
    assert(/coachKpiActivePlayers:\s*'Белсенді ойыншылар'/.test(src),
        'i18n.js: kk coachKpiActivePlayers = "Белсенді ойыншылар"');
    assert(/coachKpiColActivePlayers:\s*'Active players'/.test(src),
        'i18n.js: en coachKpiColActivePlayers present');
    assert(/coachKpiColActivePlayers:\s*'Активные игроки'/.test(src),
        'i18n.js: ru coachKpiColActivePlayers present');
    assert(/coachKpiColActivePlayers:\s*'Белсенді ойыншылар'/.test(src),
        'i18n.js: kk coachKpiColActivePlayers present');
    assert(/coachKpiColParticipation:\s*'Participation'/.test(src),
        'i18n.js: en coachKpiColParticipation present');
    assert(/coachKpiColParticipation:\s*'Участие'/.test(src),
        'i18n.js: ru coachKpiColParticipation present');
    assert(/coachKpiColParticipation:\s*'Қатысу'/.test(src),
        'i18n.js: kk coachKpiColParticipation present');
}

console.log('\n=== edge function exposes active_players_count + dedupes promotions ===\n');
{
    const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
    const SRC = fs.readFileSync(SRC_PATH, 'utf8');

    function extractAction(name) {
        const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
        const m = re.exec(SRC);
        return m ? m[1] : '';
    }

    const leaderboardBlock = extractAction('coach_leaderboard');
    const schoolBlock = extractAction('school_kpi_summary');
    const coachBlock = extractAction('coach_kpi_summary');

    assert(leaderboardBlock.length > 0, 'coach_leaderboard handler extracted');
    assert(/active_players_count:\s*r\.activePlayersCount/.test(leaderboardBlock),
        'coach_leaderboard row carries active_players_count = activePlayersCount');
    assert(/activePlayersSet\s*=\s*new Set/.test(leaderboardBlock),
        'coach_leaderboard builds activePlayersSet from games_played >= 1 students');
    assert(/activePlayersSet\.add\(r\.student_id\)/.test(leaderboardBlock),
        'coach_leaderboard adds student_id to activePlayersSet when games_played >= 1');

    // Promotions deduped by student_id everywhere — never raw `myProms.length`
    // / `proms.length` on the response payload.
    assert(/promotedStudents\s*=\s*new Set/.test(leaderboardBlock),
        'coach_leaderboard dedupes promotions into a Set keyed by student_id');
    assert(/promotionsCount:\s*promotedStudents\.size/.test(leaderboardBlock),
        'coach_leaderboard reports promotionsCount = distinct student count');
    assert(!/promotionsCount:\s*myProms\.length/.test(leaderboardBlock),
        'coach_leaderboard NO LONGER reports promotionsCount = raw event count');

    assert(schoolBlock.length > 0, 'school_kpi_summary handler extracted');
    assert(/promotedStudentIds\s*=\s*new Set/.test(schoolBlock),
        'school_kpi_summary dedupes promotions into a Set keyed by student_id');
    assert(/promotions_count:\s*promotedStudentIds\.size/.test(schoolBlock),
        'school_kpi_summary emits promotions_count = distinct student count');
    assert(!/promotions_count:\s*proms\.length/.test(schoolBlock),
        'school_kpi_summary NO LONGER emits promotions_count = raw event count');

    assert(coachBlock.length > 0, 'coach_kpi_summary handler extracted');
    assert(/promotedStudentIds\s*=\s*new Set/.test(coachBlock),
        'coach_kpi_summary dedupes promotions into a Set keyed by student_id');
    assert(/promotions_count:\s*promotedStudentIds\.size/.test(coachBlock),
        'coach_kpi_summary emits promotions_count = distinct student count');
    assert(!/promotions_count:\s*proms\.length/.test(coachBlock),
        'coach_kpi_summary NO LONGER emits promotions_count = raw event count');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
