/**
 * Tests for tournaments data layer — Phase 2a.
 * Run: node tests/test-tournament-parser.js
 *
 * Covers parser, validation warnings, Unicode normalization, score-with-½,
 * and re-import idempotency (against an in-memory mock Supabase client).
 */

const fs = require('fs');
const path = require('path');

const tournamentsData = require('../supabase-data-tournaments.js');

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

// === mock Supabase client ================================================
// Minimal builder mirroring the surface the importer uses. State is two
// tables — tournaments and tournament_participants — plus student_ratings.
function createMockClient() {
    const db = {
        tournaments: [],          // {id, name, league, tournament_date, ...}
        tournament_participants: [],
        student_ratings: [],
    };
    let nextId = 1;
    const uuid = () => `id-${nextId++}`;

    function builder(table) {
        const state = {
            table,
            op: null,
            payload: null,
            filters: [],
            inArgs: null,
            single: false,
            onConflict: null,
        };

        const api = {
            select(/* cols */) { state.op = state.op || 'select'; return api; },
            insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
            upsert(payload, opts) {
                state.op = 'upsert';
                state.payload = payload;
                if (opts && opts.onConflict) state.onConflict = opts.onConflict.split(',');
                return api;
            },
            eq(col, val) { state.filters.push({ col, val }); return api; },
            in(col, vals) { state.inArgs = { col, vals }; return api; },
            gte() { return api; },
            lte() { return api; },
            order() { return api; },
            limit() { return api; },
            range() { return api; },
            single() { state.single = true; return api; },
            then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
        };

        function execute() {
            const rows = db[table];

            if (state.op === 'select') {
                let result = rows.slice();
                for (const f of state.filters) result = result.filter(r => r[f.col] === f.val);
                if (state.inArgs) {
                    const set = new Set(state.inArgs.vals);
                    result = result.filter(r => set.has(r[state.inArgs.col]));
                }
                if (state.single) {
                    return { data: result[0] || null, error: result[0] ? null : { message: 'not found' } };
                }
                return { data: result, error: null };
            }

            if (state.op === 'upsert') {
                const keys = state.onConflict || [];
                const matchesExisting = (row) => keys.every(k => row[k] === state.payload[k]);
                let existing = rows.find(matchesExisting);
                if (existing) {
                    Object.assign(existing, state.payload);
                    return { data: existing, error: null };
                }
                const id = uuid();
                const inserted = Object.assign({ id }, state.payload);
                rows.push(inserted);
                return { data: inserted, error: null };
            }

            if (state.op === 'insert') {
                const items = Array.isArray(state.payload) ? state.payload : [state.payload];
                const out = [];
                for (const item of items) {
                    // Enforce UNIQUE(tournament_id, student_id) for participants.
                    if (table === 'tournament_participants') {
                        const dup = rows.find(r => r.tournament_id === item.tournament_id && r.student_id === item.student_id);
                        if (dup) return { data: null, error: { code: '23505', message: 'duplicate' } };
                    }
                    const id = uuid();
                    const inserted = Object.assign({ id }, item);
                    rows.push(inserted);
                    out.push(inserted);
                }
                return { data: out, error: null };
            }

            return { data: null, error: { message: 'unsupported op' } };
        }

        return api;
    }

    return {
        from: (table) => builder(table),
        _db: db,
    };
}

// === fixture =============================================================
const fixturePath = path.join(__dirname, 'fixtures', 'debut-league-b.txt');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');

