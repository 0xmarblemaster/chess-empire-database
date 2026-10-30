/**
 * Migration 101 (coach performance reports) contract test.
 * Run: node tests/test-coach-reports-migration.js
 *
 * Content-based: read-only analytics objects only (no table writes / DDL on
 * tables), idempotent CREATE OR REPLACE, service_role-only grants, function
 * signatures, 5-minute dedupe window, coach_at timeline rules, and the verify
 * script is SELECT-only. Behaviour is exercised on real Postgres by
 * tests/test_coach_reports_db.py.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const SQL = fs.readFileSync(path.join(DIR, '101_coach_reports.sql'), 'utf8');
const VERIFY = fs.readFileSync(path.join(DIR, '101_coach_reports_verify.sql'), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const CODE = strip(SQL);
const VCODE = strip(VERIFY);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Body of one CREATE OR REPLACE FUNCTION <name>(…) … $$ … $$;
function fnBody(name) {
    const m = CODE.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(([^)]*)\\)([\\s\\S]*?)AS \\$\\$([\\s\\S]*?)\\$\\$;`));
    return m ? { args: m[1], header: m[2], body: m[3] } : null;
}

console.log('\nRead-only');
assert(/^\s*BEGIN;/m.test(CODE) && /COMMIT;\s*$/.test(CODE), 'wrapped in a transaction');
assert(!/\bINSERT\s+INTO\b/i.test(CODE), 'no INSERT');
assert(!/\bUPDATE\s+\w+\s+SET\b/i.test(CODE), 'no UPDATE … SET');
assert(!/\bDELETE\s+FROM\b/i.test(CODE), 'no DELETE');
assert(!/\b(TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|CREATE\s+TRIGGER)\b/i.test(CODE), 'no table DDL / triggers');
const creates = [...CODE.matchAll(/\bCREATE\s+(OR\s+REPLACE\s+)?(VIEW|FUNCTION)\s+(\w+)/gi)];
assert(creates.length > 0 && creates.every((m) => m[1]), 'every CREATE is CREATE OR REPLACE (idempotent)');
assert(/v_status_events_dedup WITH \(security_invoker = true\)/.test(CODE)
    && /v_student_start WITH \(security_invoker = true\)/.test(CODE), 'views are security_invoker');

console.log('\nSignatures');
const report = fnBody('coach_report');
assert(report && /p_start TIMESTAMPTZ, p_end TIMESTAMPTZ/.test(report.args), 'coach_report(p_start timestamptz, p_end timestamptz)');
assert(report && /RETURNS JSONB/.test(report.header) && /STABLE SECURITY DEFINER/.test(report.header)
    && /SET search_path = public/.test(report.header), 'coach_report: jsonb, STABLE, SECURITY DEFINER, search_path = public');
const cohort = fnBody('coach_cohort_matrix');
assert(cohort && /p_coach UUID DEFAULT NULL/.test(cohort.args) && /RETURNS JSONB/.test(cohort.header)
    && /STABLE SECURITY DEFINER/.test(cohort.header) && /SET search_path = public/.test(cohort.header),
    'coach_cohort_matrix(p_coach uuid DEFAULT NULL) jsonb, STABLE, SECURITY DEFINER');
const coachAt = fnBody('coach_at');
assert(coachAt && /p_student UUID, p_ts TIMESTAMPTZ/.test(coachAt.args) && /RETURNS UUID/.test(coachAt.header)
    && /\bSTABLE\b/.test(coachAt.header), 'coach_at(p_student uuid, p_ts timestamptz) RETURNS uuid STABLE');

console.log('\nGrants (service_role only)');
for (const sig of ['coach_report(TIMESTAMPTZ, TIMESTAMPTZ)', 'coach_cohort_matrix(UUID)', 'coach_at(UUID, TIMESTAMPTZ)',
    'coach_report_field_at(UUID, TEXT, TIMESTAMPTZ)', 'coach_report_share(BIGINT, BIGINT)']) {
    const esc = sig.replace(/[()]/g, '\\$&');
    assert(new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon, authenticated;`).test(CODE)
        && new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO service_role;`).test(CODE), `${sig}: revoked from anon/authenticated, granted to service_role`);
}
assert(!/GRANT[^;]*\b(anon|authenticated)\b/i.test(CODE), 'nothing granted to anon / authenticated');
assert(/REVOKE ALL ON v_status_events_dedup, v_student_start FROM PUBLIC, anon, authenticated;/.test(CODE),
    'views revoked from anon / authenticated');

console.log('\nDedupe + coach_at rules');
assert(/PARTITION BY h\.student_id ORDER BY h\.changed_at, h\.id/.test(CODE), 'dedupe compares with the previous event of the same student');
assert(/prev_old IS DISTINCT FROM e\.old_status/.test(CODE) && /prev_new IS DISTINCT FROM e\.new_status/.test(CODE),
    'dedupe requires the same old→new transition');
assert(/e\.changed_at - e\.prev_at > INTERVAL '5 minutes'/.test(CODE), 'dedupe window is 5 minutes');
const at = coachAt ? coachAt.body : '';
assert(/field_name = 'coach_id' AND al\.action = 'UPDATE'[\s\S]*?changed_at < p_ts[\s\S]*?ORDER BY al\.changed_at DESC/.test(at)
    && /SELECT al\.new_value INTO v_coach/.test(at), 'last change strictly before ts → new_value');
assert(/SELECT al\.old_value INTO v_coach[\s\S]*?changed_at >= p_ts[\s\S]*?ORDER BY al\.changed_at ASC/.test(at),
    'else first change at/after ts → old_value (same instant = old coach)');
assert(/SELECT s\.coach_id::TEXT INTO v_coach FROM students s/.test(at), 'no coach_id UPDATE rows → current students.coach_id');
assert(/FROM coaches c WHERE c\.id = v_coach::UUID/.test(at), 'only an existing coach is returned (deleted → NULL)');

console.log('\nMetric rules');
const rb = report ? report.body : '';
assert(/trainer_id_at_change/.test(rb) && !/coach_at\([^)]*rh\./.test(rb), 'razryad credit from trainer_id_at_change (not recomputed)');
assert(/INTERVAL '60 days'/.test(rb), 'left→active counts as new only after 60 days');
assert(/INTERVAL '30 days'/.test(rb), 'frozen 30+ days');
assert(/'churn', COALESCE\(lf\.n, 0\) \+ COALESCE\(fz\.n, 0\)/.test(rb), 'churn = left + frozen_30d (D1)');
assert(/'small_sample', COALESCE\(ro\.active, 0\) < 10/.test(rb), 'small_sample = fewer than 10 active');
assert(/'Unattributed'/.test(rb) && /'school'/.test(rb), 'Unattributed row + school totals');
assert(/km_survival_3m/.test(rb) && /km_survival_6m/.test(rb), 'Kaplan–Meier survival at 3 and 6 months');
assert(/DATE '2025-12-31'/.test(CODE), 'left_censored cut-off 2025-12-31');
assert(/WHERE status = 'present'/.test(CODE), "start = first 'present' attendance");

console.log('\nVerify script');
assert(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(VCODE), 'verify script is read-only');
assert(/coach_report\(/.test(VCODE) && /student_status_history/.test(VCODE) && /tournament_results/.test(VCODE),
    'verify recounts directly from source tables');

console.log(`\n  passed: ${passed}\n  failed: ${failed}`);
process.exit(failed ? 1 : 0);
