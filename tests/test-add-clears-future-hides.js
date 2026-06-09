/**
 * Guards the "add clears future -1 hides" fix in upsertTimeSlotAssignment.
 *
 * Background: migration 057 re-stamped legacy -1 hide rows to
 * effective_from = '2026-06-01' for ~126 students across 9 coaches. The add
 * flow (drag-drop + click-to-add) writes its baseline row at
 * effective_from = '1970-01-01'. The read path
 * (getTimeSlotAssignments → ORDER BY effective_from DESC, first row per
 * student wins) then keeps returning -1 for any student with a later hide
 * row, so the just-added student stays invisible in the calendar.
 *
 * Fix: after the baseline upsert succeeds, DELETE any -1 rows at
 * effective_from > '1970-01-01' matching the same (student, branch, schedule).
 * Adding a student to a slot is treated as an explicit contradiction of any
 * later hide marker for that same (student, branch, schedule) tuple.
 *
 * Run: node tests/test-add-clears-future-hides.js
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

console.log('\n=== upsertTimeSlotAssignment function body extraction =================\n');

const fnIdx = SUPABASE.indexOf('async upsertTimeSlotAssignment(');
assert(fnIdx > 0, 'upsertTimeSlotAssignment() exists in supabase-data.js');

// Grab a generous chunk — the function ends with a `},` before the next
// sibling. The bulk function comes right after, so the next sibling is
// `bulkUpsertTimeSlotAssignments` (or similar). Slice until we hit a
// reasonable boundary.
const nextSiblingIdx = SUPABASE.indexOf('\n    /**', fnIdx + 50);
const fnBody = nextSiblingIdx > 0
    ? SUPABASE.slice(fnIdx, nextSiblingIdx)
    : SUPABASE.slice(fnIdx, fnIdx + 3000);
assert(fnBody.length > 200, 'extracted upsertTimeSlotAssignment() body for inspection');

console.log('\n=== both .upsert( and .delete( present in body ========================\n');

assert(fnBody.includes('.upsert('),
    'upsertTimeSlotAssignment body contains .upsert(');
assert(fnBody.includes('.delete('),
    'upsertTimeSlotAssignment body contains .delete(');

console.log('\n=== DELETE filter chain looks right ==================================\n');

// Locate the legacy-hide DELETE chain: post-migration-061, upsertTimeSlotAssignment
// has TWO .delete() chains — one clears per-slot hidden=TRUE rows for the
// current slot, the other clears legacy schedule-wide -1 sentinel rows.
// We want the -1 chain here. Walk every .delete( occurrence and pick the
// one whose chain (up to the next bare `;`) targets time_slot_index = -1.
function findDeleteChainMatching(body, predicate) {
    let cursor = 0;
    while (true) {
        const at = body.indexOf('.delete(', cursor);
        if (at < 0) return { idx: -1, chain: '' };
        const semi = body.indexOf(';', at);
        if (semi < 0) return { idx: -1, chain: '' };
        const chain = body.slice(at, semi);
        if (predicate(chain)) return { idx: at, chain };
        cursor = semi + 1;
    }
}

const { idx: deleteIdx, chain: deleteChain } = findDeleteChainMatching(
    fnBody,
    chain => /\.eq\(\s*['"]time_slot_index['"]\s*,\s*-1\s*\)/.test(chain)
);
assert(deleteIdx > 0 && deleteChain.length > 0,
    'legacy-hide DELETE chain (time_slot_index = -1) exists in upsertTimeSlotAssignment');

// Filter on time_slot_index = -1 (never touch a positive slot row).
assert(/\.eq\(\s*['"]time_slot_index['"]\s*,\s*-1\s*\)/.test(deleteChain),
    "DELETE filters by .eq('time_slot_index', -1) — never deletes a real slot row");

// effective_from > '1970-01-01' (only kill later hides; keep baseline alone).
assert(/\.gt\(\s*['"]effective_from['"]\s*,\s*['"]1970-01-01['"]\s*\)/.test(deleteChain),
    "DELETE filters by .gt('effective_from', '1970-01-01') — never deletes the baseline");

// Regression guard: must scope to the same (student, branch, schedule) tuple.
// Missing any of these would scope-creep the delete to other students or
// other schedules (sat_sun add must NOT clear mon_wed hides).
assert(/\.eq\(\s*['"]student_id['"]\s*,/.test(deleteChain),
    "DELETE scoped by .eq('student_id', ...) — does not touch other students");
assert(/\.eq\(\s*['"]branch_id['"]\s*,/.test(deleteChain),
    "DELETE scoped by .eq('branch_id', ...) — does not touch other branches");
assert(/\.eq\(\s*['"]schedule_type['"]\s*,/.test(deleteChain),
    "DELETE scoped by .eq('schedule_type', ...) — does not touch other schedules");

console.log('\n=== source order: DELETE runs AFTER the upsert =======================\n');

const upsertIdx = fnBody.indexOf('.upsert(');
assert(upsertIdx > 0 && deleteIdx > upsertIdx,
    'DELETE appears AFTER the UPSERT in source order');

// The upsert's `if (...) throw` error guard must fall between the two so a
// failed upsert short-circuits before we delete anything.
const upsertThrowIdx = fnBody.indexOf('throw error', upsertIdx);
assert(upsertThrowIdx > upsertIdx && upsertThrowIdx < deleteIdx,
    "upsert's `throw error` guard sits between upsert and delete (fail-fast)");

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
