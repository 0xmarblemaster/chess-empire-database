/**
 * Tests for the rewritten student-card tournament data layer.
 * Run: node tests/test-student-card-tournament-data.js
 *
 * Covers the helpers and the three public queries after the migration from
 * tournament_participants → tournament_results joined to tournaments_uploads:
 *   - _deriveTournamentMeta: kind → league letter mapping + filename cleanup
 *   - _normalizeResultRow: field mapping (rank→place, rating_before+delta→after)
 *   - _dedupeResults: keep most recent uploaded_at per (date,kind,rank,delta)
 *   - getStudentTournaments: normalized + sorted + capped recent list
 *   - getStudentTournamentsAll: full history, oldest first, deduped
 *   - getStudentTournamentAggregates: totals piped through _aggregateFromRows
 *
 * The verification target from the plan — Turabay Ali should show 2 unique
 * tournaments after dedupe with best place 13 — is mirrored in a fixture
 * here so the math is checked offline.
 */

'use strict';

const tournamentsData = require('../supabase-data-tournaments.js');
const {
    _deriveTournamentMeta,
    _normalizeResultRow,
    _dedupeResults,
} = tournamentsData._internal;

// === harness ============================================================
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

// === mock supabase client ===============================================
// The rewritten queries call `client.from(table).select(cols).eq('student_id', id)`
// and treat the awaited result as `{ data, error }`. We only need the eq()
// filter; no order/limit (limit/sort is now applied client-side after dedupe).
function makeMockClient(rows) {
    const captured = { tables: [], selects: [], filters: [] };
    return {
        captured,
        from(table) {
            captured.tables.push(table);
            const q = {
                _filter: null,
                select(cols) { captured.selects.push(cols); return q; },
                eq(col, val) { q._filter = { col, val }; captured.filters.push(q._filter); return q; },
                then(onF, onR) {
                    const filtered = q._filter
                        ? rows.filter(r => r[q._filter.col] === q._filter.val)
                        : rows.slice();
                    return Promise.resolve({ data: filtered, error: null }).then(onF, onR);
                },
            };
            return q;
        },
    };
}

// === _deriveTournamentMeta — kind / filename mapping ====================
console.log('\n• _deriveTournamentMeta');
assertEqual(
    _deriveTournamentMeta({ kind: 'league_a', source_filename: 'Лига A.xlsx' }),
    { name: 'Лига A', league: 'A' },
    'league_a → A, .xlsx stripped'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'league_b', source_filename: 'Дебют B.xls' }),
    { name: 'Дебют B', league: 'B' },
    'league_b → B, .xls stripped'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'league_c', source_filename: 'Лига С Халык Арена.xlsx' }),
    { name: 'Лига С Халык Арена', league: 'C' },
    'league_c → C, .xlsx stripped'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'razryad_4', source_filename: 'Quals 4 Mar 2026_AUT.xlsx' }),
    { name: 'Quals 4 Mar 2026', league: null },
    'razryad_4 → null league, _AUT suffix removed'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'razryad_3', source_filename: 'Quals 3.xls' }),
    { name: 'Quals 3', league: null },
    'razryad_3 → null league, name from filename'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'rated', source_filename: 'May Open.xlsx' }),
    { name: 'May Open', league: null },
    'rated → null league, name from filename'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'rated', source_filename: '' }),
    { name: 'Рейтинговый турнир', league: null },
    'rated with empty filename → falls back to kind label'
);
assertEqual(
    _deriveTournamentMeta({ kind: 'league_a', source_filename: null }),
    { name: 'Лига A', league: 'A' },
    'league_a with null filename → kind-label fallback'
);
assertEqual(
    _deriveTournamentMeta({ kind: null, source_filename: 'orphan.xlsx' }),
    { name: 'orphan', league: null },
    'null kind → null league, filename still used'
);
assertEqual(
    _deriveTournamentMeta(null),
    { name: null, league: null },
    'null upload → {name:null, league:null}'
);

// === _normalizeResultRow — field mapping ================================
console.log('\n• _normalizeResultRow');
const sampleRow = {
    id: 'r1',
    rank: 13,
    rating_before: 600,
    rating_delta: 42,
    upload: {
        id: 'u1',
        kind: 'league_c',
        source_filename: 'Лига С Халык Арена.xlsx',
        tournament_date: '2026-05-23',
        uploaded_at: '2026-05-24T10:00:00Z',
    },
};
const normalized = _normalizeResultRow(sampleRow);
assertEqual(normalized.id, 'r1', 'id passes through');
assertEqual(normalized.place, 13, 'rank → place (13)');
assertEqual(normalized.ratingBefore, 600, 'rating_before → ratingBefore');
assertEqual(normalized.ratingAfter, 642, 'rating_before + rating_delta → ratingAfter (600+42=642)');
assertEqual(normalized.ratingDelta, 42, 'rating_delta → ratingDelta');
assertEqual(normalized.tournamentId, 'u1', 'upload.id → tournamentId');
assertEqual(normalized.tournamentName, 'Лига С Халык Арена', 'name derived from filename');
assertEqual(normalized.league, 'C', 'league_c → C');
assertEqual(normalized.date, '2026-05-23', 'upload.tournament_date → date');

