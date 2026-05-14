/**
 * Coach Performance KPI dashboard — Phase 1 migrations contract test.
 * Run: node tests/test-coach-kpi-migrations.js
 *
 * Verifies that migrations 036 / 037 / 038 exist, contain the expected
 * tables/columns/triggers/policies and stay roughly syntactically sound.
 * These tests are intentionally content-based: there is no local Postgres
 * to actually execute the SQL, so we lock the schema intent at the source
 * level so accidental edits don't drift away from what the edge function
 * + dashboard expect.
 */

const fs = require('fs');
const path = require('path');

const MIG_DIR = path.join(__dirname, '..', 'migrations');
const M036 = fs.readFileSync(path.join(MIG_DIR, '036_razryad_history.sql'), 'utf8');
const M037 = fs.readFileSync(path.join(MIG_DIR, '037_tournament_type.sql'), 'utf8');
const M038 = fs.readFileSync(path.join(MIG_DIR, '038_student_league_events.sql'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function assertParens(sql, label) {
    let depth = 0;
    let inDollar = false;
    for (let i = 0; i < sql.length; i++) {
        if (!inDollar && sql.startsWith('$$', i)) { inDollar = true; i++; continue; }
        if (inDollar && sql.startsWith('$$', i)) { inDollar = false; i++; continue; }
        if (inDollar) continue;
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') depth--;
        if (depth < 0) { assert(false, `${label}: unbalanced parens — closing ')' without match at offset ${i}`); return; }
    }
    assert(depth === 0, `${label}: balanced parens (depth=${depth})`);
}

function assertNoTrailingCommaInCreateTable(sql, label) {
    // Catch silly drift: a CREATE TABLE column list ending with `, )`.
    const matches = sql.match(/CREATE TABLE[^(]*\([\s\S]*?\)\s*;/g) || [];
    let ok = true;
    for (const block of matches) {
        if (/,\s*\)\s*;/.test(block)) { ok = false; break; }
    }
    assert(ok, `${label}: no trailing comma before ')' in CREATE TABLE`);
}

console.log('\n=== file presence + basic shape =========================================\n');
assert(M036.length > 0, '036_razryad_history.sql exists and is non-empty');
assert(M037.length > 0, '037_tournament_type.sql exists and is non-empty');
assert(M038.length > 0, '038_student_league_events.sql exists and is non-empty');

// Adjacent latest-tournament-migration must not be touched.
const tournamentMig = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '035_tournaments.sql'), 'utf8');
assert(tournamentMig.includes('CREATE TABLE IF NOT EXISTS tournaments'),
       '035_tournaments.sql still exists (untouched)');

console.log('\n=== 036 razryad_history =================================================\n');
assertParens(M036, '036');
assertNoTrailingCommaInCreateTable(M036, '036');
assert(/CREATE TABLE IF NOT EXISTS razryad_history/.test(M036), '036: creates razryad_history table');
assert(/student_id\s+UUID NOT NULL REFERENCES students\(id\) ON DELETE CASCADE/.test(M036),
       '036: student_id FK with CASCADE');
assert(/old_razryad\s+TEXT/.test(M036), '036: old_razryad column present');
assert(/new_razryad\s+TEXT/.test(M036), '036: new_razryad column present');
assert(/changed_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/.test(M036), '036: changed_at default NOW()');
assert(/changed_by\s+UUID REFERENCES auth\.users\(id\)/.test(M036), '036: changed_by FK to auth.users');
assert(/source\s+TEXT NOT NULL DEFAULT 'trigger'/.test(M036), "036: source NOT NULL default 'trigger'");
assert(/CHECK \(source IN \('trigger', 'manual', 'import'\)\)/.test(M036),
       '036: source CHECK constraint trigger/manual/import');
assert(/notes\s+TEXT/.test(M036), '036: notes column present');
assert(/CREATE INDEX IF NOT EXISTS idx_razryad_history_student_changed ON razryad_history\(student_id, changed_at DESC\)/.test(M036),
       '036: composite index on (student_id, changed_at DESC)');
assert(/CREATE INDEX IF NOT EXISTS idx_razryad_history_changed_at ON razryad_history\(changed_at DESC\)/.test(M036),
       '036: secondary index on (changed_at DESC)');

assert(/CREATE OR REPLACE FUNCTION log_razryad_change/.test(M036), '036: trigger function defined');
assert(/OLD\.razryad IS DISTINCT FROM NEW\.razryad/.test(M036),
       '036: trigger only fires when razryad actually changes');
assert(/auth\.uid\(\)/.test(M036), '036: trigger captures auth.uid()');
assert(/AFTER UPDATE OF razryad ON students/.test(M036), '036: trigger AFTER UPDATE on students');
assert(/EXECUTE FUNCTION log_razryad_change/.test(M036), '036: trigger calls log_razryad_change');

assert(/ALTER TABLE razryad_history ENABLE ROW LEVEL SECURITY/.test(M036), '036: RLS enabled');
assert(/CREATE POLICY "Admins manage razryad_history"[\s\S]*FOR ALL/.test(M036), '036: admins FOR ALL policy');
assert(/CREATE POLICY "Coaches read razryad_history for their students"[\s\S]*FOR SELECT/.test(M036),
       '036: coach SELECT policy');
