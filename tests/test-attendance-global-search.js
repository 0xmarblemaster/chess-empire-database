/**
 * Tests for the restored global attendance student search.
 *
 * Verifies that:
 *  - handleAttendanceSearchDropdown searches window.students school-wide
 *    (NOT the local attendanceCalendarData slice).
 *  - The dropdown markup carries branch + coach context.
 *  - navigateToAttendanceStudent auto-switches branch/coach/schedule, calls
 *    loadAttendanceData twice (once to seed schedule assignments, once after
 *    resolving the student's schedule), expands the slot group, and applies
 *    the standard 2s yellow pulse via .attendance-row-highlight.
 *  - The orphan global-search helpers are deleted from admin-v2.js.
 *  - The new i18n key admin.attendance.searchOutOfScope is defined in all
 *    three locale blocks of i18n.js.
 *
 * Source-grep style — no DOM or supabase needed.
 *
 * Run: node tests/test-attendance-global-search.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

/**
 * Extracts the body of a top-level function/async-function by name. Walks
 * brace depth from the first `{` after the signature until the matching `}`.
 * Returns null if the function isn't found. Robust enough for source-grep
 * tests against admin-v2.js.
 */
function extractFunctionBody(source, name) {
    const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
    const m = re.exec(source);
    if (!m) return null;
    let i = source.indexOf('{', m.index);
    if (i < 0) return null;
    let depth = 0;
    const start = i;
    for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

console.log('\n=== handleAttendanceSearchDropdown: source is window.students ========\n');

const handlerBody = extractFunctionBody(JS, 'handleAttendanceSearchDropdown');
assert(handlerBody !== null,
    'handleAttendanceSearchDropdown is defined in admin-v2.js');
if (handlerBody) {
    assert(handlerBody.includes('window.students'),
        'handler references window.students (school-wide source)');
    assert(!handlerBody.includes('attendanceCalendarData'),
        'handler does NOT use attendanceCalendarData as source');
    assert(/branch/i.test(handlerBody),
        'dropdown markup references branch');
    assert(/coach/i.test(handlerBody),
        'dropdown markup references coach');
    assert(handlerBody.includes('attendance-search-result'),
        'preserves existing .attendance-search-result class');
    assert(/loadAttendanceRoleInfo\s*\(/.test(handlerBody),
        'awaits loadAttendanceRoleInfo() to evaluate coach-lock');
    assert(handlerBody.includes('isCoachLocked'),
        'consults attendanceRoleLock.isCoachLocked() for scoping');
}

console.log('\n=== navigateToAttendanceStudent: full auto-switch path ===============\n');

const navBody = extractFunctionBody(JS, 'navigateToAttendanceStudent');
assert(navBody !== null,
    'navigateToAttendanceStudent is defined in admin-v2.js');
if (navBody) {
    assert(/attendanceCurrentBranch\s*=/.test(navBody),
        'sets attendanceCurrentBranch');
    assert(/attendanceCurrentCoach\s*=/.test(navBody),
        'sets attendanceCurrentCoach');
    assert(/attendanceCurrentSchedule\s*=/.test(navBody),
        'sets attendanceCurrentSchedule');

    const loadCalls = (navBody.match(/loadAttendanceData\s*\(/g) || []).length;
    assert(loadCalls >= 2,
        `loadAttendanceData() is invoked at least twice (found ${loadCalls})`);

    assert(navBody.includes('attendanceExpandedSlots'),
        'expands the student\'s slot via attendanceExpandedSlots');
    assert(navBody.includes('attendance-row-highlight'),
        'applies .attendance-row-highlight pulse class');
    assert(navBody.includes('searchOutOfScope'),
        'shows admin.attendance.searchOutOfScope toast when out of scope');
    assert(/loadAttendanceRoleInfo\s*\(/.test(navBody),
        'resolves role before applying coach-lock guardrail');
}

console.log('\n=== orphan global-search helpers are deleted ==========================\n');

assert(!/function\s+handleGlobalStudentSearch\s*\(/.test(JS),
    'handleGlobalStudentSearch is no longer defined in admin-v2.js');
assert(!/function\s+clearGlobalSearch\s*\(/.test(JS),
    'clearGlobalSearch is no longer defined in admin-v2.js');
assert(!/function\s+navigateToGlobalStudent\s*\(/.test(JS),
    'navigateToGlobalStudent is no longer defined in admin-v2.js');
assert(!JS.includes("getElementById('globalStudentSearchInput')"),
    'no reference to the removed #globalStudentSearchInput element');
assert(!JS.includes("getElementById('globalSearchResults')"),
    'no reference to the removed #globalSearchResults element');

console.log('\n=== i18n key admin.attendance.searchOutOfScope present in en/ru/kk ====\n');

const i18nKeyRe = /"admin\.attendance\.searchOutOfScope"\s*:/g;
const i18nKeyCount = (I18N.match(i18nKeyRe) || []).length;
assert(i18nKeyCount === 3,
    `admin.attendance.searchOutOfScope defined exactly 3 times (en/ru/kk), found ${i18nKeyCount}`);
assert(I18N.includes('This student is outside your assigned branches'),
    'en string present');
assert(I18N.includes('Этот ученик находится вне ваших филиалов'),
    'ru string present');
assert(I18N.includes('Бұл оқушы сіздің филиалдарыңыздан тыс'),
    'kk string present');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
