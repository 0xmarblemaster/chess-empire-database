/**
 * Migration 100 (unchanged-coach attribution) contract test.
 * Run: node tests/test-rank-history-migration-100.js
 *
 * Content-based: only 'unknown' derived rows with no coach_id audit history
 * after audit start are touched; never updates students; append-only trigger
 * is re-enabled in the same transaction.
 */

const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations',
    '100_rank_history_unchanged_coach_attribution.sql'), 'utf8');
const CODE = SQL.replace(/--[^\n]*/g, '');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('Migration 100 — unchanged-coach attribution');
assert(/^\s*BEGIN;/m.test(CODE) && /COMMIT;\s*$/.test(CODE), 'wrapped in a transaction');
const dis = CODE.indexOf('DISABLE TRIGGER trg_razryad_history_append_only');
const en = CODE.indexOf('ENABLE TRIGGER trg_razryad_history_append_only');
const commit = CODE.lastIndexOf('COMMIT;');
assert(dis > 0 && en > dis && commit > en, 'append-only trigger disabled then re-enabled before COMMIT');
assert(!/UPDATE\s+students\b/i.test(CODE), 'never updates students');
assert(!/DELETE\s+FROM/i.test(CODE) && !/INSERT\s+INTO/i.test(CODE), 'no inserts or deletes');
assert(/rh\.trainer_attribution = 'unknown'/.test(CODE), "only touches 'unknown' rows");
assert(/rh\.source_derived = true/.test(CODE), 'only touches backfilled (derived) rows');
assert(/rh\.changed_at > a\.t/.test(CODE), 'only events after audit start');
assert(/NOT EXISTS[\s\S]*field_name = 'coach_id'/.test(CODE), 'only students with no coach_id audit history');
assert(/s\.coach_id IS NOT NULL/.test(CODE), 'skips students without a coach');
const setClause = (CODE.match(/SET([\s\S]*?)FROM students/) || [, ''])[1];
const setCols = [...setClause.matchAll(/^\s*(\w+)\s*=/gm)].map((m) => m[1]).sort();
assert(JSON.stringify(setCols) === JSON.stringify(['evidence', 'trainer_attribution', 'trainer_id_at_change']),
    `SET touches only attribution columns (${setCols.join(', ')})`);
assert(/evidence = rh\.evidence \|\|/.test(CODE), 'appends to existing evidence');

console.log(`\n  passed: ${passed}\n  failed: ${failed}`);
process.exit(failed ? 1 : 0);
