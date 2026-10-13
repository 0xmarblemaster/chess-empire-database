/**
 * Static-analysis tests for Puzzle Rush rankings P1.
 *
 *  (a) supabase/migrations/093_puzzle_rush_rankings.sql — source/external_ref
 *      columns, unique external_ref index, windowed index, Asia/Almaty windows,
 *      RANK() competition ranking, SECURITY DEFINER + search_path, grants.
 *  (b) analytics-leaderboards action=survival — calls the RPC instead of an
 *      unbounded .from('survival_scores') select (1000-row cap bug), honours
 *      branch_id, keeps the legacy response shape.
 *  (c) students-api survival-score / survival-best / survival-leaderboard.
 *
 * Run: node tests/test-puzzle-rush-rankings.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const MIG = read('supabase', 'migrations', '093_puzzle_rush_rankings.sql')
  .replace(/--[^\n]*/g, '');
const LB = read('supabase', 'functions', 'analytics-leaderboards', 'index.ts')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const API = read('supabase', 'functions', 'students-api', 'index.ts');
const README = read('README-API.md');

// ---------------------------------------------------------------------------
console.log('\n=== (a) migration 093\n');

assert(/ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'coach'\s*\n?\s*CHECK \(source IN \('coach', 'chesster'\)\)/.test(MIG),
  "survival_scores.source TEXT NOT NULL DEFAULT 'coach' CHECK (coach|chesster)");
assert(/ADD COLUMN IF NOT EXISTS external_ref TEXT NULL/.test(MIG), 'survival_scores.external_ref TEXT NULL');
assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_survival_scores_external_ref\s+ON survival_scores\(external_ref\)\s+WHERE external_ref IS NOT NULL/.test(MIG),
  'partial UNIQUE index on external_ref WHERE NOT NULL');
assert(/CREATE INDEX IF NOT EXISTS \w+\s+ON survival_scores\(student_id, achieved_at\)/.test(MIG),
  'index on (student_id, achieved_at)');

assert(/date_trunc\('week',\s*now\(\) AT TIME ZONE 'Asia\/Almaty'\) AT TIME ZONE 'Asia\/Almaty'/.test(MIG),
  'week window = date_trunc(week) in Asia/Almaty, converted back to timestamptz');
assert(/date_trunc\('month',\s*now\(\) AT TIME ZONE 'Asia\/Almaty'\) AT TIME ZONE 'Asia\/Almaty'/.test(MIG),
  'month window = date_trunc(month) in Asia/Almaty, converted back to timestamptz');

const lbStart = MIG.indexOf('CREATE OR REPLACE FUNCTION get_puzzle_rush_leaderboard(');
assert(lbStart >= 0, 'defines get_puzzle_rush_leaderboard');
const lbFn = MIG.slice(lbStart, MIG.indexOf('$$;', MIG.indexOf('AS $$', lbStart)));
assert(/p_scope TEXT,\s*p_period TEXT,\s*p_branch_id UUID DEFAULT NULL,\s*p_student_id UUID DEFAULT NULL,\s*p_limit INT DEFAULT 50/.test(lbFn),
  'signature (p_scope, p_period, p_branch_id uuid, p_student_id uuid, p_limit int=50)');
assert(/RANK\(\) OVER \(ORDER BY b\.score DESC\)/.test(lbFn), 'competition ranking via RANK() OVER (ORDER BY score DESC)');
assert(/DISTINCT ON \(ss\.student_id\)[\s\S]*ORDER BY ss\.student_id, ss\.score DESC, ss\.achieved_at ASC/.test(lbFn),
  'best per student, tie-break earliest achieved_at');
assert(/ss\.mode = 'puzzle_rush'/.test(lbFn), "only mode='puzzle_rush'");
assert(/s\.status = 'active'/.test(lbFn), 'only active students');
assert(/ss\.achieved_at >= v_start/.test(lbFn) && /puzzle_rush_window_start\(p_period\)/.test(lbFn),
  'filters achieved_at >= Almaty window start');
