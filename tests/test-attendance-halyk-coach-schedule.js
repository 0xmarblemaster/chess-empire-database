/**
 * Tests for the Halyk Arena coach-aware schedule feature.
 *
 * Covers (see TASK_halyk_coach_days.md):
 *   1. getScheduleDaysOfWeek('mon_fri') === [1, 2, 3, 4, 5]
 *   2. getScheduleDates(...) for 'mon_fri' returns only Mon–Fri dates.
 *   3. getHalykScheduleTypesForCoach: Aleksandr → ['mon_wed'];
 *      Andrei → ['tue_thu', 'sat_sun']; by id AND by name fallback.
 *   4. populateAttendanceScheduleDropdown is coach-aware for Halyk and leaves
 *      other branches unchanged.
 *   5. applyHalykScheduleResetForCoach resets an invalid schedule on coach switch.
 *   6. i18n keys admin.attendance.monFri exist in EN/RU/KK.
 *   7. The mon_fri migration file extends both CHECK constraints.
 *
 * Run: node tests/test-attendance-halyk-coach-schedule.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++; console.log(`  ✓ ${msg}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

/** Slice out a top-level `function name() { ... }` declaration from src. */
function extractFn(src, name) {
    const idx = src.indexOf(`function ${name}(`);
    if (idx < 0) return '';
    const open = src.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(idx, i + 1);
        }
    }
    return '';
}

// Full-length UUIDs whose prefixes match the ones baked into admin-v2.js.
const ALEKSANDR_ID = 'de188ac1-1111-2222-3333-444455556666';
const ANDREI_ID = '3a6d5a08-1111-2222-3333-444455556666';

