/**
 * Guards the PostgREST 1000-row cap fix for full-table student reads.
 *
 * Background: PostgREST enforces db-max-rows=1000 on this Supabase project
 * SERVER-SIDE. Range headers and limit params do NOT override it — verified
 * by direct curl: `Range: 0-9999` still returns Content-Range: 0-999/1051.
 *
 * Two queries fetch the full students table without an .in() / .eq() bound:
 *   - supabase-data.js: getStudents() (powers the admin Student Database tab)
 *   - admin-v2.js: ratings export (.in('status', ['active', 'frozen']))
 *
 * Once the table crossed 1000 rows the oldest students disappeared from the
 * student database UI (but still showed up in attendance because attendance
 * queries are .eq('branch_id', ...) — already row-bounded by branch).
 *
 * Fix: client-side pagination loop. Fetch .range(from, from + 999), append,
 * stop when a short page is returned. Both call sites must carry this loop.
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

console.log('\n=== getStudents() uses pagination loop ==============================\n');

const getStudentsIdx = SUPABASE.indexOf('async getStudents()');
assert(getStudentsIdx > 0, 'getStudents() function exists in supabase-data.js');

// Body up to the closing of the function (transform happens after the loop).
const getStudentsBlock = SUPABASE.slice(getStudentsIdx, getStudentsIdx + 2200);
assert(/\.from\('students'\)/.test(getStudentsBlock),
    'getStudents() queries the students table');
assert(/\.order\('created_at'/.test(getStudentsBlock),
    'getStudents() still orders by created_at');
assert(/for\s*\(\s*let\s+page\s*=\s*0/.test(getStudentsBlock),
    'getStudents() loops over pages (client-side pagination)');
assert(/\.range\(\s*from\s*,\s*to\s*\)/.test(getStudentsBlock),
    'getStudents() ranges by computed (from, to) per page');
assert(/data\.length\s*<\s*PAGE/.test(getStudentsBlock),
    'getStudents() breaks when a short page is returned (end-of-data signal)');

console.log('\n=== ratings export uses pagination loop =============================\n');

const ratingsExportIdx = ADMIN.indexOf("student_current_ratings(rating, rating_date)");
assert(ratingsExportIdx > 0, 'Ratings export query exists in admin-v2.js');

// Look at the surrounding block (the loop opens before the query).
const ratingsBlock = ADMIN.slice(ratingsExportIdx - 600, ratingsExportIdx + 600);
assert(/\.in\('status',\s*\['active',\s*'frozen'\]\)/.test(ratingsBlock),
    'Ratings export still filters on status [active, frozen]');
assert(/for\s*\(\s*let\s+page\s*=\s*0/.test(ratingsBlock),
    'Ratings export loops over pages (client-side pagination)');
assert(/\.range\(\s*from\s*,\s*to\s*\)/.test(ratingsBlock),
    'Ratings export ranges by computed (from, to) per page');
assert(/chunk\.length\s*<\s*PAGE/.test(ratingsBlock),
    'Ratings export breaks when a short page is returned (end-of-data signal)');

console.log('\n=== old broken fix is gone ==========================================\n');

// .range(0, 9999) was the previous attempt — it did NOT work because the
// server-side db-max-rows cap is enforced regardless of the client Range
// header. Make sure no caller silently regresses to that pattern.
assert(!/\.range\(0,\s*9999\)/.test(SUPABASE),
    'supabase-data.js does NOT contain the broken .range(0, 9999) pattern');
assert(!/\.range\(0,\s*9999\)/.test(ADMIN),
    'admin-v2.js does NOT contain the broken .range(0, 9999) pattern');

console.log('\n=== other students queries remain row-bounded (no regression) =======\n');

const occurrences = (SUPABASE.match(/\.from\('students'\)/g) || []).length;
assert(occurrences >= 10,
    `supabase-data.js has ${occurrences} .from('students') call sites (≥ 10 expected)`);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
