/**
 * Tests for the analytics-tournaments edge function — Phase 4.
 * Run: node tests/test-analytics-tournaments.js
 *
 * Strategy:
 *  - Source-contract check: the TS file at supabase/functions/analytics-tournaments/index.ts
 *    must contain the expected action strings, API key, and required-param messages.
 *    This catches accidental drift while keeping the test runnable in plain Node
 *    (the TS file imports Deno-only modules so it can't be required directly).
 *  - Behavior check: a JS port of the handler routing exercises a mock Supabase
 *    client and mock fetch-style Request objects to verify response shapes for
 *    each action, auth rejection, missing-param 400s, and empty results.
 */

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// === harness =============================================================
let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// === source contract =====================================================
console.log('\n=== source contract ====================================================\n');
assert(SRC.includes("const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'"), 'API key matches analytics-students');
assert(SRC.includes("x-api-key"), 'CORS allows x-api-key header');
assert(/Access-Control-Allow-Origin/.test(SRC), 'CORS Allow-Origin present');
assert(SRC.includes('SUPABASE_URL'), 'reads SUPABASE_URL env');
assert(SRC.includes('SUPABASE_SERVICE_ROLE_KEY'), 'reads SUPABASE_SERVICE_ROLE_KEY env');
assert(SRC.includes("action === 'list'") || SRC.includes(`action === "list"`), 'handles action=list');
assert(SRC.includes("action === 'detail'") || SRC.includes(`action === "detail"`), 'handles action=detail');
assert(SRC.includes("action === 'student_history'") || SRC.includes(`action === "student_history"`), 'handles action=student_history');
assert(SRC.includes("action === 'branch_leaderboard'") || SRC.includes(`action === "branch_leaderboard"`), 'handles action=branch_leaderboard');
assert(/tournament_id required/.test(SRC), 'detail enforces tournament_id');
assert(/student_id required/.test(SRC), 'student_history enforces student_id');
assert(/branch_id required/.test(SRC), 'branch_leaderboard enforces branch_id');
assert(/league required/.test(SRC), 'branch_leaderboard enforces league');
assert(/from\('tournaments'\)/.test(SRC), 'reads tournaments table');
assert(/from\('tournament_participants'\)/.test(SRC), 'reads tournament_participants table');
assert(/Unauthorized/.test(SRC), 'has Unauthorized response branch');
// PRD §5: read-only edge function — must NOT mutate.
assert(!/\.insert\(/.test(SRC), 'no inserts');
assert(!/\.update\(/.test(SRC), 'no updates');
assert(!/\.upsert\(/.test(SRC), 'no upserts');
assert(!/\.delete\(/.test(SRC), 'no deletes');

// === mock Supabase client (Postgrest-style chainable builder) ============
function createMockClient(initial) {
    const db = {
        tournaments: initial && initial.tournaments ? initial.tournaments.slice() : [],
        tournament_participants: initial && initial.tournament_participants ? initial.tournament_participants.slice() : [],
        students: initial && initial.students ? initial.students.slice() : [],
    };
    function builder(table) {
        const state = { filters: [], ranges: null, order: null, single: false, count: false, in: null, gte: [], lte: [] };
        const api = {
            select(_cols, opts) { if (opts && opts.count === 'exact') state.count = true; return api; },
            eq(c, v) { state.filters.push({ c, v }); return api; },
            in(c, v) { state.in = { c, v }; return api; },
            gte(c, v) { state.gte.push({ c, v }); return api; },
            lte(c, v) { state.lte.push({ c, v }); return api; },
            order() { return api; },
            range(from, to) { state.ranges = { from, to }; return api; },
            maybeSingle() { state.single = 'maybe'; return execute(); },
            single() { state.single = 'strict'; return execute(); },
            then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
        };
        function execute() {
            let rows = db[table] ? db[table].slice() : [];
            // Apply filters, supporting nested dot paths like 'student.branch_id'.
            for (const f of state.filters) {
                rows = rows.filter(r => readPath(r, f.c) === f.v);
            }
            for (const g of state.gte) {
                rows = rows.filter(r => readPath(r, g.c) >= g.v);
            }
            for (const l of state.lte) {
                rows = rows.filter(r => readPath(r, l.c) <= l.v);
            }
            if (state.in) {
                const set = new Set(state.in.v);
                rows = rows.filter(r => set.has(readPath(r, state.in.c)));
            }
            const count = rows.length;
            if (state.ranges) rows = rows.slice(state.ranges.from, state.ranges.to + 1);
            if (state.single === 'maybe') return Promise.resolve({ data: rows[0] || null, error: null });
            if (state.single === 'strict') return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'not found' } });
            return Promise.resolve({ data: rows, error: null, count: state.count ? count : undefined });
        }
        return api;
    }
    function readPath(row, dotted) {
        const keys = dotted.split('.');
        let v = row;
        for (const k of keys) {
            if (v == null) return undefined;
            v = v[k];
        }
        return v;
    }
    return { from: (t) => builder(t), _db: db };
}

// === port of the handler (mirror of supabase/functions/analytics-tournaments/index.ts) ====
const API_KEY = 'ce-api-2026-k8x9m2p4q7w1';
function makeRequest(urlStr, headers = {}, method = 'GET') {
    return {
        method,
        url: urlStr,
        headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    };
}
function authenticate(req) {
    return req.headers.get('x-api-key') === API_KEY;
}
function json(data, status = 200) { return { status, body: data }; }

async function handle(req, supabase) {
    if (!authenticate(req)) return json({ success: false, error: 'Unauthorized' }, 401);
    const url = new URL(req.url);
    const p = (k) => url.searchParams.get(k);
    const action = p('action') || 'list';

    if (action === 'list') {
        const limit = Math.min(parseInt(p('limit') || '50'), 200);
        const offset = parseInt(p('offset') || '0');
        let q = supabase.from('tournaments').select('*', { count: 'exact' });
        if (p('league')) q = q.eq('league', p('league'));
        if (p('date_from')) q = q.gte('tournament_date', p('date_from'));
        if (p('date_to')) q = q.lte('tournament_date', p('date_to'));
        q = q.range(offset, offset + limit - 1);
        const { data, count } = await q;
        return json({ success: true, data: data || [], count: count || (data || []).length, limit, offset });
    }

    if (action === 'detail') {
        const tournamentId = p('tournament_id');
        if (!tournamentId) return json({ success: false, error: 'tournament_id required' }, 400);
        const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', tournamentId).maybeSingle();
        if (!tournament) return json({ success: false, error: 'Tournament not found' }, 404);
        const { data: parts } = await supabase.from('tournament_participants')
            .select('id, place, rating_before, rating_after, rating_delta, raw_name, student:students(id, first_name, last_name, branch_id)')
            .eq('tournament_id', tournamentId);
        const participants = (parts || []).map(pp => ({
            id: pp.id,
            place: pp.place,
            rating_before: pp.rating_before,
            rating_after: pp.rating_after,
            rating_delta: pp.rating_delta,
            raw_name: pp.raw_name,
            student_id: pp.student ? pp.student.id : null,
            student_name: pp.student ? `${pp.student.first_name} ${pp.student.last_name}` : pp.raw_name,
            branch_id: pp.student ? pp.student.branch_id : null,
        }));
        return json({ success: true, data: { tournament, participants } });
    }

    if (action === 'student_history') {
        const studentId = p('student_id');
        if (!studentId) return json({ success: false, error: 'student_id required' }, 400);
        const { data } = await supabase.from('tournament_participants')
            .select('id, place, rating_before, rating_after, rating_delta, tournament:tournaments(id, name, league, tournament_date)')
            .eq('student_id', studentId);
        const rows = (data || []).filter(r => r.tournament).map(r => ({
            id: r.id,
            place: r.place,
            rating_before: r.rating_before,
            rating_after: r.rating_after,
            rating_delta: r.rating_delta,
            tournament_id: r.tournament.id,
            tournament_name: r.tournament.name,
            league: r.tournament.league,
            tournament_date: r.tournament.tournament_date,
        })).sort((a, b) => (b.tournament_date || '').localeCompare(a.tournament_date || ''));
        const places = rows.map(r => r.place).filter(n => Number.isFinite(n));
        const deltas = rows.map(r => r.rating_delta).filter(n => Number.isFinite(n));
        const year = new Date().getFullYear();
        const aggregates = {
            total: rows.length,
            ytd: rows.filter(r => String(r.tournament_date || '').startsWith(`${year}-`)).length,
            best_place: places.length ? Math.min(...places) : null,
            avg_place: places.length ? Math.round(places.reduce((a, b) => a + b, 0) / places.length) : null,
            total_rating_gained: deltas.reduce((a, b) => a + b, 0),
            last_date: rows[0] ? rows[0].tournament_date : null,
        };
        return json({ success: true, data: { tournaments: rows, aggregates }, count: rows.length });
    }

    if (action === 'branch_leaderboard') {
        if (!p('branch_id')) return json({ success: false, error: 'branch_id required' }, 400);
        if (!p('league')) return json({ success: false, error: 'league required' }, 400);
        const days = parseInt(p('days') || '90');
        const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        const { data } = await supabase.from('tournament_participants')
            .select('student_id, place, rating_delta, tournament:tournaments!inner(...), student:students!inner(...)')
            .eq('student.branch_id', p('branch_id'))
            .eq('student.status', 'active')
            .eq('tournament.league', p('league'))
            .gte('tournament.tournament_date', since);
        const byStudent = new Map();
        for (const row of data || []) {
            if (!row.student || !row.tournament) continue;
            const id = row.student.id;
            const slot = byStudent.get(id) || { studentId: id, firstName: row.student.first_name, lastName: row.student.last_name, places: [], deltas: [] };
            if (Number.isFinite(row.place)) slot.places.push(row.place);
            if (Number.isFinite(row.rating_delta)) slot.deltas.push(row.rating_delta);
            byStudent.set(id, slot);
        }
        const leaderboard = [...byStudent.values()].filter(s => s.places.length > 0).map(s => ({
            student_id: s.studentId,
            first_name: s.firstName,
            last_name: s.lastName,
            tournaments_played: s.places.length,
            avg_place: Math.round((s.places.reduce((a, b) => a + b, 0) / s.places.length) * 100) / 100,
            best_place: Math.min(...s.places),
            total_rating_gained: s.deltas.reduce((a, b) => a + b, 0),
        })).sort((a, b) => a.avg_place - b.avg_place);
        return json({ success: true, data: leaderboard, count: leaderboard.length, league: p('league'), branch_id: p('branch_id'), days });
    }

    return json({ success: false, error: 'Invalid action. Use: list, detail, student_history, branch_leaderboard' }, 400);
}

// === fixtures ===========================================================
const fixtureDb = () => ({
    tournaments: [
        { id: 'T1', name: 'Debut',   league: 'B', tournament_date: '2026-05-03' },
        { id: 'T2', name: 'Tactica', league: 'A', tournament_date: '2026-04-12' },
        { id: 'T3', name: 'Opening', league: 'B', tournament_date: '2026-02-01' },
    ],
    tournament_participants: [
        { id: 'P1', tournament_id: 'T1', student_id: 'S1', place: 1, rating_before: 600, rating_after: 700, rating_delta: 100, raw_name: 'Иванов Иван',
            tournament: { id: 'T1', name: 'Debut', league: 'B', tournament_date: '2026-05-03' },
            student: { id: 'S1', first_name: 'Иван', last_name: 'Иванов', branch_id: 'B-1', status: 'active' } },
        { id: 'P2', tournament_id: 'T1', student_id: 'S2', place: 2, rating_before: 550, rating_after: 600, rating_delta: 50, raw_name: 'Петров Пётр',
            tournament: { id: 'T1', name: 'Debut', league: 'B', tournament_date: '2026-05-03' },
            student: { id: 'S2', first_name: 'Пётр', last_name: 'Петров', branch_id: 'B-1', status: 'active' } },
        { id: 'P3', tournament_id: 'T3', student_id: 'S1', place: 3, rating_before: 500, rating_after: 600, rating_delta: 100, raw_name: 'Иванов Иван',
            tournament: { id: 'T3', name: 'Opening', league: 'B', tournament_date: '2026-02-01' },
            student: { id: 'S1', first_name: 'Иван', last_name: 'Иванов', branch_id: 'B-1', status: 'active' } },
        // Different branch — should NOT appear in branch_leaderboard for B-1.
        { id: 'P4', tournament_id: 'T1', student_id: 'S3', place: 5, rating_before: 400, rating_after: 405, rating_delta: 5, raw_name: 'X',
            tournament: { id: 'T1', name: 'Debut', league: 'B', tournament_date: '2026-05-03' },
            student: { id: 'S3', first_name: 'A', last_name: 'B', branch_id: 'B-2', status: 'active' } },
    ],
});

// === tests ===============================================================
async function run() {
    console.log('\n=== auth ================================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const noKey = await handle(makeRequest('https://x/?action=list'), supabase);
        assertEqual(noKey.status, 401, 'no x-api-key → 401');
        assertEqual(noKey.body.success, false, 'no x-api-key → success=false');
        assertEqual(noKey.body.error, 'Unauthorized', 'no x-api-key → error=Unauthorized');

        const wrongKey = await handle(makeRequest('https://x/?action=list', { 'x-api-key': 'bad' }), supabase);
        assertEqual(wrongKey.status, 401, 'wrong x-api-key → 401');

        const okKey = await handle(makeRequest('https://x/?action=list', { 'x-api-key': API_KEY }), supabase);
        assertEqual(okKey.status, 200, 'correct x-api-key → 200');
    }

    console.log('\n=== action=list =========================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const headers = { 'x-api-key': API_KEY };
        const all = await handle(makeRequest('https://x/?action=list', headers), supabase);
        assertEqual(all.status, 200, 'list → 200');
        assertEqual(all.body.success, true, 'list → success=true');
        assert(Array.isArray(all.body.data), 'list → data is array');
        assertEqual(all.body.data.length, 3, 'list returns 3 tournaments');
        assert(typeof all.body.count === 'number', 'list returns count');

        const filtered = await handle(makeRequest('https://x/?action=list&league=A', headers), supabase);
        assertEqual(filtered.body.data.length, 1, 'list filtered by league=A returns 1');
        assertEqual(filtered.body.data[0].name, 'Tactica', 'league=A returns Tactica');

        const dated = await handle(makeRequest('https://x/?action=list&date_from=2026-03-01', headers), supabase);
        assertEqual(dated.body.data.length, 2, 'list date_from=2026-03-01 → 2 tournaments');

        const paged = await handle(makeRequest('https://x/?action=list&limit=2&offset=0', headers), supabase);
        assertEqual(paged.body.data.length, 2, 'list limit=2 → 2 returned');
        assertEqual(paged.body.limit, 2, 'list echoes limit=2');
        assertEqual(paged.body.offset, 0, 'list echoes offset=0');
    }

    console.log('\n=== action=detail =======================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const headers = { 'x-api-key': API_KEY };

        const missing = await handle(makeRequest('https://x/?action=detail', headers), supabase);
        assertEqual(missing.status, 400, 'detail without tournament_id → 400');
        assertEqual(missing.body.error, 'tournament_id required', 'detail emits required-param error');

        const notFound = await handle(makeRequest('https://x/?action=detail&tournament_id=NOPE', headers), supabase);
        assertEqual(notFound.status, 404, 'detail with unknown id → 404');

        const ok = await handle(makeRequest('https://x/?action=detail&tournament_id=T1', headers), supabase);
        assertEqual(ok.status, 200, 'detail → 200');
        assertEqual(ok.body.success, true, 'detail → success=true');
        assert(ok.body.data && ok.body.data.tournament, 'detail returns tournament');
        assertEqual(ok.body.data.tournament.id, 'T1', 'detail tournament.id matches');
        assert(Array.isArray(ok.body.data.participants), 'detail returns participants array');
        assertEqual(ok.body.data.participants.length, 3, 'detail T1 has 3 participants');
        const p1 = ok.body.data.participants[0];
        assert('student_id' in p1 && 'student_name' in p1, 'participant has student_id + student_name');
    }

    console.log('\n=== action=student_history ==============================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const headers = { 'x-api-key': API_KEY };

        const missing = await handle(makeRequest('https://x/?action=student_history', headers), supabase);
        assertEqual(missing.status, 400, 'student_history without student_id → 400');
        assertEqual(missing.body.error, 'student_id required', 'emits student_id required');

        const ok = await handle(makeRequest('https://x/?action=student_history&student_id=S1', headers), supabase);
        assertEqual(ok.status, 200, 'student_history → 200');
        assertEqual(ok.body.success, true, 'student_history → success=true');
        assert(ok.body.data && Array.isArray(ok.body.data.tournaments), 'returns tournaments array');
        assertEqual(ok.body.data.tournaments.length, 2, 'S1 played in 2 tournaments');
        assertEqual(ok.body.data.tournaments[0].tournament_date, '2026-05-03', 'tournaments ordered newest-first');
        const agg = ok.body.data.aggregates;
        assertEqual(agg.total, 2, 'aggregate total = 2');
        assertEqual(agg.best_place, 1, 'best_place = 1');
        assertEqual(agg.avg_place, 2, 'avg_place = round((1+3)/2) = 2');
        assertEqual(agg.total_rating_gained, 200, 'total_rating_gained = 100 + 100');
        assertEqual(agg.last_date, '2026-05-03', 'last_date = most recent');

        const empty = await handle(makeRequest('https://x/?action=student_history&student_id=NOBODY', headers), supabase);
        assertEqual(empty.status, 200, 'student_history for unknown student → 200');
        assertEqual(empty.body.data.tournaments, [], 'empty tournaments array');
        assertEqual(empty.body.data.aggregates.total, 0, 'empty aggregates total=0');
        assertEqual(empty.body.data.aggregates.best_place, null, 'empty aggregates best_place=null');
        assertEqual(empty.body.data.aggregates.last_date, null, 'empty aggregates last_date=null');
    }

    console.log('\n=== action=branch_leaderboard ==========================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const headers = { 'x-api-key': API_KEY };

        const noBranch = await handle(makeRequest('https://x/?action=branch_leaderboard&league=B', headers), supabase);
        assertEqual(noBranch.status, 400, 'no branch_id → 400');
        assertEqual(noBranch.body.error, 'branch_id required', 'emits branch_id required');

        const noLeague = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=B-1', headers), supabase);
        assertEqual(noLeague.status, 400, 'no league → 400');
        assertEqual(noLeague.body.error, 'league required', 'emits league required');

        // Stretch the cutoff so 2026-02-01 row stays in window.
        const ok = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=B-1&league=B&days=3650', headers), supabase);
        assertEqual(ok.status, 200, 'branch_leaderboard → 200');
        assertEqual(ok.body.success, true, 'branch_leaderboard → success=true');
        assert(Array.isArray(ok.body.data), 'leaderboard returns array');
        // S1 played 2x (places 1, 3 → avg 2), S2 played 1x (place 2 → avg 2). S3 is in B-2, excluded.
        assertEqual(ok.body.data.length, 2, 'leaderboard excludes off-branch students');
        const ids = ok.body.data.map(r => r.student_id).sort();
        assertEqual(ids, ['S1', 'S2'], 'leaderboard contains exactly S1 and S2');
        const s1 = ok.body.data.find(r => r.student_id === 'S1');
        assertEqual(s1.tournaments_played, 2, 'S1 played 2 tournaments');
        assertEqual(s1.best_place, 1, 'S1 best place = 1');
        assertEqual(s1.avg_place, 2, 'S1 avg_place = 2');
        assert('total_rating_gained' in s1, 'leaderboard row has total_rating_gained');

        // Empty branch.
        const emptyBranch = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=NONE&league=B&days=3650', headers), supabase);
        assertEqual(emptyBranch.status, 200, 'empty branch → 200');
        assertEqual(emptyBranch.body.data, [], 'empty branch → []');
        assertEqual(emptyBranch.body.count, 0, 'empty branch → count=0');
    }

    console.log('\n=== unknown action ======================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const headers = { 'x-api-key': API_KEY };
        const bad = await handle(makeRequest('https://x/?action=hack', headers), supabase);
        assertEqual(bad.status, 400, 'unknown action → 400');
        assert(/Invalid action/.test(bad.body.error), 'unknown action → Invalid action error');
    }

    console.log(`\n${'='.repeat(64)}`);
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(64)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Test runner crashed:', e); process.exit(2); });
