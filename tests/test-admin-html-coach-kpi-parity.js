/**
 * Parity tests for admin.html ↔ admin-v2.html for the Coach KPI Phase 2 wiring
 * (PRD_COACH_KPI.md §6 Task 6 — "Keep both files in sync").
 *
 * The companion tests (test-coach-performance-nav.js, test-coach-kpi-section-container.js,
 * test-coach-kpi-script-tags.js) only assert against admin-v2.html; this file
 * mirrors those assertions for admin.html so the legacy dashboard stays aligned
 * with the v2 dashboard.
 *
 * Run: node tests/test-admin-html-coach-kpi-parity.js
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
const HTML = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

// ── Nav item ─────────────────────────────────────────────────────────────────
console.log('\n=== nav item present in admin.html ===================================\n');

const idxCoachKpi      = HTML.indexOf('id="menuCoachPerformance"');
const idxCoachActivity = HTML.indexOf('id="menuCoachActivity"');

assert(idxCoachKpi      > 0, 'menuCoachPerformance nav item exists');
assert(idxCoachActivity > 0, 'menuCoachActivity nav item exists');
assert(idxCoachKpi < idxCoachActivity,
    'menuCoachPerformance comes BEFORE menuCoachActivity (matches admin-v2 ordering)');

console.log('\n=== nav item shape ===================================================\n');

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

// ── Section container ────────────────────────────────────────────────────────
console.log('\n=== section container present ========================================\n');

const sectionMatch = HTML.match(
    /<section[^>]*id="section-coach-kpi"[^>]*class="([^"]*)"[\s\S]*?<\/section>/
);
assert(sectionMatch !== null, '<section id="section-coach-kpi"> present');

const sectionHtml = sectionMatch ? sectionMatch[0] : '';
const sectionClass = sectionMatch ? sectionMatch[1] : '';

assert(/\bcontent-section\b/.test(sectionClass),
    'section carries content-section class');
assert(/\bhidden\b/.test(sectionClass),
    'section starts hidden — activated by showCoachPerformance()');

console.log('\n=== three sub-views with stable ids ==================================\n');

assert(/id="coach-kpi-school-view"/.test(sectionHtml),
    'school view container (#coach-kpi-school-view) exists');
assert(/id="coach-kpi-branch-view"/.test(sectionHtml),
    'branch view container (#coach-kpi-branch-view) exists');
assert(/id="coach-kpi-coach-view"/.test(sectionHtml),
    'coach view container (#coach-kpi-coach-view) exists');

const idxSchool = sectionHtml.indexOf('id="coach-kpi-school-view"');
const idxBranch = sectionHtml.indexOf('id="coach-kpi-branch-view"');
const idxCoach  = sectionHtml.indexOf('id="coach-kpi-coach-view"');
assert(idxSchool > 0 && idxBranch > idxSchool, 'branch view comes after school view');
assert(idxBranch > 0 && idxCoach  > idxBranch, 'coach view comes after branch view');

console.log('\n=== global uniqueness of section ids =================================\n');

function count(s, needle) {
    let n = 0, i = 0;
    while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}
assert(count(HTML, 'id="section-coach-kpi"')      === 1, '#section-coach-kpi defined exactly once');
assert(count(HTML, 'id="coach-kpi-school-view"') === 1, '#coach-kpi-school-view defined exactly once');
assert(count(HTML, 'id="coach-kpi-branch-view"') === 1, '#coach-kpi-branch-view defined exactly once');
assert(count(HTML, 'id="coach-kpi-coach-view"')  === 1, '#coach-kpi-coach-view defined exactly once');

// ── Script tags ──────────────────────────────────────────────────────────────
console.log('\n=== script tags present ==============================================\n');

const idxChartJs     = HTML.indexOf('cdn.jsdelivr.net/npm/chart.js');
const idxAttendance  = HTML.indexOf('attendance-role-lock.js');
const idxKpiRoleLock = HTML.indexOf('coach-kpi-role-lock.js');
const idxKpiUpload   = HTML.search(/src="coach-kpi-upload\.js"/);
const idxKpi         = HTML.search(/src="coach-kpi\.js"/);

assert(idxChartJs     > 0, 'Chart.js script tag present');
assert(idxAttendance  > 0, 'attendance-role-lock.js script tag present');
assert(idxKpiRoleLock > 0, 'coach-kpi-role-lock.js script tag present');
assert(idxKpiUpload   > 0, 'coach-kpi-upload.js script tag present');
assert(idxKpi         > 0, 'coach-kpi.js script tag present');

console.log('\n=== load order — KPI scripts come AFTER chart.js + role lock =========\n');

assert(idxChartJs    < idxKpiRoleLock, 'coach-kpi-role-lock.js loads AFTER Chart.js');
assert(idxAttendance < idxKpiRoleLock, 'coach-kpi-role-lock.js loads AFTER attendance-role-lock.js');
assert(idxChartJs    < idxKpi,         'coach-kpi.js loads AFTER Chart.js (renderers depend on it)');
assert(idxAttendance < idxKpi,         'coach-kpi.js loads AFTER attendance-role-lock.js');
assert(idxKpiRoleLock < idxKpi,
    'coach-kpi-role-lock.js loads BEFORE coach-kpi.js (lock defines policy used by KPI)');
assert(idxKpiRoleLock < idxKpiUpload,
    'coach-kpi-upload.js loads AFTER coach-kpi-role-lock.js');
assert(idxKpiUpload < idxKpi,
    'coach-kpi-upload.js loads BEFORE coach-kpi.js (so initCoachKpi sees window.coachKpiUpload)');

console.log('\n=== script tags are well-formed ======================================\n');

assert(/<script\s+src="coach-kpi-role-lock\.js"[^>]*>\s*<\/script>/.test(HTML),
    'coach-kpi-role-lock.js is a properly closed <script> tag');
assert(/<script\s+src="coach-kpi-upload\.js"[^>]*>\s*<\/script>/.test(HTML),
    'coach-kpi-upload.js is a properly closed <script> tag');
assert(/<script\s+src="coach-kpi\.js"[^>]*>\s*<\/script>/.test(HTML),
    'coach-kpi.js is a properly closed <script> tag');

console.log('\n=== each script tag appears exactly once =============================\n');

function countRe(s, re) { return (s.match(re) || []).length; }
assert(countRe(HTML, /src="coach-kpi-role-lock\.js"/g) === 1,
    'coach-kpi-role-lock.js script tag appears exactly once');
assert(countRe(HTML, /src="coach-kpi-upload\.js"/g) === 1,
    'coach-kpi-upload.js script tag appears exactly once');
assert(countRe(HTML, /src="coach-kpi\.js"/g) === 1,
    'coach-kpi.js script tag appears exactly once');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
