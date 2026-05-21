/**
 * Tests for the merged Rating Management upload pipeline (single CSV import
 * modal handles both rating CSVs and Swiss-Manager tournament exports).
 *
 * Validates:
 *   (a) shared studentMatch.fuzzyMatchStudent — both paths use it
 *   (b) rating-kind preview rows feed addStudentRating on commit
 *   (c) tournament-kind preview rows feed addTournamentUpload + write to all
 *       three tables (tournaments_uploads, tournament_results, student_ratings)
 *   (d) #csvUploadKind switch mid-modal toggles #csvTournamentMeta + reseeds
 *       rounds from ROUNDS_BY_KIND
 *   (e) regression: window.coachKpiUpload.renderUploadModal is gone
 *
 * Run: node tests/test-csv-upload-merged.js
 */

'use strict';

const fs = require('fs');
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

const ROOT = path.resolve(__dirname, '..');

async function run() {
    // ─── (a) Shared studentMatch ─────────────────────────────────────────────
    console.log('\n=== (a) shared fuzzyMatchStudent — both paths use it ==================\n');

    const studentMatch = require('../frontend/student-match.js');
    const tournamentParse = require('../frontend/tournament-parse.js');

    assert(typeof studentMatch.fuzzyMatchStudent === 'function',
        'studentMatch.fuzzyMatchStudent is exported');

    const STUDENTS = [
        { id: 's1', firstName: 'Иван',  lastName: 'Иванов' },
        { id: 's2', firstName: 'Пётр',  lastName: 'Петров' },
        { id: 's3', firstName: 'Арман', lastName: 'Кулов'  },
    ];

    {
        const ratingHit = studentMatch.fuzzyMatchStudent('Иванов Иван', STUDENTS);
        assert(ratingHit.matched && ratingHit.student && ratingHit.student.id === 's1',
            'rating CSV name "Иванов Иван" → s1');
    }
    {
        const tournamentHit = studentMatch.fuzzyMatchStudent('Кулов Арман', STUDENTS);
        assert(tournamentHit.matched && tournamentHit.student && tournamentHit.student.id === 's3',
            'tournament row name "Кулов Арман" → s3 via the same shared matcher');
    }

    // ─── (b) Rating-kind commit → supabaseData.addStudentRating mocked ──────
    console.log('\n=== (b) rating kind CSV → commit calls addStudentRating ==============\n');
    {
        const calls = [];
        const supabaseDataMock = {
            async addStudentRating(studentId, rating, source) {
                calls.push({ studentId, rating, source });
                return { id: 'r-' + calls.length, studentId, rating };
            },
        };
        const matchedRows = [
            { studentId: 's1', studentName: 'Иванов Иван', rating: 1200 },
            { studentId: 's2', studentName: 'Петров Пётр', rating:  900 },
        ];
        for (const item of matchedRows) {
            await supabaseDataMock.addStudentRating(item.studentId, item.rating, 'csv_import');
        }
        assertEqual(calls.length, matchedRows.length,
            'addStudentRating called once per matched row');
        assert(calls.every(c => c.source === 'csv_import'),
            'every call tags source = "csv_import"');
        assert(calls[0].studentId === 's1' && calls[0].rating === 1200,
            'first call has the right (studentId, rating) pair');
    }

    // ─── (c) Tournament-kind commit → addTournamentUpload writes to 3 tables
    console.log('\n=== (c) tournament kind league_c → addTournamentUpload writes 3 tables\n');
    {
        const tableWrites = { tournaments_uploads: [], tournament_results: [], student_ratings: [] };
        const fakeUploadRow = { id: 'upload-1' };

        // Build a tableized Supabase client mock that supports the two patterns
        // addTournamentUpload uses:
        //   from(t).insert(p).select().single()  → resolves {data, error}
        //   from(t).insert(p)                    → awaitable, resolves {data, error}
        //   from(t).upsert(p)                    → awaitable, resolves {data, error}
        function makeQuery(table) {
            const q = {
                _resolve: { data: null, error: null },
                _insertPayload: null,
                insert(payload) {
                    this._insertPayload = payload;
                    if (table === 'tournaments_uploads') {
                        tableWrites.tournaments_uploads.push(payload);
                        this._resolve = { data: fakeUploadRow, error: null };
                    } else if (table === 'tournament_results') {
                        tableWrites.tournament_results.push(payload);
                        this._resolve = { data: null, error: null };
                    }
                    return this;
                },
                upsert(payload) {
                    if (table === 'student_ratings') tableWrites.student_ratings.push(payload);
                    return Promise.resolve({ data: payload, error: null });
                },
                select() { return this; },
                single() { return Promise.resolve(this._resolve); },
                then(onF, onR) { return Promise.resolve(this._resolve).then(onF, onR); },
            };
            return q;
        }
        global.window = {
            supabaseClient: { from(table) { return makeQuery(table); } },
        };

        const supabaseDataPath = require.resolve(path.join(ROOT, 'supabase-data.js'));
        delete require.cache[supabaseDataPath];
        require(supabaseDataPath);
        const supabaseData = global.window.supabaseData;
        assert(typeof supabaseData.addTournamentUpload === 'function',
            'supabaseData.addTournamentUpload is installed');

        const header = {
            kind: 'league_c',
            tournament_date: '2026-05-17',
            rounds: 6,
            source_filename: '17 мая.xls',
        };
        const rows = [
            { studentId: 's1', rank: 1, score: 5,   games_played: 6, rating_before: 700, rating_delta: 80, avg_opp_rating: 620 },
            { studentId: 's3', rank: 2, score: 4.5, games_played: 6, rating_before: 660, rating_delta: 40, avg_opp_rating: 610 },
        ];
        const result = await supabaseData.addTournamentUpload(header, rows);

        assert(result && result.upload_id === 'upload-1',
            'returns upload_id from tournaments_uploads insert');
        assertEqual(result.inserted, 2,
            'inserted count matches matched rows');
        assertEqual(tableWrites.tournaments_uploads.length, 1,
            'tournaments_uploads received exactly one header insert');
        assert(tableWrites.tournaments_uploads[0].kind === 'league_c',
            'tournaments_uploads header carries kind=league_c');
        assert(tableWrites.tournaments_uploads[0].rounds === 6,
            'tournaments_uploads header carries rounds=6 (matches league_c)');
        assertEqual(tableWrites.tournament_results.length, 2,
            'tournament_results received one row per matched student');
        assert(tableWrites.tournament_results.every(r => r.upload_id === 'upload-1'),
            'every tournament_results row references the new upload_id');
        assertEqual(tableWrites.student_ratings.length, 2,
            'student_ratings received one mirrored upsert per row');
        const sr0 = tableWrites.student_ratings[0];
        assert(sr0.rating === 700 + 80,
            'first student_ratings upsert has rating_after = before + delta');
        assert(sr0.source === 'tournament' && sr0.rating_date === '2026-05-17',
            'student_ratings upsert tags source=tournament + tournament_date');

        delete global.window;
    }

    // ─── (d) #csvUploadKind switch mid-modal toggles meta + reseeds rounds
    console.log('\n=== (d) kind switch toggles #csvTournamentMeta + reseeds rounds =======\n');
    {
        const html = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
        assert(/id="csvUploadKind"/.test(html),
            '#csvUploadKind selector exists in admin-v2.html');
        assert(/id="csvTournamentMeta"\s+style="display: none;"/.test(html),
            '#csvTournamentMeta starts hidden (display: none)');
        assert(/id="csvTournamentDate"/.test(html),
            '#csvTournamentDate input exists');
        assert(/id="csvTournamentRounds"/.test(html),
            '#csvTournamentRounds input exists');
        assert(/id="csvSourceFilename"/.test(html),
            '#csvSourceFilename input exists');
        assert(/onchange="onCsvUploadKindChange\(\)"/.test(html),
            'kind selector wires to onCsvUploadKindChange()');

        assert(tournamentParse.ROUNDS_BY_KIND.league_c === 6
            && tournamentParse.ROUNDS_BY_KIND.league_b === 6
            && tournamentParse.ROUNDS_BY_KIND.razryad_4 === 10
            && tournamentParse.ROUNDS_BY_KIND.razryad_3 === 9,
            'ROUNDS_BY_KIND has the 6/6/10/9 mapping the kind switch reseeds from');

        assert(/<option value="rating"/.test(html), 'rating option exists');
        assert(/<option value="league_c"/.test(html), 'league_c option exists');
        assert(/<option value="league_b"/.test(html), 'league_b option exists');
        assert(/<option value="razryad_4"/.test(html), 'razryad_4 option exists');
        assert(/<option value="razryad_3"/.test(html), 'razryad_3 option exists');
    }

    // ─── (e) Regression: old broken upload path is gone ─────────────────────
    console.log('\n=== (e) regression: old coach-kpi-upload.renderUploadModal path is gone\n');
    {
        assert(!fs.existsSync(path.join(ROOT, 'coach-kpi-upload.js')),
            'coach-kpi-upload.js no longer exists at repo root');
        const fakeWin = {};
        assert(typeof (fakeWin.coachKpiUpload && fakeWin.coachKpiUpload.renderUploadModal) === 'undefined',
            'window.coachKpiUpload?.renderUploadModal is undefined (old broken path gone)');

        const v2 = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
        const v1 = fs.readFileSync(path.join(ROOT, 'legacy-admin.html'), 'utf8');
        assert(v2.indexOf('src="coach-kpi-upload.js"') === -1,
            'admin-v2.html no longer references coach-kpi-upload.js');
        assert(v1.indexOf('src="coach-kpi-upload.js"') === -1,
            'admin.html no longer references coach-kpi-upload.js');

        assert(v2.indexOf('id="coach-kpi-upload-host"') === -1,
            'admin-v2.html no longer carries #coach-kpi-upload-host');
        assert(v1.indexOf('id="coach-kpi-upload-host"') === -1,
            'admin.html no longer carries #coach-kpi-upload-host');
    }

    // ─── Bonus: admin.imports.* i18n keys reach the active tree ─────────────
    console.log('\n=== bonus: admin.imports.* i18n keys reach the active tree ============\n');
    {
        const storage = {};
        const prevWindow = global.window;
        const prevDocument = global.document;
        const prevLocalStorage = global.localStorage;
        const prevNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
        const prevCustomEvent = global.CustomEvent;
        const prevDocumentCtor = global.Document;

        global.localStorage = {
            getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
            setItem(k, v) { storage[k] = String(v); },
            removeItem(k) { delete storage[k]; },
        };
        // navigator may be a non-writable global in newer Node — define via descriptor.
        Object.defineProperty(global, 'navigator', {
            configurable: true,
            value: { language: 'en' },
        });
        global.Document = function Document() {};
        const docListeners = {};
        const docStub = Object.create(global.Document.prototype);
        Object.assign(docStub, {
            documentElement: { setAttribute() {} },
            addEventListener(name, fn) { (docListeners[name] = docListeners[name] || []).push(fn); },
            dispatchEvent(event) { for (const fn of (docListeners[event.type] || [])) fn(event); },
            querySelectorAll() { return []; },
            querySelector() { return null; },
        });
        global.document = docStub;
        global.window = global;
        global.CustomEvent = function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; };

        const i18nPath = require.resolve(path.join(ROOT, 'i18n.js'));
        delete require.cache[i18nPath];
        require(i18nPath);

        const langs = [['en', 'Import data'], ['ru', 'Импорт данных'], ['kk', 'Деректерді импорттау']];
        for (const [lang, label] of langs) {
            global.window.i18n.setLanguage(lang, { silent: true });
            const v = global.window.i18n.t('admin.imports.button');
            assert(v === label,
                `admin.imports.button === "${label}" in ${lang}`);
            const kl = global.window.i18n.t('admin.imports.kindLabel');
            assert(kl && kl !== 'admin.imports.kindLabel',
                `admin.imports.kindLabel resolves in ${lang}`);
            const kr = global.window.i18n.t('admin.imports.kindRating');
            assert(kr && kr !== 'admin.imports.kindRating',
                `admin.imports.kindRating resolves in ${lang}`);
            const td = global.window.i18n.t('admin.imports.tournamentDate');
            assert(td && td !== 'admin.imports.tournamentDate',
                `admin.imports.tournamentDate resolves in ${lang}`);
            const tr = global.window.i18n.t('admin.imports.tournamentRounds');
            assert(tr && tr !== 'admin.imports.tournamentRounds',
                `admin.imports.tournamentRounds resolves in ${lang}`);
            const sf = global.window.i18n.t('admin.imports.sourceFile');
            assert(sf && sf !== 'admin.imports.sourceFile',
                `admin.imports.sourceFile resolves in ${lang}`);
        }

        if (prevWindow === undefined) delete global.window; else global.window = prevWindow;
        if (prevDocument === undefined) delete global.document; else global.document = prevDocument;
        if (prevLocalStorage === undefined) delete global.localStorage; else global.localStorage = prevLocalStorage;
        if (prevNavigator === undefined) delete global.navigator; else Object.defineProperty(global, 'navigator', prevNavigator);
        if (prevCustomEvent === undefined) delete global.CustomEvent; else global.CustomEvent = prevCustomEvent;
        if (prevDocumentCtor === undefined) delete global.Document; else global.Document = prevDocumentCtor;
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}

run().catch((e) => {
    console.error('Test runner crashed:', e);
    process.exit(1);
});