assert(/ur\.coach_id = s\.coach_id[\s\S]*ur\.role = 'coach'/.test(M036),
       '036: coach policy joins user_roles to students via coach_id and gates on role=coach');

// Sanity: must NOT contain backfill (e.g. INSERT INTO razryad_history SELECT ... FROM students)
assert(!/INSERT INTO razryad_history\s+SELECT/i.test(M036),
       '036: no SELECT-based backfill (going-forward-only)');

console.log('\n=== 037 tournament_type =================================================\n');
assertParens(M037, '037');
assert(/CREATE TYPE tournament_type AS ENUM \('regular', 'qualification', 'team', 'other'\)/.test(M037),
       '037: enum with 4 values (regular/qualification/team/other)');
assert(/IF NOT EXISTS \(SELECT 1 FROM pg_type WHERE typname = 'tournament_type'\)/.test(M037),
       '037: idempotent enum creation (DO $$ ... IF NOT EXISTS pg_type ...)');
assert(/ALTER TABLE tournaments\s+ADD COLUMN IF NOT EXISTS tournament_type tournament_type NOT NULL DEFAULT 'regular'/.test(M037),
       '037: tournaments.tournament_type column NOT NULL default regular');
assert(/COMMENT ON COLUMN tournaments\.tournament_type/.test(M037),
       '037: column has explanatory COMMENT for future devs');
assert(/CREATE INDEX IF NOT EXISTS idx_tournaments_type ON tournaments\(tournament_type\)/.test(M037),
       '037: index on tournament_type');

console.log('\n=== 038 student_league_events ==========================================\n');
assertParens(M038, '038');
assertNoTrailingCommaInCreateTable(M038, '038');
assert(/CREATE OR REPLACE FUNCTION calc_league_from_rating\(p_rating INTEGER\)\s+RETURNS TEXT/.test(M038),
       '038: helper calc_league_from_rating(int) returns text');
assert(/IF p_rating > 800 THEN RETURN 'A'/.test(M038), '038: helper >800 → A');
assert(/IF p_rating >= 450 THEN RETURN 'B'/.test(M038), '038: helper >=450 → B');
assert(/RETURN 'C'/.test(M038), '038: helper else C');

assert(/CREATE TABLE IF NOT EXISTS student_league_events/.test(M038),
       '038: creates student_league_events table');
assert(/event_type\s+TEXT NOT NULL CHECK \(event_type IN \('promotion', 'demotion'\)\)/.test(M038),
       '038: event_type CHECK promotion/demotion');
assert(/from_league\s+TEXT NOT NULL CHECK \(from_league IN \('A', 'B', 'C'\)\)/.test(M038),
       '038: from_league CHECK A/B/C');
assert(/to_league\s+TEXT NOT NULL CHECK \(to_league IN \('A', 'B', 'C'\)\)/.test(M038),
       '038: to_league CHECK A/B/C');
assert(/rating_at_event\s+INTEGER/.test(M038), '038: rating_at_event column present');
assert(/tournament_id\s+UUID REFERENCES tournaments\(id\) ON DELETE SET NULL/.test(M038),
       '038: tournament_id FK (nullable, ON DELETE SET NULL)');
assert(/occurred_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/.test(M038), '038: occurred_at default NOW()');
assert(/CREATE INDEX IF NOT EXISTS idx_sle_student_occurred ON student_league_events\(student_id, occurred_at DESC\)/.test(M038),
       '038: composite index (student_id, occurred_at DESC)');
assert(/CREATE INDEX IF NOT EXISTS idx_sle_occurred ON student_league_events\(occurred_at DESC\)/.test(M038),
       '038: secondary index (occurred_at DESC)');

assert(/CREATE OR REPLACE FUNCTION log_student_league_event/.test(M038), '038: trigger function');
assert(/AFTER INSERT ON student_ratings/.test(M038), '038: trigger AFTER INSERT on student_ratings');
assert(/EXECUTE FUNCTION log_student_league_event/.test(M038), '038: trigger calls log_student_league_event');
assert(/calc_league_from_rating\(NEW\.rating\)/.test(M038),
       '038: trigger calls helper for new league');
assert(/event_type.*'promotion'/.test(M038), '038: trigger writes promotion events');
assert(/event_type.*'demotion'/i.test(M038) || /v_event_type := 'demotion'/.test(M038),
       '038: trigger writes demotion events');

assert(/ALTER TABLE student_league_events ENABLE ROW LEVEL SECURITY/.test(M038), '038: RLS enabled');
assert(/CREATE POLICY "Admins manage student_league_events"[\s\S]*FOR ALL/.test(M038),
       '038: admins FOR ALL policy');
assert(/CREATE POLICY "Coaches read student_league_events for their students"[\s\S]*FOR SELECT/.test(M038),
       '038: coach SELECT policy');

// Sanity: must NOT contain historical backfill.
assert(!/INSERT INTO student_league_events\s+SELECT/i.test(M038),
       '038: no SELECT-based historical backfill (going-forward-only)');

console.log('\n' + '='.repeat(64));
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(64));
process.exit(failed === 0 ? 0 : 1);