// Negative delta path.
const negRow = {
    id: 'r2', rank: 50, rating_before: 700, rating_delta: -16,
    upload: { id: 'u2', kind: 'rated', source_filename: 'Праздничный турнир 31 мая.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-01T09:00:00Z' },
};
const negNorm = _normalizeResultRow(negRow);
assertEqual(negNorm.place, 50, 'place=50');
assertEqual(negNorm.ratingAfter, 684, 'negative delta: 700+(-16)=684');
assertEqual(negNorm.ratingDelta, -16, 'ratingDelta stays signed');
assertEqual(negNorm.league, null, 'rated → null league');

// Null delta path — ratingAfter must be null when delta missing.
const nullDeltaRow = {
    id: 'r3', rank: 5, rating_before: 500, rating_delta: null,
    upload: { id: 'u3', kind: 'league_b', source_filename: 'x.xlsx', tournament_date: '2026-05-01', uploaded_at: '2026-05-02T00:00:00Z' },
};
const nullDeltaNorm = _normalizeResultRow(nullDeltaRow);
assertEqual(nullDeltaNorm.ratingAfter, null, 'null rating_delta → ratingAfter=null');
assertEqual(nullDeltaNorm.ratingDelta, 0, 'null delta surfaces as 0 (legacy shape)');

// === _dedupeResults — most recent upload wins ===========================
console.log('\n• _dedupeResults');
// Mirrors Turabay's actual data: same 31.05 tournament uploaded twice.
const dup1 = {
    id: 'a', rank: 50, rating_delta: -16,
    upload: { id: 'u-old', kind: 'rated', source_filename: 'Праздничный турнир.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-01T08:00:00Z' },
};
const dup2 = {
    id: 'b', rank: 50, rating_delta: -16,
    upload: { id: 'u-new', kind: 'rated', source_filename: 'Праздничный турнир 31 мая.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-02T08:00:00Z' },
};
const distinct = {
    id: 'c', rank: 13, rating_delta: 42,
    upload: { id: 'u-distinct', kind: 'league_c', source_filename: 'Лига С Халык Арена.xlsx', tournament_date: '2026-05-23', uploaded_at: '2026-05-24T00:00:00Z' },
};
const deduped = _dedupeResults([dup1, dup2, distinct]);
assertEqual(deduped.length, 2, 'two distinct buckets after dedupe');
const winnerForMay31 = deduped.find(r => r.upload.tournament_date === '2026-05-31');
assertEqual(winnerForMay31.upload.id, 'u-new', 'most recent uploaded_at wins for 31.05 duplicate');
assertEqual(deduped.find(r => r.upload.tournament_date === '2026-05-23').upload.id, 'u-distinct', '23.05 distinct row retained');

// Differing rank or delta should NOT collapse — different (rank, delta) tuples.
const dup3 = {
    id: 'd', rank: 51, rating_delta: -16,
    upload: { id: 'u-rank51', kind: 'rated', source_filename: 'x.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-03T00:00:00Z' },
};
const dedupedKeepRank = _dedupeResults([dup1, dup3]);
assertEqual(dedupedKeepRank.length, 2, 'different rank ⇒ not deduped');

// Empty / malformed inputs.
assertEqual(_dedupeResults([]).length, 0, 'empty input → empty output');
assertEqual(_dedupeResults(null).length, 0, 'null input → empty output');
assertEqual(_dedupeResults([{ id: 'x', rank: 1, rating_delta: 0, upload: null }]).length, 0, 'rows missing upload are dropped');

// === getStudentTournaments — normalized + sorted + limited ==============
console.log('\n• getStudentTournaments (Turabay verification target)');
// Turabay's three result rows: rank-13 league C upload + two rank-50 duplicates
// of the 31.05 rated tournament.
const turabayRows = [
    {
        id: 'r-a', student_id: 'T', rank: 13, rating_before: 600, rating_delta: 42,
        upload: { id: 'u-halyk', kind: 'league_c', source_filename: 'Лига С Халык Арена.xlsx', tournament_date: '2026-05-23', uploaded_at: '2026-05-24T00:00:00Z' },
    },
    {
        id: 'r-b', student_id: 'T', rank: 50, rating_before: 642, rating_delta: -16,
        upload: { id: 'u-may31-old', kind: 'rated', source_filename: 'Праздничный турнир.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-01T08:00:00Z' },
    },
    {
        id: 'r-c', student_id: 'T', rank: 50, rating_before: 642, rating_delta: -16,
        upload: { id: 'u-may31-new', kind: 'rated', source_filename: 'Праздничный турнир 31 мая.xlsx', tournament_date: '2026-05-31', uploaded_at: '2026-06-02T08:00:00Z' },
    },
    // Unrelated student row to confirm filtering by student_id works through the
    // mock — getStudentTournaments calls `.eq('student_id', ...)`.
    {
        id: 'r-other', student_id: 'OTHER', rank: 1, rating_before: 800, rating_delta: 30,
        upload: { id: 'u-other', kind: 'league_a', source_filename: 'Other A.xlsx', tournament_date: '2026-05-15', uploaded_at: '2026-05-16T00:00:00Z' },
    },
];

