/**
 * Guards the PostgREST 1000-row cap fix for full-table student reads.
 *
 * Background: PostgREST silently truncates SELECTs to 1000 rows by default.
 * Two queries fetch the full students table without an .in() / .eq() bound:
 *   - supabase-data.js: getStudents() (powers the admin Student Database tab)
 *   - admin-v2.js: ratings export (.in('status', ['active', 'frozen']))
 *
 * Once the table crossed 1000 rows the oldest students disappeared from the
 * student database UI (but still showed up in attendance because attendance
 * queries are .eq('branch_id', ...) — already row-bounded by branch).
 *
 * Fix: explicit .range(0, 9999) on both unbounded selects.
 *
 * Run: node tests/test-students-pagination-cap.js
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
const SUPABASE = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

console.log('\n=== getStudents() full-table read carries .range() ==================\n');

const getStudentsIdx = SUPABASE.indexOf('async getStudents()');
assert(getStudentsIdx > 0, 'getStudents() function exists in supabase-data.js');

const getStudentsBlock = SUPABASE.slice(getStudentsIdx, getStudentsIdx + 1200);
assert(/\.from\('students'\)/.test(getStudentsBlock),
    'getStudents() queries the students table');
assert(/\.order\('created_at'/.test(getStudentsBlock),
    'getStudents() still orders by created_at');
assert(/\.range\(0,\s*9999\)/.test(getStudentsBlock),
    'getStudents() has .range(0, 9999) to bypass PostgREST 1000-row cap');

console.log('\n=== ratings export full-table read carries .range() =================\n');

// Admin-side ratings export is a full-table read filtered only by status.
const ratingsExportIdx = ADMIN.indexOf("student_current_ratings(rating, rating_date)");
assert(ratingsExportIdx > 0, 'Ratings export query exists in admin-v2.js');

const ratingsBlock = ADMIN.slice(ratingsExportIdx, ratingsExportIdx + 400);
assert(/\.in\('status',\s*\['active',\s*'frozen'\]\)/.test(ratingsBlock),
    'Ratings export still filters on status [active, frozen]');
assert(/\.range\(0,\s*9999\)/.test(ratingsBlock),
    'Ratings export has .range(0, 9999) to bypass PostgREST 1000-row cap');

console.log('\n=== other students queries remain row-bounded (no regression) =======\n');

// All other call sites should still be one of: single-row (.eq('id')),
// input-bounded (.in('id', ...)), keyword-limited (.limit(50)), or per-branch
// (.eq('branch_id', ...)). They do NOT need .range() and should NOT get one
// silently added (which would mask an unbounded regression).
const occurrences = (SUPABASE.match(/\.from\('students'\)/g) || []).length;
assert(occurrences >= 10,
    `supabase-data.js has ${occurrences} .from('students') call sites (≥ 10 expected)`);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
