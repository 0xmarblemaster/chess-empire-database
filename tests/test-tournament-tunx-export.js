/**
 * Regression: tunx-to-excel exports (first column "Место", year-less "14.11"
 * date, decimal Рейт+/-) must import via the Rating Management upload.
 * Run: node tests/test-tournament-tunx-export.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const upload = require('../frontend/tournament-parse.js');

let passed = 0;
let failed = 0;
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

function fakeFile(p, name) {
    const buf = fs.readFileSync(p);
    return {
        name,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
        text: async () => buf.toString(),
    };
}

(async () => {
    console.log('\n=== real tunx-to-excel export (Лига C, 14.11) ========================\n');
    const fixture = path.join(__dirname, 'fixtures', 'league-c-tunx-export-14.11.xlsx');
    const file = fakeFile(fixture, 'Лига_C_Halyk-Arena_14.11_v2_итоговая_таблица_рейтинги.xlsx');
    const text = await upload.extractText(file, XLSX);
    const parsed = upload.parseTournamentExport(text, { kind: 'league_c', filename: file.name, defaultYear: 2026 });

    assertEqual(parsed.warnings, [], 'no parser warnings');
    assertEqual(parsed.results.length, 10, '10 players parsed (footer note skipped)');
    assertEqual(parsed.tournament_date, '2026-11-14', 'date "14.11" → 2026-11-14');
    assertEqual(parsed.results[0], {
        rank: 1, raw_name: 'Player A', rating_before: 398, score: 6,
        games_played: 6, avg_opp_rating: 174, rating_delta: 56,
    }, 'row 1 fully parsed, delta 55.6 → 56');
    assertEqual(parsed.results.map(r => r.rating_delta),
        [56, 72, -17, 87, 39, -23, -24, -23, -135, -33],
        'deltas rounded half away from zero (71.5 → 72, -16.5 → -17, -22.5 → -23)');
    const v = upload.validateParsedUpload(parsed);
    assertEqual(v.errors, [], 'validation passes');
    assertEqual(v.eligibleRows.length, 10, 'all 10 rows eligible');

    console.log('\n=== header variants ==================================================\n');
    const row = ['1', 'Иванов Иван', '750', '5', '5', '620', '+12'].join('\t');
    for (const first of ['Ном.', 'Место', 'Мест.', 'Rk.', '№']) {
        const hdr = [first, 'Имя', 'Рейт.', 'Оцен.Очки', 'оцен.партии', 'НРейт.-Ø', 'Рейт+/-'].join('\t');
        const r = upload.parseTournamentExport(`title\n${hdr}\n${row}`, { kind: 'league_c', filename: '14.11.xlsx' });
        assertEqual([r.results.length, r.results[0] && r.results[0].rank], [1, 1], `header "${first}" recognised`);
    }
    const none = upload.parseTournamentExport('Foo\tИмя\tРейт.\n1\tX\t100', { kind: 'league_c', filename: 'x.xlsx' });
    assertEqual(none.results.length, 0, 'no rank column → no header match');

    console.log('\n=== year-less dates in filename ======================================\n');
    const cases = [
        ['Лига_14.11.xlsx', '2026-11-14'],
        ['league_14_11_final.xlsx', '2026-11-14'],
        ['5.3 debut.xlsx', '2026-03-05'],
        ['17.05.2026.xlsx', '2026-05-17'],
        ['export_v1.2.xlsx', null],
        ['Лига_C_1411_v2.xlsx', null],
        ['round_1_2.xlsx', null],
        ['32.13.xlsx', null],
    ];
    for (const [f, want] of cases) assertEqual(upload.parseDateFromFilename(f, 2026), want, `"${f}" → ${want}`);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
