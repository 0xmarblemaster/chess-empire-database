/**
 * Final regression guard — Coach Performance header MUST NOT carry the
 * School/Branch/Coach view-switcher tabs. The dropdowns (period / league /
 * branch / coach) cover those parameters, and the tabs were removed.
 *
 * If a future change re-introduces a data-kpi-view button or one of the
 * admin.coachKpi.viewSchool/Branch/Coach labels inside #section-coach-kpi,
 * this guard fails immediately.
 *
 * Run: node tests/test-coach-kpi-no-view-tabs.js
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

console.log('\n=== admin-v2.html: Coach KPI section has no view-tab residue =========\n');

const sectionMatch = HTML.match(
    /<section[^>]*id="section-coach-kpi"[^>]*>[\s\S]*?<\/section>/
);
assert(sectionMatch !== null, '#section-coach-kpi block found');
const section = sectionMatch ? sectionMatch[0] : '';

assert(!/data-kpi-view/.test(section),
    'zero occurrences of data-kpi-view inside #section-coach-kpi');
assert(!/admin\.coachKpi\.viewSchool/.test(section),
    'zero occurrences of admin.coachKpi.viewSchool inside #section-coach-kpi');
assert(!/admin\.coachKpi\.viewBranch/.test(section),
    'zero occurrences of admin.coachKpi.viewBranch inside #section-coach-kpi');
assert(!/admin\.coachKpi\.viewCoach/.test(section),
    'zero occurrences of admin.coachKpi.viewCoach inside #section-coach-kpi');
assert(!/aria-label="Coach KPI view"/.test(section),
    'no tablist labelled "Coach KPI view" inside #section-coach-kpi');

console.log('\n=== whole-file guard: data-kpi-view button label is gone =============\n');

// data-kpi-view was unique to the Coach Performance switcher — nowhere else
// in admin-v2.html should it appear. (data-ratings-view is the separate
// Ratings switcher and stays.)
function countMatches(s, re) { return (s.match(re) || []).length; }
assert(countMatches(HTML, /data-kpi-view/g) === 0,
    'admin-v2.html carries zero data-kpi-view attributes');

// Ratings view-switcher must still exist — guards against an over-eager edit
// that wipes both switchers.
assert(/aria-label="Ratings view"/.test(HTML),
    'admin-v2.html still carries the Ratings view-switcher (separate feature)');
assert(/data-ratings-view="main"/.test(HTML),
    'admin-v2.html still carries the Ratings "main" pill');
assert(/data-ratings-view="uploads"/.test(HTML),
    'admin-v2.html still carries the Ratings "uploads" pill');

console.log('\n=== i18n.js: retired view labels are gone in en/ru/kk ================\n');

const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
assert(countMatches(I18N, /"admin\.coachKpi\.viewSchool"/g) === 0,
    'i18n.js has zero admin.coachKpi.viewSchool entries');
assert(countMatches(I18N, /"admin\.coachKpi\.viewBranch"/g) === 0,
    'i18n.js has zero admin.coachKpi.viewBranch entries');
assert(countMatches(I18N, /"admin\.coachKpi\.viewCoach"/g) === 0,
    'i18n.js has zero admin.coachKpi.viewCoach entries');

// Ratings i18n keys must remain.
assert(/"admin\.ratings\.viewMain"/.test(I18N),
    'i18n.js still carries admin.ratings.viewMain');
assert(/"admin\.ratings\.viewUploads"/.test(I18N),
    'i18n.js still carries admin.ratings.viewUploads');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
