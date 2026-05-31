/**
 * Tests for frontend/tournament-parse.js validateParsedUpload.
 *
 * Covers the gating rules from COACH_KPI_PHASE2_SPEC.md §3 step 6:
 *   - registered + 0 games rows are excluded from eligible set
 *   - kind <-> rounds enforcement
 *   - missing date is an error (admin must enter manually)
 *
 * Commit gating + matching now lives in the merged Rating Management modal
 * path; see tests/test-csv-upload-merged.js for end-to-end commit behavior.
 *
 * Run: node tests/test-tournament-upload-validation.js
 */

'use strict';

const upload = require('../frontend/tournament-parse.js');

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

console.log('\n=== validateParsedUpload: rounds-vs-kind enforcement ====================\n');
{
    const ok = upload.validateParsedUpload({
        kind: 'league_b', rounds: 6, tournament_date: '2026-05-17',
        results: [{ rank: 1, raw_name: 'A', rating_before: 500, score: 4, games_played: 5, rating_delta: 10 }],
        warnings: [],
    });
    assertEqual(ok.errors, [], 'league_b + 6 rounds → no errors');

    const wrongRounds = upload.validateParsedUpload({
        kind: 'razryad_3', rounds: 10, tournament_date: '2026-05-17',
        results: [], warnings: [],
    });
    assert(wrongRounds.errors.some(e => /Rounds.*razryad_3/.test(e)),
        'razryad_3 with 10 rounds → error (expected 9)');

    const badKind = upload.validateParsedUpload({
        kind: 'league_a', rounds: 6, tournament_date: '2026-05-17',
        results: [], warnings: [],
    });
    assert(badKind.errors.some(e => /Invalid tournament kind/i.test(e)),
        'unknown kind "league_a" rejected');
}

console.log('\n=== validateParsedUpload: rated tournaments accept 1..20 rounds =======\n');
{
    const okRated = upload.validateParsedUpload({
        kind: 'rated', rounds: 7, tournament_date: '2026-06-01',
        results: [{ rank: 1, raw_name: 'A', rating_before: 500, score: 4, games_played: 7, rating_delta: 10 }],
        warnings: [],
    });
    assertEqual(okRated.errors, [], 'rated + 7 rounds → no errors');

    const zeroRated = upload.validateParsedUpload({
        kind: 'rated', rounds: 0, tournament_date: '2026-06-01',
        results: [], warnings: [],
    });
    assert(zeroRated.errors.some(e => /rated tournaments/i.test(e)),
        'rated + 0 rounds → error');

    const tooManyRated = upload.validateParsedUpload({
        kind: 'rated', rounds: 21, tournament_date: '2026-06-01',
        results: [], warnings: [],
    });
    assert(tooManyRated.errors.some(e => /rated tournaments/i.test(e)),
        'rated + 21 rounds → error (exceeds max)');

    const nullRated = upload.validateParsedUpload({
        kind: 'rated', rounds: null, tournament_date: '2026-06-01',
        results: [], warnings: [],
    });
    assert(nullRated.errors.some(e => /rated tournaments/i.test(e)),
        'rated + null rounds → error');
}

console.log('\n=== validateParsedUpload: missing date is an error ====================\n');
{
    const missingDate = upload.validateParsedUpload({
        kind: 'league_c', rounds: 6, tournament_date: null,
        results: [], warnings: [],
    });
    assert(missingDate.errors.some(e => /date is required/i.test(e)),
        'missing tournament_date → error');
}

console.log('\n=== validateParsedUpload: 0-games rows excluded ========================\n');
{
    const out = upload.validateParsedUpload({
        kind: 'league_b', rounds: 6, tournament_date: '2026-05-17',
        results: [
            { rank: 1, raw_name: 'Played 5', rating_before: 500, score: 4, games_played: 5, rating_delta: 10 },
            { rank: 2, raw_name: 'Played 0', rating_before: 500, score: 0, games_played: 0, rating_delta: 0 },
            { rank: 3, raw_name: 'Played 1', rating_before: 500, score: 1, games_played: 1, rating_delta: 5 },
        ],
        warnings: [],
    });
    assertEqual(out.eligibleRows.length, 2, '2 eligible rows (games_played >= 1)');
    assertEqual(out.excludedRows.length, 1, '1 excluded row (games_played = 0)');
    assertEqual(out.excludedRows[0].reason, 'registered_zero_games',
        'exclusion reason = registered_zero_games');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
