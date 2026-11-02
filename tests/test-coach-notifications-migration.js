/**
 * Migration 102 (coach notifications) contract test.
 * Run: node tests/test-coach-notifications-migration.js
 *
 * Content-based: table shape (FKs with ON DELETE CASCADE, defaults, kind
 * CHECK, event + snapshot columns), unique key per (recipient, status event) +
 * inbox index, RLS enabled with SELECT-only policies
 * (own rows via the coach-email helper, all rows for admins), no client
 * INSERT / UPDATE / DELETE, the SECURITY DEFINER mark-read RPC, idempotency,
 * and a SELECT-only verify script.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const SQL = fs.readFileSync(path.join(DIR, '102_coach_notifications.sql'), 'utf8');
const VERIFY = fs.readFileSync(path.join(DIR, '102_coach_notifications_verify.sql'), 'utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
const CODE = strip(SQL);
const VCODE = strip(VERIFY);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function fnBody(name) {
    const m = CODE.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(([^)]*)\\)([\\s\\S]*?)AS \\$\\$([\\s\\S]*?)\\$\\$;`));
    return m ? { args: m[1], header: m[2], body: m[3] } : null;
}

console.log('\nHeader + transaction');
assert(/^-- Migration 102: coach "new student" notifications/.test(SQL), 'header comment');
assert(/kind 'reactivated'/.test(SQL) && /\(recipient_coach_id, status_history_id\)/.test(SQL), 'header documents reactivation + event key');
assert(/^\s*BEGIN;/m.test(CODE) && /COMMIT;\s*$/.test(CODE), 'wrapped in a transaction');

console.log('\nTable');
const table = (CODE.match(/CREATE TABLE IF NOT EXISTS coach_notifications \(([\s\S]*?)\n\);/) || [])[1] || '';
assert(table.length > 0, 'CREATE TABLE IF NOT EXISTS coach_notifications');
assert(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/.test(table), 'uuid primary key');
assert(/recipient_coach_id\s+UUID NOT NULL REFERENCES coaches\(id\) ON DELETE CASCADE/.test(table), 'recipient → coaches ON DELETE CASCADE');
assert(/student_id\s+UUID NOT NULL REFERENCES students\(id\) ON DELETE CASCADE/.test(table), 'student → students ON DELETE CASCADE');
assert(/kind\s+TEXT NOT NULL DEFAULT 'new_student'/.test(table), "kind default 'new_student'");
assert(/CHECK \(kind IN \('new_student', 'reactivated', 'frozen'\)\)/.test(table), "kind CHECK (new_student, reactivated, frozen)");
const kindChecks = [...CODE.matchAll(/CHECK \(kind IN \(([^)]*)\)\)/g)].map((m) => m[1]);
assert(kindChecks.length === 2 && kindChecks.every((k) => k === "'new_student', 'reactivated', 'frozen'"),
    'every kind CHECK (table + re-assert) lists exactly the 3 kinds');
assert(!/'left'/.test(kindChecks.join()) && !/kind 'left'/.test(SQL), "no 'left' notification kind");
assert(/ALTER TABLE coach_notifications DROP CONSTRAINT IF EXISTS coach_notifications_kind_check;/.test(CODE),
    'kind CHECK re-asserted idempotently');
assert(/kind 'frozen'/.test(SQL), 'header documents the frozen kind');
assert(/previous_status\s+TEXT,/.test(table), 'previous_status TEXT nullable');
assert(/status_history_id\s+UUID NOT NULL REFERENCES student_status_history\(id\) ON DELETE CASCADE/.test(table),
    'status_history_id → student_status_history ON DELETE CASCADE, NOT NULL');
assert(/source\s+TEXT NOT NULL DEFAULT 'amocrm'/.test(table), "source default 'amocrm'");
assert(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/.test(table), 'created_at default now()');
assert(/read_at\s+TIMESTAMPTZ,/.test(table), 'read_at nullable');
for (const col of ['student_name', 'student_code', 'assigned_coach_id', 'assigned_coach_name', 'branch_id', 'branch_name']) {
    assert(new RegExp(`\\b${col}\\s+(TEXT|UUID)\\b`).test(table), `snapshot column ${col}`);
}
assert(/CONSTRAINT coach_notifications_recipient_event_key\s+UNIQUE \(recipient_coach_id, status_history_id\)/.test(table),
    'unique (recipient_coach_id, status_history_id)');
assert(!/UNIQUE \(recipient_coach_id, student_id, kind\)/.test(CODE) && !/recipient_student_kind_key/.test(CODE),
    'old unique (recipient_coach_id, student_id, kind) gone');
assert(/CREATE INDEX IF NOT EXISTS coach_notifications_inbox_idx\s+ON coach_notifications \(recipient_coach_id, read_at, created_at DESC\)/.test(CODE),
    'inbox index (recipient_coach_id, read_at, created_at desc)');

console.log('\nRLS + grants');
assert(/ALTER TABLE coach_notifications ENABLE ROW LEVEL SECURITY;/.test(CODE), 'RLS enabled');
assert(/REVOKE ALL ON coach_notifications FROM PUBLIC, anon, authenticated;/.test(CODE), 'all table privileges revoked from clients');
assert(/GRANT SELECT ON coach_notifications TO authenticated;/.test(CODE), 'authenticated may SELECT');
assert(!/GRANT[^;]*\b(INSERT|UPDATE|DELETE|ALL)\b[^;]*ON coach_notifications/i.test(CODE), 'no INSERT / UPDATE / DELETE grant');
const policies = [...CODE.matchAll(/CREATE POLICY (\w+)\s+ON coach_notifications FOR (\w+) TO (\w+)\s+USING \(([^;]*)\);/g)];
assert(policies.length === 2, `exactly two policies (${policies.length})`);
assert(policies.every((p) => p[2] === 'SELECT' && p[3] === 'authenticated'), 'both policies are SELECT for authenticated');
assert(!/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i.test(CODE), 'no client INSERT / UPDATE / DELETE policy');
const own = policies.find((p) => p[1] === 'coach_notifications_select_own');
assert(own && /recipient_coach_id IN \(SELECT coach_notifications_my_coach_ids\(\)\)/.test(own[4]), 'own rows via coach email helper');
const admin = policies.find((p) => p[1] === 'coach_notifications_select_admin');
assert(admin && /coach_notifications_is_admin\(\)/.test(admin[4]), 'admins see all');
for (const p of policies) {
    assert(new RegExp(`DROP POLICY IF EXISTS ${p[1]} ON coach_notifications;`).test(CODE), `${p[1]} dropped first (idempotent)`);
}

console.log('\nHelpers');
const mine = fnBody('coach_notifications_my_coach_ids');
assert(mine && /SECURITY DEFINER/.test(mine.header) && /SET search_path = public/.test(mine.header), 'my_coach_ids: SECURITY DEFINER + search_path');
assert(mine && /lower\(c\.email\) = lower\(auth\.email\(\)\)/.test(mine.body), 'my_coach_ids: case-insensitive coaches.email = auth.email()');
const isAdmin = fnBody('coach_notifications_is_admin');
assert(isAdmin && /SECURITY DEFINER/.test(isAdmin.header), 'is_admin: SECURITY DEFINER');
assert(isAdmin && /ur\.user_id = auth\.uid\(\) AND ur\.role = 'admin'/.test(isAdmin.body), "is_admin: user_roles.role = 'admin'");

console.log('\nmark_coach_notifications_read RPC');
const rpc = fnBody('mark_coach_notifications_read');
assert(rpc && /ids UUID\[\] DEFAULT NULL/.test(rpc.args), 'ids uuid[] default null');
assert(rpc && /RETURNS INTEGER/.test(rpc.header) && /SECURITY DEFINER/.test(rpc.header) && /SET search_path = public/.test(rpc.header),
    'returns count, SECURITY DEFINER, search_path');
assert(rpc && /SET read_at = now\(\)/.test(rpc.body) && !/SET[^;]*,/.test(rpc.body.match(/SET read_at[^\n]*/)[0]), 'only read_at is written');
assert(rpc && /recipient_coach_id IN \(SELECT coach_notifications_my_coach_ids\(\)\)/.test(rpc.body), "only the caller's rows");
assert(rpc && /\(ids IS NULL OR cn\.id = ANY \(ids\)\)/.test(rpc.body), 'null ids = all mine');
assert(rpc && /cn\.read_at IS NULL/.test(rpc.body), 'already-read rows untouched');
assert(/REVOKE ALL ON FUNCTION mark_coach_notifications_read\(UUID\[\]\) FROM PUBLIC, anon;/.test(CODE), 'rpc not callable by anon');
assert(/GRANT EXECUTE ON FUNCTION mark_coach_notifications_read\(UUID\[\]\) TO authenticated;/.test(CODE), 'rpc granted to authenticated');
assert(!/\bINSERT\s+INTO\b/i.test(CODE) && !/\bDELETE\s+FROM\b/i.test(CODE), 'migration itself writes no rows');

console.log('\nVerify script');
assert(/READ-ONLY/.test(VERIFY), 'verify header says read-only');
assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(VCODE.replace(/'[^']*'/g, "''")), 'verify script is SELECT-only (outside string literals)');
for (const c of ['rls enabled', 'unique (recipient_coach_id, status_history_id)',
    'old unique (recipient_coach_id, student_id, kind) gone', 'kind check (new_student, reactivated, frozen; no left)',
    'event columns (previous_status, status_history_id NOT NULL)', 'only SELECT policies (2)', 'no write grants for anon / authenticated', 'security definer helpers']) {
    assert(VERIFY.includes(`'${c}'`), `verify checks ${c}`);
}
assert(/LIKE '%''frozen''%'/.test(VERIFY) && /NOT LIKE '%''left''%'/.test(VERIFY), "verify: CHECK has 'frozen', not 'left'");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
