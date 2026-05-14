/**
 * Tests for the "Coach Performance" nav menu item that lands in admin-v2.html
 * between "Tournaments" and "Coach Activity" (PRD_COACH_KPI.md §5).
 *
 * Run: node tests/test-coach-performance-nav.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = actual === expected;
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
const ADMIN_JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

console.log('\n=== nav item present in admin-v2.html =================================\n');

const idxTournaments    = HTML.indexOf('id="menuTournaments"');
const idxCoachKpi       = HTML.indexOf('id="menuCoachPerformance"');
const idxCoachActivity  = HTML.indexOf('id="menuCoachActivity"');

assert(idxTournaments    > 0, 'menuTournaments nav item exists');
assert(idxCoachKpi       > 0, 'menuCoachPerformance nav item exists');
assert(idxCoachActivity  > 0, 'menuCoachActivity nav item exists');

console.log('\n=== positional ordering — between Tournaments and Coach Activity =====\n');

assert(idxTournaments < idxCoachKpi,
    'menuCoachPerformance comes AFTER menuTournaments');
assert(idxCoachKpi < idxCoachActivity,
    'menuCoachPerformance comes BEFORE menuCoachActivity');

console.log('\n=== nav item shape ===================================================\n');

// Pull out the nav-item div for menuCoachPerformance so we can assert on its
// internals. Stops at the first closing </div> after the span (template uses
// one <i> + one <span> inside).
const navMatch = HTML.match(
    /<div class="nav-item" id="menuCoachPerformance"[^>]*>[\s\S]*?<\/div>/
);
assert(navMatch !== null, 'menuCoachPerformance markup found');

const navHtml = navMatch ? navMatch[0] : '';
assert(/onclick="showCoachPerformance\(\)"/.test(navHtml),
    'onclick wired to showCoachPerformance()');
assert(/style="display: none;"/.test(navHtml),
    'starts hidden (display: none) — role-gated by updateMenuVisibility');
assert(/data-lucide="bar-chart-3"/.test(navHtml),
    'uses bar-chart-3 lucide icon (KPI visual cue)');
assert(/data-i18n="admin\.sidebar\.coachPerformance"/.test(navHtml),
    'span carries data-i18n="admin.sidebar.coachPerformance"');
assert(/>Coach Performance</.test(navHtml),
    'default (English) label is "Coach Performance"');

console.log('\n=== i18n keys (EN / KK / RU) =========================================\n');

// Three occurrences expected — one per locale. The test counts occurrences of
// the key declaration so renames/typos in any single locale fail loudly.
const keyMatches = I18N.match(/"admin\.sidebar\.coachPerformance"\s*:/g) || [];
assertEqual(keyMatches.length, 3,
    'admin.sidebar.coachPerformance defined exactly once per locale (en/kk/ru)');

// English value sanity check.
assert(/"admin\.sidebar\.coachPerformance"\s*:\s*"Coach Performance"/.test(I18N),
    'English translation = "Coach Performance"');
// Russian + Kazakh: just confirm a non-empty translated value lives in the
// other locale blocks (catches the common "added EN only" mistake).
const ruMatch = I18N.match(/"admin\.sidebar\.coachPerformance"\s*:\s*"([^"]+)"/g) || [];
assertEqual(ruMatch.length, 3,
    'every locale ships a non-empty translation (no "" stub)');

console.log('\n=== visibility wiring in admin-v2.js =================================\n');

assert(/const\s+menuCoachPerformance\s*=\s*document\.getElementById\(['"]menuCoachPerformance['"]\)/
    .test(ADMIN_JS),
    'updateMenuVisibility() looks up menuCoachPerformance element');
assert(/menuCoachPerformance\.style\.display\s*=\s*['"]flex['"]/.test(ADMIN_JS),
    'menuCoachPerformance is shown via display: flex');
assert(/userRole\.role\s*===\s*['"]coach['"]/.test(ADMIN_JS),
    'coach role visibility check exists (PRD §6: coaches see branch + coach views)');

// PRD §6 — the policy decision lives in coach-kpi-role-lock.canViewCoachKpi,
// not in an inline `role === 'coach'` check. The wiring delegates to that helper.
assert(/window\.coachKpiRoleLock[^\n]*canViewCoachKpi/.test(ADMIN_JS),
    'updateMenuVisibility() calls window.coachKpiRoleLock.canViewCoachKpi');
assert(/canViewCoachKpi\s*\(\s*kpiRoleInfo\s*\)/.test(ADMIN_JS),
    'canViewCoachKpi is invoked with a roleInfo argument');
// The roleInfo passed in must carry isAdmin + isCoach (the two shapes
// canViewCoachKpi inspects when no coachId is available client-side).
assert(/isAdmin\s*:\s*userRole\.role\s*===\s*['"]admin['"]/.test(ADMIN_JS),
    'roleInfo.isAdmin is derived from userRole.role === "admin"');
assert(/isCoach\s*:\s*userRole\.role\s*===\s*['"]coach['"]/.test(ADMIN_JS),
    'roleInfo.isCoach is derived from userRole.role === "coach"');
// The display flip must be gated by the canViewCoachKpi result.
assert(/menuCoachPerformance\s*&&\s*canViewKpi[\s\S]*?menuCoachPerformance\.style\.display\s*=\s*['"]flex['"]/
    .test(ADMIN_JS),
    'menuCoachPerformance display flip is gated by canViewKpi');

console.log('\n=== click handler stub exists ========================================\n');

assert(/function\s+showCoachPerformance\s*\(/.test(ADMIN_JS),
    'showCoachPerformance() defined so onclick does not throw');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
