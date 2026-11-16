/**
 * admin-v2 Students table «Рейтинг» + «Расписание» columns (Variant A).
 *
 *  - Data: supabaseData.getStudentTableRatings / getAllStudentSchedules and the
 *    pure filterExcludedSlots run in a vm against a fake Supabase client.
 *  - Render: the REAL cell renderers + sortStudentsByRating from admin-v2.js
 *    (vm) with the real RU dictionary from i18n.js and helpers from constants.js.
 *  - Markup: admin-v2.html thead order, i18n keys in EN / RU / KK.
 *
 * Run: node tests/test-students-table-rating-schedule.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

function extractFunction(src, name) {
    const start = src.search(new RegExp(`(async )?function ${name}\\(`));
    if (start === -1) throw new Error(`function ${name} not found`);
    const open = src.indexOf('{', src.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
}
function extractConst(src, name) {
    const start = src.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`const ${name} not found`);
    return src.slice(start, src.indexOf(';\n', start) + 1);
}

const DATA_SRC = read('supabase-data.js');
const ADMIN_SRC = read('admin-v2.js');
const CONSTANTS_SRC = read('constants.js');
const I18N_SRC = read('i18n.js');
const HTML = read('admin-v2.html');

// ---------------------------------------------------------------------------
// Fake Supabase client: per-table result (object, Error, or fn(ops) → result).
const calls = [];
let tables = {};
function builder(table) {
    const rec = { table, ops: [] };
    calls.push(rec);
    const result = () => {
        let r = tables[table];
        if (typeof r === 'function') r = r(rec.ops);
        if (r instanceof Error) return Promise.reject(r);
        return Promise.resolve(r || { data: [], error: null });
    };
    const b = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'then') return (res, rej) => result().then(res, rej);
            return (...args) => { rec.ops.push([prop, args]); return b; };
        },
    });
    return b;
}
const rangeOf = (ops) => (ops.find(([op]) => op === 'range') || [null, [0, 999]])[1];
// Serve `rows` page by page according to the .range(from, to) call.
const paged = (rows) => (ops) => {
    const [from, to] = rangeOf(ops);
    return { data: rows.slice(from, to + 1), error: null };
};

const window = { supabaseClient: { from: builder } };
const dctx = vm.createContext({ window, console: { error() {}, log() {}, warn() {} } });
vm.runInContext(DATA_SRC, dctx);
const data = window.supabaseData;
const filterExcluded = window.filterExcludedSlots;
const resolveSlots = window.resolveStudentScheduleSlots;
const plain = (v) => JSON.parse(JSON.stringify(v));
const mapToObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, plain(v)]));

const B1 = 'branch-1';
const B2 = 'branch-2';
const COACH_A = 'coach-a';
const COACH_B = 'coach-b';
const row = (o) => Object.assign({ branch_id: B1, schedule_type: 'tue_thu', hidden: false, logical_slot_id: null, effective_from: '2026-01-01' }, o);
const ts = (o) => Object.assign({ branch_id: B1, coach_id: COACH_A, schedule_type: 'tue_thu', effective_from: '2026-01-01', deleted_at: null, logical_slot_id: null }, o);

(async () => {
    // -----------------------------------------------------------------------
    console.log('\n=== getStudentTableRatings ===========================================\n');
    const ratingRows = [];
    for (let i = 0; i < 1005; i++) {
        ratingRows.push({ student_id: `s${String(i).padStart(4, '0')}`, rating: i === 3 ? null : i === 4 ? 0 : 500 + i, rating_date: '2026-11-01', league_tier: 'bronze' });
    }
    tables = { student_current_ratings: paged(ratingRows) };
    calls.length = 0;
    let ratings = await data.getStudentTableRatings();
    const rc = calls.filter(c => c.table === 'student_current_ratings');
    assertEqual(rc.length, 2, 'pages past 1000 rows (1000 then 5)');
    assertEqual(rc.map(c => rangeOf(c.ops)), [[0, 999], [1000, 1999]], 'range() pages of 1000');
    assert(rc[0].ops.some(([op, a]) => op === 'order' && a[0] === 'student_id'), 'ordered by student_id');
    assert(rc[0].ops.some(([op, a]) => op === 'select' && /student_id, rating, rating_date, league_tier/.test(a[0])), 'selects student_id, rating, rating_date, league_tier');
    assertEqual(ratings.size, 1003, 'null and 0 ratings skipped');
    assertEqual(plain(ratings.get('s1004')), { rating: 1504, ratingDate: '2026-11-01', leagueTier: 'bronze' }, 'row from the second page mapped');
    assert(!ratings.has('s0003') && !ratings.has('s0004'), 'unrated students absent');

    tables = { student_current_ratings: { data: null, error: { message: 'boom' } } };
    ratings = await data.getStudentTableRatings();
    assertEqual(ratings.size, 0, 'error → empty Map');

    tables = { student_current_ratings: new Error('network') };
    assertEqual((await data.getStudentTableRatings()).size, 0, 'thrown error → empty Map');

    // -----------------------------------------------------------------------
    console.log('\n=== filterExcludedSlots parity with _applySlotExclusions =============\n');
    assert(typeof filterExcluded === 'function', 'filterExcludedSlots exported on window');
    const groupRows = [
        row({ student_id: 'p1', time_slot_index: 0, logical_slot_id: 'L1' }),
        row({ student_id: 'p1', time_slot_index: 1, logical_slot_id: 'L2' }),
        row({ student_id: 'p2', time_slot_index: 1, logical_slot_id: 'LX' }),
        row({ student_id: 'p2', time_slot_index: 2 }),
        row({ student_id: 'p3', time_slot_index: 3, logical_slot_id: 'L3' }),
        row({ student_id: 'p3', time_slot_index: 4 }),
    ];
    const groupExclusions = [
        { student_id: 'p1', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: 'L2', time_slot_index: 1 },
        { student_id: 'p2', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: 'LOTHER', time_slot_index: 1 },
        { student_id: 'p2', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: 'LOTHER2', time_slot_index: 2 },
        { student_id: 'p3', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: null, time_slot_index: 3 },
    ];
    const resolvedGroup = resolveSlots(groupRows);
    tables = { student_slot_exclusions: { data: groupExclusions, error: null } };
    const legacy = await data._applySlotExclusions(resolvedGroup, B1, 'tue_thu');
    const bulk = filterExcluded(resolvedGroup, groupExclusions);
    assertEqual(plain(bulk), plain(legacy), 'same result as _applySlotExclusions for a single group');
    assertEqual(bulk.map(s => `${s.studentId}:${s.timeSlotIndex}`), ['p1:0', 'p2:1', 'p3:4'],
        'logical match drops L2; logical mismatch keeps LX; index match drops no-logical slot; legacy index exclusion drops L3');

    // -----------------------------------------------------------------------
    console.log('\n=== getAllStudentSchedules ===========================================\n');
    const students = [
        { id: 'a', coachId: COACH_A },  // two schedules
        { id: 'b', coachId: COACH_A },  // legacy -1 hides tue_thu, keeps sat_sun
        { id: 'c', coachId: COACH_A },  // hidden=true latest
        { id: 'd', coachId: COACH_A },  // latest version wins
        { id: 'e', coachId: COACH_A },  // exclusion by logical id
        { id: 'f', coachId: COACH_A },  // legacy index exclusion
        { id: 'g', coachId: COACH_A },  // exclusion in another branch/schedule → kept
        { id: 'h', coachId: COACH_A },  // tombstoned time slot
        { id: 'i', coachId: COACH_A },  // logical id in coach B's slot
        { id: 'j', coachId: COACH_B },  // index fallback with own coach
        { id: 'k', coachId: COACH_A },  // no rows
    ];
    const assignRows = [
        row({ student_id: 'a', time_slot_index: 0 }),
        row({ student_id: 'a', schedule_type: 'sat_sun', time_slot_index: 0 }),
        row({ student_id: 'b', time_slot_index: -1, effective_from: '2026-11-01' }),
        row({ student_id: 'b', time_slot_index: 0 }),
        row({ student_id: 'b', schedule_type: 'sat_sun', time_slot_index: 0 }),
        row({ student_id: 'c', time_slot_index: 10, logical_slot_id: 'LC', hidden: true, effective_from: '2026-11-01' }),
        row({ student_id: 'c', time_slot_index: 10, logical_slot_id: 'LC' }),
        row({ student_id: 'd', time_slot_index: 12, logical_slot_id: 'LD', effective_from: '2026-11-01' }),
        row({ student_id: 'd', time_slot_index: 11, logical_slot_id: 'LD' }),
        row({ student_id: 'e', time_slot_index: 13, logical_slot_id: 'LE' }),
        row({ student_id: 'f', time_slot_index: 14, logical_slot_id: 'LF' }),
        row({ student_id: 'g', time_slot_index: 0 }),
        row({ student_id: 'h', time_slot_index: 15, logical_slot_id: 'LH' }),
        row({ student_id: 'i', time_slot_index: 7, logical_slot_id: 'LI' }),
        row({ student_id: 'j', time_slot_index: 0 }),
    ];
    const timeSlots = [
        ts({ slot_index: 0, start_time: '16:00:00', end_time: '17:30:00' }),
        ts({ slot_index: 1, start_time: '17:30:00', end_time: '19:00:00' }),
        ts({ schedule_type: 'sat_sun', slot_index: 0, start_time: '10:00:00', end_time: '11:30:00' }),
        ts({ slot_index: 10, logical_slot_id: 'LC', start_time: '16:00:00', end_time: '17:30:00' }),
        // LD has no logical-id time slot: the index of the LATEST assignment version decides
        ts({ slot_index: 11, start_time: '16:00:00', end_time: '17:30:00' }),
        ts({ slot_index: 12, start_time: '17:30:00', end_time: '19:00:00' }),
        ts({ slot_index: 13, logical_slot_id: 'LE', start_time: '16:00:00', end_time: '17:30:00' }),
        ts({ slot_index: 14, logical_slot_id: 'LF', start_time: '17:30:00', end_time: '19:00:00' }),
        ts({ slot_index: 15, logical_slot_id: 'LH', start_time: '16:00:00', end_time: '17:30:00' }),
        ts({ slot_index: 15, logical_slot_id: 'LH', start_time: '16:00:00', end_time: '17:30:00', effective_from: '2026-10-01', deleted_at: '2026-10-01T00:00:00Z' }),
        ts({ coach_id: COACH_B, slot_index: 3, logical_slot_id: 'LI', start_time: '12:00:00', end_time: '13:00:00' }),
        ts({ coach_id: COACH_B, slot_index: 0, start_time: '09:00:00', end_time: '10:00:00' }),
    ];
    const exclusions = [
        { student_id: 'e', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: 'LE', time_slot_index: 13 },
        { student_id: 'f', branch_id: B1, schedule_type: 'tue_thu', logical_slot_id: null, time_slot_index: 14 },
        { student_id: 'g', branch_id: B2, schedule_type: 'tue_thu', logical_slot_id: null, time_slot_index: 0 },
        { student_id: 'g', branch_id: B1, schedule_type: 'sat_sun', logical_slot_id: null, time_slot_index: 0 },
    ];
    const setTables = () => {
        tables = {
            student_time_slot_assignments: paged(assignRows),
            time_slots: paged(timeSlots),
            student_slot_exclusions: paged(exclusions),
        };
    };
    setTables();
    calls.length = 0;
    const sched = mapToObj(await data.getAllStudentSchedules(students));
    const summary = (list) => (list || []).map(r => `${r.scheduleType} ${r.startTime}`);
    assertEqual(summary(sched.a), ['tue_thu 16:00:00', 'sat_sun 10:00:00'], 'multiple schedules for one student');
    assertEqual(summary(sched.b), ['sat_sun 10:00:00'], 'legacy -1 hides only its group');
    assert(!sched.c, 'hidden=true latest version hides the slot');
    assertEqual(summary(sched.d), ['tue_thu 17:30:00'], 'latest assignment version wins');
    assert(!sched.e, 'exclusion by logical id');
    assert(!sched.f, 'legacy index exclusion hides logical-id slot');
    assertEqual(summary(sched.g), ['tue_thu 16:00:00'], 'exclusion in another branch / schedule does NOT hide');
    assert(!sched.h, 'tombstoned time slot dropped');
    assertEqual(summary(sched.i), ['tue_thu 12:00:00'], 'logical id matches another coach\'s slot');
    assertEqual(summary(sched.j), ['tue_thu 09:00:00'], 'index fallback uses each student\'s own coachId');
    assert(!sched.k, 'student without rows absent');

    const ac = calls.find(c => c.table === 'student_time_slot_assignments');
    assert(ac.ops.some(([op, a]) => op === 'lte' && a[0] === 'effective_from'), 'assignments capped at month end');
    assertEqual(ac.ops.filter(([op]) => op === 'order').map(([, a]) => a[0]), ['effective_from', 'updated_at', 'id'], 'assignments ordered effective_from, updated_at, id');
    assert(!ac.ops.some(([op]) => op === 'eq' || op === 'in'), 'assignments fetched for all students at once');
    assert(calls.find(c => c.table === 'student_slot_exclusions').ops.some(([op, a]) => op === 'eq' && a[0] === 'active' && a[1] === true), 'only active exclusions');
    assertEqual(calls.filter(c => c.table === 'student_slot_exclusions').length, 1, 'exclusions fetched once');

    // paging past 1000 assignment rows
    const many = [];
    for (let i = 0; i < 1003; i++) many.push(row({ student_id: `m${i}`, time_slot_index: 0 }));
    tables = { student_time_slot_assignments: paged(many), time_slots: paged(timeSlots), student_slot_exclusions: paged([]) };
    calls.length = 0;
    const big = await data.getAllStudentSchedules([{ id: 'm1002', coachId: COACH_A }]);
    assertEqual(calls.filter(c => c.table === 'student_time_slot_assignments').length, 2, 'assignments paged in 1000-row pages');
    assertEqual(summary(big.get('m1002')), ['tue_thu 16:00:00'], 'student from the second page resolved');

    setTables();
    tables.student_slot_exclusions = { data: null, error: { message: 'relation does not exist' } };
    const open = mapToObj(await data.getAllStudentSchedules(students));
    assert(open.e && open.f, 'exclusions error → fail open');

    setTables();
    tables.student_time_slot_assignments = { data: null, error: { message: 'boom' } };
    assertEqual((await data.getAllStudentSchedules(students)).size, 0, 'assignments error → empty Map');

    setTables();
    tables.time_slots = new Error('network');
    assertEqual((await data.getAllStudentSchedules(students)).size, 0, 'time_slots error → empty Map');

    // -----------------------------------------------------------------------
    console.log('\n=== cell renderers (RU) ==============================================\n');
    const TRANSLATIONS = vm.runInNewContext(`(${I18N_SRC.slice(I18N_SRC.indexOf('const translations = {') + 'const translations = '.length, I18N_SRC.indexOf('\n};', I18N_SRC.indexOf('const translations = {')) + 2)})`);
    const renderSrc = [
        extractConst(CONSTANTS_SRC, 'SCHEDULE_CHIP_DAYS'),
        extractConst(CONSTANTS_SRC, 'SCHEDULE_CHIP_ORDER'),
        ...['formatScheduleTime', 'sortScheduleChips'].map(n => extractFunction(CONSTANTS_SRC, n)),
        'let studentRatingMap = null; let studentScheduleMap = null;',
        extractConst(ADMIN_SRC, 'STUDENT_LEAGUE_KEYS'),
        ...['escapeHtml', 'renderStudentAgeCell', 'renderStudentRatingCell', 'renderStudentScheduleCell', 'sortStudentsByRating'].map(n => extractFunction(ADMIN_SRC, n)),
        'this.setMaps = (r, s) => { studentRatingMap = r; studentScheduleMap = s; };',
    ].join('\n\n');
    const rctx = vm.createContext({ t: (k) => TRANSLATIONS.ru[k] });
    vm.runInContext(renderSrc, rctx);
    const { renderStudentAgeCell, renderStudentRatingCell, renderStudentScheduleCell, sortStudentsByRating } = rctx;

    assertEqual(renderStudentRatingCell('x'), '<span class="st-muted">…</span>', 'rating loading → …');
    assertEqual(renderStudentScheduleCell('x'), '<span class="st-muted">…</span>', 'schedule loading → …');

    const rMap = new Map([
        ['r1', { rating: 612, ratingDate: '2026-11-01', leagueTier: 'bronze' }],
        ['r2', { rating: 1450, ratingDate: '2026-11-01', leagueTier: 'gold' }],
        ['r3', { rating: 900, ratingDate: '2026-11-01', leagueTier: 'silver' }],
    ]);
    const sMap = new Map([
        ['r1', [
            { scheduleType: 'sat_sun', startTime: '10:00:00', endTime: '11:30:00' },
            { scheduleType: 'mon_wed', startTime: '16:00:00', endTime: '17:30:00' },
        ]],
        ['x<', [{ scheduleType: 'tue_thu', startTime: '<b>', endTime: '' }]],
    ]);
    rctx.setMaps(rMap, sMap);
    assertEqual(renderStudentRatingCell('r1'), '<div class="st-rating"><b>612</b><span class="st-league bronze">Лига C</span></div>', 'rating + bronze league pill');
    assert(renderStudentRatingCell('r2').includes('<span class="st-league gold">Лига A</span>'), 'gold → Лига A');
    assert(renderStudentRatingCell('r3').includes('<span class="st-league silver">Лига B</span>'), 'silver → Лига B');
    assertEqual(renderStudentRatingCell('nobody'), '<span class="st-muted">—</span>', 'unrated → —');

    const chips = renderStudentScheduleCell('r1');
    assert(chips.startsWith('<div class="st-sched">'), 'wrapped in .st-sched');
    assertEqual((chips.match(/class="st-chip"/g) || []).length, 2, 'one chip per schedule');
    assert(chips.includes('<span class="st-chip"><span class="st-chip-days">Пн · Ср</span><span class="st-chip-time">16:00–17:30</span></span>'), 'chip markup «Пн · Ср» 16:00–17:30');
    assert(chips.indexOf('Пн · Ср') < chips.indexOf('Сб · Вс'), 'mon_wed sorted before sat_sun');
    assertEqual(renderStudentScheduleCell('nobody'), '<span class="st-muted">Не назначено</span>', 'no schedule → Не назначено');
    assertEqual(renderStudentScheduleCell('x<'), '<span class="st-muted">Не назначено</span>', 'unparseable time → treated as none');

    assertEqual(renderStudentAgeCell(null), '<span class="st-muted">—</span>', 'age null → —');
    assertEqual(renderStudentAgeCell(undefined), '<span class="st-muted">—</span>', 'age undefined → —');
    assertEqual(renderStudentAgeCell(9), '9', 'age rendered');
    assertEqual(renderStudentAgeCell(0), '0', 'age 0 rendered (not —)');

    rctx.t = () => '<img>';
    assert(!renderStudentRatingCell('r1').includes('<img>') && !renderStudentScheduleCell('r1').includes('<img>')
        && !renderStudentScheduleCell('nobody').includes('<img>'), 'translated text escaped');
    rctx.t = (k) => TRANSLATIONS.ru[k];

    // Row / mobile card wiring
    const load = extractFunction(ADMIN_SRC, 'loadStudents');
    assert(/<td>\$\{renderStudentAgeCell\(student\.age\)\}<\/td>/.test(load), 'row uses renderStudentAgeCell');
    assert(load.indexOf('student.coach}</td>') < load.indexOf('renderStudentRatingCell(student.id)')
        && load.indexOf('renderStudentRatingCell(student.id)') < load.indexOf('renderStudentScheduleCell(student.id)')
        && load.indexOf('renderStudentScheduleCell(student.id)') < load.indexOf('level-badge'), 'row: coach → rating → schedule → level');
    assert(load.includes('colspan="11"') && !load.includes('colspan="9"'), 'empty-state colspan 11');
    assert(/sortStudentsByRating\(getFilteredStudents\(\), studentRatingSort, studentRatingMap\)/.test(load), 'sort applied after filtering, before pagination');
    const mobile = extractFunction(ADMIN_SRC, 'renderMobileStudentCards');
    assert(mobile.includes('renderStudentRatingCell(student.id)') && mobile.includes('renderStudentScheduleCell(student.id)'), 'mobile cards show rating + schedule');
    assert(mobile.includes('mobile-card-detail mobile-card-detail-full'), 'mobile schedule spans full width');
    assert(!mobile.includes("${student.age} ${t('common.years')}"), 'mobile meta no longer prints "null лет"');
    assert(/\.mobile-card-detail-full \{ grid-column: 1 \/ -1; \}/.test(read('admin-styles.css')), 'full-width CSS rule');

    // -----------------------------------------------------------------------
    console.log('\n=== sortStudentsByRating =============================================\n');
    const list = [
        { id: 'u1' }, { id: 'a600' }, { id: 'b900' }, { id: 'u2' }, { id: 'c600' }, { id: 'd300' },
    ];
    const sortMap = new Map([
        ['a600', { rating: 600 }], ['b900', { rating: 900 }], ['c600', { rating: 600 }], ['d300', { rating: 300 }],
    ]);
    const ids = (l) => l.map(s => s.id);
    assertEqual(ids(sortStudentsByRating(list, 'desc', sortMap)), ['b900', 'a600', 'c600', 'd300', 'u1', 'u2'], 'desc, ties stable, unrated last');
    assertEqual(ids(sortStudentsByRating(list, 'asc', sortMap)), ['d300', 'a600', 'c600', 'b900', 'u1', 'u2'], 'asc, ties stable, unrated last');
    assertEqual(ids(sortStudentsByRating(list, 'none', sortMap)), ids(list), 'none keeps original order');
    assertEqual(ids(sortStudentsByRating(list, 'desc', null)), ids(list), 'ratings still loading → original order');
    assertEqual(ids(list), ['u1', 'a600', 'b900', 'u2', 'c600', 'd300'], 'input not mutated');

    const toggle = extractFunction(ADMIN_SRC, 'toggleStudentRatingSort');
    assert(/currentStudentPage = 1/.test(toggle) && /loadStudents\(\)/.test(toggle), 'toggle resets to page 1 and re-renders');
    assert(/RATING_SORT_NEXT = \{ none: 'desc', desc: 'asc', asc: 'none' \}/.test(ADMIN_SRC), 'cycle none → desc → asc → none');
    assert(/RATING_SORT_ICONS = \{ none: 'arrow-down-up', desc: 'arrow-down', asc: 'arrow-up' \}/.test(ADMIN_SRC), 'lucide icons per sort state');

    const extras = extractFunction(ADMIN_SRC, 'loadStudentTableExtras');
    assert(/Promise\.all/.test(extras) && /getStudentTableRatings/.test(extras) && /getAllStudentSchedules/.test(extras), 'extras fetched in parallel');
    assert(/window\.loadStudentTableExtras\(\)/.test(extractFunction(read('crud.js'), 'initializeData')), 'extras re-run on every initializeData()');

    // -----------------------------------------------------------------------
    console.log('\n=== admin-v2.html thead + i18n =======================================\n');
    const thead = HTML.slice(HTML.indexOf('<thead>', HTML.indexOf('id="searchInput"')), HTML.indexOf('</thead>', HTML.indexOf('id="searchInput"')));
    const ths = [...thead.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].map(m => {
        const key = /data-i18n="([^"]+)"/.exec(m[1] + m[2]);
        return key ? key[1] : null;
    });
    assertEqual(ths, ['admin.table.number', 'admin.table.student', 'admin.table.age', 'admin.table.branch', 'admin.table.coach',
        'admin.table.rating', 'admin.table.schedule', 'admin.table.level', 'admin.table.razryad', 'admin.table.status', 'admin.table.actions'],
    '11 <th> in the agreed order');
    assert(/<th id="ratingSortHeader" class="sortable-th"/.test(thead), 'rating header is sortable');

    const expected = {
        en: ['Rating', 'Schedule', 'Not assigned', 'Sort by rating'],
        kk: ['Рейтинг', 'Кесте', 'Тағайындалмаған', 'Рейтинг бойынша сұрыптау'],
        ru: ['Рейтинг', 'Расписание', 'Не назначено', 'Сортировать по рейтингу'],
    };
    for (const lang of Object.keys(expected)) {
        assertEqual(['rating', 'schedule', 'scheduleNone', 'sortByRating'].map(k => TRANSLATIONS[lang][`admin.table.${k}`]), expected[lang], `${lang}: admin.table keys`);
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
