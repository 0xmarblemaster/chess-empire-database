/**
 * Tests for the mobile "More" menu entry for Coach Performance.
 *
 * Until this wiring landed, coaches and admins on mobile had no path into
 * the Coach KPI dashboard — the desktop sidebar is hidden, and the bottom
 * tab's "Ещё" (More) sheet did not surface a row for it.
 *
 * Asserts:
 *   1. Both admin.html and admin-v2.html carry the #moreMenuCoachKpi button,
 *      hidden by default and routed to showCoachPerformance(event).
 *   2. admin.js role-gates #moreMenuCoachKpi using the same canViewKpi flag
 *      that gates #menuCoachPerformance.
 *   3. mobileSectionTitles maps "coachKpi" → admin.sidebar.coachPerformance.
 *   4. moreSubSections whitelist contains "coachKpi" so the More tab stays
 *      highlighted when the KPI dashboard is open.
 *   5. showCoachPerformance() clears mobile-nav-item.active, activates the
 *      data-section="settings" tab, and updates the mobile header title.
 *
 * Run: node tests/test-coach-kpi-mobile-more-menu.js
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
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const ADMIN_V2_HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const ADMIN_JS = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
const ADMIN_V2_JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

console.log('\n=== More menu button present in admin.html ===========================\n');

const buttonRe = /<button\s+class="more-menu-item"\s+id="moreMenuCoachKpi"[^>]*>[\s\S]*?<\/button>/;

const adminMatch = ADMIN_HTML.match(buttonRe);
assert(adminMatch !== null, 'admin.html: #moreMenuCoachKpi button exists');

const adminButton = adminMatch ? adminMatch[0] : '';
assert(/style="display:\s*none"/.test(adminButton),
    'admin.html: button starts hidden — role-gated by updateMenuVisibility');
assert(/onclick="showCoachPerformance\(event\)"/.test(adminButton),
    'admin.html: onclick wired to showCoachPerformance(event)');
assert(/data-lucide="bar-chart-3"/.test(adminButton),
    'admin.html: button uses bar-chart-3 lucide icon');
assert(/data-i18n="admin\.sidebar\.coachPerformance"/.test(adminButton),
    'admin.html: span carries data-i18n="admin.sidebar.coachPerformance"');
assert(/data-lucide="chevron-right"/.test(adminButton),
    'admin.html: button carries chevron-right affordance');

console.log('\n=== More menu button present in admin-v2.html ========================\n');

const v2Match = ADMIN_V2_HTML.match(buttonRe);
assert(v2Match !== null, 'admin-v2.html: #moreMenuCoachKpi button exists');

const v2Button = v2Match ? v2Match[0] : '';
assert(/style="display:\s*none"/.test(v2Button),
    'admin-v2.html: button starts hidden — role-gated by updateMenuVisibility');
assert(/onclick="showCoachPerformance\(event\)"/.test(v2Button),
    'admin-v2.html: onclick wired to showCoachPerformance(event)');
assert(/data-lucide="bar-chart-3"/.test(v2Button),
    'admin-v2.html: button uses bar-chart-3 lucide icon');
assert(/data-i18n="admin\.sidebar\.coachPerformance"/.test(v2Button),
    'admin-v2.html: span carries data-i18n="admin.sidebar.coachPerformance"');

console.log('\n=== More menu button sits BEFORE the logout divider ==================\n');

function indices(s, needle) {
    return [s.indexOf('id="moreMenuCoachKpi"'),
            s.indexOf('class="more-menu-divider"')];
}
const [adminBtnIdx, adminDividerIdx] = indices(ADMIN_HTML);
const [v2BtnIdx, v2DividerIdx] = indices(ADMIN_V2_HTML);
assert(adminBtnIdx > 0 && adminBtnIdx < adminDividerIdx,
    'admin.html: #moreMenuCoachKpi appears before the logout divider');
assert(v2BtnIdx > 0 && v2BtnIdx < v2DividerIdx,
    'admin-v2.html: #moreMenuCoachKpi appears before the logout divider');

console.log('\n=== role-gating wired in admin.js ====================================\n');

assert(/document\.getElementById\(['"]moreMenuCoachKpi['"]\)/.test(ADMIN_JS),
    'admin.js: updateMenuVisibility looks up #moreMenuCoachKpi');
assert(/moreMenuCoachKpi\s*&&\s*canViewKpi[\s\S]{0,80}?moreMenuCoachKpi\.style\.display\s*=\s*['"]flex['"]/
    .test(ADMIN_JS),
    'admin.js: #moreMenuCoachKpi display flip is gated by canViewKpi');

console.log('\n=== mobileSectionTitles + moreSubSections updated ====================\n');

assert(/coachKpi\s*:\s*['"]admin\.sidebar\.coachPerformance['"]/.test(ADMIN_JS),
    'admin.js: mobileSectionTitles maps coachKpi → admin.sidebar.coachPerformance');

const moreSubMatch = ADMIN_JS.match(/const\s+moreSubSections\s*=\s*\[([^\]]+)\]/);
assert(moreSubMatch !== null, 'admin.js: moreSubSections array defined');
const moreSubBody = moreSubMatch ? moreSubMatch[1] : '';
assert(/['"]coachKpi['"]/.test(moreSubBody),
    'admin.js: moreSubSections whitelist contains "coachKpi"');

console.log('\n=== showCoachPerformance() mobile state handling =====================\n');

const fnMatch = ADMIN_JS.match(
    /function\s+showCoachPerformance\s*\([^)]*\)\s*\{[\s\S]*?\n\}/
);
assert(fnMatch !== null, 'admin.js: showCoachPerformance function found');
const fnBody = fnMatch ? fnMatch[0] : '';

assert(/function\s+showCoachPerformance\s*\(\s*event\s*\)/.test(fnBody),
    'showCoachPerformance accepts an event parameter (so the More-menu click can suppress default)');
assert(/document\.querySelectorAll\(['"]\.mobile-nav-item['"]\)[\s\S]{0,80}?classList\.remove\(['"]active['"]\)/
    .test(fnBody),
    'showCoachPerformance clears .mobile-nav-item.active classes');
assert(/\.mobile-nav-item\[data-section=['"]settings['"]\]/.test(fnBody),
    'showCoachPerformance re-activates the data-section="settings" (More) tab');
assert(/updateMobileHeaderTitle\(\s*['"]coachKpi['"]\s*\)/.test(fnBody),
    'showCoachPerformance updates the mobile header title via updateMobileHeaderTitle("coachKpi")');

console.log('\n=== role-gating wired in admin-v2.js =================================\n');

assert(/document\.getElementById\(['"]moreMenuCoachKpi['"]\)/.test(ADMIN_V2_JS),
    'admin-v2.js: updateMenuVisibility looks up #moreMenuCoachKpi');
assert(/moreMenuCoachKpi\s*&&\s*canViewKpi[\s\S]{0,80}?moreMenuCoachKpi\.style\.display\s*=\s*['"]flex['"]/
    .test(ADMIN_V2_JS),
    'admin-v2.js: #moreMenuCoachKpi display flip is gated by canViewKpi');

console.log('\n=== admin-v2.js mobileSectionTitles + moreSubSections updated ========\n');

assert(/coachKpi\s*:\s*['"]admin\.sidebar\.coachPerformance['"]/.test(ADMIN_V2_JS),
    'admin-v2.js: mobileSectionTitles maps coachKpi → admin.sidebar.coachPerformance');

const v2MoreSubMatch = ADMIN_V2_JS.match(/const\s+moreSubSections\s*=\s*\[([^\]]+)\]/);
assert(v2MoreSubMatch !== null, 'admin-v2.js: moreSubSections array defined');
const v2MoreSubBody = v2MoreSubMatch ? v2MoreSubMatch[1] : '';
assert(/['"]coachKpi['"]/.test(v2MoreSubBody),
    'admin-v2.js: moreSubSections whitelist contains "coachKpi"');

console.log('\n=== admin-v2.js showCoachPerformance() mobile state handling ========\n');

const v2FnMatch = ADMIN_V2_JS.match(
    /function\s+showCoachPerformance\s*\([^)]*\)\s*\{[\s\S]*?\n\}/
);
assert(v2FnMatch !== null, 'admin-v2.js: showCoachPerformance function found');
const v2FnBody = v2FnMatch ? v2FnMatch[0] : '';

assert(/function\s+showCoachPerformance\s*\(\s*event\s*\)/.test(v2FnBody),
    'admin-v2.js: showCoachPerformance accepts an event parameter');
assert(/document\.querySelectorAll\(['"]\.mobile-nav-item['"]\)[\s\S]{0,80}?classList\.remove\(['"]active['"]\)/
    .test(v2FnBody),
    'admin-v2.js: showCoachPerformance clears .mobile-nav-item.active classes');
assert(/\.mobile-nav-item\[data-section=['"]settings['"]\]/.test(v2FnBody),
    'admin-v2.js: showCoachPerformance re-activates the data-section="settings" tab');
assert(/updateMobileHeaderTitle\(\s*['"]coachKpi['"]\s*\)/.test(v2FnBody),
    'admin-v2.js: showCoachPerformance updates the mobile header title via updateMobileHeaderTitle("coachKpi")');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
