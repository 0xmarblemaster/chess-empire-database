/**
 * Tests for Phase 5 branch-leaderboard helper exposed by
 * supabase-data-tournaments.js. Run: node tests/test-branch-leaderboard.js
 *
 * Covers:
 *   - _aggregateLeaderboard: pure aggregation, sort, tie-break, top-10 cap,
 *     same-student merge across leagues
 *   - getBranchLeaderboard: edge-function dispatch (A/B/C/All), fetch error,
 *     missing branchId, empty body — using an injected fetch stub
 */

const tournamentsData = require('../supabase-data-tournaments.js');
const { getBranchLeaderboard } = tournamentsData;
const { _aggregateLeaderboard } = tournamentsData._internal;

// ===== harness ===========================================================
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

// ===== _aggregateLeaderboard ===========================================
console.log('\n• _aggregateLeaderboard — degenerate inputs');
assertEqual(_aggregateLeaderboard(null), [], 'null rows → empty');
assertEqual(_aggregateLeaderboard(undefined), [], 'undefined rows → empty');
assertEqual(_aggregateLeaderboard([]), [], 'empty rows → empty');
assertEqual(_aggregateLeaderboard([null, undefined, {}, { first_name: 'noid' }]), [], 'rows without student_id skipped');

console.log('\n• _aggregateLeaderboard — basic shaping');
{
    const rows = [{
        student_id: 'A', first_name: 'Ana', last_name: 'Aralova',
        tournaments_played: 3, total_rating_gained: 50, best_place: 2,
    }];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out.length, 1, 'single-row input → 1 result');
    assertEqual(out[0].rank, 1, 'single row gets rank 1');
    assertEqual(out[0].student_id, 'A', 'student_id preserved');
    assertEqual(out[0].tournaments_played, 3, 'tournaments_played preserved');
    assertEqual(out[0].total_rating_gained, 50, 'total_rating_gained preserved');
    assertEqual(out[0].best_place, 2, 'best_place preserved');
    assertEqual(out[0].first_name, 'Ana', 'first_name preserved');
}

console.log('\n• _aggregateLeaderboard — ordering by tournaments-played');
{
    const rows = [
        { student_id: 'L', first_name: 'L', last_name: 'L', tournaments_played: 1, total_rating_gained: 0 },
        { student_id: 'H', first_name: 'H', last_name: 'H', tournaments_played: 5, total_rating_gained: 0 },
        { student_id: 'M', first_name: 'M', last_name: 'M', tournaments_played: 3, total_rating_gained: 0 },
    ];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out.map(r => r.student_id), ['H', 'M', 'L'], 'sorted descending by tournaments_played');
    assertEqual(out.map(r => r.rank), [1, 2, 3], 'ranks 1..n assigned in order');
}

console.log('\n• _aggregateLeaderboard — tie-break by total_rating_gained');
{
    const rows = [
        { student_id: 'X', first_name: 'X', last_name: 'X', tournaments_played: 3, total_rating_gained: 10 },
        { student_id: 'Y', first_name: 'Y', last_name: 'Y', tournaments_played: 3, total_rating_gained: 100 },
        { student_id: 'Z', first_name: 'Z', last_name: 'Z', tournaments_played: 3, total_rating_gained: -5 },
    ];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out.map(r => r.student_id), ['Y', 'X', 'Z'], 'ties broken by total_rating_gained desc');
}

console.log('\n• _aggregateLeaderboard — same student across multiple leagues');
{
    const rows = [
        { student_id: 'A', first_name: 'Ana', last_name: 'A', tournaments_played: 2, total_rating_gained: 30, best_place: 4, league: 'B' },
        { student_id: 'A', first_name: 'Ana', last_name: 'A', tournaments_played: 1, total_rating_gained: -10, best_place: 1, league: 'C' },
        { student_id: 'B', first_name: 'Bob', last_name: 'B', tournaments_played: 2, total_rating_gained: 50, best_place: 3, league: 'A' },
    ];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out.length, 2, 'merged 2 leagues for same student → 2 unique students');
    const a = out.find(r => r.student_id === 'A');
    assert(a !== undefined, 'student A appears once after merge');
    assertEqual(a.tournaments_played, 3, 'student A: tournaments_played summed (2+1)');
    assertEqual(a.total_rating_gained, 20, 'student A: total_rating_gained summed (30-10)');
    assertEqual(a.best_place, 1, 'student A: best_place = min across leagues');
}

