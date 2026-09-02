/**
 * Tests for the Debut coach-aware schedule feature (Azamat Alemkhanovich).
 *
 * Azamat (28c56c39…) works Tue-Thu 09:00-19:00 and Sat-Sun 09:00-13:00 only.
 * Covers:
 *   1. getDebutScheduleTypesForCoach: Azamat → ['tue_thu','sat_sun'] (by id
 *      AND by name, EN/RU); other coaches → null (generic Debut list).
 *   2. populateAttendanceScheduleDropdown shows only Azamat's days on all
 *      three selects; other Debut coaches keep the full generic list.
 *   3. applyDebutScheduleResetForCoach resets an invalid schedule on coach
 *      switch, keeps valid ones and the empty "All" filter, and is a no-op
 *      for other branches/coaches.
 *   4. getTimeSlotsForBranch fallback arrays: Azamat tue_thu → 10 hourly
 *      slots 9:00-19:00; sat_sun → 4 hourly slots 9:00-13:00.
 *   5. Migration 075 seeds both schedules idempotently.
 *
 * Run: node tests/test-attendance-debut-azamat-schedule.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

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

function extractConst(src, name) {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*[^;]+;`, 's'));
    return m ? m[0] : '';
}

// Full-length UUID whose prefix matches the one baked into admin-v2.js.
const AZAMAT_ID = '28c56c39-7318-41f1-8f8b-a996dd721f02';
const NAIL_NAME = 'Nail Ildusovich';

const CONSTS =
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ALEKSANDR_ID') + '\n' +
    extractConst(ADMIN_V2_SRC, 'HALYK_COACH_ANDREI_ID') + '\n' +
    extractConst(ADMIN_V2_SRC, 'DEBUT_COACH_AZAMAT_ID') + '\n';

// ---------------------------------------------------------------------------
// (1) getDebutScheduleTypesForCoach
// ---------------------------------------------------------------------------
console.log('\n=== getDebutScheduleTypesForCoach ====================================\n');
{
    const factory = new Function(
        CONSTS +
        extractFn(ADMIN_V2_SRC, 'getDebutScheduleTypesForCoach') +
        '\nreturn getDebutScheduleTypesForCoach;');
    const fn = factory();

    assertEqual(fn(AZAMAT_ID, null), ['tue_thu', 'sat_sun'], 'Azamat by id → [tue_thu, sat_sun]');
    assertEqual(fn(null, 'Azamat Alemkhanovich'), ['tue_thu', 'sat_sun'], 'Azamat by name → [tue_thu, sat_sun]');
    assertEqual(fn(null, 'Азамат Алемханович'), ['tue_thu', 'sat_sun'], 'Azamat by Russian name → [tue_thu, sat_sun]');
    assertEqual(fn(null, NAIL_NAME), null, 'Nail → null (generic Debut list)');
    assertEqual(fn('some-other-id', 'Assylkhan Agbaevich'), null, 'Assylkhan → null');
    assertEqual(fn(null, null), null, 'no coach → null');
    assertEqual(fn('all', null), null, '"all" coaches → null');
}

// ---------------------------------------------------------------------------
// (2)/(3) populateAttendanceScheduleDropdown + applyDebutScheduleResetForCoach
// ---------------------------------------------------------------------------
console.log('\n=== populate + reset (functional sandbox) ============================\n');

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

// Debut + Azamat → only tue_thu + sat_sun on all three selects.
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Debut', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML), ['', 'tue_thu', 'sat_sun'],
        'Debut/Azamat desktop → [All, tue_thu, sat_sun]');
    assertEqual(optionValues(selects.mobileScheduleFilter.innerHTML), ['', 'tue_thu', 'sat_sun'],
        'Debut/Azamat mobile → [All, tue_thu, sat_sun]');
    assertEqual(optionValues(selects.addStudentScheduleSelect.innerHTML), ['tue_thu', 'sat_sun'],
        'Debut/Azamat add-student → [tue_thu, sat_sun] (no All)');
}

// Debut + Nail (or no coach) → generic full list unchanged.
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Debut', coach: 'nail-id', coachName: NAIL_NAME, schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML),
        ['', 'mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun'],
        'Debut/Nail desktop keeps the full generic list');
}
{
    const { api, selects } = loadDropdownSandbox({
        branch: 'Debut', coach: 'all', coachName: null, schedule: '',
    });
    api.populate();
    assertEqual(optionValues(selects.attendanceScheduleFilter.innerHTML),
        ['', 'mon_wed', 'mon_wed_fri', 'tue_thu', 'sat_sun'],
        'Debut/all-coaches desktop keeps the full generic list');
}

// Reset: Nail(mon_wed_fri) → switch to Azamat → resets to tue_thu.
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: 'mon_wed_fri',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'tue_thu',
        'switching to Azamat while mon_wed_fri selected resets to tue_thu');
}

// Reset: valid schedule and empty "All" filter are kept.
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: 'sat_sun',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'sat_sun', 'sat_sun kept for Azamat');
}
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: '',
    });
    api.reset();
    assertEqual(api.getSchedule(), '', 'empty All filter stays valid on coach change');
}

// Reset: no-op for other Debut coaches and for other branches.
{
    const { api } = loadDropdownSandbox({
        branch: 'Debut', coach: 'nail-id', coachName: NAIL_NAME, schedule: 'mon_wed_fri',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'mon_wed_fri', 'reset is a no-op for other Debut coaches');
}
{
    const { api } = loadDropdownSandbox({
        branch: 'Gagarin Park', coach: AZAMAT_ID, coachName: 'Azamat Alemkhanovich', schedule: 'mon_wed',
    });
    api.reset();
    assertEqual(api.getSchedule(), 'mon_wed', 'reset is a no-op for non-Debut branches');
}

// ---------------------------------------------------------------------------
// (4) getTimeSlotsForBranch fallback arrays for Azamat
// ---------------------------------------------------------------------------
console.log('\n=== getTimeSlotsForBranch (Azamat fallback slots) ====================\n');
{
    // Pull every ATTENDANCE_TIME_SLOTS_* const the function references.
    const slotConsts = [...ADMIN_V2_SRC.matchAll(/const (ATTENDANCE_TIME_SLOTS_\w+) = \[[^\]]*\];/gs)]
        .map(m => m[0]).join('\n');
    const body = `
'use strict';
let TIME_SLOTS_CACHE = null;
function _currentAttendanceMonthKey() { return '2026-09'; }
${slotConsts}
${extractFn(ADMIN_V2_SRC, 'getTimeSlotsForBranch')}
return getTimeSlotsForBranch;
`;
    const getTimeSlotsForBranch = new Function(body)();

    assertEqual(getTimeSlotsForBranch('Debut', 'tue_thu', 'Azamat Alemkhanovich'),
        ['9:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
         '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00'],
        'Azamat tue_thu → 10 hourly slots 9:00-19:00');
    assertEqual(getTimeSlotsForBranch('Debut', 'sat_sun', 'Azamat Alemkhanovich'),
        ['9:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00'],
        'Azamat sat_sun → 4 hourly slots 9:00-13:00');
    assertEqual(getTimeSlotsForBranch('Debut', 'tue_thu', 'Азамат Алемханович'),
        getTimeSlotsForBranch('Debut', 'tue_thu', 'Azamat Alemkhanovich'),
        'Russian coach name resolves the same tue_thu slots');
    // Other Debut coaches unchanged.
    assertEqual(getTimeSlotsForBranch('Debut', 'tue_thu', 'Nail Ildusovich'),
        ['9:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '14:00-15:00',
         '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:30'],
        'Nail tue_thu slots unchanged');
}

// ---------------------------------------------------------------------------
// (5) migration file
// ---------------------------------------------------------------------------
console.log('\n=== migration file ===================================================\n');
{
    const migPath = path.join(ROOT, 'supabase', 'migrations', '075_seed_azamat_debut_time_slots.sql');
    assert(fs.existsSync(migPath), 'supabase/migrations/075_seed_azamat_debut_time_slots.sql exists');
    const sql = fs.readFileSync(migPath, 'utf8');
    assert(sql.includes(AZAMAT_ID), 'migration targets Azamat by full coach id');
    assert(/ILIKE '%debut%'/i.test(sql), 'migration targets the Debut branch');
    assert((sql.match(/'tue_thu'/g) || []).length === 10, 'migration seeds 10 tue_thu slots');
    assert((sql.match(/'sat_sun'/g) || []).length === 4, 'migration seeds 4 sat_sun slots');
    assert(/ON CONFLICT \(branch_id, coach_id, schedule_type, slot_index, effective_from\) DO NOTHING/.test(sql),
        'migration is idempotent (ON CONFLICT DO NOTHING)');
    assert(sql.includes("'18:00'::TIME, '19:00'::TIME"), 'tue_thu ends at 19:00');
    assert(sql.includes("'12:00'::TIME, '13:00'::TIME"), 'sat_sun ends at 13:00');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
