// Regression test: orphan coach/branch (null after coach delete) must not produce
// an empty option in #coachFilter / #branchFilter on the admin dashboard.
//
// Context: deleting a coach sets students.coach_id to NULL (ON DELETE SET NULL).
// supabase-data.js then maps coach: '' for those students. populateFilterDropdowns
// in admin-v2.js used [...new Set(students.map(s => s.coach))] without filtering
// falsy values, so the empty string became a blank dropdown row.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'admin-v2.js'), 'utf8');

function assertFiltersFalsy(arrayExprMatch, label) {
  assert.ok(
    arrayExprMatch,
    `populateFilterDropdowns: ${label} array expression not found — file structure changed?`
  );
  assert.ok(
    /\.filter\(\s*\w+\s*=>\s*\w+\s*&&\s*String\(\w+\)\.trim\(\)\s*\)/.test(arrayExprMatch),
    `populateFilterDropdowns: ${label} must filter out null/empty values to avoid orphan blank rows`
  );
}

const branchMatch = src.match(/students\.map\(s\s*=>\s*s\.branch\)[^\]]*/);
const coachMatch  = src.match(/students\.map\(s\s*=>\s*s\.coach\)[^\]]*/);

assertFiltersFalsy(branchMatch && branchMatch[0], 'branch');
assertFiltersFalsy(coachMatch  && coachMatch[0],  'coach');

console.log('OK: admin-v2.js populateFilterDropdowns filters out null/empty coach + branch');
