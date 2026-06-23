/**
 * Regression test: showAttendanceManagement must validate the coach + branch
 * ids restored from localStorage against window.coaches / window.branches
 * before populating the dropdowns.
 *
 * Bug it guards against:
 *   - attendanceFilterState.coach in localStorage holds a deleted coach UUID.
 *   - populateAttendanceCoachDropdown rebuilds <option>s from window.coaches
 *     — the stale UUID has no matching option, so `select.value = stale-id`
 *     silently leaves the select blank.
 *   - window.coaches.find(c => c.id === stale-id) returns undefined →
 *     attendanceCurrentCoachName = null, which breaks the time-slot cache key
 *     and the edit-slot pencil button.
 *
 * Fix: after restoring savedState from localStorage, drop the saved coach id
 * if it isn't in window.coaches (default to roleInfo.coachId for coaches,
 * 'all' for admins) and drop the saved branch name if it isn't in
 * window.branches. Re-persist the cleaned state.
 *
 * Run: node tests/test-attendance-restore-validates-ids.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Pull the async function body so the assertions can't accidentally match a
// pattern elsewhere in the 8k-line file.
function fnBody(src, name) {
    const sigA = src.indexOf(`async function ${name}(`);
    const sigB = src.indexOf(`function ${name}(`);
    const s = sigA >= 0 ? sigA : sigB;
    if (s < 0) return '';
    const open = src.indexOf('{', s);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    return '';
}

console.log('\n=== showAttendanceManagement: restored-id validation =================\n');

const body = fnBody(SRC, 'showAttendanceManagement');
assert(body.length > 0, 'located showAttendanceManagement function body');

// 1. Validation reads the live coach + branch lists from window.
assert(/window\.coaches/.test(body),
    'validation references window.coaches');
assert(/window\.branches/.test(body),
    'validation references window.branches');

// 2. Checks the restored coach id exists in window.coaches.
assert(/some\(\s*c\s*=>\s*c\s*&&\s*c\.id\s*===\s*attendanceCurrentCoach\s*\)/.test(body),
    'checks attendanceCurrentCoach against window.coaches via .some(c => c.id === id)');

// 3. Sentinel values ('all', 'unassigned') must NOT be treated as stale.
assert(/attendanceCurrentCoach\s*!==\s*'all'/.test(body)
    && /attendanceCurrentCoach\s*!==\s*'unassigned'/.test(body),
    'skips "all" and "unassigned" sentinels — only validates real UUIDs');

// 4. Fallback default for stale coach id picks the right value for the role:
//    - locked coach (isAdmin === false && coachId) → roleInfo.coachId
//    - admin / anon → 'all'
assert(/roleInfo\.isAdmin\s*===\s*false[\s\S]{0,80}roleInfo\.coachId/.test(body),
    'fallback uses roleInfo.coachId for locked coaches');
assert(/:\s*'all'/.test(body),
    'fallback defaults to "all" for admins (no coachId)');

// 5. Checks the restored branch name exists in window.branches.
assert(/some\(\s*b\s*=>\s*b\s*&&\s*b\.name\s*===\s*attendanceCurrentBranch\s*\)/.test(body),
    'checks attendanceCurrentBranch against window.branches via .some(b => b.name === name)');

// 6. Stale branch resets to null (lets the dropdown pick a default).
assert(/attendanceCurrentBranch\s*=\s*null/.test(body),
    'stale branch is reset to null');

// 7. Re-persists the cleaned state so the next reload starts clean.
assert(/cleaned\s*\)\s*saveAttendanceFilterState\(\)/.test(body)
    || /if\s*\(\s*cleaned\s*\)[\s\S]{0,80}saveAttendanceFilterState\(\)/.test(body),
    'calls saveAttendanceFilterState() when validation cleaned anything');

// 8. Ordering — validation must happen BEFORE the populate calls that set
//    select.value, otherwise a stale id can still slip through.
const validateIdx = body.search(/some\(\s*c\s*=>\s*c\s*&&\s*c\.id\s*===\s*attendanceCurrentCoach\s*\)/);
const populateBranchIdx = body.indexOf('populateAttendanceBranchDropdown(');
const populateCoachIdx = body.indexOf('populateAttendanceCoachDropdown(');
assert(validateIdx > 0 && populateBranchIdx > validateIdx,
    'coach validation runs BEFORE populateAttendanceBranchDropdown()');
assert(validateIdx > 0 && populateCoachIdx > validateIdx,
    'coach validation runs BEFORE populateAttendanceCoachDropdown()');

// 9. Ordering — validation must happen AFTER loadAttendanceRoleInfo() so
//    roleInfo is available for the fallback default.
const roleInfoIdx = body.indexOf('loadAttendanceRoleInfo(');
assert(roleInfoIdx >= 0 && roleInfoIdx < validateIdx,
    'validation runs AFTER loadAttendanceRoleInfo() — roleInfo available for fallback');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
