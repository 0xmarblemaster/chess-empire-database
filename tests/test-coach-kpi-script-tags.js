/**
 * Tests that admin-v2.html loads the coach KPI scripts in the right order:
 * after Chart.js and after attendance-role-lock.js (PRD_COACH_KPI.md Phase 2).
 *
 *   chart.js  ─┐
 *              ├─► coach-kpi-role-lock.js  ─► coach-kpi.js
 *   attendance-role-lock.js  ─┘
 *
 * Tournament upload now uses two shared modules — frontend/student-match.js
 * (fuzzy name matcher) and frontend/tournament-parse.js (Swiss-Manager parser)
 * — both loaded before coach-kpi.js so the Rating Management modal can call
 * window.tournamentParse / window.studentMatch from admin-v2.js.
 *
 * Run: node tests/test-coach-kpi-script-tags.js
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

console.log('\n=== script tags present ==============================================\n');

const idxChartJs       = HTML.indexOf('cdn.jsdelivr.net/npm/chart.js');
const idxAttendance    = HTML.indexOf('attendance-role-lock.js');
const idxKpiRoleLock   = HTML.indexOf('coach-kpi-role-lock.js');
const idxStudentMatch  = HTML.search(/src="frontend\/student-match\.js"/);
const idxTournamentP   = HTML.search(/src="frontend\/tournament-parse\.js"/);
const idxKpi           = HTML.search(/src="coach-kpi\.js"/);

assert(idxChartJs       > 0, 'Chart.js script tag present');
assert(idxAttendance    > 0, 'attendance-role-lock.js script tag present');
assert(idxKpiRoleLock   > 0, 'coach-kpi-role-lock.js script tag present');
assert(idxStudentMatch  > 0, 'frontend/student-match.js script tag present');
assert(idxTournamentP   > 0, 'frontend/tournament-parse.js script tag present');
assert(idxKpi           > 0, 'coach-kpi.js script tag present');

console.log('\n=== legacy coach-kpi-upload.js must be gone ==========================\n');
assert(HTML.search(/src="coach-kpi-upload\.js"/) === -1,
    'coach-kpi-upload.js script tag is no longer present');
assert(!fs.existsSync(path.join(ROOT, 'coach-kpi-upload.js')),
    'coach-kpi-upload.js file no longer exists at repo root');

console.log('\n=== load order — KPI scripts come AFTER chart.js + role lock =========\n');

assert(idxChartJs    < idxKpiRoleLock,
    'coach-kpi-role-lock.js loads AFTER Chart.js');
assert(idxAttendance < idxKpiRoleLock,
    'coach-kpi-role-lock.js loads AFTER attendance-role-lock.js');
assert(idxChartJs    < idxKpi,
    'coach-kpi.js loads AFTER Chart.js (renderers depend on it)');
assert(idxAttendance < idxKpi,
    'coach-kpi.js loads AFTER attendance-role-lock.js');

console.log('\n=== role lock loads before main KPI module ============================\n');

assert(idxKpiRoleLock < idxKpi,
    'coach-kpi-role-lock.js loads BEFORE coach-kpi.js (lock defines policy used by KPI)');
assert(idxKpiRoleLock < idxStudentMatch,
    'student-match.js loads AFTER coach-kpi-role-lock.js');
assert(idxStudentMatch < idxKpi,
    'student-match.js loads BEFORE coach-kpi.js so admin-v2.js can call window.studentMatch');
assert(idxTournamentP < idxKpi,
    'tournament-parse.js loads BEFORE coach-kpi.js so admin-v2.js can call window.tournamentParse');

console.log('\n=== script tags are well-formed (no malformed src) ===================\n');

const roleLockTagMatch = HTML.match(/<script\s+src="coach-kpi-role-lock\.js"[^>]*>\s*<\/script>/);
assert(roleLockTagMatch !== null,
    'coach-kpi-role-lock.js is a properly closed <script src="..."></script> tag');

const studentMatchTag = HTML.match(/<script\s+src="frontend\/student-match\.js"[^>]*>\s*<\/script>/);
assert(studentMatchTag !== null,
    'frontend/student-match.js is a properly closed <script src="..."></script> tag');

const tournamentParseTag = HTML.match(/<script\s+src="frontend\/tournament-parse\.js"[^>]*>\s*<\/script>/);
assert(tournamentParseTag !== null,
    'frontend/tournament-parse.js is a properly closed <script src="..."></script> tag');

const kpiTagMatch = HTML.match(/<script\s+src="coach-kpi\.js"[^>]*>\s*<\/script>/);
assert(kpiTagMatch !== null,
    'coach-kpi.js is a properly closed <script src="..."></script> tag');

console.log('\n=== script files actually exist on disk ==============================\n');

assert(fs.existsSync(path.join(ROOT, 'coach-kpi-role-lock.js')),
    'coach-kpi-role-lock.js file exists at repo root');
assert(fs.existsSync(path.join(ROOT, 'frontend', 'student-match.js')),
    'frontend/student-match.js exists');
assert(fs.existsSync(path.join(ROOT, 'frontend', 'tournament-parse.js')),
    'frontend/tournament-parse.js exists');
assert(fs.existsSync(path.join(ROOT, 'coach-kpi.js')),
    'coach-kpi.js file exists at repo root');

console.log('\n=== each script tag appears exactly once =============================\n');

function count(s, re) {
    return (s.match(re) || []).length;
}
assert(count(HTML, /src="coach-kpi-role-lock\.js"/g) === 1,
    'coach-kpi-role-lock.js script tag appears exactly once');
assert(count(HTML, /src="frontend\/student-match\.js"/g) === 1,
    'frontend/student-match.js script tag appears exactly once');
assert(count(HTML, /src="frontend\/tournament-parse\.js"/g) === 1,
    'frontend/tournament-parse.js script tag appears exactly once');
assert(count(HTML, /src="coach-kpi\.js"/g) === 1,
    'coach-kpi.js script tag appears exactly once');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