// The coach-id constants live at module scope in admin-v2.js; pull their source
// so the extracted helpers resolve them inside the sandbox.
function extractConst(src, name) {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*[^;]+;`));
    return m ? m[0] : '';
}
const HALYK_CONSTS =
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ALEKSANDR_ID') + '\n' +
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ANDREI_ID') + '\n';

// ---------------------------------------------------------------------------
// (1) getScheduleDaysOfWeek('mon_fri')
// ---------------------------------------------------------------------------
console.log('\n=== getScheduleDaysOfWeek ============================================\n');
{
    const factory = new Function(extractFn(ADMIN_V2_SRC, 'getScheduleDaysOfWeek') + '\nreturn getScheduleDaysOfWeek;');
    const getScheduleDaysOfWeek = factory();
    assertEqual(getScheduleDaysOfWeek('mon_fri'), [1, 2, 3, 4, 5],
        "getScheduleDaysOfWeek('mon_fri') === [1,2,3,4,5]");
    // Existing patterns unchanged.
    assertEqual(getScheduleDaysOfWeek('tue_thu'), [2, 4], "tue_thu unchanged");
    assertEqual(getScheduleDaysOfWeek('sat_sun'), [0, 6], "sat_sun unchanged");
}

// ---------------------------------------------------------------------------
// (2) getScheduleDates(...) for mon_fri — desktop returns all Mon–Fri dates
// ---------------------------------------------------------------------------
console.log('\n=== getScheduleDates (mon_fri) =======================================\n');
{
    const factory = new Function('window',
        extractFn(ADMIN_V2_SRC, 'getScheduleDates') + '\nreturn getScheduleDates;');
    const getScheduleDates = factory({ innerWidth: 1280 }); // desktop

    // September 2026 (month index 8).
    const year = 2026, month = 8;
    const dates = getScheduleDates(year, month, 'mon_fri', 0);
    const allWeekdays = dates.every(d => {
        const dow = new Date(year, month, d).getDay();
        return dow >= 1 && dow <= 5;
    });
    assert(dates.length > 0, 'mon_fri returns a non-empty date list');
    assert(allWeekdays, 'mon_fri returns only Mon–Fri dates (no weekends)');

    // Cross-check: length equals the count of weekdays in the month.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let expectedCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month, d).getDay();
        if (dow >= 1 && dow <= 5) expectedCount++;
    }
    assertEqual(dates.length, expectedCount, 'mon_fri count matches weekday count in month');
}

// ---------------------------------------------------------------------------
// (3) getHalykScheduleTypesForCoach — by id and by name
// ---------------------------------------------------------------------------
console.log('\n=== getHalykScheduleTypesForCoach ====================================\n');
{
    const factory = new Function(
        HALYK_CONSTS +
        extractFn(ADMIN_V2_SRC, 'getHalykScheduleTypesForCoach') +
        '\nreturn getHalykScheduleTypesForCoach;');
    const fn = factory();

    assertEqual(fn(ALEKSANDR_ID, null), ['mon_wed'], 'Aleksandr by id → [mon_wed]');
    assertEqual(fn(ANDREI_ID, null), ['tue_thu', 'sat_sun'], 'Andrei by id → [tue_thu, sat_sun]');
    assertEqual(fn(null, 'Aleksandr Olegovich'), ['mon_wed'], 'Aleksandr by name → [mon_wed]');
    assertEqual(fn(null, 'Андрей Олегович'), ['tue_thu', 'sat_sun'], 'Andrei by Russian name → [tue_thu, sat_sun]');
    assertEqual(fn('some-other-id', 'Someone Else'), [], 'unknown coach → []');
    assertEqual(fn(null, null), [], 'no coach → []');
}

// ---------------------------------------------------------------------------
// (4)/(5) populateAttendanceScheduleDropdown + applyHalykScheduleResetForCoach
// ---------------------------------------------------------------------------
console.log('\n=== populate + reset (functional sandbox) ============================\n');

function makeSelect() { return { innerHTML: '', value: '' }; }
function makeDoc(selects) {
    return { getElementById: (id) => selects[id] || null };
}

/** Build a sandbox with the Halyk helpers, populate, and reset wired up. */
function loadDropdownSandbox({ branch, coach, coachName, schedule }) {
    const body = `
'use strict';
let attendanceCurrentBranch = __branch;
let attendanceCurrentCoach = __coach;
let attendanceCurrentCoachName = __coachName;
let attendanceCurrentSchedule = __schedule;
const t = __t;
const document = __document;
${HALYK_CONSTS}
${extractFn(ADMIN_V2_SRC, 'isHalykBranch')}
${extractFn(ADMIN_V2_SRC, 'scheduleTypeI18nKey')}
${extractFn(ADMIN_V2_SRC, 'getHalykScheduleTypesForCoach')}
${extractFn(ADMIN_V2_SRC, 'scheduleOptionsHtml')}
${extractFn(ADMIN_V2_SRC, 'applyHalykScheduleResetForCoach')}
${extractFn(ADMIN_V2_SRC, 'populateAttendanceScheduleDropdown')}
return {
    populate: populateAttendanceScheduleDropdown,
    reset: applyHalykScheduleResetForCoach,
    getSchedule: () => attendanceCurrentSchedule,
};
`;
    const factory = new Function('__branch', '__coach', '__coachName', '__schedule', '__t', '__document', body);
    const selects = {
        attendanceScheduleFilter: makeSelect(),
        mobileScheduleFilter: makeSelect(),
        addStudentScheduleSelect: makeSelect(),
    };
    const api = factory(branch, coach, coachName, schedule, (k) => k, makeDoc(selects));
    return { api, selects };
}

function optionValues(html) {
    return [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1]);
}

// Halyk + Aleksandr → only mon_wed (plus the empty "All" placeholder on filters).
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Halyk Arena', coach: ALEKSANDR_ID, coachName: 'Aleksandr Olegovich', schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML), ['', 'mon_wed'],
        'Halyk/Aleksandr desktop → [All, mon_wed]');
    assertEqual(optionValues(selects.mobileScheduleFilter.innerHTML), ['', 'mon_wed'],
        'Halyk/Aleksandr mobile → [All, mon_wed]');
    assertEqual(optionValues(selects.addStudentScheduleSelect.innerHTML), ['mon_wed'],
        'Halyk/Aleksandr add-student → [mon_wed] (no All)');
}

// Halyk + Andrei → tue_thu + sat_sun.
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Halyk Arena', coach: ANDREI_ID, coachName: 'Andrei Olegovich', schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML), ['', 'tue_thu', 'sat_sun'],
        'Halyk/Andrei desktop → [All, tue_thu, sat_sun]');
    assertEqual(optionValues(selects.addStudentScheduleSelect.innerHTML), ['tue_thu', 'sat_sun'],
        'Halyk/Andrei add-student → [tue_thu, sat_sun]');
}

// Other branch (Debut) unchanged — no mon_fri, keeps mon_wed/mon_wed_fri/tue_thu/sat_sun.
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Debut', coach: 'all', coachName: null, schedule: '',
    });
    api.populate();
    const vals = optionValues(selects.attendanceScheduleFilter.innerHTML);
    assertEqual(vals, ['', 'mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun'],
        'Debut desktop unchanged (no mon_fri)');
    assert(!vals.includes('mon_fri'), 'Debut never offers mon_fri');
}

// Reset: Andrei(tue_thu selected) → switch to Aleksandr → resets to mon_wed.
{
    const { api } = loadDropdownSandbox({
        branch: 'Halyk Arena', coach: ALEKSANDR_ID, coachName: 'Aleksandr Olegovich', schedule: 'tue_thu',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'mon_wed',
        'switching to Aleksandr while tue_thu selected resets to mon_wed');
}

// Reset: empty "All" filter stays valid for a coach.
{
    const { api } = loadDropdownSandbox({
        branch: 'Halyk Arena', coach: ANDREI_ID, coachName: 'Andrei Olegovich', schedule: '',
    });
    api.reset();
    assertEqual(api.getSchedule(), '', 'empty All filter stays valid on coach change');
}

// Reset: valid schedule for coach is kept.
{
    const { api } = loadDropdownSandbox({
        branch: 'Halyk Arena', coach: ANDREI_ID, coachName: 'Andrei Olegovich', schedule: 'sat_sun',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'sat_sun', 'sat_sun kept for Andrei');
}

// Reset: no-op for non-Halyk branches.
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: 'all', coachName: null, schedule: 'mon_wed',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'mon_wed', 'reset is a no-op for non-Halyk branches');
}

// ---------------------------------------------------------------------------
// (6) i18n keys
// ---------------------------------------------------------------------------
console.log('\n=== i18n keys ========================================================\n');
{
    assert(/"admin\.attendance\.monFri":\s*"Mon-Fri"/.test(I18N_SRC), 'EN monFri = "Mon-Fri"');
    assert(/"admin\.attendance\.monFri":\s*"Пн-Пт"/.test(I18N_SRC), 'RU monFri = "Пн-Пт"');
    assert(/"admin\.attendance\.monFri":\s*"Дс-Жм"/.test(I18N_SRC), 'KK monFri = "Дс-Жм"');
}

// ---------------------------------------------------------------------------
// (7) migration file
// ---------------------------------------------------------------------------
console.log('\n=== migration file ===================================================\n');
{
    const migPath = path.join(ROOT, 'migrations', 'add_mon_fri_schedule_type.sql');
    assert(fs.existsSync(migPath), 'migrations/add_mon_fri_schedule_type.sql exists');
    const sql = fs.readFileSync(migPath, 'utf8');
    assert(/attendance_schedule_type_check/.test(sql), 'migration touches attendance constraint');
    assert(/student_time_slot_assignments_schedule_type_check/.test(sql),
        'migration touches student_time_slot_assignments constraint');
    const monFriConstraints = (sql.match(/'mon_fri'/g) || []).length;
    assert(monFriConstraints >= 2, "migration adds 'mon_fri' to both CHECK constraints");
    assert(/SQL editor/i.test(sql), 'migration notes it must be run in the Supabase SQL editor');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
