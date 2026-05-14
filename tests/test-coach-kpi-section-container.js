/**
 * Tests for the Coach Performance section container in admin-v2.html
 * (PRD_COACH_KPI.md Phase 2). Verifies the three sub-views render targets
 * exist so coach-kpi.js has a stable DOM contract.
 *
 * Run: node tests/test-coach-kpi-section-container.js
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

console.log('\n=== section container present =========================================\n');

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

console.log('\n=== three sub-views with stable ids ===================================\n');

assert(/id="coach-kpi-school-view"/.test(sectionHtml),
    'school view container (#coach-kpi-school-view) exists');
assert(/id="coach-kpi-branch-view"/.test(sectionHtml),
    'branch view container (#coach-kpi-branch-view) exists');
assert(/id="coach-kpi-coach-view"/.test(sectionHtml),
    'coach view container (#coach-kpi-coach-view) exists');

console.log('\n=== sub-view ordering matches drill-down (school -> branch -> coach) ==\n');

const idxSchool = sectionHtml.indexOf('id="coach-kpi-school-view"');
const idxBranch = sectionHtml.indexOf('id="coach-kpi-branch-view"');
const idxCoach  = sectionHtml.indexOf('id="coach-kpi-coach-view"');

assert(idxSchool > 0 && idxBranch > idxSchool,
    'branch view comes after school view');
assert(idxBranch > 0 && idxCoach > idxBranch,
    'coach view comes after branch view');

console.log('\n=== sub-views nested inside the section ===============================\n');

// All three sub-view ids must occur strictly within the section's HTML.
// The match above is the section body — if a sub-view existed elsewhere
// only, it would still show in HTML but not in sectionHtml.
const allInside = sectionHtml.indexOf('id="coach-kpi-school-view"') > 0
               && sectionHtml.indexOf('id="coach-kpi-branch-view"') > 0
               && sectionHtml.indexOf('id="coach-kpi-coach-view"') > 0;
assert(allInside, 'all three sub-views nest inside #section-coach-kpi');

console.log('\n=== global uniqueness of the four ids =================================\n');

function count(s, needle) {
    let n = 0, i = 0;
    while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
}
assert(count(HTML, 'id="section-coach-kpi"') === 1,
    '#section-coach-kpi defined exactly once');
assert(count(HTML, 'id="coach-kpi-school-view"') === 1,
    '#coach-kpi-school-view defined exactly once');
assert(count(HTML, 'id="coach-kpi-branch-view"') === 1,
    '#coach-kpi-branch-view defined exactly once');
assert(count(HTML, 'id="coach-kpi-coach-view"') === 1,
    '#coach-kpi-coach-view defined exactly once');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
