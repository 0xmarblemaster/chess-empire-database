/**
 * Phase 2b — Tournament importer smoke test.
 * Run: node tests/test-tournament-importer.js
 *
 * Covers the data-layer surface that the admin-v2.js importer UI calls
 * against the fixture file. We exercise parseSwissManagerCSV +
 * matchParticipants (with a mock client) + importTournament (against an
 * in-memory mock client). A real Supabase test instance is not used here
 * — booting one in CI is out of scope for this phase and would require
 * a service-role key in the environment. The pure data layer is already
 * covered by tests/test-tournament-parser.js; this file ensures the
 * importer end-to-end (parse → match → resolve → import) doesn't choke
 * on the real fixture.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const tournamentsData = require('../supabase-data-tournaments.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// === Mock Supabase client ===============================================
// Just enough surface to satisfy importTournament + matchParticipants.
function makeMockClient() {
    const state = {
        tournaments: [],
        tournament_participants: [],
        student_ratings: [],
    };

    function table(name) {
        return {
            _filters: [],
            _name: name,
            select(_cols, _opts) { return this; },
            eq(col, val) { this._filters.push(['eq', col, val]); return this; },
            in(col, vals) { this._filters.push(['in', col, vals]); return this; },
            order() { return this; },
            range() { return this; },
            limit() { return this; },
            single() {
                return Promise.resolve({ data: this._results?.[0] || null, error: null });
            },
            insert(payload) {
                const rows = Array.isArray(payload) ? payload : [payload];
                for (const row of rows) {
                    const id = `${name}-${state[name].length + 1}`;
                    state[name].push({ id, ...row });
                }
                return Promise.resolve({ data: rows, error: null });
            },
            upsert(payload) {
                const rows = Array.isArray(payload) ? payload : [payload];
                const inserted = [];
                for (const row of rows) {
                    // dedupe by (name,tournament_date,league) for tournaments
                    let existing = null;
                    if (name === 'tournaments') {
                        existing = state.tournaments.find(t =>
                            t.name === row.name &&
                            t.tournament_date === row.tournament_date &&
                            t.league === row.league
                        );
                    }
                    if (existing) {
                        Object.assign(existing, row);
                        inserted.push(existing);
                    } else {
                        const id = `${name}-${state[name].length + 1}`;
                        const r = { id, ...row };
                        state[name].push(r);
                        inserted.push(r);
                    }
                }
                this._results = inserted;
                return this;
            },
            delete() {
                this._del = true;
                return this;
            },
            then(onF, onR) {
                // resolve query-style: filter state and return data array
                let rows = state[this._name].slice();
                for (const [op, col, val] of this._filters) {
                    if (op === 'eq') rows = rows.filter(r => r[col] === val);
                    if (op === 'in') rows = rows.filter(r => val.includes(r[col]));
                }
                if (this._del) {
                    const ids = new Set(rows.map(r => r.id));
                    state[this._name] = state[this._name].filter(r => !ids.has(r.id));
                    return Promise.resolve({ data: null, error: null }).then(onF, onR);
                }
                return Promise.resolve({ data: rows, error: null, count: rows.length }).then(onF, onR);
            },
        };
    }

    return {
        from: table,
        _state: state,
    };
}

// === Fixtures ===========================================================
const fixturePath = path.join(__dirname, 'fixtures', 'debut-league-b.txt');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');

// Students that should fuzzy-match a few names in the fixture.
const students = [
    { id: 's1', firstName: 'Иван', lastName: 'Иванов' },
    { id: 's2', firstName: 'Пётр', lastName: 'Петров' },
    { id: 's3', firstName: 'Арман', lastName: 'Кулов' },
];

// === Tests ==============================================================
(async () => {
    console.log('\n=== parseSwissManagerCSV against real fixture =====================\n');
    const parsed = tournamentsData.parseSwissManagerCSV(fixtureText, 'debut-league-b.txt');
    assert(parsed.tournament.name === 'Debut', 'tournament name parsed');
    assert(parsed.tournament.league === 'B', 'league parsed');
    assert(parsed.tournament.date === '2026-05-03', 'date parsed');
    assert(parsed.participants.length > 0, 'participants parsed (' + parsed.participants.length + ')');

    console.log('\n=== matchParticipants with mock client ============================\n');
    const client = makeMockClient();
    const match = await tournamentsData.matchParticipants(parsed.participants, students, { client });
    assert(Array.isArray(match.matched), 'match.matched is array');
    assert(Array.isArray(match.ambiguous), 'match.ambiguous is array');
    assert(Array.isArray(match.unmatched), 'match.unmatched is array');
    assert(match.matched.length >= 1, 'at least one auto-match');

    console.log('\n=== importTournament end-to-end ===================================\n');
    const resolvedParts = match.matched.map(m => ({ participant: m.participant, student: m.student }));
    const result = await tournamentsData.importTournament(parsed, resolvedParts, { client });
    assert(typeof result.tournamentId === 'string', 'returns tournamentId');
    assert(result.inserted === resolvedParts.length, 'inserts all resolved participants');
    assert(client._state.tournaments.length === 1, 'one tournament row written');
    assert(client._state.tournament_participants.length === resolvedParts.length, 'participant rows written');

    console.log('\n=== re-import idempotency =========================================\n');
    const result2 = await tournamentsData.importTournament(parsed, resolvedParts, { client });
    assert(result2.inserted === 0, 're-import inserts 0');
    assert(result2.skipped === resolvedParts.length, 're-import skips all');
    assert(client._state.tournaments.length === 1, 'still one tournament row');

    console.log('\n================================================================');
    console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('================================================================');
    process.exit(failed === 0 ? 0 : 1);
})();
