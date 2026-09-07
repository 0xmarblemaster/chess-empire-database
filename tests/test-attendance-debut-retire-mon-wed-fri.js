/**
 * Tests for retiring the mon_wed_fri (Pn-Sr-Pt / Mon-Wed-Fri) schedule option
 * from the generic Debut branch schedule list.
 *
 * Covers:
 *   1. populateAttendanceScheduleDropdown: the generic Debut list (no
 *      coach-specific restriction) is EXACTLY [all, mon_wed, tue_thu, sat_sun]
 *      on the two attendance filters, and [mon_wed, tue_thu, sat_sun] on the
 *      add-student modal (no "All"). mon_wed_fri must be absent from all three.
 *   2. applyDebutScheduleResetForCoach: a previously-saved mon_wed_fri filter
 *      falls back to mon_wed (the retired option no longer exists).
 *   3. The Azamat coach-specific list is untouched (still [tue_thu, sat_sun]).
 *
 * Run: node tests/test-attendance-debut-retire-mon-wed-fri.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

let passed = 0;
let failed = 0;
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

function extractConst(src, name) {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*[^;]+;`, 's'));
    return m ? m[0] : '';
}

const AZAMAT_ID = '28c56c39-7318-41f1-8f8b-a996dd721f02';
const NAIL_NAME = 'Nail Ildusovich';

const CONSTS =
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ALEKSANDR_ID') + '\n' +
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ANDREI_ID') + '\n' +
    extractConst(ADMIN_V2_SRC, 'DEBUT_COACH_AZAMAT_ID') + '\n';

function makeSelect() { return { innerHTML: '', value: '' }; }
function makeDoc(selects) {
    return { getElementById: (id) => selects[id] || null };
}

function loadDropdownSandbox({ branch, coach, coachName, schedule }) {
    const body = `
'use strict';
let attendanceCurrentBranch = __branch;
let attendanceCurrentCoach = __coach;
let attendanceCurrentCoachName = __coachName;
let attendanceCurrentSchedule = __schedule;
const t = __t;
const document = __document;
${CONSTS}
${extractFn(ADMIN_V2_SRC, 'isHalykBranch')}
${extractFn(ADMIN_V2_SRC, 'scheduleTypeI18nKey')}
${extractFn(ADMIN_V2_SRC, 'getHalykScheduleTypesForCoach')}
${extractFn(ADMIN_V2_SRC, 'getDebutScheduleTypesForCoach')}
${extractFn(ADMIN_V2_SRC, 'scheduleOptionsHtml')}
${extractFn(ADMIN_V2_SRC, 'applyDebutScheduleResetForCoach')}
${extractFn(ADMIN_V2_SRC, 'populateAttendanceScheduleDropdown')}
return {
    populate: populateAttendanceScheduleDropdown,
    reset: applyDebutScheduleResetForCoach,
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

// ---------------------------------------------------------------------------
// (1) Generic Debut list is EXACTLY [all, mon_wed, tue_thu, sat_sun].
// ---------------------------------------------------------------------------
console.log('\n=== generic Debut schedule options (mon_wed_fri retired) =============\n');
for (const { label, coach, coachName } of [
    { label: 'Nail', coach: 'nail-id', coachName: NAIL_NAME },
    { label: 'all-coaches', coach: 'all', coachName: null },
    { label: 'no-coach', coach: null, coachName: null },
]) {
    const { api, selects } = loadDropdownSandbox({ branch: 'Debut', coach, coachName, schedule: '' });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML),
        ['', 'mon_wed', 'tue_thu', 'sat_sun'],
        `Debut/${label} desktop filter is exactly [all, mon_wed, tue_thu, sat_sun]`);
    assertEqual(optionValues(selects.mobileScheduleFilter.innerHTML),
        ['', 'mon_wed', 'tue_thu', 'sat_sun'],
        `Debut/${label} mobile filter is exactly [all, mon_wed, tue_thu, sat_sun]`);
    assertEqual(optionValues(selects.addStudentScheduleSelect.innerHTML),
        ['mon_wed', 'tue_thu', 'sat_sun'],
        `Debut/${label} add-student is exactly [mon_wed, tue_thu, sat_sun] (no All)`);
}

// ---------------------------------------------------------------------------
// (2) Reset falls back mon_wed_fri → mon_wed for generic Debut coaches.
// ---------------------------------------------------------------------------
console.log('\n=== reset fallback for retired mon_wed_fri ===========================\n');
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: 'nail-id', coachName: NAIL_NAME, schedule: 'mon_wed_fri',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'mon_wed',
        'saved mon_wed_fri filter falls back to mon_wed on the generic Debut list');
}

// ---------------------------------------------------------------------------
// (3) Azamat coach-specific list is untouched.
// ---------------------------------------------------------------------------
console.log('\n=== Azamat coach-specific list unchanged =============================\n');
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Debut', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML), ['', 'tue_thu', 'sat_sun'],
        'Debut/Azamat desktop still [all, tue_thu, sat_sun]');
}

console.log(`\n${'='.repeat(70)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));
process.exit(failed ? 1 : 0);
