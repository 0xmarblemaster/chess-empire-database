/**
 * Tests for extractTextFromTournamentFile (Task 2 — xlsx ingestion).
 *
 * Builds an in-memory Swiss-Manager-style workbook, runs it through the
 * helper, and asserts the resulting text feeds parseSwissManagerCSV
 * cleanly — same result you'd get from the equivalent .txt export.
 *
 * Run: node tests/test-tournament-xlsx.js
 */

'use strict';

const XLSX = require('xlsx');
const tournamentsData = require('../supabase-data-tournaments.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++; console.log(`  ✓ ${msg}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// Wrap an ArrayBuffer in the minimal File-shape the helper consumes.
function fakeFile(name, buf) {
    return { name, arrayBuffer: async () => buf };
}

// Synthesize a Swiss-Manager-style workbook in memory. Header info lines sit
// in column A of the first rows; the participant table starts a few rows down.
function buildSwissManagerWorkbook() {
    const aoa = [
        ['Шахматный клуб Chess Empire'],
        ['Организатор(ы) : Chess Empire'],
        ['Турнирный директор : Karayev Assylkhan'],
        ['Рейтинг-Ø : 579'],
        ['Дата : 03.05.2026'],
        [],
        ['Chess Empire | Лига B | Debut'],
        [],
        ['Ном.', 'Имя', 'Рейт.', 'Фед', 'Очки', 'Оцен. партии', 'НРейт.-Ø', 'Рейт+/-'],
        [1, 'Иванов Иван', 750, 'KAZ', '5½', 5, 620, '+125'],
        [2, 'Петров Пётр', 680, 'KAZ', '5', 5, 595, '+108'],
        [3, 'Кулов Арман', 620, 'KAZ', '4½', 5, 560, '+45'],
        [4, 'Сидоров Игорь', 550, 'KAZ', '3½', 5, 545, '-12'],
        [5, 'Алексеев Александр', 480, 'KAZ', '3', 4, 530, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

async function run() {
    console.log('\n=== extractTextFromTournamentFile — xlsx round-trip ===============\n');
    {
        const buf = buildSwissManagerWorkbook();
        const file = fakeFile('debut-league-b.xlsx', buf);
        const text = await tournamentsData.extractTextFromTournamentFile(file, XLSX);

        assert(typeof text === 'string' && text.length > 0, 'helper returns a non-empty string');
        assert(text.indexOf('\t') !== -1, 'output contains tab separators (FS:\\t honored)');
        assert(/Дата\s*:\s*03\.05\.2026/.test(text), 'date header line preserved');
        assert(/Chess Empire \| Лига B \| Debut/.test(text), 'title line preserved');
        assert(text.indexOf('Ном.') !== -1 && text.indexOf('Имя') !== -1, 'participant header row present');

        const out = tournamentsData.parseSwissManagerCSV(text, file.name);
        assertEqual(out.tournament.date, '2026-05-03', 'parsed date = 2026-05-03');
        assertEqual(out.tournament.league, 'B', 'parsed league = B');
        assertEqual(out.tournament.name, 'Debut', 'parsed name = Debut');
        assertEqual(out.tournament.organizer, 'Chess Empire', 'parsed organizer');
        assertEqual(out.tournament.director, 'Karayev Assylkhan', 'parsed director');
        assertEqual(out.tournament.avg_rating, 579, 'parsed avg_rating = 579');
        assertEqual(out.tournament.source_file, 'debut-league-b.xlsx', 'source_file echoes xlsx name');
        assertEqual(out.participants.length, 5, '5 participants parsed');
        assert(
            !out.warnings.some(w => /Could not locate participant table/i.test(w)),
            'no "Could not locate participant table" warning'
        );

        const p1 = out.participants[0];
        assertEqual(p1.raw_name, 'Иванов Иван', 'p1 raw_name');
        assertEqual(p1.rating_before, 750, 'p1 rating_before');
        assertEqual(p1.rating_delta, 125, 'p1 rating_delta = +125');
        assertEqual(p1.rating_after, 875, 'p1 rating_after = 750+125');

        const p4 = out.participants[3];
        assertEqual(p4.rating_delta, -12, 'p4 rating_delta = -12 (signed)');

        const p5 = out.participants[4];
        assertEqual(p5.rating_delta, 0, 'p5 empty delta → 0');
    }

    console.log('\n=== extractTextFromTournamentFile — .xls extension is also handled ===\n');
    {
        const buf = buildSwissManagerWorkbook();
        // Reuse the same xlsx bytes — the helper branches on extension only.
        const file = fakeFile('debut-league-b.xls', buf);
        const text = await tournamentsData.extractTextFromTournamentFile(file, XLSX);
        const out = tournamentsData.parseSwissManagerCSV(text, file.name);
        assertEqual(out.participants.length, 5, '.xls path produces 5 participants');
        assertEqual(out.tournament.league, 'B', '.xls path parses league');
    }

    console.log('\n=== extractTextFromTournamentFile — .txt passthrough =============\n');
    {
        const txt = 'Дата : 03.05.2026\nChess Empire | Лига B | Debut\n\nНом.\tИмя\tРейт.\tРейт+/-\n1\tИванов Иван\t750\t+10\n';
        const file = {
            name: 'plain.txt',
            arrayBuffer: () => { throw new Error('arrayBuffer should not be called for .txt'); },
            text: async () => txt,
        };
        const out = await tournamentsData.extractTextFromTournamentFile(file, XLSX);
        assertEqual(out, txt, '.txt path returns file.text() verbatim, untouched by SheetJS');
    }

    console.log('\n=== extractTextFromTournamentFile — missing XLSX throws ==========\n');
    {
        const buf = buildSwissManagerWorkbook();
        const file = fakeFile('any.xlsx', buf);
        // Force the helper to see no XLSX: pass null and ensure no global leaks in.
        const savedGlobal = global.XLSX;
        delete global.XLSX;
        let threw = false;
        try {
            await tournamentsData.extractTextFromTournamentFile(file, null);
        } catch (e) {
            threw = /SheetJS/i.test(e.message);
        } finally {
            if (savedGlobal !== undefined) global.XLSX = savedGlobal;
        }
        assert(threw, 'throws "SheetJS not loaded" when XLSX is absent');
    }

    console.log(`\n${'='.repeat(64)}`);
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`${'='.repeat(64)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('Test runner crashed:', e);
    process.exit(2);
});