console.log('\n• _aggregateLeaderboard — top-10 cap');
{
    const rows = [];
    for (let i = 0; i < 15; i++) {
        rows.push({
            student_id: `s${i}`,
            first_name: `S${i}`,
            last_name: 'X',
            tournaments_played: 20 - i,
            total_rating_gained: 0,
        });
    }
    const out = _aggregateLeaderboard(rows);
    assertEqual(out.length, 10, '15 students → capped to top 10');
    assertEqual(out[0].student_id, 's0', 'rank 1 is highest tournaments_played');
    assertEqual(out[9].student_id, 's9', 'rank 10 is the 10th highest');
    assertEqual(out[9].rank, 10, 'ranks go up to 10');
}

console.log('\n• _aggregateLeaderboard — best_place edge cases');
{
    const rows = [
        { student_id: 'A', first_name: 'A', last_name: 'A', tournaments_played: 1, total_rating_gained: 0, best_place: null },
        { student_id: 'A', first_name: 'A', last_name: 'A', tournaments_played: 1, total_rating_gained: 0, best_place: 7 },
        { student_id: 'A', first_name: 'A', last_name: 'A', tournaments_played: 1, total_rating_gained: 0, best_place: 2 },
    ];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out[0].best_place, 2, 'best_place picks minimum, ignoring nulls');
}

console.log('\n• _aggregateLeaderboard — missing numeric fields treated as 0');
{
    const rows = [
        { student_id: 'A', first_name: 'A', last_name: 'A' },
        { student_id: 'B', first_name: 'B', last_name: 'B', tournaments_played: 2, total_rating_gained: 30 },
    ];
    const out = _aggregateLeaderboard(rows);
    assertEqual(out[0].student_id, 'B', 'student with data ranks above one with none');
    const a = out.find(r => r.student_id === 'A');
    assertEqual(a.tournaments_played, 0, 'missing tournaments_played defaults to 0');
    assertEqual(a.total_rating_gained, 0, 'missing total_rating_gained defaults to 0');
    assertEqual(a.best_place, null, 'missing best_place stays null');
}

// ===== getBranchLeaderboard — fetch dispatch ===========================
function makeFetchStub(responsePerLeague) {
    const calls = [];
    async function stub(url) {
        calls.push(url);
        const leagueMatch = url.match(/league=([A-Z])/);
        const league = leagueMatch ? leagueMatch[1] : null;
        const data = responsePerLeague[league] || [];
        return {
            ok: true,
            async json() { return { success: true, data }; },
        };
    }
    return { stub, calls };
}

