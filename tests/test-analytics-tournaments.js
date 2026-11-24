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
 *    each action, auth rejection, missing-param 400s, and empty results. The
 *    port reuses roster-logic.mjs (the module index.ts imports) for row
 *    mapping, so only the query plumbing is mirrored here.
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
assert(SRC.includes("const API_KEYS = [Deno.env.get('CHESS_EMPIRE_API_KEY') ?? ''"), 'API key read from CHESS_EMPIRE_API_KEY env (matches analytics-students)');
assert(SRC.includes("x-api-key"), 'CORS allows x-api-key header');
assert(/Access-Control-Allow-Origin/.test(SRC), 'CORS Allow-Origin present');
assert(SRC.includes('SUPABASE_URL'), 'reads SUPABASE_URL env');
assert(SRC.includes('SUPABASE_SERVICE_ROLE_KEY'), 'reads SUPABASE_SERVICE_ROLE_KEY env');
assert(SRC.includes("action === 'list'") || SRC.includes(`action === "list"`), 'handles action=list');
assert(SRC.includes("action === 'detail'") || SRC.includes(`action === "detail"`), 'handles action=detail');
assert(SRC.includes("action === 'student_history'") || SRC.includes(`action === "student_history"`), 'handles action=student_history');
assert(SRC.includes("action === 'branch_leaderboard'") || SRC.includes(`action === "branch_leaderboard"`), 'handles action=branch_leaderboard');
assert(/tournament_id required/.test(SRC), 'detail enforces tournament_id');
assert(/student_id or student_code required/.test(SRC), 'student_history enforces student_id / student_code');
assert(/branch_id required/.test(SRC), 'branch_leaderboard enforces branch_id');
assert(/league required/.test(SRC), 'branch_leaderboard enforces league');
assert(/from\('tournaments'\)/.test(SRC), 'reads tournaments table');
assert(!/tournament_participants'\)/.test(SRC), 'never reads the legacy tournament_participants table');
assert(/from\('tournament_results'\)/.test(SRC), 'reads tournament_results table');
assert(/from\('tournaments_uploads'\)/.test(SRC), 'reads tournaments_uploads table');
assert(/from\('tournament_registrations'\)/.test(SRC), 'detail reads tournament_registrations');
assert(/upload:tournaments_uploads\(id, kind, tournament_date\)/.test(SRC), 'student_history embeds the upload (kind + date)');
assert(/q = q\.eq\('branch_id', branchId\)/.test(SRC), 'list filters on tournaments.branch_id directly');
assert(!/external_contact/.test(SRC), 'external_contact is never selected or returned');
assert(/registrations_count/.test(SRC), 'detail returns registrations_count');
assert(/action === 'student_roster'/.test(SRC), 'handles action=student_roster');
assert(/error: `invalid \$\{parsed\.field\}`/.test(SRC), 'student_roster 400s with invalid <field>');
assert(/from\('audit_log'\)/.test(SRC) && /\.eq\('field_name', 'current_level'\)/.test(SRC), 'student_roster reads current_level audit rows');
assert(/from\('student_current_ratings'\)/.test(SRC), 'student_roster reads student_current_ratings');
assert(!/parent_phone|email/.test(SRC.slice(SRC.indexOf("action === 'student_roster'"), SRC.indexOf("action === 'coach_leaderboard'"))), 'student_roster selects no phone/email');
assert(/from '\.\/roster-logic\.mjs'/.test(SRC), 'imports pure helpers from roster-logic.mjs');
assert(/Use: list, detail, student_history, branch_leaderboard, student_roster,/.test(SRC), 'invalid-action message lists student_roster');
assert(/Unauthorized/.test(SRC), 'has Unauthorized response branch');
// PRD §5: read-only edge function — must NOT mutate.
assert(!/\.insert\(/.test(SRC), 'no inserts');
assert(!/\.update\(/.test(SRC), 'no updates');
assert(!/\.upsert\(/.test(SRC), 'no upserts');
assert(!/\.delete\(/.test(SRC), 'no deletes');

// === mock Supabase client (Postgrest-style chainable builder) ============
function createMockClient(initial) {
    const db = {};
    for (const [k, v] of Object.entries(initial || {})) db[k] = v.slice();
    const reads = [];
    function builder(table) {
        reads.push(table);
        const state = { filters: [], ranges: null, single: false, count: false, head: false, in: null, gte: [], lte: [], gt: [], limit: null };
        const api = {
            select(_cols, opts) { if (opts && opts.count === 'exact') state.count = true; if (opts && opts.head) state.head = true; return api; },
            eq(c, v) { state.filters.push({ c, v }); return api; },
            in(c, v) { state.in = { c, v }; return api; },
            gte(c, v) { state.gte.push({ c, v }); return api; },
            lte(c, v) { state.lte.push({ c, v }); return api; },
            gt(c, v) { state.gt.push({ c, v }); return api; },
            order() { return api; },
            limit(n) { state.limit = n; return api; },
            range(from, to) { state.ranges = { from, to }; return api; },
            maybeSingle() { state.single = 'maybe'; return execute(); },
            then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
        };
        function execute() {
            let rows = db[table] ? db[table].slice() : [];
            for (const f of state.filters) rows = rows.filter(r => r[f.c] === f.v);
            for (const g of state.gte) rows = rows.filter(r => r[g.c] >= g.v);
            for (const l of state.lte) rows = rows.filter(r => r[l.c] <= l.v);
            for (const g of state.gt) rows = rows.filter(r => r[g.c] > g.v);
            if (state.in) {
                const set = new Set(state.in.v);
                rows = rows.filter(r => set.has(r[state.in.c]));
            }
            const count = rows.length;
            if (state.ranges) rows = rows.slice(state.ranges.from, state.ranges.to + 1);
            if (state.limit !== null) rows = rows.slice(0, state.limit);
            if (state.single === 'maybe') return Promise.resolve({ data: rows[0] || null, error: null });
            return Promise.resolve({ data: state.head ? null : rows, error: null, count: state.count ? count : undefined });
        }
        return api;
    }
    return { from: (t) => builder(t), _db: db, _reads: reads };
}

// === port of the handler (mirror of supabase/functions/analytics-tournaments/index.ts) ====
const API_KEY = 'ce-api-2026-08c2e0bf820443dd436c';
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

// Embedded selects (student:students(...), upload:tournaments_uploads(...))
// are resolved by the fixture builder, like PostgREST would.
function makeHandler(L) {
    return async function handle(req, supabase) {
        if (!authenticate(req)) return json({ success: false, error: 'Unauthorized' }, 401);
        const url = new URL(req.url);
        const p = (k) => url.searchParams.get(k);
        const action = p('action') || 'list';

        if (action === 'list') {
            const limit = Math.min(parseInt(p('limit') || '50'), 200);
            const offset = parseInt(p('offset') || '0');
            let q = supabase.from('tournaments').select('*', { count: 'exact' });
            if (p('league')) q = q.eq('league', p('league'));
            if (p('branch_id')) q = q.eq('branch_id', p('branch_id'));
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
            const registrations = await L.fetchAll((from, to) => supabase.from('tournament_registrations')
                .select('...').eq('tournament_id', tournamentId).order('registered_at').range(from, to));
            return json({ success: true, data: { tournament, registrations: registrations.map(L.registrationRow), registrations_count: registrations.length } });
        }

        if (action === 'student_history') {
            const studentId = p('student_id');
            if (!studentId) return json({ success: false, error: 'student_id or student_code required' }, 400);
            const results = await L.fetchAll((from, to) => supabase.from('tournament_results')
                .select('...').eq('student_id', studentId).order('id').range(from, to));
            const history = L.studentHistory(results, new Date().getFullYear());
            return json({ success: true, data: history, count: history.tournaments.length });
        }

        if (action === 'branch_leaderboard') {
            const branchId = p('branch_id');
            const league = p('league');
            if (!branchId) return json({ success: false, error: 'branch_id required' }, 400);
            if (!league) return json({ success: false, error: 'league required' }, 400);
            const kind = L.LEAGUE_KINDS[league];
            if (!kind) return json({ success: false, error: `invalid league (one of: ${Object.keys(L.LEAGUE_KINDS).join(', ')})` }, 400);
            const days = parseInt(p('days') || '90');
            const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
            const students = await L.fetchAll((from, to) => supabase.from('students').select('...')
                .eq('branch_id', branchId).eq('status', 'active').order('id').range(from, to));
            const uploads = await L.fetchAll((from, to) => supabase.from('tournaments_uploads').select('id')
                .eq('kind', kind).gte('tournament_date', since).order('id').range(from, to));
            const results = [];
            for (const ids of L.chunk(uploads.map(u => u.id))) {
                results.push(...await L.fetchAll((from, to) => supabase.from('tournament_results').select('...')
                    .in('upload_id', ids).order('id').range(from, to)));
            }
            const leaderboard = L.branchLeaderboard(results, Object.fromEntries(students.map(s => [s.id, s])));
            return json({ success: true, data: leaderboard, count: leaderboard.length, league, branch_id: branchId, days });
        }

        if (action === 'student_roster') {
            const parsed = L.parseStudentRosterParams({ status: p('status'), limit: p('limit'), offset: p('offset'), after_id: p('after_id') });
            if (!parsed.value) return json({ success: false, error: `invalid ${parsed.field}` }, 400);
            const rp = parsed.value;
            const asOf = AS_OF;
            let pageQuery = supabase.from('students').select('...').order('id');
            let countQuery = supabase.from('students').select('id', { count: 'exact', head: true });
            if (rp.status !== 'all') { pageQuery = pageQuery.eq('status', rp.status); countQuery = countQuery.eq('status', rp.status); }
            pageQuery = rp.after_id ? pageQuery.gt('id', rp.after_id).limit(rp.limit) : pageQuery.range(rp.offset, rp.offset + rp.limit - 1);
            const page = await pageQuery;
            const counted = await countQuery;
            const coaches = await L.fetchAll((f, t) => supabase.from('coaches').select('...').range(f, t));
            const branches = await L.fetchAll((f, t) => supabase.from('branches').select('...').range(f, t));
            const uploads = await L.fetchAll((f, t) => supabase.from('tournaments_uploads').select('...').range(f, t));
            const students = page.data || [];
            const ids = students.map(s => s.id);
            const ratings = await L.fetchAll((f, t) => supabase.from('student_current_ratings').select('...').in('student_id', ids).range(f, t));
            const audit = await L.fetchAll((f, t) => supabase.from('audit_log').select('...')
                .eq('entity_type', 'students').eq('field_name', 'current_level').eq('action', 'UPDATE').in('entity_id', ids).range(f, t));
            const results = await L.fetchAll((f, t) => supabase.from('tournament_results').select('...').in('student_id', ids).range(f, t));
            const lookups = {
                branchNames: Object.fromEntries(branches.map(b => [b.id, b.name])),
                coachNames: L.nameMap(coaches),
                ratings: Object.fromEntries(ratings.map(r => [r.student_id, r])),
                step2: L.step2Dates(audit),
                stats: L.tournamentStats(results, Object.fromEntries(uploads.map(u => [u.id, u.tournament_date])), asOf),
            };
            return json({ success: true, data: {
                as_of: asOf, status: rp.status, total: counted.count ?? 0, limit: rp.limit, offset: rp.offset,
                after_id: rp.after_id, next_after_id: L.nextAfterId(students, rp.limit), rules: L.ROSTER_RULES,
                students: students.map(s => L.studentRosterRow(s, lookups)),
            } });
        }

        return json({ success: false, error: 'Invalid action. Use: list, detail, student_history, branch_leaderboard, student_roster, coach_leaderboard, coach_kpi_summary, school_kpi_summary, school_student_drilldown' }, 400);
    };
}

// === fixtures ===========================================================
const AS_OF = '2026-11-24T09:00:00.000Z';
const recent = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const S = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const fixtureDb = () => {
    const uploads = [
        { id: 'U1', kind: 'league_b', tournament_date: recent },
        { id: 'U2', kind: 'league_b', tournament_date: '2026-02-01' },
        { id: 'U3', kind: 'razryad_4', tournament_date: '2026-11-01' },
    ];
    const up = Object.fromEntries(uploads.map(u => [u.id, u]));
    const res = (id, upload_id, student_id, rank, rating_before, rating_delta, games_played = 5) =>
        ({ id, upload_id, student_id, rank, score: 3, games_played, rating_before, rating_delta, earned_razryad: null, upload: up[upload_id] });
    const students = [
        { id: S(1), student_code: 'CE-00001', first_name: 'Иван', last_name: 'Иванов', branch_id: 'B-1', coach_id: 'C-1', razryad: null, status: 'active', current_level: 3, amocrm_customer_id: 111, parent_phone: '+77000000001' },
        { id: S(2), student_code: 'CE-00002', first_name: 'Пётр', last_name: 'Петров', branch_id: 'B-1', coach_id: 'C-1', razryad: '4th', status: 'active', current_level: 2, amocrm_customer_id: null, parent_phone: '+77000000002' },
        { id: S(3), student_code: 'CE-00003', first_name: 'A', last_name: 'B', branch_id: 'B-2', coach_id: null, razryad: null, status: 'active', current_level: 1, amocrm_customer_id: null },
        { id: S(4), student_code: 'CE-00004', first_name: 'F', last_name: 'Z', branch_id: 'B-1', coach_id: null, razryad: null, status: 'frozen', current_level: 2, amocrm_customer_id: null },
    ];
    return {
        tournaments: [
            { id: 'T1', name: 'Debut',   league: 'B', branch_id: 'B-1', tournament_date: '2026-05-03' },
            { id: 'T2', name: 'Tactica', league: 'A', branch_id: 'B-2', tournament_date: '2026-04-12' },
            { id: 'T3', name: 'Opening', league: 'B', branch_id: 'B-1', tournament_date: '2026-02-01' },
        ],
        tournament_registrations: [
            { id: 'R1', tournament_id: 'T1', student_id: S(1), registered_at: '2026-05-01T10:00:00Z', player_name: 'Иванов Иван', display_name: null, source: 'dashboard', external_contact: null,
                student: { student_code: 'CE-00001', first_name: 'Иван', last_name: 'Иванов', branch_id: 'B-1' } },
            { id: 'R2', tournament_id: 'T1', student_id: null, registered_at: '2026-05-01T11:00:00Z', player_name: 'Guest Kid', display_name: 'Guest K.', source: 'telegram', external_contact: '@parent', student: null },
            { id: 'R3', tournament_id: 'T3', student_id: S(2), registered_at: '2026-01-30T10:00:00Z', player_name: 'x', display_name: null, source: 'dashboard', external_contact: null,
                student: { student_code: 'CE-00002', first_name: 'Пётр', last_name: 'Петров', branch_id: 'B-1' } },
        ],
        tournaments_uploads: uploads,
        tournament_results: [
            res('TR1', 'U1', S(1), 1, 600, 100),
            res('TR2', 'U1', S(2), 2, 550, 50),
            res('TR3', 'U2', S(1), 3, 500, 100),
            res('TR4', 'U1', S(3), 5, 400, 5),    // other branch
            res('TR5', 'U3', S(1), 2, 700, 10),   // razryad_4
            res('TR6', 'U2', S(2), 7, 540, 10, 0), // unplayed entry
        ],
        students,
        coaches: [{ id: 'C-1', first_name: 'Коуч', last_name: 'Один' }],
        branches: [{ id: 'B-1', name: 'Халык' }, { id: 'B-2', name: 'Дебют' }],
        student_current_ratings: [{ student_id: S(1), rating: 810, rating_date: '2026-11-01', league: 'A' }, { student_id: S(2), rating: 450, rating_date: recent, league: 'C' }],
        audit_log: [
            { entity_type: 'students', entity_id: S(2), action: 'UPDATE', field_name: 'current_level', old_value: '1', new_value: '2', changed_at: '2026-03-03T12:00:00Z' },
            { entity_type: 'students', entity_id: S(2), action: 'UPDATE', field_name: 'razryad', old_value: '1', new_value: '2', changed_at: '2026-02-10T12:00:00Z' },
        ],
    };
};

// === tests ===============================================================
async function run() {
    const L = await import(path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'roster-logic.mjs'));
    const handle = makeHandler(L);
    const headers = { 'x-api-key': API_KEY };

    console.log('\n=== auth ================================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const noKey = await handle(makeRequest('https://x/?action=list'), supabase);
        assertEqual(noKey.status, 401, 'no x-api-key → 401');
        assertEqual(noKey.body.success, false, 'no x-api-key → success=false');
        assertEqual(noKey.body.error, 'Unauthorized', 'no x-api-key → error=Unauthorized');

        const wrongKey = await handle(makeRequest('https://x/?action=list', { 'x-api-key': 'bad' }), supabase);
        assertEqual(wrongKey.status, 401, 'wrong x-api-key → 401');

        const okKey = await handle(makeRequest('https://x/?action=list', headers), supabase);
        assertEqual(okKey.status, 200, 'correct x-api-key → 200');
    }

    console.log('\n=== action=list =========================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const all = await handle(makeRequest('https://x/?action=list', headers), supabase);
        assertEqual(all.status, 200, 'list → 200');
        assertEqual(all.body.success, true, 'list → success=true');
        assertEqual(all.body.data.length, 3, 'list returns 3 tournaments');
        assert(typeof all.body.count === 'number', 'list returns count');

        const filtered = await handle(makeRequest('https://x/?action=list&league=A', headers), supabase);
        assertEqual(filtered.body.data.map(t => t.name), ['Tactica'], 'league=A returns Tactica');

        const branch = await handle(makeRequest('https://x/?action=list&branch_id=B-1', headers), supabase);
        assertEqual(branch.body.data.map(t => t.id), ['T1', 'T3'], 'branch_id filters on tournaments.branch_id');
        assertEqual(branch.body.count, 2, 'branch-filtered count is exact');
        assert(!supabase._reads.includes('tournament_participants'), 'list never touches tournament_participants');

        const dated = await handle(makeRequest('https://x/?action=list&date_from=2026-03-01', headers), supabase);
        assertEqual(dated.body.data.length, 2, 'list date_from=2026-03-01 → 2 tournaments');

        const paged = await handle(makeRequest('https://x/?action=list&limit=2&offset=0', headers), supabase);
        assertEqual(paged.body.data.length, 2, 'list limit=2 → 2 returned');
        assertEqual([paged.body.limit, paged.body.offset], [2, 0], 'list echoes limit/offset');
    }

    console.log('\n=== action=detail =======================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const missing = await handle(makeRequest('https://x/?action=detail', headers), supabase);
        assertEqual(missing.status, 400, 'detail without tournament_id → 400');
        assertEqual(missing.body.error, 'tournament_id required', 'detail emits required-param error');

        const notFound = await handle(makeRequest('https://x/?action=detail&tournament_id=NOPE', headers), supabase);
        assertEqual(notFound.status, 404, 'detail with unknown id → 404');

        const ok = await handle(makeRequest('https://x/?action=detail&tournament_id=T1', headers), supabase);
        assertEqual(ok.status, 200, 'detail → 200');
        assertEqual(ok.body.data.tournament.id, 'T1', 'detail tournament.id matches');
        assert(!('participants' in ok.body.data), 'participants field removed');
        assertEqual(ok.body.data.registrations_count, 2, 'T1 has 2 registrations');
        assertEqual(ok.body.data.registrations[0], { id: 'R1', student_id: S(1), student_code: 'CE-00001', name: 'Иван Иванов', branch_id: 'B-1', registered_at: '2026-05-01T10:00:00Z', source: 'dashboard' }, 'student registration shape');
        assertEqual(ok.body.data.registrations[1].name, 'Guest K.', 'guest registration uses display_name');
        assert(!JSON.stringify(ok.body).includes('@parent'), 'external_contact never returned');
    }

    console.log('\n=== action=student_history ==============================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const missing = await handle(makeRequest('https://x/?action=student_history', headers), supabase);
        assertEqual(missing.status, 400, 'student_history without student → 400');
        assertEqual(missing.body.error, 'student_id or student_code required', 'emits student_id or student_code required');

        const ok = await handle(makeRequest(`https://x/?action=student_history&student_id=${S(1)}`, headers), supabase);
        assertEqual(ok.status, 200, 'student_history → 200');
        assertEqual(ok.body.data.tournaments.length, 3, 'S1 has 3 results (all kinds)');
        assertEqual(ok.body.count, 3, 'count = 3');
        assertEqual(ok.body.data.tournaments.map(t => t.tournament_date), [recent, '2026-11-01', '2026-02-01'], 'newest first');
        const top = ok.body.data.tournaments[0];
        assertEqual([top.place, top.rating_after, top.tournament_id, top.league, top.kind, top.tournament_name], [1, 700, 'U1', 'B', 'league_b', `League B (${recent})`], 'row mapped from tournament_results + upload');
        assertEqual(ok.body.data.tournaments[1].league, 'R4', 'razryad_4 → R4');
        const agg = ok.body.data.aggregates;
        assertEqual([agg.total, agg.best_place, agg.avg_place, agg.total_rating_gained, agg.last_date], [3, 1, 2, 210, recent], 'aggregates');

        const empty = await handle(makeRequest('https://x/?action=student_history&student_id=NOBODY', headers), supabase);
        assertEqual(empty.status, 200, 'student_history for unknown student → 200');
        assertEqual(empty.body.data.tournaments, [], 'empty tournaments array');
        assertEqual([empty.body.data.aggregates.total, empty.body.data.aggregates.best_place, empty.body.data.aggregates.last_date], [0, null, null], 'empty aggregates');
        assert(!supabase._reads.includes('tournament_participants'), 'student_history never touches tournament_participants');
    }

    console.log('\n=== action=branch_leaderboard ==========================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const noBranch = await handle(makeRequest('https://x/?action=branch_leaderboard&league=B', headers), supabase);
        assertEqual([noBranch.status, noBranch.body.error], [400, 'branch_id required'], 'no branch_id → 400');
        const noLeague = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=B-1', headers), supabase);
        assertEqual([noLeague.status, noLeague.body.error], [400, 'league required'], 'no league → 400');
        for (const bad of ['A', 'b', 'all']) {
            const r = await handle(makeRequest(`https://x/?action=branch_leaderboard&branch_id=B-1&league=${bad}`, headers), supabase);
            assertEqual(r.status, 400, `league=${bad} → 400`);
        }

        const ok = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=B-1&league=B&days=3650', headers), supabase);
        assertEqual(ok.status, 200, 'branch_leaderboard → 200');
        // S1: places 1, 3 → avg 2; S2: place 2 (unplayed entry skipped); S3 off-branch.
        assertEqual(ok.body.data.map(r => r.student_id).sort(), [S(1), S(2)], 'leaderboard excludes off-branch students');
        const s1 = ok.body.data.find(r => r.student_id === S(1));
        assertEqual([s1.tournaments_played, s1.best_place, s1.avg_place, s1.total_rating_gained], [2, 1, 2, 200], 'S1 aggregates (league B only)');
        assertEqual(ok.body.data.find(r => r.student_id === S(2)).tournaments_played, 1, 'games_played=0 entry ignored');

        const r4 = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=B-1&league=R4&days=3650', headers), supabase);
        assertEqual(r4.body.data.map(r => r.student_id), [S(1)], 'league=R4 maps to razryad_4 uploads');

        const emptyBranch = await handle(makeRequest('https://x/?action=branch_leaderboard&branch_id=NONE&league=B&days=3650', headers), supabase);
        assertEqual([emptyBranch.status, emptyBranch.body.data, emptyBranch.body.count], [200, [], 0], 'empty branch → []');
    }

    console.log('\n=== action=student_roster ==============================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        for (const [qs, field] of [['limit=0', 'limit'], ['limit=201', 'limit'], ['offset=-1', 'offset'], ['after_id=nope', 'after_id'], ['status=gone', 'status']]) {
            const r = await handle(makeRequest(`https://x/?action=student_roster&${qs}`, headers), supabase);
            assertEqual([r.status, r.body], [400, { success: false, error: `invalid ${field}` }], `${qs} → 400 invalid ${field}`);
        }

        const ok = await handle(makeRequest('https://x/?action=student_roster', headers), supabase);
        assertEqual(ok.status, 200, 'student_roster → 200');
        const d = ok.body.data;
        assertEqual([d.status, d.total, d.limit, d.offset, d.after_id, d.next_after_id], ['active', 3, 100, 0, null, null], 'defaults: active, total 3, single page');
        assertEqual(d.rules.league_b, 'rating >= 450 and <= 800', 'rules included');
        assertEqual(d.students.map(s => s.student_code), ['CE-00001', 'CE-00002', 'CE-00003'], 'ordered by id, frozen excluded');
        const [s1, s2, s3] = d.students;
        assertEqual([s1.current_rating, s1.current_league, s1.admitted_to_tournaments, s1.step2_date, s1.step2_date_known], [810, 'A', true, null, false], 'S1: A league; admitted without audit row');
        assertEqual([s1.tournaments_total, s1.tournaments_last_30d, s1.last_tournament_date, s1.amocrm_customer_id], [3, 2, recent, '111'], 'S1 tournament counts (distinct uploads, all kinds)');
        assertEqual([s2.current_league, s2.step2_date, s2.step2_date_known], ['B', '2026-03-03', true], 'S2: 450 → B (view says C); step2 from current_level audit only');
        assertEqual([s2.tournaments_total, s2.tournaments_last_30d], [2, 1], 'S2 counts include unplayed upload entry');
        assertEqual([s2.branch_name, s2.trainer_name], ['Халык', 'Коуч Один'], 'branch + trainer names');
        assertEqual([s3.admitted_to_tournaments, s3.current_rating, s3.current_league], [false, null, null], 'S3: level 1, no rating');
        assert(!JSON.stringify(ok.body).includes('+7700'), 'no phone in response');

        const all = await handle(makeRequest('https://x/?action=student_roster&status=all&limit=2', headers), supabase);
        assertEqual([all.body.data.total, all.body.data.students.length, all.body.data.next_after_id], [4, 2, S(2)], 'status=all page 1: full page → next_after_id');
        const next = await handle(makeRequest(`https://x/?action=student_roster&status=all&limit=2&after_id=${S(2)}`, headers), supabase);
        assertEqual(next.body.data.students.map(s => s.student_id), [S(3), S(4)], 'keyset page 2 continues after cursor');
        const last = await handle(makeRequest(`https://x/?action=student_roster&status=all&limit=2&after_id=${S(4)}`, headers), supabase);
        assertEqual([last.body.data.students.length, last.body.data.next_after_id], [0, null], 'past the end → empty, no cursor');
        const off = await handle(makeRequest('https://x/?action=student_roster&status=frozen&offset=0', headers), supabase);
        assertEqual(off.body.data.students.map(s => s.student_code), ['CE-00004'], 'status=frozen');
    }

    console.log('\n=== unknown action ======================================================\n');
    {
        const supabase = createMockClient(fixtureDb());
        const bad = await handle(makeRequest('https://x/?action=hack', headers), supabase);
        assertEqual(bad.status, 400, 'unknown action → 400');
        assert(/Invalid action.*student_roster/.test(bad.body.error), 'unknown action → Invalid action error listing student_roster');
    }

    console.log(`\n${'='.repeat(64)}`);
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(64)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Test runner crashed:', e); process.exit(2); });