(async () => {
    // Plug the mock client into the global slot the data layer reads.
    global.window = global;
    global.window.supabaseClient = makeMockClient(turabayRows);

    const recent = await tournamentsData.getStudentTournaments('T', 5);
    assertEqual(recent.length, 2, 'after dedupe, 2 unique tournaments');
    assertEqual(recent[0].date, '2026-05-31', 'most recent first: 31.05');
    assertEqual(recent[1].date, '2026-05-23', 'then 23.05');
    const halyk = recent.find(r => r.date === '2026-05-23');
    assertEqual(halyk.place, 13, 'best place = 13 on Halyk row');
    assertEqual(halyk.league, 'C', 'Halyk row league = C');
    assertEqual(halyk.tournamentName, 'Лига С Халык Арена', 'Halyk row name from filename');
    assertEqual(halyk.ratingAfter, 642, 'Halyk row ratingAfter = 600+42');
    const may31 = recent.find(r => r.date === '2026-05-31');
    assertEqual(may31.tournamentId, 'u-may31-new', 'most recent upload wins for 31.05');

    // Limit honours the requested cap.
    const oneRow = await tournamentsData.getStudentTournaments('T', 1);
    assertEqual(oneRow.length, 1, 'limit=1 returns one row');
    assertEqual(oneRow[0].date, '2026-05-31', 'limit=1 returns the most recent');

    // === getStudentTournamentsAll — oldest first, deduped ===============
    console.log('\n• getStudentTournamentsAll');
    global.window.supabaseClient = makeMockClient(turabayRows);
    const all = await tournamentsData.getStudentTournamentsAll('T');
    assertEqual(all.length, 2, 'all: 2 deduped tournaments');
    assertEqual(all[0].date, '2026-05-23', 'all sorted oldest first');
    assertEqual(all[1].date, '2026-05-31', 'all sorted oldest first (2nd)');

    // === getStudentTournamentAggregates — totals via _aggregateFromRows ==
    console.log('\n• getStudentTournamentAggregates');
    global.window.supabaseClient = makeMockClient(turabayRows);
    const today = new Date('2026-06-04T00:00:00Z');
    const agg = await tournamentsData.getStudentTournamentAggregates('T', today);
    // getStudentTournamentAggregates currently calls _aggregateFromRows() with
    // no `today` (real production runtime). For deterministic assertions in
    // tests we only check totals that don't depend on "now":
    assertEqual(agg.total, 2, 'aggregate: total = 2 unique tournaments');
    assertEqual(agg.bestPlace, 13, 'aggregate: best place = 13');
    assertEqual(agg.avgPlace, Math.round((13 + 50) / 2), 'aggregate: avgPlace = round((13+50)/2)');
    assertEqual(agg.totalRatingGained, 42 + (-16), 'aggregate: totalRatingGained = 42 + -16');
    assertEqual(agg.lastDate, '2026-05-31', 'aggregate: lastDate = 2026-05-31');

    // Empty student: client returns no rows → empty aggregates.
    global.window.supabaseClient = makeMockClient([]);
    const empty = await tournamentsData.getStudentTournamentAggregates('NOBODY');
    assertEqual(empty.total, 0, 'no rows → total 0');
    assertEqual(empty.bestPlace, null, 'no rows → bestPlace null');
    assertEqual(empty.cadence, 'inactive', 'no rows → cadence inactive');

    // No client present → empty list (no crash).
    global.window.supabaseClient = null;
    const noneRecent = await tournamentsData.getStudentTournaments('T', 5);
    assertEqual(noneRecent.length, 0, 'no client → []');
    const noneAll = await tournamentsData.getStudentTournamentsAll('T');
    assertEqual(noneAll.length, 0, 'no client (all) → []');
    const noneAgg = await tournamentsData.getStudentTournamentAggregates('T');
    assertEqual(noneAgg.total, 0, 'no client (agg) → empty');

    console.log('\n================================================================');
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('================================================================');
    process.exit(failed === 0 ? 0 : 1);
})();