console.log('\n• getBranchLeaderboard — single-league dispatch');
(async () => {
    const { stub, calls } = makeFetchStub({
        A: [{ student_id: 'a1', first_name: 'A', last_name: 'One', tournaments_played: 4, total_rating_gained: 80, best_place: 2 }],
    });
    const out = await getBranchLeaderboard('branch-uuid-1', 'A', {
        fetch: stub, config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(calls.length, 1, 'league=A → exactly 1 fetch call');
    assert(calls[0].includes('league=A'), 'fetched URL contains league=A');
    assert(calls[0].includes('branch_id=branch-uuid-1'), 'fetched URL contains branch_id');
    assert(calls[0].includes('action=branch_leaderboard'), 'fetched URL contains action');
    assert(calls[0].includes('days=90'), 'fetched URL contains 90-day window');
    assertEqual(out.length, 1, 'league=A returned 1 student');
    assertEqual(out[0].rank, 1, 'student ranked 1');

    console.log('\n• getBranchLeaderboard — All-league dispatch + merge');
    const all = makeFetchStub({
        A: [{ student_id: 's1', first_name: 'S1', last_name: 'X', tournaments_played: 2, total_rating_gained: 10, best_place: 3 }],
        B: [
            { student_id: 's1', first_name: 'S1', last_name: 'X', tournaments_played: 1, total_rating_gained: -5, best_place: 1 },
            { student_id: 's2', first_name: 'S2', last_name: 'Y', tournaments_played: 4, total_rating_gained: 50, best_place: 5 },
        ],
        C: [{ student_id: 's3', first_name: 'S3', last_name: 'Z', tournaments_played: 1, total_rating_gained: 100, best_place: 1 }],
    });
    const out2 = await getBranchLeaderboard('br-2', 'All', {
        fetch: all.stub, config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(all.calls.length, 3, 'league=All → 3 fetch calls (A, B, C)');
    const calledLeagues = all.calls.map(u => u.match(/league=([A-Z])/)[1]).sort();
    assertEqual(calledLeagues, ['A', 'B', 'C'], 'one call per league A/B/C');
    assertEqual(out2.length, 3, '3 unique students after merge');
    assertEqual(out2[0].student_id, 's2', 's2 (4 tournaments) ranks 1');
    const s1 = out2.find(r => r.student_id === 's1');
    assertEqual(s1.tournaments_played, 3, 's1 merged across A+B → 3 tournaments');
    assertEqual(s1.total_rating_gained, 5, 's1 merged delta = 10-5');
    assertEqual(s1.best_place, 1, 's1 best_place = min(3, 1)');

    console.log('\n• getBranchLeaderboard — empty league argument == All');
    const noLg = makeFetchStub({ A: [], B: [], C: [] });
    await getBranchLeaderboard('br-3', '', { fetch: noLg.stub, config: { url: 'https://x', apiKey: 'k' } });
    assertEqual(noLg.calls.length, 3, 'empty-string league → 3 calls (treated as All)');

    const noLg2 = makeFetchStub({ A: [], B: [], C: [] });
    await getBranchLeaderboard('br-3', null, { fetch: noLg2.stub, config: { url: 'https://x', apiKey: 'k' } });
    assertEqual(noLg2.calls.length, 3, 'null league → 3 calls (treated as All)');

    console.log('\n• getBranchLeaderboard — error and edge cases');
    // missing branchId → empty
    const noBranch = await getBranchLeaderboard(null, 'A', { fetch: () => { throw new Error('should not fetch'); } });
    assertEqual(noBranch, [], 'null branchId → empty array (no fetch)');

    // fetch throws → empty array (caught)
    const throwing = await getBranchLeaderboard('br-x', 'A', {
        fetch: async () => { throw new Error('network down'); },
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(throwing, [], 'fetch throw → empty array');

    // non-ok response → empty
    const badResp = await getBranchLeaderboard('br-x', 'A', {
        fetch: async () => ({ ok: false, async json() { return { success: false }; } }),
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(badResp, [], 'non-ok response → empty array');

    // body.success=false → ignored
    const failBody = await getBranchLeaderboard('br-x', 'A', {
        fetch: async () => ({ ok: true, async json() { return { success: false, data: [] }; } }),
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(failBody, [], 'body.success=false → empty array');

    // body.data not array → ignored
    const badData = await getBranchLeaderboard('br-x', 'A', {
        fetch: async () => ({ ok: true, async json() { return { success: true, data: 'not-array' }; } }),
        config: { url: 'https://x', apiKey: 'k' },
    });
    assertEqual(badData, [], 'non-array data → empty array');

    // custom days override threads through to URL
    const dayStub = makeFetchStub({ A: [] });
    await getBranchLeaderboard('br-d', 'A', {
        fetch: dayStub.stub, config: { url: 'https://x', apiKey: 'k' }, days: 30,
    });
    assert(dayStub.calls[0].includes('days=30'), 'custom days param threaded into URL');

    // x-api-key header is sent
    let capturedHeaders = null;
    async function headerStub(_url, opts) {
        capturedHeaders = opts && opts.headers;
        return { ok: true, async json() { return { success: true, data: [] }; } };
    }
    await getBranchLeaderboard('br-h', 'A', {
        fetch: headerStub, config: { url: 'https://x', apiKey: 'secret-key' },
    });
    assertEqual(capturedHeaders && capturedHeaders['x-api-key'], 'secret-key', 'x-api-key header forwarded from config');

    console.log('\n================================================================');
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('================================================================');
    process.exit(failed === 0 ? 0 : 1);
})();