assert(/p_scope = 'branch' AND p_branch_id IS NULL THEN\s*RAISE EXCEPTION/.test(lbFn), 'branch scope without branch id raises');
assert(/NOT IN \('school', 'branch'\)[\s\S]*RAISE EXCEPTION/.test(lbFn), 'invalid scope raises');
assert(/NOT IN \('week', 'month', 'all'\)[\s\S]*RAISE EXCEPTION/.test(lbFn), 'invalid period raises');
['rank', 'student_id', 'first_name', 'last_name', 'branch_id', 'branch_name', 'best_score', 'achieved_at', 'source', 'total_count', 'is_self']
  .forEach((c) => assert(new RegExp(`\\b${c}\\b`).test(lbFn.slice(0, lbFn.indexOf('LANGUAGE'))), `returns column ${c}`));
assert(/r\.pos <= [\s\S]*OR \(p_student_id IS NOT NULL AND r\.student_id = p_student_id\)/.test(lbFn),
  'top N plus the p_student_id row when outside');

const bestStart = MIG.indexOf('CREATE OR REPLACE FUNCTION get_student_puzzle_rush_best(p_student_id UUID)');
assert(bestStart >= 0, 'defines get_student_puzzle_rush_best(p_student_id uuid)');
const bestFn = MIG.slice(bestStart, MIG.indexOf('$$;', bestStart));
assert(/week_best INT,\s*month_best INT,\s*all_best INT/.test(bestFn), 'returns week_best, month_best, all_best');
assert(/puzzle_rush_window_start\('week'\)/.test(bestFn) && /puzzle_rush_window_start\('month'\)/.test(bestFn),
  'bests use the shared Almaty windows');

[lbFn, bestFn].forEach((fn, i) => {
  const name = i ? 'get_student_puzzle_rush_best' : 'get_puzzle_rush_leaderboard';
  assert(/SECURITY DEFINER/.test(fn), `${name} is SECURITY DEFINER`);
  assert(/SET search_path = public/.test(fn), `${name} pins search_path = public`);
  assert(/\bSTABLE\b/.test(fn), `${name} is STABLE`);
});
assert(/GRANT EXECUTE ON FUNCTION get_puzzle_rush_leaderboard\(TEXT, TEXT, UUID, UUID, INT\) TO anon, authenticated, service_role/.test(MIG),
  'leaderboard EXECUTE granted to anon, authenticated, service_role');
assert(/GRANT EXECUTE ON FUNCTION get_student_puzzle_rush_best\(UUID\) TO anon, authenticated, service_role/.test(MIG),
  'bests EXECUTE granted to anon, authenticated, service_role');
assert(/BEGIN;[\s\S]*COMMIT;/.test(MIG), 'wrapped in a transaction');
assert(!/\b(UPDATE|DELETE FROM)\s+survival_scores\b/i.test(MIG), 'does not modify existing survival_scores rows');
assert(!/CREATE (TABLE|FUNCTION|INDEX) (?!IF NOT EXISTS|OR REPLACE)/.test(MIG.replace(/CREATE UNIQUE INDEX/g, 'CREATE INDEX')),
  'idempotent: every CREATE uses IF NOT EXISTS / OR REPLACE');

// ---------------------------------------------------------------------------
console.log('\n=== (b) analytics-leaderboards action=survival\n');