// === test groups =========================================================
async function run() {
    console.log('\n=== parseSwissManagerCSV — header =================================\n');
    {
        const out = tournamentsData.parseSwissManagerCSV(fixtureText, 'debut-league-b.txt');
        assertEqual(out.tournament.name, 'Debut', 'name = Debut');
        assertEqual(out.tournament.league, 'B', 'league = B');
        assertEqual(out.tournament.date, '2026-05-03', 'date = 2026-05-03 (DD.MM.YYYY parsed)');
        assertEqual(out.tournament.director, 'Karayev Assylkhan', 'director parsed');
        assertEqual(out.tournament.organizer, 'Chess Empire', 'organizer parsed');
        assertEqual(out.tournament.avg_rating, 579, 'avg_rating = 579');
        assertEqual(out.tournament.source_file, 'debut-league-b.txt', 'source_file echoed');
        assertEqual(out.warnings, [], 'no warnings for complete header');
    }

    console.log('\n=== parseSwissManagerCSV — participants ===========================\n');
    {
        const out = tournamentsData.parseSwissManagerCSV(fixtureText, 'debut-league-b.txt');
        assertEqual(out.participants.length, 5, '5 participants parsed');

        const p1 = out.participants[0];
        assertEqual(p1.place, 1, 'p1 place = 1');
        assertEqual(p1.raw_name, 'Иванов Иван', 'p1 name = Иванов Иван');
        assertEqual(p1.rating_before, 750, 'p1 rating_before = 750');
        assertEqual(p1.rating_delta, 125, 'p1 rating_delta = +125');
        assertEqual(p1.rating_after, 875, 'p1 rating_after = 750+125 = 875');

        const p4 = out.participants[3];
        assertEqual(p4.rating_delta, -12, 'p4 rating_delta = -12 (signed parse)');
        assertEqual(p4.rating_after, 538, 'p4 rating_after = 550-12 = 538');

        const p5 = out.participants[4];
        assertEqual(p5.rating_delta, 0, 'p5 empty delta → 0');
        assertEqual(p5.rating_after, 480, 'p5 rating_after = 480 (no delta)');
    }

    console.log('\n=== parseSwissManagerCSV — score with ½ does not crash ============\n');
    {
        const out = tournamentsData.parseSwissManagerCSV(fixtureText, 'f.txt');
        // The Очки column for p1=5½, p3=4½ — these must be silently ignored.
        // We assert the parser produced full output despite ½ in the table.
        assert(out.participants.length === 5, 'parser completed with ½ scores in input');
        assert(out.warnings.length === 0, 'no warnings raised by ½ scores');
    }

    console.log('\n=== parseSwissManagerCSV — missing date triggers warning ==========\n');
    {
        const broken = fixtureText.replace(/Дата\s*:\s*\d{2}\.\d{2}\.\d{4}/, '');
        const out = tournamentsData.parseSwissManagerCSV(broken, 'f.txt');
        assertEqual(out.tournament.date, null, 'date left null when header missing');
        assert(out.warnings.some(w => /date/i.test(w)), 'warning mentions date');
        assert(out.participants.length === 5, 'participants still parsed despite missing date');
    }

    console.log('\n=== parseSwissManagerCSV — missing league triggers warning ========\n');
    {
        const broken = fixtureText.replace(/Chess Empire \| Лига B \| Debut/, 'Chess Empire | | Debut');
        const out = tournamentsData.parseSwissManagerCSV(broken, 'f.txt');
        assertEqual(out.tournament.league, null, 'league left null when header missing');
        assert(out.warnings.some(w => /league/i.test(w)), 'warning mentions league');
    }

    console.log('\n=== Unicode NFC normalization =====================================\n');
    {
        // "Пётр" can be composed (one ё codepoint) or decomposed (е + combining diaeresis).
        const composed = 'Пётр';                      // U+0451
        const decomposed = 'Пётр'.normalize('NFD'); // е + combining ̈
        assert(composed !== decomposed, 'composed vs decomposed forms differ pre-NFC');

        const nfc = tournamentsData._internal.nfc;
        assertEqual(nfc(composed), nfc(decomposed), 'NFC reconciles both forms');

        // fuzzyMatchStudent must match across normalization forms.
        const students = [{ id: 's1', firstName: 'Пётр', lastName: 'Петров' }];
        const m = tournamentsData._internal.fuzzyMatchStudent(decomposed + ' Петров', students);
        assert(m.matched === true, 'decomposed input matches composed student name');
        assertEqual(m.student.id, 's1', 'correct student returned');
    }

    console.log('\n=== parseDDMMYYYY strictness ======================================\n');
    {
        const p = tournamentsData._internal.parseDDMMYYYY;
        assertEqual(p('03.05.2026'), '2026-05-03', '03.05.2026 → 2026-05-03');
        assertEqual(p('31.02.2026'), null, '31.02.2026 rejected (no Feb 31)');
        assertEqual(p('5/3/2026'), null, 'slashes rejected');
        assertEqual(p('2026-05-03'), null, 'ISO rejected (must be DD.MM.YYYY)');
        assertEqual(p(''), null, 'empty rejected');
    }

    console.log('\n=== matchParticipants — fuzzy + auto-resolve =======================\n');
    {
        const parsed = tournamentsData.parseSwissManagerCSV(fixtureText, 'f.txt');
        const students = [
            { id: 'stu-1', firstName: 'Иван', lastName: 'Иванов' },
            { id: 'stu-2', firstName: 'Пётр', lastName: 'Петров' },
            { id: 'stu-3', firstName: 'Арман', lastName: 'Кулов' },
            // Sidorov + Alekseev intentionally omitted to test unmatched bucket.
        ];

        const client = createMockClient();
        const out = await tournamentsData.matchParticipants(parsed.participants, students, { client });
        assert(out.matched.length === 3, '3 matched');
        assert(out.unmatched.length === 2, '2 unmatched (Sidorov, Alekseev)');
        assert(out.ambiguous.length === 0, '0 ambiguous');

        // Now persist a raw_name mapping for Sidorov so auto-resolve picks it up.
        client._db.tournament_participants.push({
            id: 'old-1', tournament_id: 't-old', student_id: 'stu-9', raw_name: 'Сидоров Игорь',
        });
        const studentsWithSidorov = students.concat([{ id: 'stu-9', firstName: 'Игорь', lastName: 'Сидоров' }]);
        const out2 = await tournamentsData.matchParticipants(parsed.participants, studentsWithSidorov, { client });
        assert(out2.matched.length === 4, '4 matched after auto-resolve via raw_name mapping');
        assert(out2.matched.some(m => m.source === 'auto' && m.student.id === 'stu-9'), 'Sidorov auto-resolved');
    }

    console.log('\n=== importTournament — idempotency =================================\n');
    {
        const parsed = tournamentsData.parseSwissManagerCSV(fixtureText, 'f.txt');
        const students = [
            { id: 'stu-1', firstName: 'Иван', lastName: 'Иванов' },
            { id: 'stu-2', firstName: 'Пётр', lastName: 'Петров' },
            { id: 'stu-3', firstName: 'Арман', lastName: 'Кулов' },
        ];
        const client = createMockClient();
        const matched = await tournamentsData.matchParticipants(parsed.participants, students, { client });
        const resolved = matched.matched;
        assert(resolved.length === 3, '3 resolved participants going into import');

        const r1 = await tournamentsData.importTournament(parsed, resolved, { client });
        assertEqual(r1.inserted, 3, 'first import inserts 3 participants');
        assertEqual(r1.skipped, 0, 'first import skips 0');
        assert(client._db.tournaments.length === 1, 'one tournament row after first import');
        assert(client._db.student_ratings.length === 3, 'paired student_ratings rows written');
        assert(
            client._db.student_ratings.every(r => r.source === 'tournament' && r.tournament_id === r1.tournamentId),
            'student_ratings rows tagged source=tournament + tournament_id FK'
        );

        const r2 = await tournamentsData.importTournament(parsed, resolved, { client });
        assertEqual(r2.tournamentId, r1.tournamentId, 'second import upserts to same tournament id');
        assertEqual(r2.inserted, 0, 'second import inserts 0 (idempotent)');
        assertEqual(r2.skipped, 3, 'second import skips 3 (idempotent)');
        assert(client._db.tournaments.length === 1, 'still one tournament row');
        assert(client._db.tournament_participants.length === 3, 'still 3 participant rows');
    }

    console.log('\n=== importTournament — missing metadata throws =====================\n');
    {
        const client = createMockClient();
        let threw = false;
        try {
            await tournamentsData.importTournament(
                { tournament: { name: 'X', league: null, date: '2026-01-01' }, participants: [] },
                [],
                { client }
            );
        } catch (e) { threw = true; }
        assert(threw, 'import throws when league is missing');
    }

    console.log('\n=== _cadenceFromDate cutoffs =======================================\n');
    {
        const cad = tournamentsData._internal._cadenceFromDate;
        const today = new Date('2026-05-12');
        assertEqual(cad('2026-05-01', today), 'active', '11 days ago → active');
        assertEqual(cad('2026-04-01', today), 'occasional', '41 days ago → occasional');
        assertEqual(cad('2026-01-01', today), 'inactive', '131 days ago → inactive');
        assertEqual(cad(null, today), 'inactive', 'null lastDate → inactive');
    }

    console.log('\n=== parseDelta edge cases ==========================================\n');
    {
        const d = tournamentsData._internal.parseDelta;
        assertEqual(d('+125'), 125, '+125 → 125');
        assertEqual(d('-12'), -12, '-12 → -12');
        assertEqual(d('0'), 0, '0 → 0');
        assertEqual(d(''), 0, 'empty → 0');
        assertEqual(d(null), 0, 'null → 0');
        assertEqual(d(undefined), 0, 'undefined → 0');
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
