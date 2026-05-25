/**
 * Tests the orphan attendance search bar wiring in admin-v2.html.
 *
 * The search handlers, CSS, and i18n strings were already in place; this
 * test guards the DOM wiring added in admin-v2.html so the input + dropdown
 * pair stays present, points at the expected handlers, and sits ABOVE the
 * attendance calendar mount point (per the placement requirement).
 *
 * Run: node tests/test-attendance-search-wiring.js
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
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');

console.log('\n=== search input + dropdown DOM exist ================================\n');

const idxInput = HTML.indexOf('id="attendanceStudentSearch"');
const idxDropdown = HTML.indexOf('id="attendanceSearchDropdown"');
const idxCalendarMount = HTML.indexOf('id="attendanceCalendarContainer"');

assert(idxInput > 0, '<input id="attendanceStudentSearch"> exists in admin-v2.html');
assert(idxDropdown > 0, '<div id="attendanceSearchDropdown"> exists in admin-v2.html');
assert(idxCalendarMount > 0, 'attendance calendar mount (#attendanceCalendarContainer) still exists');

console.log('\n=== ids defined exactly once =========================================\n');

function count(s, needle) {
    let n = 0, i = 0;
    while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}
assert(count(HTML, 'id="attendanceStudentSearch"') === 1,
    '#attendanceStudentSearch declared exactly once');
assert(count(HTML, 'id="attendanceSearchDropdown"') === 1,
    '#attendanceSearchDropdown declared exactly once');

console.log('\n=== input attributes wire to existing handler + i18n key =============\n');

const inputMatch = HTML.match(
    /<input\b[^>]*id="attendanceStudentSearch"[^>]*>/
);
assert(inputMatch !== null, 'found <input id="attendanceStudentSearch"> tag');
const inputHtml = inputMatch ? inputMatch[0] : '';

assert(/oninput="handleAttendanceSearch\(this\.value\)"/.test(inputHtml),
    'oninput="handleAttendanceSearch(this.value)" wired to existing handler');
assert(/data-i18n-placeholder="admin\.attendance\.searchStudent"/.test(inputHtml),
    'data-i18n-placeholder="admin.attendance.searchStudent" set for translation');
assert(/class="[^"]*\battendance-search-input\b[^"]*"/.test(inputHtml),
    'input carries the .attendance-search-input class (matches admin-styles.css)');
assert(/type="text"/.test(inputHtml),
    'input is type="text"');

console.log('\n=== dropdown sibling has the expected class + starts hidden ==========\n');

const dropdownMatch = HTML.match(
    /<div\b[^>]*id="attendanceSearchDropdown"[^>]*>/
);
assert(dropdownMatch !== null, 'found <div id="attendanceSearchDropdown"> tag');
const dropdownHtml = dropdownMatch ? dropdownMatch[0] : '';

assert(/class="[^"]*\battendance-search-dropdown\b[^"]*"/.test(dropdownHtml),
    'dropdown carries the .attendance-search-dropdown class');
assert(/style="[^"]*display:\s*none/.test(dropdownHtml),
    'dropdown starts with display:none (shown only when JS sets it)');

console.log('\n=== placement: search is ABOVE the attendance calendar ===============\n');

assert(idxInput < idxCalendarMount,
    'attendanceStudentSearch appears BEFORE attendanceCalendarContainer in source');
assert(idxDropdown < idxCalendarMount,
    'attendanceSearchDropdown appears BEFORE attendanceCalendarContainer in source');

console.log('\n=== placement: search is OUTSIDE the calendar mount/branch-card ======\n');

// Find the .branch-card wrapper that owns the calendar mount. The search
// container must sit OUTSIDE that wrapper (as its own sibling), not inside
// the calendar header <th> or filter row.
const calendarCardOpen = HTML.lastIndexOf('<div class="branch-card"', idxCalendarMount);
assert(calendarCardOpen > 0,
    'found the .branch-card wrapping the attendance calendar');
assert(idxInput < calendarCardOpen,
    'search input sits OUTSIDE (above) the calendar .branch-card wrapper');

// Defensive guard: input must not be nested inside <thead>/<tr>/<th> of the
// calendar table. The calendar header starts at #attendanceCalendarHead.
const idxCalendarHead = HTML.indexOf('id="attendanceCalendarHead"');
if (idxCalendarHead > 0) {
    assert(idxInput < idxCalendarHead,
        'search input is not inside the calendar header (#attendanceCalendarHead)');
}

console.log('\n=== handler that the wiring targets still exists in admin-v2.js ======\n');

const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
assert(/function\s+handleAttendanceSearch\s*\(/.test(JS),
    'handleAttendanceSearch() is defined in admin-v2.js');
assert(/function\s+handleAttendanceSearchDropdown\s*\(/.test(JS),
    'handleAttendanceSearchDropdown() is defined in admin-v2.js');
assert(JS.indexOf("document.getElementById('attendanceStudentSearch')") > 0,
    'admin-v2.js references the #attendanceStudentSearch element we just wired');
assert(JS.indexOf("document.getElementById('attendanceSearchDropdown')") > 0,
    'admin-v2.js references the #attendanceSearchDropdown element we just wired');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
