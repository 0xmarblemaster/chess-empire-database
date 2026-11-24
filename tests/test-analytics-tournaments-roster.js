/**
 * Unit tests for supabase/functions/analytics-tournaments/roster-logic.mjs —
 * the pure helpers behind action=student_roster and the tournament_results
 * reads of student_history / branch_leaderboard / detail. The module is the
 * one index.ts imports (no re-implementation).
 *
 * Run: node tests/test-analytics-tournaments-roster.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

async function run() {
    const L = await import(path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'roster-logic.mjs'));

    console.log('\n=== calcLeagueFromRating ===============================================\n');
    assertEqual(L.calcLeagueFromRating(null), null, 'null → null');
    assertEqual(L.calcLeagueFromRating(801), 'A', '801 → A');
    assertEqual(L.calcLeagueFromRating(800), 'B', '800 → B (canonical rule: > 800 is A)');
    assertEqual(L.calcLeagueFromRating(450), 'B', '450 → B (>= 450, unlike the view\'s > 450)');
    assertEqual(L.calcLeagueFromRating(449), 'C', '449 → C');

    console.log('\n=== parseStudentRosterParams ===========================================\n');
    assertEqual(L.parseStudentRosterParams({}), { value: { status: 'active', limit: 100, offset: 0, after_id: null } }, 'defaults: active / 100 / 0');
    assertEqual(L.parseStudentRosterParams({ status: 'all', limit: '200', offset: '400' }).value, { status: 'all', limit: 200, offset: 400, after_id: null }, 'status=all, limit=200, offset=400');
    assertEqual(L.parseStudentRosterParams({ status: 'frozen' }).value.status, 'frozen', 'status=frozen accepted');
    assertEqual(L.parseStudentRosterParams({ status: 'left' }).value.status, 'left', 'status=left accepted');
    assertEqual(L.parseStudentRosterParams({ status: 'gone' }), { field: 'status' }, 'unknown status → field status');
    for (const bad of ['0', '201', '1.5', 'abc', '-1']) {
        assertEqual(L.parseStudentRosterParams({ limit: bad }), { field: 'limit' }, `limit=${bad} → invalid limit`);
    }
    for (const bad of ['-1', '2.5', 'x']) {
        assertEqual(L.parseStudentRosterParams({ offset: bad }), { field: 'offset' }, `offset=${bad} → invalid offset`);
    }
    assertEqual(L.parseStudentRosterParams({ after_id: 'not-a-uuid' }), { field: 'after_id' }, 'bad after_id → invalid after_id');
    assertEqual(L.parseStudentRosterParams({ after_id: U1, offset: '50' }).value, { status: 'active', limit: 100, offset: 0, after_id: U1 }, 'after_id given → offset ignored');

    console.log('\n=== nextAfterId ========================================================\n');
    assertEqual(L.nextAfterId([{ id: U1 }, { id: U2 }], 2), U2, 'full page → last id');
    assertEqual(L.nextAfterId([{ id: U1 }], 2), null, 'short page → null');
    assertEqual(L.nextAfterId([], 2), null, 'empty page → null');

    console.log('\n=== step2Dates (audit_log current_level) ===============================\n');
    const step2 = L.step2Dates([
        { entity_id: 'S1', old_value: '1', new_value: '2', changed_at: '2026-03-10T08:00:00+00:00' },
        { entity_id: 'S1', old_value: '1', new_value: '2', changed_at: '2026-02-20T08:00:00+00:00' }, // earlier → wins
        { entity_id: 'S1', old_value: '2', new_value: '3', changed_at: '2026-01-01T08:00:00+00:00' }, // not a crossing
        { entity_id: 'S2', old_value: '1', new_value: '3', changed_at: '2026-04-01T23:30:00Z' },       // jump 1→3 counts
        { entity_id: 'S3', old_value: '3', new_value: '1', changed_at: '2026-04-01T00:00:00Z' },       // demotion
        { entity_id: 'S4', old_value: null, new_value: '2', changed_at: '2026-04-01T00:00:00Z' },     // unknown old
        { entity_id: 'S5', old_value: '0', new_value: '2', changed_at: '2026-05-05T22:00:00-05:00' }, // UTC date rolls
    ]);
    assertEqual(step2.S1, '2026-02-20', 'earliest 1→2 crossing wins');
    assertEqual(step2.S2, '2026-04-01', '1→3 jump counts as step-2 date');
    assertEqual(step2.S3, undefined, 'demotion is not a step-2 date');
    assertEqual(step2.S4, undefined, 'null old_value is ignored');
    assertEqual(step2.S5, '2026-05-06', 'date is taken in UTC');

    console.log('\n=== tournamentStats / 30-day window ====================================\n');
    const asOf = '2026-11-24T10:00:00.000Z';
    assertEqual(L.last30dCutoff(asOf), '2026-10-25', 'cutoff = as_of date - 30 days');
    const uploadDates = { UA: '2026-11-22', UB: '2026-10-25', UC: '2026-10-24', UD: '2025-05-01' };
    const stats = L.tournamentStats([
        { student_id: 'S1', upload_id: 'UA' },
        { student_id: 'S1', upload_id: 'UA' }, // duplicate upload counted once
        { student_id: 'S1', upload_id: 'UB' },
        { student_id: 'S1', upload_id: 'UC' },
        { student_id: 'S1', upload_id: 'UD' },
        { student_id: 'S2', upload_id: 'UD' },
    ], uploadDates, asOf);
    assertEqual(stats.S1, { total: 4, last_30d: 2, last_date: '2026-11-22' }, 'S1: 4 distinct uploads, 2 in window (boundary inclusive)');
    assertEqual(stats.S2, { total: 1, last_30d: 0, last_date: '2025-05-01' }, 'S2: old tournament only');
    assertEqual(stats.S3, undefined, 'no results → no entry');

    console.log('\n=== studentRosterRow ===================================================\n');
    const student = {
        id: 'S1', student_code: 'CE-00959', first_name: 'Айсулу', last_name: 'Ким', branch_id: 'B1', coach_id: 'C1',
        razryad: '4th', status: 'active', current_level: 3, amocrm_customer_id: 31234567, parent_phone: '+77001234567',
    };
    const lookups = {
        branchNames: { B1: 'Халык' },
        coachNames: { C1: 'Иван Петров' },
        ratings: { S1: { student_id: 'S1', rating: 512.6, rating_date: '2026-11-22' } },
        step2: { S1: '2026-03-01' },
        stats: { S1: { total: 13, last_30d: 3, last_date: '2026-11-22' } },
    };
    const row = L.studentRosterRow(student, lookups);
    assertEqual(Object.keys(row), [
        'student_id', 'student_code', 'full_name', 'branch_id', 'branch_name', 'trainer_id', 'trainer_name', 'status',
        'current_level', 'admitted_to_tournaments', 'step2_date', 'step2_date_known', 'current_rating', 'current_rating_date',
        'current_league', 'razryad', 'amocrm_customer_id', 'tournaments_total', 'tournaments_last_30d', 'last_tournament_date',
    ], 'row has exactly the documented keys (no phone/email)');
    assertEqual(row.full_name, 'Айсулу Ким', 'full_name');
    assertEqual([row.branch_name, row.trainer_name], ['Халык', 'Иван Петров'], 'branch + trainer names resolved');
    assertEqual(row.admitted_to_tournaments, true, 'level 3 → admitted');
    assertEqual([row.step2_date, row.step2_date_known], ['2026-03-01', true], 'step2 date known');
    assertEqual([row.current_rating, row.current_rating_date, row.current_league], [513, '2026-11-22', 'B'], 'rating rounded to int, league B');
    assertEqual(row.amocrm_customer_id, '31234567', 'amocrm id as string');
    assertEqual([row.tournaments_total, row.tournaments_last_30d, row.last_tournament_date], [13, 3, '2026-11-22'], 'tournament counts');

    const bare = L.studentRosterRow({ id: 'S9', first_name: 'A', last_name: '', status: 'frozen', current_level: 2, amocrm_customer_id: null });
    assertEqual([bare.admitted_to_tournaments, bare.step2_date, bare.step2_date_known], [true, null, false], 'admitted without audit row → step2_date_known=false');
    assertEqual([bare.current_rating, bare.current_rating_date, bare.current_league], [null, null, null], 'no rating → nulls');
    assertEqual([bare.tournaments_total, bare.tournaments_last_30d, bare.last_tournament_date], [0, 0, null], 'no tournaments → 0/0/null');
    assertEqual([bare.amocrm_customer_id, bare.branch_name, bare.trainer_name], [null, null, null], 'missing lookups → null');
    const intro = L.studentRosterRow({ id: 'S8', status: 'active', current_level: 1 });
    assertEqual([intro.admitted_to_tournaments, intro.step2_date_known], [false, true], 'level 1 → not admitted, step2 null is known');
    assertEqual(L.studentRosterRow({ id: 'S7', current_level: 1 }, { ratings: { S7: { rating: 900 } } }).current_league, 'A', 'rating 900 → A');

    assertEqual(L.ROSTER_RULES.admitted, 'current_level >= 2', 'rules.admitted');
    assertEqual(L.ROSTER_RULES.step2_date_available_since, '2026-02-05', 'rules.step2_date_available_since');

    console.log('\n=== student_history (tournament_results) ===============================\n');
    // CE-00959 has 13 results across all four kinds — every one must come back.
    const kinds = ['league_b', 'league_c', 'razryad_3', 'razryad_4'];
    const ce959 = Array.from({ length: 13 }, (_, i) => {
        const kind = kinds[i % 4];
        const date = `2026-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '15' : '01'}`;
        return {
            id: `R${i}`, upload_id: `UP${i}`, rank: (i % 5) + 1, score: 3.5, games_played: 5,
            rating_before: 400 + i * 10, rating_delta: i % 3 === 0 ? -5 : 10, earned_razryad: kind === 'razryad_4' && i === 3 ? '4th' : null,
            upload: { id: `UP${i}`, kind, tournament_date: date },
        };
    });
    const hist = L.studentHistory(ce959, 2026);
    assertEqual(hist.tournaments.length, 13, 'CE-00959: 13 results returned');
    assertEqual(hist.aggregates.total, 13, 'aggregates.total = 13');
    assertEqual(hist.tournaments[0].tournament_date, '2026-07-01', 'newest first');
    assertEqual(hist.tournaments[12].tournament_date, '2026-01-01', 'oldest last');
    const h0 = hist.tournaments.find((r) => r.id === 'R3');
    assertEqual(h0, {
        id: 'R3', place: 4, rating_before: 430, rating_after: 425, rating_delta: -5, tournament_id: 'UP3',
        tournament_name: '4th Razryad Qualifier (2026-02-15)', league: 'R4', kind: 'razryad_4', tournament_date: '2026-02-15',
        score: 3.5, games_played: 5, earned_razryad: '4th',
    }, 'row maps rank→place, upload_id→tournament_id, kind→league, rating_after = before + delta');
    assertEqual(hist.tournaments.find((r) => r.id === 'R0').tournament_name, 'League B (2026-01-01)', 'League B label');
    assertEqual(hist.tournaments.find((r) => r.id === 'R1').league, 'C', 'league_c → C');
    assertEqual(hist.tournaments.find((r) => r.id === 'R2').league, 'R3', 'razryad_3 → R3');
    assertEqual(hist.aggregates.best_place, 1, 'best_place');
    assertEqual(hist.aggregates.ytd, 13, 'ytd counts 2026 rows');
    assertEqual(hist.aggregates.last_date, '2026-07-01', 'last_date');
    assertEqual(hist.aggregates.total_rating_gained, 5 * -5 + 8 * 10, 'total_rating_gained sums deltas');
    const nulls = L.historyRow({ id: 'X', upload_id: 'U', rank: 2, rating_before: null, rating_delta: 7 }, { kind: 'league_c', tournament_date: '2026-01-01' });
    assertEqual(nulls.rating_after, null, 'rating_after null when rating_before is null');
    assertEqual(L.studentHistory([], 2026).aggregates, { total: 0, ytd: 0, best_place: null, avg_place: null, total_rating_gained: 0, last_date: null }, 'empty history aggregates');

    console.log('\n=== branchLeaderboard ==================================================\n');
    const studentsById = {
        S1: { id: 'S1', student_code: 'CE-00001', first_name: 'A', last_name: 'One' },
        S2: { id: 'S2', student_code: 'CE-00002', first_name: 'B', last_name: 'Two' },
    };
    const lb = L.branchLeaderboard([
        { student_id: 'S1', rank: 1, games_played: 5, rating_delta: 20 },
        { student_id: 'S1', rank: 5, games_played: 5, rating_delta: -4 },
        { student_id: 'S2', rank: 2, games_played: 5, rating_delta: 8 },
        { student_id: 'S2', rank: 9, games_played: 0, rating_delta: 0 }, // unplayed entry skipped
        { student_id: 'S3', rank: 1, games_played: 5, rating_delta: 50 }, // other branch / inactive
    ], studentsById);
    assertEqual(lb.map((r) => r.student_id), ['S2', 'S1'], 'sorted by avg_place, off-branch excluded');
    assertEqual(lb[1], { student_id: 'S1', student_code: 'CE-00001', first_name: 'A', last_name: 'One', tournaments_played: 2, avg_place: 3, best_place: 1, total_rating_gained: 16 }, 'S1 aggregates');
    assertEqual(lb[0].tournaments_played, 1, 'games_played=0 entry not counted');
    assertEqual(L.LEAGUE_KINDS, { B: 'league_b', C: 'league_c', R3: 'razryad_3', R4: 'razryad_4' }, 'league → kind map');

    console.log('\n=== registrationRow ====================================================\n');
    assertEqual(L.registrationRow({
        id: 'R1', student_id: 'S1', registered_at: '2026-11-20T10:00:00Z', player_name: 'raw', display_name: 'disp', source: 'bot',
        external_contact: '+7700', student: { student_code: 'CE-00001', first_name: 'A', last_name: 'One', branch_id: 'B1' },
    }), { id: 'R1', student_id: 'S1', student_code: 'CE-00001', name: 'A One', branch_id: 'B1', registered_at: '2026-11-20T10:00:00Z', source: 'bot' }, 'student registration (external_contact dropped)');
    assertEqual(L.registrationRow({ id: 'R2', student_id: null, registered_at: 't', player_name: 'Guest', display_name: null, source: 'guest', student: null }).name, 'Guest', 'guest falls back to player_name');

    console.log('\n=== chunk / fetchAll ===================================================\n');
    assertEqual(L.chunk(Array.from({ length: 450 }, (_, i) => i)).map((c) => c.length), [200, 200, 50], 'chunk ≤ 200');
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const calls = [];
    const fetched = await L.fetchAll(async (from, to) => { calls.push([from, to]); return { data: all.slice(from, to + 1), error: null }; });
    assertEqual(fetched.length, 2500, 'fetchAll reads every row');
    assertEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]], 'fetchAll pages by 1000 until a short page');
    const exact = [];
    await L.fetchAll(async (from, to) => { exact.push(from); return { data: from < 1000 ? all.slice(0, 1000) : [], error: null }; });
    assertEqual(exact, [0, 1000], 'exactly-full page triggers one more (empty) read');
    let threw = null;
    try { await L.fetchAll(async () => ({ data: null, error: { message: 'boom' } })); } catch (e) { threw = e; }
    assertEqual(threw, { message: 'boom' }, 'fetchAll rethrows PostgREST errors');

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('Test runner crashed:', e); process.exit(2); });
