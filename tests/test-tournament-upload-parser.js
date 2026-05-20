/**
 * Tests for coach-kpi-upload.js parser — Phase 2 tournament upload.
 *
 * Covers:
 *   - parseDateFromFilename for "17 мая", "17 мая 2026", "17.05.2026", ISO.
 *   - parseTournamentExport on both xlsx-style tab-separated text AND the
 *     HTML-table-as-.xls Swiss-Manager export format (extractRowsFromHtml).
 *   - Column mapping for Ном., Имя, Рейт., Оцен.Очки, оцен.партии, НРейт.-Ø,
 *     Рейт+/- (spec §3 step 3).
 *
 * Run: node tests/test-tournament-upload-parser.js
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

console.log('\n=== parseDateFromFilename ============================================\n');
assertEqual(upload.parseDateFromFilename('17 мая.xlsx', 2026), '2026-05-17',
    '"17 мая" → 2026-05-17 (default year)');
assertEqual(upload.parseDateFromFilename('17 мая 2027.xlsx', 2026), '2027-05-17',
    '"17 мая 2027" → 2027-05-17 (year in filename overrides default)');
assertEqual(upload.parseDateFromFilename('17.05.2026.xlsx', 2026), '2026-05-17',
    'DD.MM.YYYY → ISO');
assertEqual(upload.parseDateFromFilename('2026-05-17-debut.xlsx', 2026), '2026-05-17',
    'ISO substring picked out');
assertEqual(upload.parseDateFromFilename('1 января 2026.xls', 2026), '2026-01-01',
    'январь → 01');
assertEqual(upload.parseDateFromFilename('5 декабря.xls', 2026), '2026-12-05',
    'декабря → 12');
assertEqual(upload.parseDateFromFilename('no date here.xlsx', 2026), null,
    'no parseable date → null (admin must enter manually)');
assertEqual(upload.parseDateFromFilename(null, 2026), null, 'null filename → null');

console.log('\n=== parseTournamentExport (TSV / xlsx-like) ==========================\n');

const TSV = [
    'Шахматный клуб Chess Empire',
    'Дата : 03.05.2026',
    '',
    'Chess Empire | Лига B | Debut',
    '',
    ['Ном.', 'Имя', 'Рейт.', 'Фед', 'Оцен.Очки', 'оцен.партии', 'НРейт.-Ø', 'Рейт+/-'].join('\t'),
    ['1', 'Иванов Иван', '750', 'KAZ', '5½', '5', '620', '+125'].join('\t'),
    ['2', 'Петров Пётр', '680', 'KAZ', '5', '5', '595', '+108'].join('\t'),
    ['3', 'Кулов Арман', '620', 'KAZ', '4½', '5', '560', '+45'].join('\t'),
    ['4', 'Сидоров Игорь', '550', 'KAZ', '3½', '5', '545', '-12'].join('\t'),
    ['5', 'Алексеев Александр', '480', 'KAZ', '3', '4', '530', ''].join('\t'),
].join('\n');

const parsedLB = upload.parseTournamentExport(TSV, {
    kind: 'league_b',
    filename: '03.05.2026 debut.xlsx',
});
assertEqual(parsedLB.kind, 'league_b', 'kind passthrough');
assertEqual(parsedLB.rounds, 6, 'rounds = 6 for league_b');
assertEqual(parsedLB.tournament_date, '2026-05-03', 'date parsed from filename');
assertEqual(parsedLB.results.length, 5, '5 result rows parsed');

const p1 = parsedLB.results[0];
assertEqual(p1.rank, 1, 'p1 rank = 1');
assertEqual(p1.raw_name, 'Иванов Иван', 'p1 raw_name');
assertEqual(p1.rating_before, 750, 'p1 rating_before');
assertEqual(p1.score, 5.5, 'p1 score "5½" → 5.5');
assertEqual(p1.games_played, 5, 'p1 games_played');
assertEqual(p1.avg_opp_rating, 620, 'p1 avg_opp_rating');
assertEqual(p1.rating_delta, 125, 'p1 rating_delta = +125');

const p4 = parsedLB.results[3];
assertEqual(p4.rating_delta, -12, 'p4 rating_delta = -12 (signed)');

const p5 = parsedLB.results[4];
assertEqual(p5.rating_delta, 0, 'p5 empty delta → 0');
assertEqual(p5.score, 3, 'p5 score "3" → 3 (no half)');

console.log('\n=== parseTournamentExport: rounds-per-kind ===========================\n');
for (const [kind, expectedRounds] of [
    ['league_c', 6],
    ['league_b', 6],
    ['razryad_4', 10],
    ['razryad_3', 9],
]) {
    const out = upload.parseTournamentExport(TSV, { kind, filename: '17 мая.xlsx' });
    assertEqual(out.rounds, expectedRounds, `${kind} → rounds=${expectedRounds}`);
}

console.log('\n=== extractRowsFromHtml (HTML-table-as-.xls) =========================\n');

const HTML_FIXTURE = `
<html><body>
<h1>Дата : 17.05.2026</h1>
<table>
  <tr><th>Ном.</th><th>Имя</th><th>Рейт.</th><th>Оцен.Очки</th><th>оцен.партии</th><th>НРейт.-Ø</th><th>Рейт+/-</th></tr>
  <tr><td>1</td><td>Иванов Иван</td><td>750</td><td>5&frac12;</td><td>5</td><td>620</td><td>+125</td></tr>
  <tr><td>2</td><td>Петров Пётр</td><td>680</td><td>5</td><td>5</td><td>595</td><td>+108</td></tr>
</table>
</body></html>
`;
const htmlExtracted = upload.extractRowsFromHtml(HTML_FIXTURE.replace('&frac12;', '½'));
assert(htmlExtracted.indexOf('\t') !== -1, 'HTML extractor produces tab-separated rows');
assert(htmlExtracted.indexOf('Ном.') !== -1, 'HTML extractor captured header row');
assert(htmlExtracted.indexOf('Иванов Иван') !== -1, 'HTML extractor captured first data row');

const parsedFromHtml = upload.parseTournamentExport(htmlExtracted, {
    kind: 'league_c',
    filename: '17 мая.xls',
});
assertEqual(parsedFromHtml.results.length, 2, '2 results parsed from HTML fixture');
assertEqual(parsedFromHtml.tournament_date, '2026-05-17', 'date from "17 мая" filename');
assertEqual(parsedFromHtml.results[0].raw_name, 'Иванов Иван', 'HTML row 1 name');
assertEqual(parsedFromHtml.results[0].rating_delta, 125, 'HTML row 1 delta');

console.log('\n=== extractText: extension routing =================================\n');
(async () => {
    const txtFile = { name: 'plain.txt', text: async () => TSV };
    const txtOut = await upload.extractText(txtFile);
    assertEqual(txtOut, TSV, '.txt path passes through file.text()');

    const xlsHtmlFile = {
        name: 'sample.xls',
        text: async () => HTML_FIXTURE,
        arrayBuffer: async () => new ArrayBuffer(0),
    };
    const xlsHtmlOut = await upload.extractText(xlsHtmlFile);
    assert(xlsHtmlOut.indexOf('\t') !== -1,
        '.xls path with HTML body falls back to extractRowsFromHtml (tab-separated output)');

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})();