const svStart = LB.indexOf("if (action === 'survival')");
const svBlock = LB.slice(svStart, LB.indexOf("if (action === 'bot_battles')"));
assert(svStart >= 0, 'survival action still routed');
assert(!/from\('survival_scores'\)/.test(LB), "no raw .from('survival_scores') select (1000-row cap removed)");
assert(/rpc\('get_puzzle_rush_leaderboard'/.test(svBlock), 'calls get_puzzle_rush_leaderboard RPC');
assert(/branch_id: p\('branch_id'\)/.test(svBlock) && /p_branch_id: q\.branch_id/.test(svBlock), 'branch_id param is honoured');
assert(/parseLeaderboardParams\([\s\S]*, 20\)/.test(svBlock), 'shared param parsing, legacy default limit 20');
assert(/rank:[\s\S]*student_id:[\s\S]*score: r\.best_score[\s\S]*mode: 'puzzle_rush'[\s\S]*student: \{ first_name: r\.first_name, last_name: r\.last_name, branch_id: r\.branch_id \}/.test(svBlock),
  'keeps legacy shape rank/student_id/score/mode/student{first_name,last_name,branch_id}');
assert(/branch_name:[\s\S]*achieved_at:[\s\S]*source:[\s\S]*is_self:/.test(svBlock), 'adds new fields');
assert(/total_count/.test(svBlock), 'returns total_count');

// ---------------------------------------------------------------------------
console.log('\n=== (c) students-api survival actions\n');

['survival-score', 'survival-best', 'survival-leaderboard'].forEach((a) =>
  assert(new RegExp(`'/\\?action=${a}'`).test(API), `OpenAPI documents action=${a}`));
assert(/method === 'POST' && action === 'survival-score'/.test(API), 'survival-score is POST');
assert(/method === 'GET' && action === 'survival-best'/.test(API), 'survival-best is GET');
assert(/method === 'GET' && action === 'survival-leaderboard'/.test(API), 'survival-leaderboard is GET');

const push = API.slice(API.indexOf('async function pushSurvivalScore'), API.indexOf('async function getSurvivalBest'));
assert(/validateSurvivalPush\(body\)/.test(push), 'push validates via pure validateSurvivalPush');
assert(/err\('not_found', 404\)/.test(push), 'unknown student → 404');
assert(/status !== 'active'\) return err\('student_inactive', 409\)/.test(push), 'inactive student → 409');
assert(/mode: 'puzzle_rush'/.test(push) && /source: 'chesster'/.test(push) && /notes: SURVIVAL_NOTES/.test(push),
  "inserts mode='puzzle_rush', source='chesster', Chesster notes");
assert(/SURVIVAL_NOTES = 'Chesster Puzzle Rush \(survival\)'/.test(API), 'notes text');
assert(/findByExternalRef\(ctx, push\.external_ref\)[\s\S]*ok\(\{ duplicate: true, id: existingId \}\)/.test(push),
  'existing external_ref → 200 {duplicate:true, id} without insert');
assert(/iErr\.code === '23505'[\s\S]*duplicate: true/.test(push), 'unique-violation race also returns duplicate');
assert(/ok\(\{ id: inserted\.id, best: await survivalBest/.test(push), 'returns {ok, id, best}');
assert(/rpc\('get_student_puzzle_rush_best'/.test(API), 'bests via get_student_puzzle_rush_best RPC');
assert(/week: row\.week_best[\s\S]*month: row\.month_best[\s\S]*all: row\.all_best/.test(API), 'best shaped {week, month, all}');
assert(/rpc\('get_puzzle_rush_leaderboard'/.test(API) && /parseLeaderboardParams\(/.test(API),
  'leaderboard validates params then calls the RPC');
assert(!/\bfunction isUuid\b/.test(API), 'isUuid comes from students-logic (no duplicate)');

// ---------------------------------------------------------------------------
console.log('\n=== (d) README-API.md\n');
['survival-score', 'survival-best', 'survival-leaderboard'].forEach((a) =>
  assert(README.includes(`\`${a}\``), `README documents ${a}`));
assert(/external_ref/.test(README) && /duplicate/.test(README), 'README documents the idempotency rule');
assert(/Asia\/Almaty/.test(README), 'README documents Almaty windows');
assert(/093_puzzle_rush_rankings\.sql/.test(README), 'README references migration 093');

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
