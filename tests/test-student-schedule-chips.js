/**
 * Student profile schedule chips ("[Вт · Чт] ⏱ 16:30–17:30" under the league
 * badges, Variant A).
 *
 *  - Data: resolveStudentScheduleSlots / mapStudentScheduleTimes and
 *    supabaseData.getStudentSchedule run in a vm against a fake Supabase
 *    client — legacy -1 hide, hidden=true, latest version wins, exclusions,
 *    tombstoned time_slot, logical-id match across coaches, index fallback,
 *    errors → [].
 *  - Render: the REAL renderScheduleChips() from student.js (vm) with the
 *    real EN / RU / KK dictionaries from i18n.js.
 *  - Placement: .schedule-row sits right after .badge-row inside .profile-info.
 *  - i18n keys present in all three languages.
 *
 * Run: node tests/test-student-schedule-chips.js
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

const STUDENT_SRC = read('student.js');
const DATA_SRC = read('supabase-data.js');
const I18N_SRC = read('i18n.js');

// ---------------------------------------------------------------------------
// Fake Supabase client: per-table results, records every call's ops.
const calls = [];
let tables = {};
function builder(table) {
    const rec = { table, ops: [] };
    calls.push(rec);
    const result = () => {
        const r = tables[table];
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
const window = { supabaseClient: { from: builder } };
const dctx = vm.createContext({ window, console: { error() {}, log() {}, warn() {} } });
vm.runInContext(DATA_SRC, dctx);
const data = window.supabaseData;
const resolveSlots = window.resolveStudentScheduleSlots;
const mapTimes = window.mapStudentScheduleTimes;

const S = 'stu-1';
const B1 = 'branch-1';
const B2 = 'branch-2';
const COACH = 'coach-a';
const OTHER = 'coach-b';
const row = (o) => Object.assign({ student_id: S, branch_id: B1, schedule_type: 'tue_thu', hidden: false, logical_slot_id: null }, o);
const ts = (o) => Object.assign({ branch_id: B1, coach_id: COACH, schedule_type: 'tue_thu', effective_from: '2026-01-01', deleted_at: null, logical_slot_id: null }, o);
const plain = (v) => JSON.parse(JSON.stringify(v));

console.log('\n=== resolveStudentScheduleSlots =====================================\n');
assert(typeof resolveSlots === 'function' && typeof mapTimes === 'function', 'pure helpers exported on window');

assertEqual(plain(resolveSlots([
    row({ time_slot_index: -1, effective_from: '2026-11-01' }),
    row({ time_slot_index: 2, effective_from: '2026-10-01' }),
    row({ schedule_type: 'sat_sun', time_slot_index: 0, effective_from: '2026-10-01' }),
])).map(s => s.scheduleType), ['sat_sun'], 'legacy -1 latest row hides only its (branch, schedule) group');

assertEqual(resolveSlots([
    row({ time_slot_index: 2, effective_from: '2026-11-01' }),
    row({ time_slot_index: -1, effective_from: '2026-09-01' }),
]).length, 1, 'older -1 marker superseded by a newer slot row');

assertEqual(resolveSlots([
    row({ time_slot_index: 1, logical_slot_id: 'L1', hidden: true, effective_from: '2026-11-01' }),
    row({ time_slot_index: 1, logical_slot_id: 'L1', effective_from: '2026-01-01' }),
]).length, 0, 'hidden=true latest version hides the slot');

assertEqual(plain(resolveSlots([
    row({ time_slot_index: 3, logical_slot_id: 'L1', effective_from: '2026-11-01' }),
    row({ time_slot_index: 1, logical_slot_id: 'L1', effective_from: '2026-01-01' }),
]).map(s => s.timeSlotIndex)), [3], 'latest version per logical slot wins');

assertEqual(resolveSlots([
    row({ time_slot_index: 0, logical_slot_id: 'L1', effective_from: '2026-11-01' }),
    row({ time_slot_index: 1, logical_slot_id: 'L2', effective_from: '2026-11-01' }),
]).length, 2, 'two slots in one schedule (multi-group) → two slots');

assertEqual(resolveSlots([
    row({ time_slot_index: 0, effective_from: '2026-11-01' }),
    row({ branch_id: B2, time_slot_index: 0, effective_from: '2026-11-01' }),
]).length, 2, 'same schedule+index in two branches are distinct');

console.log('\n=== mapStudentScheduleTimes =========================================\n');
const slot = (o) => Object.assign({ studentId: S, branchId: B1, scheduleType: 'tue_thu', timeSlotIndex: 0, logicalSlotId: null }, o);

assertEqual(plain(mapTimes([slot({ timeSlotIndex: 1 })], [
    ts({ slot_index: 1, start_time: '16:30:00', end_time: '17:30:00' }),
    ts({ coach_id: OTHER, slot_index: 1, start_time: '10:00:00', end_time: '11:00:00' }),
], COACH)), [{ scheduleType: 'tue_thu', startTime: '16:30:00', endTime: '17:30:00', logicalSlotId: null }],
'index fallback uses the student\'s coach');

assertEqual(plain(mapTimes([slot({ timeSlotIndex: 5, logicalSlotId: 'LX' })], [
    ts({ coach_id: OTHER, slot_index: 0, logical_slot_id: 'LX', start_time: '09:00:00', end_time: '10:00:00' }),
    ts({ slot_index: 5, start_time: '18:00:00', end_time: '19:00:00' }),
], COACH)).map(r => r.startTime), ['09:00:00'], 'logical id matches another coach\'s slot first');

assertEqual(plain(mapTimes([slot({ timeSlotIndex: 0 })], [
    ts({ slot_index: 0, start_time: '15:00:00', end_time: '16:00:00', effective_from: '2026-01-01' }),
    ts({ slot_index: 0, start_time: '16:00:00', end_time: '17:00:00', effective_from: '2026-10-01' }),
], COACH)).map(r => r.startTime), ['16:00:00'], 'latest time_slots version wins');

assertEqual(mapTimes([slot({ logicalSlotId: 'L1' })], [
    ts({ slot_index: 0, logical_slot_id: 'L1', start_time: '15:00:00', end_time: '16:00:00', effective_from: '2026-01-01' }),
    ts({ slot_index: 0, logical_slot_id: 'L1', start_time: '15:00:00', end_time: '16:00:00', effective_from: '2026-10-01', deleted_at: '2026-10-01T00:00:00Z' }),
], COACH).length, 0, 'tombstoned latest time_slot drops the chip');

assertEqual(mapTimes([slot({ timeSlotIndex: 9 })], [ts({ slot_index: 0, start_time: '15:00:00', end_time: '16:00:00' })], COACH).length,
    0, 'unresolvable slot → no chip');

(async () => {
    console.log('\n=== supabaseData.getStudentSchedule ==================================\n');
    assert(typeof data.getStudentSchedule === 'function', 'getStudentSchedule defined');

    tables = {
        student_time_slot_assignments: { error: null, data: [
            row({ time_slot_index: 0, logical_slot_id: 'L1', effective_from: '2026-01-01' }),
            row({ time_slot_index: 1, logical_slot_id: 'L2', effective_from: '2026-01-01' }),
            row({ schedule_type: 'sat_sun', time_slot_index: 0, effective_from: '2026-01-01' }),
        ] },
        students: { error: null, data: { coach_id: COACH } },
        student_slot_exclusions: { error: null, data: [
            { student_id: S, logical_slot_id: 'L2', time_slot_index: 1 },
        ] },
        time_slots: { error: null, data: [
            ts({ slot_index: 0, logical_slot_id: 'L1', start_time: '16:30:00', end_time: '17:30:00' }),
            ts({ slot_index: 1, logical_slot_id: 'L2', start_time: '17:30:00', end_time: '18:30:00' }),
            ts({ schedule_type: 'sat_sun', slot_index: 0, start_time: '10:30:00', end_time: '12:00:00' }),
        ] },
    };
    calls.length = 0;
    const got = plain(await data.getStudentSchedule(S));
    assertEqual(got.map(r => `${r.scheduleType} ${r.startTime}`), ['tue_thu 16:30:00', 'sat_sun 10:30:00'],
        'resolves slots → times; exclusion drops the L2 slot');
    const assignCall = calls.find(c => c.table === 'student_time_slot_assignments');
    assert(assignCall && assignCall.ops.some(([op, a]) => op === 'eq' && a[0] === 'student_id' && a[1] === S),
        'assignments filtered by student_id');
    assert(assignCall.ops.some(([op, a]) => op === 'lte' && a[0] === 'effective_from'), 'assignments capped at month end');
    assert(calls.some(c => c.table === 'students'), 'looks up coach when not passed');

    calls.length = 0;
    await data.getStudentSchedule(S, COACH);
    assert(!calls.some(c => c.table === 'students'), 'skips coach lookup when coachId passed');

    tables.student_slot_exclusions = { error: { message: 'relation does not exist' }, data: null };
    assertEqual((await data.getStudentSchedule(S, COACH)).length, 3, 'exclusions table missing → fail open');

    tables.student_time_slot_assignments = { error: { message: 'boom' }, data: null };
    assertEqual(plain(await data.getStudentSchedule(S, COACH)), [], 'assignment query error → []');

    tables.student_time_slot_assignments = new Error('network');
    assertEqual(plain(await data.getStudentSchedule(S, COACH)), [], 'thrown error → []');

    tables.student_time_slot_assignments = { error: null, data: [] };
    calls.length = 0;
    assertEqual(plain(await data.getStudentSchedule(S, COACH)), [], 'no assignments → []');
    assert(!calls.some(c => c.table === 'time_slots'), 'no time_slots query when nothing assigned');

    // -----------------------------------------------------------------------
    console.log('\n=== renderScheduleChips ==============================================\n');
    const TRANSLATIONS = vm.runInNewContext(`(${I18N_SRC.slice(I18N_SRC.indexOf('const translations = {') + 'const translations = '.length, I18N_SRC.indexOf('\n};', I18N_SRC.indexOf('const translations = {')) + 2)})`);
    const constsStart = STUDENT_SRC.indexOf('const SCHEDULE_CHIP_DAYS');
    const consts = STUDENT_SRC.slice(constsStart, STUDENT_SRC.indexOf('function formatScheduleTime', constsStart));
    const renderSrc = [consts, ...['escapeHtmlSafe', 'formatScheduleTime', 'renderScheduleChips'].map(n => extractFunction(STUDENT_SRC, n))].join('\n\n');
    const rctx = vm.createContext({ lang: 'en', t: (k) => TRANSLATIONS[rctx.lang][k] });
    vm.runInContext(renderSrc, rctx);
    const render = (schedules, lang = 'en') => { rctx.lang = lang; return rctx.renderScheduleChips(schedules); };

    assert(/window\.renderScheduleChips = renderScheduleChips/.test(STUDENT_SRC), 'renderScheduleChips exported on window');
    assertEqual(render([]), '', 'empty → ""');
    assertEqual(render(null), '', 'null → ""');
    assertEqual(render([{ scheduleType: 'unknown', startTime: '10:00:00', endTime: '11:00:00' }]), '', 'unknown schedule type → ""');

    const two = [
        { scheduleType: 'sat_sun', startTime: '10:30:00', endTime: '12:00:00' },
        { scheduleType: 'tue_thu', startTime: '16:30:00', endTime: '17:30:00' },
    ];
    const html = render(two, 'ru');
    assertEqual((html.match(/class="schedule-chip"/g) || []).length, 2, 'two schedules → two chips');
    assert(html.startsWith('<div class="schedule-row"'), 'wrapped in .schedule-row');
    assert(html.indexOf('Вт · Чт') < html.indexOf('Сб · Вс'), 'sorted by weekday order (tue_thu before sat_sun)');
    assert(html.includes('<span class="schedule-chip-time">16:30–17:30</span>'), 'time "16:30–17:30" (en dash, no seconds)');
    assert(html.includes('data-lucide="clock"') && html.includes('width: 14px'), 'lucide clock icon, 14px');
    assert(html.includes('aria-label="Расписание занятий"') && html.includes('title="Расписание занятий"'), 'RU aria-label/title');

    assert(render([{ scheduleType: 'mon_wed_fri', startTime: '9:00', endTime: '10:00:00' }]).includes('>9:00–10:00<'),
        'keeps leading hour as stored (9:00)');
    assert(render(two, 'en').includes('>Tue · Thu<') && render(two, 'en').includes('>Sat · Sun<'), 'EN labels');
    assert(render([{ scheduleType: 'mon_wed', startTime: '10:00', endTime: '11:00' }], 'kk').includes('>Дс · Ср<'), 'KK labels');
    assert(render([{ scheduleType: 'wed_fri', startTime: '10:00', endTime: '11:00' }], 'ru').includes('>Ср · Пт<'), 'wed_fri label');

    const order = render([
        { scheduleType: 'sat_sun', startTime: '09:00', endTime: '10:00' },
        { scheduleType: 'tue_thu', startTime: '17:30', endTime: '18:30' },
        { scheduleType: 'wed_fri', startTime: '09:00', endTime: '10:00' },
        { scheduleType: 'tue_thu', startTime: '9:30', endTime: '10:30' },
        { scheduleType: 'mon_wed_fri', startTime: '09:00', endTime: '10:00' },
        { scheduleType: 'mon_wed', startTime: '09:00', endTime: '10:00' },
    ], 'en');
    const seq = [...order.matchAll(/schedule-chip-days">([^<]+)<\/span><i[^>]*><\/i><span class="schedule-chip-time">([^<]+)</g)].map(m => `${m[1]} ${m[2]}`);
    assertEqual(seq, ['Mon · Wed 09:00–10:00', 'Mon · Wed · Fri 09:00–10:00', 'Tue · Thu 9:30–10:30', 'Tue · Thu 17:30–18:30', 'Wed · Fri 09:00–10:00', 'Sat · Sun 09:00–10:00'],
        'day order then start time (numeric, 9:30 before 17:30)');

    rctx.t = () => '<b>x</b>';
    assert(!render(two).includes('<b>'), 'text is escaped');

    // -----------------------------------------------------------------------
    console.log('\n=== placement & loading ==============================================\n');
    const profile = extractFunction(STUDENT_SRC, 'renderProfile');
    const badgeEnd = profile.indexOf('${rankBadgesHTML}\n                </div>');
    const chips = profile.indexOf('${renderScheduleChips(studentProfileData?.schedule)}');
    const infoEnd = profile.indexOf('${editButtonHTML}');
    assert(badgeEnd > 0 && chips > badgeEnd && chips < infoEnd, 'schedule-row rendered right after .badge-row inside .profile-info');
    const loader = extractFunction(STUDENT_SRC, 'loadStudentProfileData');
    assertEqual((loader.match(/loadStudentSchedule\(studentId\)/g) || []).length, 2, 'schedule loaded inside both Promise.all branches (no serial round-trip)');

    const CSS = read('student-styles.css');
    assert(/\.schedule-chip \{[^}]*background: #fdf2f4;[^}]*border: 1px solid #f3d0d8;[^}]*color: #5F192B;/.test(CSS), 'chip colours per mockup');
    assert(/@media \(max-width: 768px\)[\s\S]*?\.badge-row,\s*\.schedule-row \{\s*justify-content: center;/.test(CSS), 'centered on mobile alongside .badge-row');

    // -----------------------------------------------------------------------
    console.log('\n=== i18n keys ========================================================\n');
    const keys = ['student.schedule.title', ...['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => `student.schedule.days.${d}`)];
    for (const lang of ['en', 'ru', 'kk']) {
        const missing = keys.filter(k => typeof TRANSLATIONS[lang][k] !== 'string' || !TRANSLATIONS[lang][k]);
        assertEqual(missing, [], `${lang}: all schedule keys present`);
    }
    assertEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => TRANSLATIONS.ru[`student.schedule.days.${d}`]), ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], 'RU weekdays');
    assertEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => TRANSLATIONS.kk[`student.schedule.days.${d}`]), ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жк'], 'KK weekdays');

    console.log(`\n--- ${passed} passed, ${failed} failed ---`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
