/**
 * Migration 099 (rank history attribution) contract test.
 * Run: node tests/test-rank-history-migration.js
 *
 * Content-based (no Postgres in CI): locks the schema intent of
 * 099_rank_history_attribution.sql — new columns, widened source CHECK,
 * trigger rewrites, append-only guard, idempotent backfill that never touches
 * students — and that the verify file is read-only.
 */

const fs = require('fs');
const path = require('path');

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const SQL = fs.readFileSync(path.join(MIG_DIR, '099_rank_history_attribution.sql'), 'utf8');
const VERIFY = fs.readFileSync(path.join(MIG_DIR, '099_rank_history_attribution_verify.sql'), 'utf8');
const M040 = fs.readFileSync(path.join(MIG_DIR, '040_fix_razryad_trigger_format.sql'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const stripSql = (s) => s.replace(/--[^\n]*/g, '');
const CODE = stripSql(SQL);
const VERIFY_CODE = stripSql(VERIFY);

// Body of a CREATE OR REPLACE FUNCTION <name>() ... $$ block.
function fnBody(src, name) {
    const m = src.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`));
    return m ? m[1] : '';
}

function assertParens(sql, label) {
    let depth = 0;
    for (const ch of sql) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth < 0) break;
    }
    assert(depth === 0, `${label}: balanced parens`);
}

console.log('\n=== shape ==============================================================\n');
assert(/^BEGIN;/m.test(CODE) && /^COMMIT;/m.test(CODE), 'wrapped in BEGIN / COMMIT');
assertParens(CODE, '099');
assertParens(VERIFY_CODE, '099 verify');

console.log('\n=== columns + checks ===================================================\n');
assert(/ADD COLUMN IF NOT EXISTS trainer_id_at_change UUID REFERENCES coaches\(id\) ON DELETE SET NULL/.test(CODE),
    'trainer_id_at_change UUID FK coaches ON DELETE SET NULL');
assert(/ADD COLUMN IF NOT EXISTS trainer_attribution TEXT/.test(CODE), 'trainer_attribution TEXT');
assert(/ADD COLUMN IF NOT EXISTS source_derived BOOLEAN NOT NULL DEFAULT false/.test(CODE), 'source_derived BOOLEAN NOT NULL DEFAULT false');
assert(/ADD COLUMN IF NOT EXISTS evidence TEXT/.test(CODE), 'evidence TEXT');
assert(/trainer_attribution IN \('event_time', 'derived_audit_log', 'unknown'\)/.test(CODE), 'trainer_attribution CHECK values');
const sourceCheck = (CODE.match(/razryad_history_source_check CHECK \(([\s\S]*?)\);/) || [])[1] || '';
['trigger', 'manual', 'import', 'admin_ui', 'coach_ui', 'api', 'tournament', 'system'].forEach((v) => {
    assert(sourceCheck.includes(`'${v}'`), `source CHECK allows '${v}'`);
});
assert(/DROP CONSTRAINT IF EXISTS razryad_history_source_check/.test(CODE)
    && /DROP CONSTRAINT IF EXISTS razryad_history_trainer_attribution_check/.test(CODE),
    'constraints dropped IF EXISTS before re-add (idempotent)');

console.log('\n=== log_razryad_change() ===============================================\n');
const log = fnBody(CODE, 'log_razryad_change');
assert(log.length > 0, 'log_razryad_change() redefined');
assert(/IF OLD\.razryad IS DISTINCT FROM NEW\.razryad THEN/.test(log), 'no row when the value is unchanged');
assert(/current_setting\('app\.rank_source', true\)/.test(log), 'source from app.rank_source GUC first');
assert(/auth\.role\(\) = 'service_role'[\s\S]*'api'/.test(log), "service_role JWT → 'api'");
assert(/FROM user_roles WHERE user_id = auth\.uid\(\)/.test(log) && /'admin' THEN 'admin_ui'/.test(log) && /'coach' THEN 'coach_ui'/.test(log),
    'user_roles role → admin_ui / coach_ui');
assert(/COALESCE\(v_source, 'system'\)/.test(log), "fallback 'system'");
assert(log.indexOf("app.rank_source") < log.indexOf("service_role") && log.indexOf("service_role") < log.indexOf("user_roles"),
    'precedence: GUC → service_role → user_roles');
assert(/OLD\.coach_id, CASE WHEN OLD\.coach_id IS NULL THEN 'unknown' ELSE 'event_time' END/.test(log),
    "trainer = OLD.coach_id, attribution event_time / unknown");
assert(/auth\.uid\(\)/.test(log) && !/changed_at/.test(log), 'changed_by = auth.uid(); changed_at left to DEFAULT now()');
assert(/SECURITY DEFINER/.test(CODE.slice(CODE.indexOf('FUNCTION log_razryad_change'), CODE.indexOf('FUNCTION detect_razryad_from_result'))),
    'log_razryad_change stays SECURITY DEFINER');

console.log('\n=== detect_razryad_from_result() =======================================\n');
const det = fnBody(CODE, 'detect_razryad_from_result');
const det040 = fnBody(M040, 'detect_razryad_from_result');
assert(/set_config\('app\.rank_source', 'tournament', true\)\s*;\s*UPDATE students SET razryad = v_earned_for_student/.test(det),
    "set_config('app.rank_source','tournament',true) right before its UPDATE");
// Everything else byte-identical to the latest (040) definition.
const normalize = (s) => s
    .replace(/\n\s*v_prev_source\s+TEXT;/, '')
    .replace(/\n\s*v_prev_source := [^\n]*/, '')
    .replace(/\n\s*PERFORM set_config\([^\n]*/g, '');
assert(normalize(det) === det040, 'all other behaviour byte-identical to 040');

console.log('\n=== append-only guard + RLS ============================================\n');
assert(/CREATE TRIGGER trg_razryad_history_append_only\s+BEFORE UPDATE ON razryad_history/.test(CODE), 'BEFORE UPDATE trigger on razryad_history');
assert(/DROP TRIGGER IF EXISTS trg_razryad_history_append_only/.test(CODE), 'trigger dropped IF EXISTS first');
const guard = fnBody(CODE, 'razryad_history_append_only');
assert(/RAISE EXCEPTION 'razryad_history is append-only/.test(guard), 'guard raises');
assert(/current_setting\('app\.rank_history_backfill', true\) = 'on'/.test(guard), 'backfill exception gated on app.rank_history_backfill GUC');
assert(/OLD\.source = 'trigger' AND OLD\.source_derived = false/.test(guard), 'backfill exception only for legacy, not-yet-derived rows');
assert(/ARRAY\['trainer_id_at_change', 'trainer_attribution', 'source_derived', 'evidence', 'source'\]/.test(guard),
    'backfill may change only the 4 new columns + source');
assert(/ARRAY\['changed_by', 'trainer_id_at_change'\]/.test(guard) && /NEW\.changed_by IS NULL/.test(guard),
    'FK ON DELETE SET NULL (changed_by / trainer) still allowed');
assert(/DROP POLICY IF EXISTS "Admins manage razryad_history"/.test(CODE), 'FOR ALL admin policy dropped');
assert(/CREATE POLICY "Admins read razryad_history"\s+ON razryad_history FOR SELECT/.test(CODE), 'admin policy narrowed to SELECT');
assert(!/FOR ALL/.test(CODE), 'no FOR ALL policy created');
assert(!/ON DELETE CASCADE|DROP CONSTRAINT razryad_history_student_id_fkey/.test(CODE), 'student FK (ON DELETE CASCADE from 036) left alone');

console.log('\n=== backfill ===========================================================\n');
const backfill = CODE.slice(CODE.indexOf("set_config('app.rank_history_backfill', 'on', true)"));
assert(backfill.length > 0 && /set_config\('app\.rank_history_backfill', 'off', true\)/.test(backfill), 'backfill GUC switched on then off');
assert(/WHERE rh\.source = 'trigger' AND rh\.source_derived = false/.test(backfill)
    && /AND rh\.source = 'trigger' AND rh\.source_derived = false;/.test(backfill),
    'idempotent: only legacy rows not yet derived (selected and updated)');
assert(/source_derived = true/.test(backfill) && /evidence = concat_ws/.test(backfill), 'sets source_derived=true + evidence');
assert(/al\.entity_type = 'students'/.test(backfill) && /al\.field_name = 'coach_id'/.test(backfill), 'trainer from audit_log students.coach_id timeline');
assert(/al\.changed_at < l\.changed_at/.test(backfill) && /al\.changed_at >= l\.changed_at/.test(backfill),
    'timeline: last change before (new_value) else first at/after (old_value)');
assert(/'derived_audit_log' ELSE 'unknown'/.test(backfill), "derived → 'derived_audit_log', else 'unknown'");
assert(!/s\.coach_id|students\.coach_id|FROM students/.test(stripSql(backfill)), 'never falls back to current students.coach_id');
assert(/tournament_results tr/.test(backfill) && /INTERVAL '5 seconds'/.test(backfill) && /earned_razryad IS NOT NULL/.test(backfill),
    'tournament match: earned_razryad within 5s');
assert(/WHEN r\.tournament_result_id IS NOT NULL THEN 'tournament'[\s\S]*'admin_ui'[\s\S]*'coach_ui'[\s\S]*ELSE 'trigger'/.test(backfill),
    "source precedence tournament → admin_ui / coach_ui → keep 'trigger'");
assert(!/old_razryad\s*=|new_razryad\s*=|changed_at\s*=|changed_by\s*=/.test(backfill.slice(backfill.indexOf('UPDATE razryad_history'))),
    'backfill never rewrites old/new/changed_at/changed_by');
assert(!/UPDATE\s+students/i.test(CODE.replace(fnBody(CODE, 'detect_razryad_from_result'), '')),
    'no UPDATE students outside the (copied) tournament trigger');
assert(!/DELETE FROM|TRUNCATE|DROP TABLE/i.test(CODE), 'no DELETE / TRUNCATE / DROP TABLE');

console.log('\n=== verify file ========================================================\n');
assert(VERIFY_CODE.trim().length > 0, 'verify file present');
assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT)\b/i.test(VERIFY_CODE.replace(/'[^']*'/g, '')), 'verify file is read-only');
assert(/GROUP BY source, source_derived/.test(VERIFY_CODE), 'counts by source');
assert(/GROUP BY trainer_attribution/.test(VERIFY_CODE), 'counts by attribution');
assert(/immutable_fingerprint/.test(VERIFY_CODE) && /old_razryad/.test(VERIFY_CODE) && /changed_at::TEXT/.test(VERIFY_CODE),
    'fingerprint over old/new/changed_at to assert they are unchanged');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
