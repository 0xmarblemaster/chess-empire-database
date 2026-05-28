/**
 * Tests for the completeness of the mobile More menu in admin-v2.
 *
 * The desktop sidebar carries five Management entries (Ratings, App Access,
 * Manage Coaches, Manage Branches, Data Management) plus an analytics-only
 * User Sessions entry. On mobile, the sidebar is hidden and those pages
 * were unreachable. This test asserts that admin-v2 exposes every gated
 * sidebar item through the bottom-nav "More" sheet, role-gates each entry
 * the same way the sidebar twin is gated, and wires the existing handlers.
 *
 * Asserts:
 *   1. All 6 new More-menu buttons exist with the right IDs, hidden by
 *      default, with a chevron-right affordance and a click handler.
 *   2. Each new ID is flipped under the same role condition as its sidebar
 *      twin (admin override, can_manage_* permission flags, or — for
 *      Sessions — the analytics email allowlist).
 *   3. moreSubSections whitelist (both occurrences) contains the 4 new
 *      dynamic section names so the More tab stays highlighted.
 *   4. showSection has a case for each dynamic name that calls the
 *      existing handler.
 *   5. mobileSectionTitles has an entry for each new key.
 *   6. i18n.js carries EN/RU/KZ entries for every label key the new
 *      buttons reference.
 *
 * Run: node tests/test-admin-more-menu-completeness.js
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
const JS   = fs.readFileSync(path.join(ROOT, 'admin-v2.js'),   'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'),       'utf8');

// ---------------------------------------------------------------------
// Each new More-menu entry: id, click handler section key, sidebar twin,
// i18n key, the showSection case key, and the showSection handler name.
// ---------------------------------------------------------------------
const newEntries = [
    {
        id: 'moreMenuRatings',
        sectionKey: 'ratings',
        sidebarTwin: 'menuRatings',
        i18nKey: 'admin.ratings.title',
        handler: 'showRatingsManagement'
    },
    {
        id: 'moreMenuAppAccess',
        sectionKey: 'appAccess',
        sidebarTwin: 'menuAppAccess',
        i18nKey: 'access.sidebar.appAccess',
        handler: 'showAppAccessManagement'
    },
    {
        id: 'moreMenuManageCoaches',
        sectionKey: 'manageCoaches',
        sidebarTwin: 'menuManageCoaches',
        i18nKey: 'admin.sidebar.manageCoaches',
        handler: 'showCoachesManagement'
    },
    {
        id: 'moreMenuManageBranches',
        sectionKey: 'manageBranches',
        sidebarTwin: 'menuManageBranches',
        i18nKey: 'admin.sidebar.manageBranches',
        handler: 'showBranchesManagement'
    },
    {
        id: 'moreMenuDataManagement',
        sectionKey: 'dataManagement',
        sidebarTwin: 'menuDataManagement',
        i18nKey: 'admin.sidebar.dataManagement',
        handler: 'showDataManagement'
    },
    {
        id: 'moreMenuSessions',
        sectionKey: 'sessions',
        sidebarTwin: 'menuSessions',
        i18nKey: 'admin.sessions.title',
        handler: 'showSessions'
    }
];

console.log('\n=== Each new More-menu button is present in admin-v2.html ============\n');

for (const entry of newEntries) {
    const buttonRe = new RegExp(
        '<button\\s+class="more-menu-item"\\s+id="' + entry.id + '"[^>]*>[\\s\\S]*?<\\/button>'
    );
    const match = HTML.match(buttonRe);
    assert(match !== null, `admin-v2.html: #${entry.id} button exists`);
    if (!match) continue;
    const body = match[0];

    assert(/style="display:\s*none"/.test(body),
        `#${entry.id}: hidden by default (role-gated by updateMenuVisibility)`);
    assert(new RegExp(`onclick="showMobileSection\\('${entry.sectionKey}',\\s*event\\)"`).test(body),
        `#${entry.id}: onclick wired to showMobileSection('${entry.sectionKey}', event)`);
    assert(new RegExp(`data-i18n="${entry.i18nKey.replace(/\./g, '\\.')}"`).test(body),
        `#${entry.id}: label uses data-i18n="${entry.i18nKey}"`);
    assert(/data-lucide="chevron-right"/.test(body),
        `#${entry.id}: chevron-right affordance present`);
}

console.log('\n=== More-menu has section dividers between groups ====================\n');

const dividerCount = (HTML.match(/class="more-menu-divider"/g) || []).length;
assert(dividerCount >= 2,
    `admin-v2.html: at least 2 more-menu-divider elements (between groups)`);

console.log('\n=== Role-gating mirrors the sidebar twins ============================\n');

for (const entry of newEntries) {
    assert(new RegExp(`getElementById\\(['"]${entry.id}['"]\\)`).test(JS),
        `admin-v2.js: looks up #${entry.id} in updateMenuVisibility`);
}

// Admin override: every management More twin must be flipped to flex in
// the admin branch (mirrors the sidebar's blanket admin show).
const adminFlexMirrors = [
    'moreMenuRatings',
    'moreMenuAppAccess',
    'moreMenuManageCoaches',
    'moreMenuManageBranches',
    'moreMenuDataManagement'
];
for (const id of adminFlexMirrors) {
    assert(new RegExp(`${id}\\.style\\.display\\s*=\\s*['"]flex['"]`).test(JS),
        `admin-v2.js: #${id} display is flipped to flex (admin or permission branch)`);
}

// Sessions is gated by the analytics email allowlist (same as #menuSessions).
assert(/moreMenuSessions\.style\.display\s*=\s*['"]flex['"]/.test(JS),
    `admin-v2.js: #moreMenuSessions display is flipped to flex (analytics email allowlist)`);

// Permission-flag branches: each twin must also be flipped under the
// same can_manage_* flag as its sidebar twin (so non-admin coaches /
// staff who hold the permission see the mobile entry too).
const permissionPairs = [
    { flag: 'can_manage_app_access', id: 'moreMenuAppAccess' },
    { flag: 'can_manage_coaches',    id: 'moreMenuManageCoaches' },
    { flag: 'can_manage_branches',   id: 'moreMenuManageBranches' },
    { flag: 'can_manage_ratings',    id: 'moreMenuRatings' },
    { flag: 'can_manage_data',       id: 'moreMenuDataManagement' }
];
for (const { flag, id } of permissionPairs) {
    const blockRe = new RegExp(
        `userRole\\.${flag}\\s*===\\s*true[\\s\\S]{0,400}?${id}\\.style\\.display\\s*=\\s*['"]flex['"]`
    );
    assert(blockRe.test(JS),
        `admin-v2.js: #${id} is also flipped under userRole.${flag}`);
}

console.log('\n=== moreSubSections whitelist contains the new section keys ==========\n');

const moreSubMatches = JS.match(/const\s+moreSubSections\s*=\s*\[([^\]]+)\]/g) || [];
assert(moreSubMatches.length >= 2,
    `admin-v2.js: moreSubSections is declared at least twice (state + nav helper)`);
for (const decl of moreSubMatches) {
    for (const key of ['appAccess', 'manageCoaches', 'manageBranches', 'dataManagement']) {
        assert(new RegExp(`['"]${key}['"]`).test(decl),
            `admin-v2.js: moreSubSections contains "${key}"`);
    }
}

console.log('\n=== showSection has a case for each new dynamic section ==============\n');

const showSectionMatch = JS.match(/function\s+showSection\s*\(\s*section\s*\)\s*\{([\s\S]*?)\n\}/);
assert(showSectionMatch !== null, 'admin-v2.js: showSection function found');
const showSectionBody = showSectionMatch ? showSectionMatch[1] : '';

const dynamicSections = [
    { key: 'ratings',        handler: 'showRatingsManagement' },
    { key: 'appAccess',      handler: 'showAppAccessManagement' },
    { key: 'manageCoaches',  handler: 'showCoachesManagement' },
    { key: 'manageBranches', handler: 'showBranchesManagement' },
    { key: 'dataManagement', handler: 'showDataManagement' }
];
for (const { key, handler } of dynamicSections) {
    const caseRe = new RegExp(
        `section\\s*===\\s*['"]${key}['"][\\s\\S]{0,200}?${handler}\\s*\\(`
    );
    assert(caseRe.test(showSectionBody),
        `showSection: case "${key}" calls ${handler}()`);
}

console.log('\n=== mobileSectionTitles has an entry for each new key ================\n');

const newTitleEntries = [
    { key: 'appAccess',      i18n: 'access.sidebar.appAccess' },
    { key: 'manageCoaches',  i18n: 'admin.sidebar.manageCoaches' },
    { key: 'manageBranches', i18n: 'admin.sidebar.manageBranches' },
    { key: 'dataManagement', i18n: 'admin.sidebar.dataManagement' }
];
for (const { key, i18n } of newTitleEntries) {
    const entryRe = new RegExp(
        `${key}\\s*:\\s*['"]${i18n.replace(/\./g, '\\.')}['"]`
    );
    assert(entryRe.test(JS),
        `admin-v2.js: mobileSectionTitles maps ${key} → ${i18n}`);
}

console.log('\n=== i18n.js carries EN/RU/KZ for every new label key =================\n');

// i18n.js is one object per locale; each key appears exactly once in
// each locale's block, so >= 3 occurrences == EN/RU/KZ coverage.
const labelKeys = [
    'admin.ratings.title',
    'access.sidebar.appAccess',
    'admin.sidebar.manageCoaches',
    'admin.sidebar.manageBranches',
    'admin.sidebar.dataManagement',
    'admin.sessions.title'
];
for (const key of labelKeys) {
    const re = new RegExp(`"${key.replace(/\./g, '\\.')}"\\s*:`, 'g');
    const count = (I18N.match(re) || []).length;
    assert(count >= 3,
        `i18n.js: key "${key}" defined in ≥ 3 locales (found ${count})`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
