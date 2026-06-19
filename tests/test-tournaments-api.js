/**
 * Tests for the public Tournament Registration API (migration 044 + the
 * tournaments-api edge function + the vercel rewrite).
 *
 * Strategy follows test-analytics-tournaments.js:
 *   1. Source-contract regex checks across the TS edge function + the SQL
 *      migration (catches accidental drift; runs in plain Node).
 *   2. A JS port of the register_for_tournament RPC body + a JS port of the
 *      edge-function routing/handlers, both exercised against an in-memory
 *      mock Supabase client. The JS ports mirror the production behavior
 *      and let us assert response shapes end-to-end.
 *
 * Run: node tests/test-tournaments-api.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 1. Migration 044 — source contract
// ============================================================================
console.log('\n=== migration 044_tournament_api.sql =================================\n');

const MIG_PATH = path.join(ROOT, 'migrations/044_tournament_api.sql');
assert(fs.existsSync(MIG_PATH), 'migrations/044_tournament_api.sql exists');
const MIG = fs.readFileSync(MIG_PATH, 'utf8');

assert(/ALTER COLUMN student_id DROP NOT NULL/.test(MIG),
    'drops NOT NULL on tournament_registrations.student_id');
assert(/ADD COLUMN IF NOT EXISTS player_name/.test(MIG),
    'adds player_name TEXT column');
assert(/ADD COLUMN IF NOT EXISTS source/.test(MIG),
    'adds source TEXT column');
assert(/ADD COLUMN IF NOT EXISTS external_contact/.test(MIG),
    'adds external_contact TEXT column');
assert(/CHECK \(source IN \('web','telegram','whatsapp','online','admin'\)\)/.test(MIG),
    'source whitelist matches the API enum');
assert(/reg_identity_chk/.test(MIG),
    'identity check constraint (reg_identity_chk) defined');
assert(/student_id IS NOT NULL OR player_name IS NOT NULL/.test(MIG),
    'reg_identity_chk requires at least one of student_id / player_name');
assert(/DROP FUNCTION IF EXISTS register_for_tournament\(UUID, UUID\)/.test(MIG),
    'drops the legacy 2-arg register_for_tournament so PostgREST has one overload');
assert(/CREATE OR REPLACE FUNCTION register_for_tournament/.test(MIG),
    'creates the new register_for_tournament');
assert(/p_player_name\s+TEXT DEFAULT NULL/.test(MIG),
    'new RPC accepts p_player_name with DEFAULT NULL');
assert(/p_source\s+TEXT DEFAULT 'web'/.test(MIG),
    "new RPC accepts p_source with DEFAULT 'web'");
assert(/p_external_contact\s+TEXT DEFAULT NULL/.test(MIG),
    'new RPC accepts p_external_contact with DEFAULT NULL');
assert(/FOR UPDATE/.test(MIG),
    'new RPC still holds the FOR UPDATE row lock');
assert(/jsonb_build_object\('ok', false, 'reason', 'invalid_input'\)/.test(MIG),
    'new RPC returns invalid_input when both identities are missing');
assert(/jsonb_build_object\('ok', false, 'reason', 'duplicate'\)/.test(MIG),
    'new RPC returns duplicate for repeat student registration');
assert(/'reason', 'full'/.test(MIG),
    'new RPC returns full when capacity is reached');
assert(/GRANT EXECUTE ON FUNCTION[\s\S]+?register_for_tournament\(UUID, UUID, TEXT, TEXT, TEXT\)[\s\S]+?TO anon, authenticated, service_role/.test(MIG),
    'new RPC granted to anon, authenticated, service_role');

// ============================================================================
// 1b. Migration 049 — league eligibility check (source contract)
// ============================================================================
console.log('\n=== migration 049_tournament_eligibility_check.sql ====================\n');

const MIG_049_PATH = path.join(ROOT, 'migrations/049_tournament_eligibility_check.sql');
assert(fs.existsSync(MIG_049_PATH), 'migrations/049_tournament_eligibility_check.sql exists');
const MIG_049 = fs.readFileSync(MIG_049_PATH, 'utf8');

assert(/CREATE OR REPLACE FUNCTION register_for_tournament/.test(MIG_049),
    '049 re-creates register_for_tournament (single source of truth)');
assert(/calc_league_from_rating/.test(MIG_049),
    '049 calls calc_league_from_rating to derive the student league');
assert(/student_current_ratings/.test(MIG_049),
    '049 reads student rating from student_current_ratings view');
assert(/'reason',\s*'ineligible'/.test(MIG_049),
    "049 returns reason='ineligible' when student league differs from tournament league");
assert(/'student_rating'/.test(MIG_049),
    '049 surfaces student_rating in the ineligible response');
assert(/'student_league'/.test(MIG_049),
    '049 surfaces student_league in the ineligible response');
assert(/'tournament_league'/.test(MIG_049),
    '049 surfaces tournament_league in the ineligible response');
assert(/p_student_id IS NOT NULL/.test(MIG_049),
    '049 only enforces the rating check when p_student_id is set (walk-ins bypass)');
assert(/v_tournament_league IS NOT NULL/.test(MIG_049),
    '049 skips the check when the tournament has no league tag');
assert(/COALESCE\(v_student_rating,\s*0\)/.test(MIG_049),
    '049 treats NULL rating as 0 (forces League C bucket)');
assert(/GRANT EXECUTE ON FUNCTION[\s\S]+?register_for_tournament\(UUID, UUID, TEXT, TEXT, TEXT\)[\s\S]+?TO anon, authenticated, service_role/.test(MIG_049),
    '049 re-grants execute to anon, authenticated, service_role');

// ============================================================================
// 2. Edge function — source contract
// ============================================================================
console.log('\n=== supabase/functions/tournaments-api/index.ts ======================\n');

const FN_PATH = path.join(ROOT, 'supabase/functions/tournaments-api/index.ts');
assert(fs.existsSync(FN_PATH), 'edge function file exists');
const FN = fs.readFileSync(FN_PATH, 'utf8');

assert(/import\s+\{\s*serve\s*\}\s+from\s+"https:\/\/deno\.land\/std/.test(FN),
    'imports Deno serve');
assert(/createClient/.test(FN), 'imports supabase createClient');
assert(/CHESS_EMPIRE_API_KEY/.test(FN), 'reads CHESS_EMPIRE_API_KEY env var');
assert(/SUPABASE_SERVICE_ROLE_KEY/.test(FN), 'reads SUPABASE_SERVICE_ROLE_KEY env var');
assert(/Access-Control-Allow-Origin/.test(FN), 'sets CORS allow-origin');
assert(/Access-Control-Allow-Methods/.test(FN), 'sets CORS allow-methods');
assert(/x-api-key/.test(FN), 'CORS allows x-api-key header');
assert(/x-source/.test(FN), 'CORS allows x-source header');
assert(/OPTIONS/.test(FN), 'handles OPTIONS preflight');

const REASONS_ENUM = ['unauthorized', 'not_found', 'closed', 'full', 'duplicate', 'ineligible', 'invalid_input', 'server_error'];
for (const r of REASONS_ENUM) {
    assert(new RegExp(`'${r}'`).test(FN), `reason enum includes '${r}'`);
}
assert(/reason === 'ineligible'\s*\?\s*409/.test(FN),
    "edge function maps reason='ineligible' to HTTP 409");

assert(/'\/branches'/.test(FN), 'routes /branches');
assert(/'\/tournaments'/.test(FN), 'routes /tournaments');
assert(/'\/tournaments\/:id'/.test(FN), 'routes /tournaments/:id');
assert(/'\/tournaments\/:id\/registrations'/.test(FN), 'routes /tournaments/:id/registrations');
assert(/'\/tournaments\/:id\/register'/.test(FN), 'routes POST /tournaments/:id/register');
assert(/'\/registrations\/:registration_id'/.test(FN), 'routes DELETE /registrations/:registration_id');
assert(/'\/students\/search'/.test(FN), 'routes /students/search');
assert(/'\/openapi\.json'/.test(FN), 'routes /openapi.json');

assert(/НИШ/.test(FN), 'branches filter excludes НИШ');
assert(/zhandosova/i.test(FN), 'branches filter excludes zhandosova');
assert(/rpc\('register_for_tournament'/.test(FN),
    'register handler calls the register_for_tournament RPC');
// external_contact must NEVER appear in any roster select string.
const rosterSelectRe = /from\('tournament_registrations'\)\s*\.select\(([^)]+)\)/g;
let rosterMatch;
let rosterChecked = false;
while ((rosterMatch = rosterSelectRe.exec(FN)) !== null) {
    rosterChecked = true;
    assert(!/external_contact/.test(rosterMatch[1]),
        `select on tournament_registrations does NOT include external_contact (${rosterMatch[1].slice(0, 60)}…)`);
}
assert(rosterChecked, 'edge function reads tournament_registrations at least once');

// ============================================================================
// 3. vercel.json — rewrite present
// ============================================================================
console.log('\n=== vercel.json rewrite ==============================================\n');

const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const hasRewrite = (VERCEL.rewrites || []).some(r =>
    r.source === '/api/tournaments-api/:path*' &&
    r.destination === 'https://papgcizhfkngubwofjuo.supabase.co/functions/v1/tournaments-api/:path*'
);
assert(hasRewrite, 'vercel.json proxies /api/tournaments-api/* to the supabase edge function');

const existingRewrites = (VERCEL.rewrites || []).filter(r => r.source === '/admin' || r.source === '/admin.html');
assertEqual(existingRewrites.length, 2,
    'existing /admin rewrites preserved (no clobber)');

// ============================================================================
// 4. README-API.md — mentions the new endpoints
// ============================================================================
console.log('\n=== README-API.md docs ===============================================\n');

const README = fs.readFileSync(path.join(ROOT, 'README-API.md'), 'utf8');
assert(/tournaments-api/i.test(README), 'README documents tournaments-api');
assert(/\/branches/.test(README), 'README mentions /branches route');
assert(/\/students\/search/.test(README), 'README mentions /students/search route');
assert(/\/register/.test(README), 'README mentions register route');
assert(/openapi/i.test(README), 'README mentions OpenAPI');

// ============================================================================
// 5. Deploy script
// ============================================================================
console.log('\n=== scripts/deploy-tournaments-api.sh =================================\n');

const DEPLOY = path.join(ROOT, 'scripts/deploy-tournaments-api.sh');
assert(fs.existsSync(DEPLOY), 'scripts/deploy-tournaments-api.sh exists');
const DEPLOY_SRC = fs.readFileSync(DEPLOY, 'utf8');
assert(/supabase functions deploy tournaments-api/.test(DEPLOY_SRC),
    'deploy script invokes supabase functions deploy tournaments-api');
const stat = fs.statSync(DEPLOY);
assert((stat.mode & 0o111) !== 0, 'deploy script is executable (chmod +x)');

// ============================================================================
// 6. JS port of register_for_tournament — behavior
// ============================================================================
console.log('\n=== register_for_tournament logic (in-memory simulation) =============\n');

function makeStore() {
    const tournaments = new Map();      // id -> { capacity, status, name, league, ... }
    const registrations = [];           // { id, tournament_id, student_id, player_name, source, external_contact, registered_at }
    const studentRatings = new Map();   // student_id -> rating
    let regSeq = 0;

    function addTournament(t) {
        const row = {
            id: t.id, name: t.name || 'T',
            tournament_date: t.tournament_date || '2026-06-01',
            start_time: t.start_time || '14:00',
            time_format: t.time_format || 'Rapid 15+5',
            capacity: t.capacity || 24, status: t.status || 'open',
            branch_id: t.branch_id || null,
            league: t.league === undefined ? null : t.league,
        };
        tournaments.set(t.id, row);
        return row;
    }

    function setStudentRating(student_id, rating) {
        studentRatings.set(student_id, rating);
    }

    // Mirrors calc_league_from_rating() in migration 038.
    function calcLeagueFromRating(rating) {
        if (rating === null || rating === undefined) return null;
        if (rating > 800) return 'A';
        if (rating >= 450) return 'B';
        return 'C';
    }

    // Mirrors the plpgsql body in migrations/044_tournament_api.sql + 049_tournament_eligibility_check.sql.
    function register(p_tournament_id, p_student_id = null, p_player_name = null, p_source = 'web', p_external_contact = null) {
        if (!p_student_id && (!p_player_name || !p_player_name.trim())) {
            return { ok: false, reason: 'invalid_input' };
        }
        let source = p_source || 'web';
        if (!['web', 'telegram', 'whatsapp', 'online', 'admin'].includes(source)) source = 'web';

        const t = tournaments.get(p_tournament_id);
        if (!t) return { ok: false, reason: 'not_found' };
        if (t.status !== 'open') return { ok: false, reason: 'closed' };

        const count = registrations.filter(r => r.tournament_id === p_tournament_id).length;
        if (count >= t.capacity) {
            t.status = 'closed';
            return { ok: false, reason: 'full', registered_count: count, capacity: t.capacity };
        }
        if (p_student_id) {
            const dup = registrations.some(r =>
                r.tournament_id === p_tournament_id && r.student_id === p_student_id
            );
            if (dup) return { ok: false, reason: 'duplicate' };

            // League eligibility check — mirrors migration 049.
            if (t.league) {
                const studentRating = studentRatings.has(p_student_id) ? studentRatings.get(p_student_id) : null;
                const requiredLeague = calcLeagueFromRating(studentRating === null ? 0 : studentRating);
                if (requiredLeague !== t.league) {
                    return {
                        ok: false,
                        reason: 'ineligible',
                        student_rating: studentRating,
                        student_league: requiredLeague,
                        tournament_league: t.league,
                    };
                }
            }
        }

        const id = `reg-${++regSeq}`;
        const row = {
            id,
            tournament_id: p_tournament_id,
            student_id: p_student_id,
            player_name: p_student_id ? null : (p_player_name || '').trim(),
            source,
            external_contact: p_external_contact,
            registered_at: new Date().toISOString(),
        };
        registrations.push(row);
        if (count + 1 >= t.capacity) t.status = 'closed';
        return {
            ok: true,
            registration_id: id,
            registered_count: count + 1,
            capacity: t.capacity,
            status: t.status,
            tournament: {
                id: t.id, name: t.name, date: t.tournament_date,
                start_time: t.start_time, time_format: t.time_format,
            },
        };
    }

    function deleteRegistration(reg_id) {
        const idx = registrations.findIndex(r => r.id === reg_id);
        if (idx < 0) return { ok: false, reason: 'not_found' };
        const tid = registrations[idx].tournament_id;
        registrations.splice(idx, 1);
        // Re-open if the tournament was closed solely because it was full.
        const t = tournaments.get(tid);
        if (t && t.status === 'closed') {
            const count = registrations.filter(r => r.tournament_id === tid).length;
            if (count < t.capacity) t.status = 'open';
        }
        return { ok: true };
    }

    return { tournaments, registrations, studentRatings, addTournament, setStudentRating, register, deleteRegistration };
}

const STUDENT_A = '11111111-1111-1111-1111-111111111111';
const STUDENT_B = '22222222-2222-2222-2222-222222222222';
const STUDENT_C = '33333333-3333-3333-3333-333333333333';
const T_ID      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T_SMALL   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const store = makeStore();
store.addTournament({ id: T_ID, capacity: 24 });

// student-id path
const r1 = store.register(T_ID, STUDENT_A);
assertEqual(r1.ok, true, 'register with student_id succeeds');
assertEqual(r1.registered_count, 1, 'registered_count is 1 after first signup');
assert(r1.registration_id && r1.tournament, 'register returns registration_id + tournament block');

// duplicate student
const r2 = store.register(T_ID, STUDENT_A);
assertEqual(r2.reason, 'duplicate', 'duplicate student registration is rejected');

// player_name path (manual entry)
const r3 = store.register(T_ID, null, 'Walk-In Wendy', 'telegram', '+7700123456');
assertEqual(r3.ok, true, 'register with player_name succeeds');
const stored = store.registrations.find(r => r.id === r3.registration_id);
assertEqual(stored.player_name, 'Walk-In Wendy', 'player_name trimmed + stored');
assertEqual(stored.student_id, null, 'manual entry has student_id=NULL');
assertEqual(stored.source, 'telegram', 'source is recorded');

// invalid_input: both missing
const r4 = store.register(T_ID, null, null);
assertEqual(r4.reason, 'invalid_input', 'register with both NULL → invalid_input');
const r4b = store.register(T_ID, null, '   ');
assertEqual(r4b.reason, 'invalid_input', 'register with whitespace-only player_name → invalid_input');

// not_found
const r5 = store.register('cccccccc-cccc-cccc-cccc-cccccccccccc', STUDENT_C);
assertEqual(r5.reason, 'not_found', 'register on unknown tournament → not_found');

// capacity + status flip
const smallStore = makeStore();
smallStore.addTournament({ id: T_SMALL, capacity: 2 });
const cap1 = smallStore.register(T_SMALL, STUDENT_A);
const cap2 = smallStore.register(T_SMALL, STUDENT_B);
assertEqual(cap1.ok, true, 'small tournament: 1st reg succeeds');
assertEqual(cap2.ok, true, 'small tournament: 2nd reg succeeds (last seat)');
assertEqual(smallStore.tournaments.get(T_SMALL).status, 'closed',
    'tournament flips to closed when last seat is filled');
const cap3 = smallStore.register(T_SMALL, STUDENT_C);
assertEqual(cap3.reason, 'closed', '3rd register after auto-close → reason=closed');

// delete → re-open
const del1 = smallStore.deleteRegistration(cap2.registration_id);
assertEqual(del1.ok, true, 'delete registration succeeds');
assertEqual(smallStore.tournaments.get(T_SMALL).status, 'open',
    'tournament re-opens when a seat is freed by deletion');
const delMiss = smallStore.deleteRegistration('non-existent');
assertEqual(delMiss.reason, 'not_found', 'delete of unknown id → not_found');

// ----------------------------------------------------------------------------
// 6b. League eligibility (migration 049) — behavior
// ----------------------------------------------------------------------------
console.log('\n=== league eligibility (in-memory simulation) =========================\n');

const T_LEAGUE_A = 'a0000000-0000-0000-0000-0000000000aa';
const T_LEAGUE_B = 'b0000000-0000-0000-0000-0000000000bb';
const T_LEAGUE_C = 'c0000000-0000-0000-0000-0000000000cc';
const T_NO_LEAGUE = 'd0000000-0000-0000-0000-0000000000dd';

const S_RATED_LOW    = '11111111-aaaa-aaaa-aaaa-111111111111'; // 300 → League C
const S_RATED_MID    = '22222222-aaaa-aaaa-aaaa-222222222222'; // 600 → League B
const S_RATED_HIGH   = '33333333-aaaa-aaaa-aaaa-333333333333'; // 1000 → League A
const S_RATED_EDGE_B = '44444444-aaaa-aaaa-aaaa-444444444444'; // 450 → League B (inclusive lower)
const S_RATED_EDGE_C = '55555555-aaaa-aaaa-aaaa-555555555555'; // 449 → League C (just below)
const S_NO_RATING    = '66666666-aaaa-aaaa-aaaa-666666666666'; // null → treated as 0 → League C

const leagueStore = makeStore();
leagueStore.addTournament({ id: T_LEAGUE_A, capacity: 24, league: 'A' });
leagueStore.addTournament({ id: T_LEAGUE_B, capacity: 24, league: 'B' });
leagueStore.addTournament({ id: T_LEAGUE_C, capacity: 24, league: 'C' });
leagueStore.addTournament({ id: T_NO_LEAGUE, capacity: 24, league: null });

leagueStore.setStudentRating(S_RATED_LOW, 300);
leagueStore.setStudentRating(S_RATED_MID, 600);
leagueStore.setStudentRating(S_RATED_HIGH, 1000);
leagueStore.setStudentRating(S_RATED_EDGE_B, 450);
leagueStore.setStudentRating(S_RATED_EDGE_C, 449);
// S_NO_RATING intentionally left unset.

// Wrong league registration is blocked with ineligible reason + context.
const elig1 = leagueStore.register(T_LEAGUE_C, S_RATED_MID);
assertEqual(elig1.ok, false, 'rating 600 → League C tournament: blocked');
assertEqual(elig1.reason, 'ineligible', 'rating 600 → League C: reason=ineligible');
assertEqual(elig1.student_rating, 600, 'ineligible response surfaces student_rating');
assertEqual(elig1.student_league, 'B', 'ineligible response surfaces correct student_league');
assertEqual(elig1.tournament_league, 'C', 'ineligible response surfaces tournament_league');

const elig2 = leagueStore.register(T_LEAGUE_C, S_RATED_HIGH);
assertEqual(elig2.reason, 'ineligible', 'rating 1000 → League C: ineligible');
assertEqual(elig2.student_league, 'A', 'rating 1000 → student_league=A');

const elig3 = leagueStore.register(T_LEAGUE_B, S_RATED_LOW);
assertEqual(elig3.reason, 'ineligible', 'rating 300 → League B: ineligible');
assertEqual(elig3.student_league, 'C', 'rating 300 → student_league=C');

const elig4 = leagueStore.register(T_LEAGUE_A, S_RATED_MID);
assertEqual(elig4.reason, 'ineligible', 'rating 600 → League A: ineligible');

// Correct league registration is allowed.
const elig5 = leagueStore.register(T_LEAGUE_C, S_RATED_LOW);
assertEqual(elig5.ok, true, 'rating 300 → League C: allowed');

const elig6 = leagueStore.register(T_LEAGUE_B, S_RATED_MID);
assertEqual(elig6.ok, true, 'rating 600 → League B: allowed');

const elig7 = leagueStore.register(T_LEAGUE_A, S_RATED_HIGH);
assertEqual(elig7.ok, true, 'rating 1000 → League A: allowed');

// Boundary at 450 — inclusive in League B per user spec + calc_league_from_rating.
const elig8 = leagueStore.register(T_LEAGUE_B, S_RATED_EDGE_B);
assertEqual(elig8.ok, true, 'rating 450 (boundary) → League B: allowed');

const elig9 = leagueStore.register(T_LEAGUE_C, S_RATED_EDGE_C);
assertEqual(elig9.ok, true, 'rating 449 → League C: allowed');

// Tournament with NULL league skips the check entirely.
const eligNull = leagueStore.register(T_NO_LEAGUE, S_RATED_HIGH);
assertEqual(eligNull.ok, true, 'league IS NULL tournament: rating check skipped');

// Walk-in (no student_id) bypasses the check.
const eligWalkIn = leagueStore.register(T_LEAGUE_C, null, 'Off-System Player', 'admin');
assertEqual(eligWalkIn.ok, true, 'walk-in (player_name only): rating check skipped');

// Student with no rating row is treated as rating 0 → League C only.
const eligNoRatingC = leagueStore.register(T_LEAGUE_C, S_NO_RATING);
assertEqual(eligNoRatingC.ok, true, 'student with no rating: League C accepted');

const eligNoRatingB = makeStore();
eligNoRatingB.addTournament({ id: T_LEAGUE_B, capacity: 24, league: 'B' });
const eligNoRatingBRes = eligNoRatingB.register(T_LEAGUE_B, S_NO_RATING);
assertEqual(eligNoRatingBRes.reason, 'ineligible', 'student with no rating: League B blocked');
assertEqual(eligNoRatingBRes.student_league, 'C', 'no rating maps to League C bucket');
assertEqual(eligNoRatingBRes.student_rating, null, 'no rating surfaces as student_rating=null');

// ============================================================================
// 7. JS port of route dispatching — behavior
// ============================================================================
console.log('\n=== tournaments-api routing (JS port) ================================\n');

// --- minimal mock supabase client ------------------------------------------
function createMockSupabase(state) {
    function chain(table) {
        const op = { table, kind: 'select', filters: [], gte: [], lte: [], ins: [], or: [], notIlike: [], limit: null, order: null, single: false, count: false, head: false, updates: null, updatesFilters: [], inserts: null, deletes: false };

        const builder = {
            select(_cols, opts) {
                if (opts && opts.count === 'exact') op.count = true;
                if (opts && opts.head) op.head = true;
                op.cols = _cols;
                return builder;
            },
            eq(c, v) { op.filters.push({ c, v }); return builder; },
            in(c, v) { op.ins.push({ c, v }); return builder; },
            gte(c, v) { op.gte.push({ c, v }); return builder; },
            lte(c, v) { op.lte.push({ c, v }); return builder; },
            not(c, op2, v) { if (op2 === 'ilike') op.notIlike.push({ c, v }); return builder; },
            or(s) { op.or.push(s); return builder; },
            order() { return builder; },
            limit(n) { op.limit = n; return builder; },
            maybeSingle() { op.single = 'maybe'; return run(); },
            single() { op.single = 'strict'; return run(); },
            update(values) { op.kind = 'update'; op.updates = values; return builder; },
            insert(values) { op.kind = 'insert'; op.inserts = values; return run(); },
            delete() { op.kind = 'delete'; op.deletes = true; return builder; },
            then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
        };
        return builder;

        function run() {
            const rows = (state[table] || []).slice();
            if (op.kind === 'select' || op.kind === 'update' || op.kind === 'delete') {
                let result = rows;
                for (const f of op.filters) result = result.filter(r => r[f.c] === f.v);
                for (const g of op.gte) result = result.filter(r => String(r[g.c]) >= String(g.v));
                for (const l of op.lte) result = result.filter(r => String(r[l.c]) <= String(l.v));
                for (const i of op.ins) {
                    const set = new Set(i.v);
                    result = result.filter(r => set.has(r[i.c]));
                }
                for (const ni of op.notIlike) {
                    const needle = String(ni.v || '').replace(/%/g, '').toLowerCase();
                    result = result.filter(r => !String(r[ni.c] || '').toLowerCase().includes(needle));
                }
                for (const orStr of op.or) {
                    // or pattern like 'first_name.ilike.%pat%,last_name.ilike.%pat%'
                    const clauses = orStr.split(',').map(s => s.trim());
                    result = result.filter(r => clauses.some(c => {
                        const m = c.match(/^([a-z_]+)\.ilike\.(.+)$/);
                        if (!m) return false;
                        const col = m[1];
                        const pat = m[2].replace(/^%/, '').replace(/%$/, '').toLowerCase();
                        return String(r[col] || '').toLowerCase().includes(pat);
                    }));
                }

                if (op.kind === 'update') {
                    for (const r of result) Object.assign(r, op.updates);
                    return Promise.resolve({ data: null, error: null });
                }
                if (op.kind === 'delete') {
                    for (const r of result) {
                        const idx = (state[table] || []).indexOf(r);
                        if (idx >= 0) state[table].splice(idx, 1);
                    }
                    return Promise.resolve({ data: null, error: null });
                }

                // Embed sub-selects when cols mentions parens. The mock supports
                // `branch:branches(id, name)` and `student:students(first_name, last_name)`
                // and `student_current_ratings(rating)` shapes — enough for the routes.
                const cols = op.cols || '';
                if (cols.includes('branch:branches')) {
                    result = result.map(r => ({ ...r, branch: (state.branches || []).find(b => b.id === r.branch_id) || null }));
                }
                if (cols.includes('student:students')) {
                    result = result.map(r => ({ ...r, student: r.student_id ? ((state.students || []).find(s => s.id === r.student_id) || null) : null }));
                }
                if (cols.includes('student_current_ratings')) {
                    result = result.map(s => ({
                        ...s,
                        student_current_ratings: (state.student_current_ratings || []).filter(rr => rr.student_id === s.id),
                    }));
                }
                if (op.limit) result = result.slice(0, op.limit);

                if (op.single === 'maybe') return Promise.resolve({ data: result[0] || null, error: null });
                if (op.single === 'strict') return Promise.resolve({ data: result[0], error: result[0] ? null : { message: 'not found' } });
                if (op.head) return Promise.resolve({ data: null, error: null, count: result.length });
                if (op.count) return Promise.resolve({ data: result, error: null, count: result.length });
                return Promise.resolve({ data: result, error: null });
            }
            if (op.kind === 'insert') {
                const list = Array.isArray(op.inserts) ? op.inserts : [op.inserts];
                state[table] = state[table] || [];
                for (const r of list) state[table].push(r);
                return Promise.resolve({ data: list, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        }
    }

    return {
        from: (table) => chain(table),
        rpc: async (name, args) => {
            assertEqual(name, 'register_for_tournament', 'edge function calls register_for_tournament RPC');
            const data = state.__rpcStore.register(
                args.p_tournament_id, args.p_student_id, args.p_player_name,
                args.p_source, args.p_external_contact
            );
            return { data, error: null };
        },
    };
}

// --- mirror of edge-function helpers ---------------------------------------
const REASONS = ['unauthorized', 'not_found', 'closed', 'full', 'duplicate', 'ineligible', 'invalid_input', 'server_error'];
const SOURCES = new Set(['web', 'telegram', 'whatsapp', 'online', 'admin']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = s => !!s && UUID_RE.test(s);

function extractSubPath(pathname) {
    const idx = pathname.indexOf('/tournaments-api');
    if (idx < 0) return pathname;
    let sub = pathname.slice(idx + '/tournaments-api'.length);
    if (sub.length > 1 && sub.endsWith('/')) sub = sub.slice(0, -1);
    return sub || '/';
}
function matchPath(pattern, p) {
    const pp = pattern.split('/').filter(Boolean);
    const ap = p.split('/').filter(Boolean);
    if (pp.length !== ap.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
        else if (pp[i] !== ap[i]) return null;
    }
    return params;
}

function makeReq(method, urlPath, { body, headers } = {}) {
    const h = new Map();
    for (const [k, v] of Object.entries(headers || {})) h.set(k.toLowerCase(), v);
    return {
        method,
        url: `https://example.test${urlPath}`,
        headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
        text: async () => body === undefined ? '' : JSON.stringify(body),
    };
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1';

async function handle(req, supabase) {
    if (req.method === 'OPTIONS') return { status: 204, body: null };

    const url = new URL(req.url);
    const path = extractSubPath(url.pathname);
    const method = req.method.toUpperCase();

    function ok(extra, status = 200) { return { status, body: { ok: true, ...extra } }; }
    function fail(reason, status, extra = {}) { return { status, body: { ok: false, reason, ...extra } }; }
    function auth() { return req.headers.get('x-api-key') === API_KEY; }
    function source() {
        const h = (req.headers.get('x-source') || '').toLowerCase();
        return SOURCES.has(h) ? h : 'web';
    }

    if (method === 'GET' && path === '/openapi.json') {
        return { status: 200, body: { openapi: '3.0.3', info: { title: 'Chess Empire — Tournaments API', version: '1.0.0' } } };
    }

    let m;

    if (method === 'GET' && path === '/branches') {
        const { data } = await supabase.from('branches').select('id, name, location').not('name', 'ilike', '%НИШ%').not('name', 'ilike', '%zhandosova%');
        const branches = (data || []).map(b => ({ id: b.id, name: b.name, address: b.location || null }));
        return ok({ branches });
    }
    if (method === 'GET' && path === '/tournaments') {
        const branchId = url.searchParams.get('branch_id');
        const upcomingParam = url.searchParams.get('upcoming');
        const upcoming = upcomingParam === null ? true : upcomingParam === 'true';
        let q = supabase.from('tournaments').select('id, branch_id, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status, branch:branches(id, name)');
        if (branchId) q = q.eq('branch_id', branchId);
        if (upcoming) q = q.gte('tournament_date', new Date().toISOString().slice(0, 10));
        const { data } = await q;
        const rows = data || [];
        const ids = rows.map(t => t.id);
        const countsById = new Map();
        if (ids.length > 0) {
            const { data: regs } = await supabase.from('tournament_registrations').select('tournament_id').in('tournament_id', ids);
            for (const r of regs || []) countsById.set(r.tournament_id, (countsById.get(r.tournament_id) || 0) + 1);
        }
        const tournaments = rows.map(t => ({ ...t, registered_count: countsById.get(t.id) || 0 }));
        return ok({ tournaments });
    }
    if (method === 'GET' && (m = matchPath('/tournaments/:id', path))) {
        if (!isUuid(m.id)) return fail('invalid_input', 400);
        const { data: t } = await supabase.from('tournaments').select('id, branch_id, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status, branch:branches(id, name)').eq('id', m.id).maybeSingle();
        if (!t) return fail('not_found', 404);
        const { count } = await supabase.from('tournament_registrations').select('id', { count: 'exact', head: true }).eq('tournament_id', m.id);
        return ok({ tournament: { ...t, registered_count: count || 0 } });
    }
    if (method === 'GET' && (m = matchPath('/tournaments/:id/registrations', path))) {
        if (!isUuid(m.id)) return fail('invalid_input', 400);
        const { data } = await supabase.from('tournament_registrations').select('id, source, registered_at, player_name, student:students(first_name, last_name)').eq('tournament_id', m.id);
        const registrations = (data || []).map(r => {
            const s = r.student;
            const display_name = s
                ? `${s.first_name || ''} ${s.last_name || ''}`.trim()
                : (r.player_name || '');
            return { id: r.id, source: r.source, registered_at: r.registered_at, display_name };
        });
        return ok({ registrations });
    }
    if (method === 'POST' && (m = matchPath('/tournaments/:id/register', path))) {
        if (!auth()) return fail('unauthorized', 401);
        if (!isUuid(m.id)) return fail('invalid_input', 400);
        let body = {};
        try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return fail('invalid_input', 400); }
        const studentId = typeof body.student_id === 'string' ? body.student_id : null;
        const playerName = typeof body.player_name === 'string' ? body.player_name.trim() : null;
        const externalContact = typeof body.external_contact === 'string' ? body.external_contact : null;
        const hasStudent = !!studentId && studentId.length > 0;
        const hasName = !!playerName && playerName.length > 0;
        if (hasStudent === hasName) return fail('invalid_input', 400);
        if (hasStudent && !isUuid(studentId)) return fail('invalid_input', 400);

        const { data } = await supabase.rpc('register_for_tournament', {
            p_tournament_id: m.id,
            p_student_id: hasStudent ? studentId : null,
            p_player_name: hasName ? playerName : null,
            p_source: source(),
            p_external_contact: externalContact,
        });
        if (data && data.ok) return { status: 200, body: data };
        const r = String((data || {}).reason || 'server_error');
        const status = r === 'not_found' ? 404 :
                       r === 'duplicate' || r === 'full' || r === 'closed' || r === 'ineligible' ? 409 :
                       r === 'invalid_input' ? 400 : 500;
        return { status, body: data || { ok: false, reason: 'server_error' } };
    }
    if (method === 'DELETE' && (m = matchPath('/registrations/:registration_id', path))) {
        if (!auth()) return fail('unauthorized', 401);
        // Use the RPC store directly for the delete (mirrors the production path
        // which the route uses for the conditional re-open).
        const { data: existing } = await supabase.from('tournament_registrations').select('id, tournament_id').eq('id', m.registration_id).maybeSingle();
        if (!existing) return fail('not_found', 404);
        // Direct call into the RPC simulation to keep the test deterministic.
        const store = supabase.__rpcStore || null;
        if (store) { const out = store.deleteRegistration(m.registration_id); if (!out.ok) return fail('not_found', 404); }
        return ok();
    }
    if (method === 'GET' && path === '/students/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 2) return fail('invalid_input', 400);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '8', 10) || 8, 1), 20);
        const escaped = q.replace(/[%_]/g, m => `\\${m}`);
        const pattern = `%${escaped}%`;
        const { data } = await supabase.from('students').select('id, first_name, last_name, branch:branches(name), student_current_ratings(rating)').in('status', ['active', 'frozen']).or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`).limit(limit);
        const students = (data || []).map(s => {
            const ratingRow = Array.isArray(s.student_current_ratings) ? s.student_current_ratings[0] : null;
            return {
                id: s.id,
                name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
                branch: s.branch ? s.branch.name : null,
                current_rating: ratingRow && Number.isFinite(Number(ratingRow.rating)) ? Number(ratingRow.rating) : null,
            };
        });
        return ok({ students });
    }
    return fail('not_found', 404);
}

// --- Run scenarios ---------------------------------------------------------
(async () => {
    const HALYK = 'h0000000-0000-0000-0000-00000000000h'.replace('h', 'a');
    // we'll just use proper UUID strings
    const BR_HA = 'd0000000-0000-0000-0000-0000000000aa';
    const BR_A1 = 'd0000000-0000-0000-0000-0000000000a1';
    const BR_DB = 'd0000000-0000-0000-0000-0000000000db';
    const BR_NS = 'd0000000-0000-0000-0000-0000000000ee';
    const BR_ZH = 'd0000000-0000-0000-0000-0000000000ff';

    const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const T2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    const rpcStore = makeStore();
    rpcStore.addTournament({ id: T1, capacity: 24, branch_id: BR_HA, name: 'League C' });
    rpcStore.addTournament({ id: T2, capacity: 2, branch_id: BR_HA, name: 'League C' });
    // Mirror the rpcStore into the mock select tables.
    function syncMock(state) {
        state.tournaments = [...rpcStore.tournaments.values()].map(t => ({ ...t }));
        state.tournament_registrations = rpcStore.registrations.map(r => ({ ...r }));
    }
    const STATE = {
        branches: [
            { id: BR_HA, name: 'Halyk Arena', location: 'Halyk' },
            { id: BR_A1, name: 'Almaty 1',    location: 'A1' },
            { id: BR_DB, name: 'Debut',       location: 'Db' },
            { id: BR_NS, name: 'НИШ',         location: 'Nis' },
            { id: BR_ZH, name: 'Zhandosova',  location: 'Zh' },
        ],
        students: [
            { id: STUDENT_A, first_name: 'Adam',    last_name: 'Aliyev',     status: 'active', branch_id: BR_HA },
            { id: STUDENT_B, first_name: 'Beibit',  last_name: 'Bekzhanov',  status: 'frozen', branch_id: BR_A1 },
            { id: STUDENT_C, first_name: 'Chyngyz', last_name: 'Choibalsan', status: 'left',   branch_id: BR_DB },
        ],
        student_current_ratings: [
            { student_id: STUDENT_A, rating: 312 },
            { student_id: STUDENT_B, rating: 511 },
        ],
        tournaments: [],
        tournament_registrations: [],
        __rpcStore: rpcStore,
    };

    function makeClient() {
        syncMock(STATE);
        const sup = createMockSupabase(STATE);
        sup.__rpcStore = rpcStore;
        return sup;
    }

    // 7a. /branches
    const branchesResp = await handle(makeReq('GET', '/tournaments-api/branches'), makeClient());
    assertEqual(branchesResp.status, 200, 'GET /branches → 200');
    assert(branchesResp.body.ok === true, '/branches returns ok:true');
    const names = branchesResp.body.branches.map(b => b.name).sort();
    assertEqual(names, ['Almaty 1', 'Debut', 'Halyk Arena'], '/branches excludes НИШ and Zhandosova');
    assert(branchesResp.body.branches.every(b => 'address' in b), '/branches rows expose `address` field');

    // 7b. /tournaments — happy path
    const listResp = await handle(makeReq('GET', '/tournaments-api/tournaments?upcoming=false'), makeClient());
    assertEqual(listResp.status, 200, 'GET /tournaments → 200');
    assert(Array.isArray(listResp.body.tournaments), '/tournaments returns array');
    assertEqual(listResp.body.tournaments.length, 2, '/tournaments returns both seeded rows when upcoming=false');
    assert(listResp.body.tournaments.every(t => 'registered_count' in t), 'each tournament row has registered_count');

    // 7c. /tournaments/:id — detail
    const detailResp = await handle(makeReq('GET', `/tournaments-api/tournaments/${T1}`), makeClient());
    assertEqual(detailResp.status, 200, 'GET /tournaments/:id → 200');
    assertEqual(detailResp.body.tournament.id, T1, 'detail returns the right tournament id');
    const detailMiss = await handle(makeReq('GET', `/tournaments-api/tournaments/${T_ID.replace(/a/g, '9')}`), makeClient());
    assertEqual(detailMiss.status, 404, 'unknown id → 404');
    assertEqual(detailMiss.body.reason, 'not_found', 'unknown id → reason=not_found');

    // 7d. /students/search
    const searchResp = await handle(makeReq('GET', '/tournaments-api/students/search?q=al'), makeClient());
    assertEqual(searchResp.status, 200, 'GET /students/search → 200');
    const hit = searchResp.body.students.find(s => s.id === STUDENT_A);
    assert(hit, 'student "al" search hits Adam Aliyev');
    assertEqual(hit.name, 'Adam Aliyev', 'student name is "first last"');
    assertEqual(hit.branch, 'Halyk Arena', 'student carries branch name');
    assertEqual(hit.current_rating, 312, 'student carries current_rating');
    const leftStudent = searchResp.body.students.find(s => s.id === STUDENT_C);
    assert(!leftStudent, 'left student is excluded from search results');
    const searchShort = await handle(makeReq('GET', '/tournaments-api/students/search?q=a'), makeClient());
    assertEqual(searchShort.body.reason, 'invalid_input', 'q < 2 chars → invalid_input');

    // 7e. POST /register — auth required
    const regNoKey = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: { student_id: STUDENT_A } }), makeClient());
    assertEqual(regNoKey.status, 401, 'register without x-api-key → 401');
    assertEqual(regNoKey.body.reason, 'unauthorized', 'register without x-api-key → reason=unauthorized');

    // 7f. POST /register with student_id (happy path)
    const regOk = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: { student_id: STUDENT_A }, headers: { 'x-api-key': API_KEY, 'x-source': 'telegram' } }), makeClient());
    assertEqual(regOk.status, 200, 'register with student_id + key → 200');
    assert(regOk.body.ok === true, 'register success ok:true');
    assert(regOk.body.registration_id, 'register returns registration_id');
    assertEqual(regOk.body.tournament.id, T1, 'register echoes tournament block');

    // 7g. POST /register with player_name only
    const regManual = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: { player_name: 'Manual Mike' }, headers: { 'x-api-key': API_KEY, 'x-source': 'whatsapp' } }), makeClient());
    assertEqual(regManual.status, 200, 'register with player_name only → 200');
    assertEqual(regManual.body.ok, true, 'manual register ok:true');

    // 7h. POST /register with both → invalid_input
    const regBoth = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: { student_id: STUDENT_B, player_name: 'X Y' }, headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(regBoth.status, 400, 'register with both student_id and player_name → 400');
    assertEqual(regBoth.body.reason, 'invalid_input', 'register with both → reason=invalid_input');

    // 7i. POST /register with neither → invalid_input
    const regNeither = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: {}, headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(regNeither.body.reason, 'invalid_input', 'register with neither → reason=invalid_input');

    // 7j. duplicate
    const regDup = await handle(makeReq('POST', `/tournaments-api/tournaments/${T1}/register`, { body: { student_id: STUDENT_A }, headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(regDup.status, 409, 'duplicate student → 409');
    assertEqual(regDup.body.reason, 'duplicate', 'duplicate student → reason=duplicate');

    // 7k. capacity flip + delete re-opens
    const cap1 = await handle(makeReq('POST', `/tournaments-api/tournaments/${T2}/register`, { body: { student_id: STUDENT_A }, headers: { 'x-api-key': API_KEY } }), makeClient());
    const cap2 = await handle(makeReq('POST', `/tournaments-api/tournaments/${T2}/register`, { body: { student_id: STUDENT_B }, headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(cap1.body.ok, true, 'small tournament: 1st register ok');
    assertEqual(cap2.body.ok, true, 'small tournament: 2nd register ok');
    assertEqual(rpcStore.tournaments.get(T2).status, 'closed', 'small tournament closed after capacity');
    const overflowResp = await handle(makeReq('POST', `/tournaments-api/tournaments/${T2}/register`, { body: { student_id: STUDENT_C }, headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(overflowResp.status, 409, 'over-capacity register → 409');
    assertEqual(overflowResp.body.reason, 'closed', 'over-capacity register → reason=closed (status flipped)');

    // 7l. roster — display_name + privacy
    const rosterResp = await handle(makeReq('GET', `/tournaments-api/tournaments/${T1}/registrations`), makeClient());
    assertEqual(rosterResp.status, 200, 'GET roster → 200');
    assert(rosterResp.body.registrations.length >= 2, 'roster has the registrations we made');
    for (const row of rosterResp.body.registrations) {
        assert(!('external_contact' in row), `roster row does NOT include external_contact (row id=${row.id})`);
        assert(typeof row.display_name === 'string' && row.display_name.length > 0, `roster row has non-empty display_name (id=${row.id})`);
    }
    const adamRow = rosterResp.body.registrations.find(r => r.display_name === 'Adam Aliyev');
    assert(adamRow, 'roster display_name resolves student to "first last"');
    const manualRow = rosterResp.body.registrations.find(r => r.display_name === 'Manual Mike');
    assert(manualRow, 'roster display_name falls back to player_name for manual entries');

    // 7m. delete reopens
    const delResp = await handle(makeReq('DELETE', `/tournaments-api/registrations/${cap2.body.registration_id}`, { headers: { 'x-api-key': API_KEY } }), makeClient());
    assertEqual(delResp.status, 200, 'DELETE registration → 200');
    assertEqual(rpcStore.tournaments.get(T2).status, 'open',
        'tournament re-opens after the closing registration is cancelled');
    const delNoKey = await handle(makeReq('DELETE', `/tournaments-api/registrations/${cap1.body.registration_id}`), makeClient());
    assertEqual(delNoKey.status, 401, 'DELETE without key → 401');

    // 7n. /openapi.json
    const openapiResp = await handle(makeReq('GET', '/tournaments-api/openapi.json'), makeClient());
    assertEqual(openapiResp.status, 200, 'GET /openapi.json → 200');
    // Validate it's serializable JSON.
    let serialized = null;
    try { serialized = JSON.stringify(openapiResp.body); } catch { /* fall through */ }
    assert(serialized && serialized.length > 0, '/openapi.json body is JSON-serializable');
    assertEqual(openapiResp.body.openapi, '3.0.3', '/openapi.json declares openapi 3.0.3');

    // 7o. OPTIONS preflight
    const optionsResp = await handle(makeReq('OPTIONS', '/tournaments-api/tournaments'), makeClient());
    assertEqual(optionsResp.status, 204, 'OPTIONS → 204');

    // ─── Inspect the real edge function's OpenAPI surface ──────────────────
    // Extract the OPENAPI_SPEC declaration from the TS source and verify the
    // routes + the reason enum are present. (We can't JSON.parse a JS object
    // literal, but a regex is enough for the contract.)
    const openapiBlockStart = FN.indexOf('const OPENAPI_SPEC');
    const openapiBlockEnd   = FN.indexOf('// ─── Route handlers');
    assert(openapiBlockStart > 0 && openapiBlockEnd > openapiBlockStart, 'OPENAPI_SPEC block found in edge function source');
    const openapiBlock = FN.slice(openapiBlockStart, openapiBlockEnd);
    for (const route of ['/branches', '/tournaments', '/tournaments/{id}', '/tournaments/{id}/registrations', '/tournaments/{id}/register', '/registrations/{registration_id}', '/students/search', '/openapi.json']) {
        assert(openapiBlock.includes(`'${route}'`), `OpenAPI spec lists path '${route}'`);
    }
    // The OpenAPI Reason schema is built from the runtime REASONS array via
    // `[...REASONS]`; check the top-level REASONS const declaration covers
    // every value the API surface contract promises.
    const reasonsDecl = FN.match(/const REASONS = \[([\s\S]*?)\] as const/);
    assert(reasonsDecl, 'REASONS const declaration found in edge function');
    if (reasonsDecl) {
        for (const r of REASONS) {
            assert(reasonsDecl[1].includes(`'${r}'`), `REASONS const (sourced into OpenAPI) includes '${r}'`);
        }
    }
    assert(/title:\s*'Chess Empire — Tournaments API'/.test(openapiBlock), 'OpenAPI title set');
    assert(/version:\s*'1\.0\.0'/.test(openapiBlock), 'OpenAPI version set');

    console.log(`\n=== Summary ===\n  passed: ${passed}\n  failed: ${failed}\n`);
    if (failed > 0) process.exit(1);
})().catch((e) => {
    console.error('Test runner crashed:', e);
    process.exit(1);
});
