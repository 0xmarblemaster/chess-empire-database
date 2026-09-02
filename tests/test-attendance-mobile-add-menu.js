/**
 * Static-contract tests for the mobile "+ Add" dropdown menu on the attendance
 * calendar header (spec-mobile-add-menu-20260902).
 *
 * This is pure UI (a position:fixed dropdown built at runtime), so — like the
 * other UI suites here — we assert the source contract rather than spin up a
 * DOM: the header markup, the toggle/close functions + their window exposure,
 * the CSS show/hide wiring in the ≤768px block, and all 3×3 i18n keys.
 *
 * Run: node tests/test-attendance-mobile-add-menu.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ADMIN_JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'admin-styles.css'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// ============================================================================
// 1. admin-v2.js — header markup + menu functions
// ============================================================================
console.log('\n=== admin-v2.js header + menu wiring =================================\n');

// The two existing buttons keep their handlers AND gain the desktop-only class.
assert(/class="attendance-add-student-btn attendance-header-desktop-btn" onclick="openAddStudentToCalendarModal\(\)"/.test(ADMIN_JS),
    'Add Student button carries attendance-header-desktop-btn + its handler');
assert(/class="attendance-add-student-btn attendance-header-desktop-btn" onclick="openAddTimeSlotModal\(\)"/.test(ADMIN_JS),
    'Add Time Slot button carries attendance-header-desktop-btn + its handler');

// New compact menu button.
assert(/class="attendance-add-menu-btn" onclick="toggleAttendanceAddMenu\(event\)"/.test(ADMIN_JS),
    'menu button rendered with toggleAttendanceAddMenu(event) handler');
assert(/admin\.attendance\.addMenu\.button/.test(ADMIN_JS),
    'menu button label uses the addMenu.button i18n key');

// Functions defined and exposed on window.
assert(/function toggleAttendanceAddMenu\(event\)/.test(ADMIN_JS),
    'toggleAttendanceAddMenu(event) is defined');
assert(/function closeAttendanceAddMenu\(\)/.test(ADMIN_JS),
    'closeAttendanceAddMenu() is defined');
assert(/window\.toggleAttendanceAddMenu = toggleAttendanceAddMenu/.test(ADMIN_JS),
    'toggleAttendanceAddMenu exposed on window');
assert(/window\.closeAttendanceAddMenu = closeAttendanceAddMenu/.test(ADMIN_JS),
    'closeAttendanceAddMenu exposed on window');

// Dropdown is fixed on body and positioned from the button rect.
assert(/document\.body\.appendChild\(menu\)/.test(ADMIN_JS),
    'dropdown appended to document.body (not clipped by the table)');
assert(/getBoundingClientRect\(\)/.test(ADMIN_JS),
    'dropdown positioned from the button getBoundingClientRect()');
assert(/\.id = 'attendanceAddMenuDropdown'/.test(ADMIN_JS) &&
       /\.className = 'attendance-add-menu-dropdown'/.test(ADMIN_JS),
    'dropdown uses the attendanceAddMenuDropdown id + attendance-add-menu-dropdown class');

// Items call the existing modal openers directly.
assert(/openAddStudentToCalendarModal\(\);/.test(ADMIN_JS),
    'student item calls openAddStudentToCalendarModal()');
assert(/openAddTimeSlotModal\(\);/.test(ADMIN_JS),
    'time-slot item calls openAddTimeSlotModal()');

// Close on outside click, Escape, scroll of the calendar container.
assert(/attendanceCalendarContainer'\)[\s\S]*?addEventListener\('scroll', closeAttendanceAddMenu\)/.test(ADMIN_JS),
    'closes on scroll of #attendanceCalendarContainer');
assert(/e\.key === 'Escape'/.test(ADMIN_JS),
    'closes on Escape key');
assert(/_attendanceAddMenuOutside/.test(ADMIN_JS),
    'has an outside click/tap handler');

// ============================================================================
// 2. admin-styles.css — hidden-by-default, shown on mobile
// ============================================================================
console.log('\n=== admin-styles.css show/hide wiring ================================\n');

// Base rule: menu button hidden by default.
const menuBtnBase = CSS.match(/\.attendance-add-menu-btn\s*\{[^}]*\}/);
assert(menuBtnBase && /display:\s*none/.test(menuBtnBase[0]),
    '.attendance-add-menu-btn is display:none by default');

// Dropdown styles: fixed, radius 8px, high z-index above sticky headers (>20).
const dropdownRule = CSS.match(/\.attendance-add-menu-dropdown\s*\{[^}]*\}/);
assert(dropdownRule && /position:\s*fixed/.test(dropdownRule[0]),
    '.attendance-add-menu-dropdown is position:fixed');
assert(dropdownRule && /border-radius:\s*8px/.test(dropdownRule[0]),
    '.attendance-add-menu-dropdown has 8px radius');
const zMatch = dropdownRule && dropdownRule[0].match(/z-index:\s*(\d+)/);
assert(zMatch && Number(zMatch[1]) > 20,
    `.attendance-add-menu-dropdown z-index (${zMatch ? zMatch[1] : 'none'}) above sticky headers`);

// The ≤768px block hides desktop buttons and shows the menu button.
// Extract the full block by brace-matching from the media query open brace.
function mediaBlock(css, header) {
    // Find the max-width:768px block that contains our desktop-btn rule.
    const anchor = css.indexOf('.attendance-header-desktop-btn');
    const start = anchor < 0 ? -1 : css.lastIndexOf(header, anchor);
    if (start < 0) return '';
    let i = css.indexOf('{', start);
    const begin = i;
    let depth = 0;
    for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) return css.slice(begin, i + 1);
        }
    }
    return '';
}
const mqBody = mediaBlock(CSS, '@media (max-width: 768px)');
assert(mqBody.length > 0, 'found the @media (max-width: 768px) block');
assert(/\.attendance-header-desktop-btn\s*\{[^}]*display:\s*none/.test(mqBody),
    'mobile block hides .attendance-header-desktop-btn');
assert(/\.attendance-add-menu-btn\s*\{[^}]*display:\s*inline-flex/.test(mqBody),
    'mobile block shows .attendance-add-menu-btn (inline-flex)');

// ============================================================================
// 3. i18n.js — all 3 keys in all 3 languages
// ============================================================================
console.log('\n=== i18n.js keys (en/ru/kk × 3) =====================================\n');

const expected = {
    button:   { en: 'Add',      ru: 'Добавить',       kk: 'Қосу' },
    student:  { en: 'Student',  ru: 'Ученика',        kk: 'Оқушы' },
    timeSlot: { en: 'Time Slot', ru: 'Временной слот', kk: 'Уақыт слоты' },
};

for (const [suffix, langs] of Object.entries(expected)) {
    const key = `admin.attendance.addMenu.${suffix}`;
    for (const [lang, value] of Object.entries(langs)) {
        const re = new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"${value}"`);
        assert(re.test(I18N), `${lang}: "${key}" = "${value}"`);
    }
    // exactly 3 occurrences (one per language)
    const count = (I18N.match(new RegExp(`"${key.replace(/\./g, '\\.')}"`, 'g')) || []).length;
    assert(count === 3, `"${key}" present in all 3 language blocks (found ${count})`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
