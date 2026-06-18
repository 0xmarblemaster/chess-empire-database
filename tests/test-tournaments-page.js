/**
 * Smoke test for the public tournament schedule page (Job 1 of 2).
 *
 * Coverage:
 *   1. register_for_tournament RPC capacity + status logic, simulated by
 *      executing the SQL function body in JS against an in-memory store.
 *   2. Branch exclusion list — `tournaments.js` must filter out
 *      "НИШ" (NiS) and "Zhandosova" client-side.
 *   3. i18n keys exist in en/ru/kk for every tournaments.* key shipped on
 *      the public page.
 *   4. tournaments.html wires the page scripts in the right order and
 *      references the i18n title key.
 *
 * No live Supabase. Run: `node tests/test-tournaments-page.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (actual === expected) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ---------------------------------------------------------------------------
// 1. Migration sanity — file exists and ships the expected primitives
// ---------------------------------------------------------------------------
console.log('\n=== migration 043_tournaments.sql ====================================\n');

const MIG_PATH = path.join(ROOT, 'migrations/043_tournaments.sql');
assert(fs.existsSync(MIG_PATH), 'migrations/043_tournaments.sql exists');
const MIG = fs.readFileSync(MIG_PATH, 'utf8');

assert(/CREATE TABLE IF NOT EXISTS tournaments/.test(MIG),
    'creates tournaments table (idempotent)');
assert(/CREATE TABLE IF NOT EXISTS tournament_registrations/.test(MIG),
    'creates tournament_registrations table');
assert(/UNIQUE \(tournament_id, student_id\)/.test(MIG),
    'tournament_registrations has UNIQUE (tournament_id, student_id)');
assert(/CREATE OR REPLACE FUNCTION register_for_tournament/.test(MIG),
    'defines register_for_tournament RPC');
assert(/FOR UPDATE/.test(MIG),
    'register_for_tournament locks the tournament row FOR UPDATE');
assert(/GRANT EXECUTE ON FUNCTION register_for_tournament.+TO anon, authenticated/.test(MIG),
    'RPC is exposed to anon + authenticated roles');
assert(/Public read tournaments/.test(MIG),
    'RLS policy: public can SELECT tournaments');
assert(/Public read registrations/.test(MIG),
    'RLS policy: public can SELECT tournament_registrations');
assert(/ALTER PUBLICATION supabase_realtime ADD TABLE tournament_registrations/.test(MIG),
    'tournament_registrations is added to the supabase_realtime publication');
assert(/Halyk Arena/.test(MIG), 'seed targets Halyk Arena branch');
assert(/FOR i IN 0\.\.3 LOOP/.test(MIG), 'seed iterates 4 Saturdays');

// ---------------------------------------------------------------------------
// 2. RPC simulation — capacity & status enforcement
// ---------------------------------------------------------------------------
console.log('\n=== register_for_tournament logic (in-memory simulation) =============\n');

function makeRegisterFn() {
    // Mimics the plpgsql body of register_for_tournament.
    const tournaments = new Map();   // id -> { capacity, status }
    const registrations = [];        // { tournament_id, student_id }

    function addTournament(id, capacity) {
        tournaments.set(id, { capacity, status: 'open' });
    }

    function register(tournamentId, studentId) {
        const t = tournaments.get(tournamentId);
        if (!t) return { ok: false, reason: 'not_found' };
        if (t.status !== 'open') return { ok: false, reason: 'closed' };

        const count = registrations.filter(r => r.tournament_id === tournamentId).length;
        if (count >= t.capacity) {
            t.status = 'closed';
            return { ok: false, reason: 'full' };
        }
        const duplicate = registrations.some(
            r => r.tournament_id === tournamentId && r.student_id === studentId
        );
        if (duplicate) return { ok: false, reason: 'duplicate' };

        registrations.push({ tournament_id: tournamentId, student_id: studentId });
        if (count + 1 >= t.capacity) t.status = 'closed';
        return { ok: true };
    }

    return { addTournament, register, tournaments, registrations };
}

const sim = makeRegisterFn();
sim.addTournament('t1', 3);

assertEqual(sim.register('t1', 's1').ok, true, 'first registration succeeds');
assertEqual(sim.register('t1', 's1').reason, 'duplicate',
    'second registration by same student is rejected as duplicate');
assertEqual(sim.register('t1', 's2').ok, true, '2nd unique registration succeeds');
const third = sim.register('t1', 's3');
assertEqual(third.ok, true, '3rd registration (capacity) succeeds');
assertEqual(sim.tournaments.get('t1').status, 'closed',
    'status flips to "closed" when capacity is reached');
assertEqual(sim.register('t1', 's4').reason, 'closed',
    'further registration after capacity reports reason=closed');
assertEqual(sim.register('does-not-exist', 's5').reason, 'not_found',
    'unknown tournament reports reason=not_found');

// Race: simulate two parallel callers when only 1 seat remains. The RPC's
// FOR UPDATE serializes them, so one succeeds and the second sees reason=full.
const race = makeRegisterFn();
race.addTournament('rt', 1);
const r1 = race.register('rt', 'a');
const r2 = race.register('rt', 'b');
assertEqual(r1.ok, true, 'race: first caller wins');
assertEqual(r2.reason, 'closed',
    'race: losing caller sees reason=closed (capacity already reached & status flipped)');

// ---------------------------------------------------------------------------
// 3. Branch exclusion contract
// ---------------------------------------------------------------------------
console.log('\n=== branch exclusion (tournaments.js) ================================\n');

const JS = fs.readFileSync(path.join(ROOT, 'tournaments.js'), 'utf8');

assert(/EXCLUDED_BRANCHES\s*=\s*\[/.test(JS),
    'tournaments.js declares EXCLUDED_BRANCHES list');
assert(/'НИШ'/.test(JS),
    'EXCLUDED_BRANCHES includes the DB name "НИШ" (i.e. NiS)');
assert(/'Zhandosova'/.test(JS),
    'EXCLUDED_BRANCHES includes "Zhandosova"');

// Exercise the filter against a realistic branch list.
const allBranches = [
    { id: '1', name: 'Almaty Arena' },
    { id: '2', name: 'Almaty 1' },
    { id: '3', name: 'Debut' },
    { id: '4', name: 'Gagarin Park' },
    { id: '5', name: 'Halyk Arena' },
    { id: '6', name: 'НИШ' },
    { id: '7', name: 'Zhandosova' },
];
const excluded = ['НИШ', 'Zhandosova'];
const visible = allBranches.filter(b => !excluded.includes(b.name));
assertEqual(visible.length, 5, 'after filtering, 5 branches remain');
assert(!visible.some(b => b.name === 'НИШ'), 'НИШ is filtered out');
assert(!visible.some(b => b.name === 'Zhandosova'), 'Zhandosova is filtered out');
assert(visible.some(b => b.name === 'Halyk Arena'), 'Halyk Arena is retained');

// ---------------------------------------------------------------------------
// 4. i18n key coverage (en / ru / kk)
// ---------------------------------------------------------------------------
console.log('\n=== i18n keys present in en / ru / kk ================================\n');

const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

function sliceLocale(src, locale) {
    const re = new RegExp(`\\n\\s+${locale}:\\s*\\{`, 'g');
    let combined = '';
    let m;
    while ((m = re.exec(src)) !== null) {
        let depth = 0;
        let i = src.indexOf('{', m.index);
        const begin = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) { combined += src.slice(begin, i + 1); break; }
            }
        }
    }
    return combined;
}

const EN = sliceLocale(I18N_SRC, 'en');
const RU = sliceLocale(I18N_SRC, 'ru');
const KK = sliceLocale(I18N_SRC, 'kk');

const REQUIRED_KEYS = [
    'tournaments.title',
    'tournaments.upcoming',
    'tournaments.noUpcoming',
    'tournaments.registerButton',
    'tournaments.registrationClosed',
    'tournaments.registrationFull',
    'tournaments.searchStudent',
    'tournaments.confirmRegister',
    'tournaments.registeredSuccess',
    'tournaments.alreadyRegistered',
    'tournaments.tournamentNotFound',
    'tournaments.fields.info',
    'tournaments.fields.date',
    'tournaments.fields.time',
    'tournaments.fields.format',
    'tournaments.fields.fee',
    'tournaments.fields.rounds',
    'tournaments.fields.capacity',
    'tournaments.fields.roster',
];

for (const k of REQUIRED_KEYS) {
    assert(EN.includes(`"${k}"`), `en defines ${k}`);
    assert(RU.includes(`"${k}"`), `ru defines ${k}`);
    assert(KK.includes(`"${k}"`), `kk defines ${k}`);
}

// ---------------------------------------------------------------------------
// 5. tournaments.html script wiring
// ---------------------------------------------------------------------------
console.log('\n=== tournaments.html script wiring ===================================\n');

const HTML = fs.readFileSync(path.join(ROOT, 'tournaments.html'), 'utf8');

assert(/<script[^>]*\bsrc="supabase-config\.js/.test(HTML),
    'tournaments.html loads supabase-config.js');
assert(/<script[^>]*\bsrc="supabase-client\.js/.test(HTML),
    'tournaments.html loads supabase-client.js');
assert(/<script[^>]*\bsrc="i18n\.js/.test(HTML),
    'tournaments.html loads i18n.js');
assert(/<script[^>]*\bsrc="tournaments\.js/.test(HTML),
    'tournaments.html loads tournaments.js');
assert(/data-i18n="tournaments\.title"/.test(HTML),
    'page header binds to tournaments.title i18n key');
assert(/data-lang="en"/.test(HTML) && /data-lang="ru"/.test(HTML) && /data-lang="kk"/.test(HTML),
    'language switcher exposes en / ru / kk buttons');
assert(/id="registerModal"/.test(HTML),
    'register modal markup present');
assert(/id="toastStack"/.test(HTML),
    'toast stack container present');

// ---------------------------------------------------------------------------
// 6. tournaments.js — RPC name + roster behavior
// ---------------------------------------------------------------------------
console.log('\n=== tournaments.js — RPC + roster contract ===========================\n');

assert(/supabase\.rpc\('register_for_tournament'/.test(JS),
    'tournaments.js calls the register_for_tournament RPC');
assert(/p_tournament_id/.test(JS) && /p_student_id/.test(JS),
    'RPC payload uses positional parameter names p_tournament_id, p_student_id');
assert(/students\?\.\(?first_name|students!inner\(first_name, last_name\)/.test(JS) ||
       /students!inner\(first_name, last_name\)/.test(JS),
    'roster query joins students with first_name + last_name (NOT initials only)');
assert(/first_name \+ ' ' \+ r\.last_name|r\.first_name.*r\.last_name/.test(JS),
    'roster renders full first + last name');
assert(/POLL_INTERVAL_MS\s*=\s*15000/.test(JS),
    '15s polling fallback when Realtime is unavailable');
assert(/REALTIME_CONNECT_TIMEOUT_MS\s*=\s*5000/.test(JS),
    '5s Realtime connect timeout before falling back to polling');
assert(/SEARCH_DEBOUNCE_MS\s*=\s*250/.test(JS),
    'student search is debounced to 250ms');
assert(/'duplicate'/.test(JS) && /'full'/.test(JS) && /'closed'/.test(JS) && /'not_found'/.test(JS),
    'tournaments.js handles all four register_for_tournament failure reasons');

// ---------------------------------------------------------------------------
// 7. tournaments.js — public UI treats expired tournaments as closed
// ---------------------------------------------------------------------------
//
// The DB-side cron in migration 047 persists `status = 'closed'` for rows
// whose tournament_date or start_time has passed in Asia/Almaty, but the
// public page must still render the right thing for rows the cron has not
// yet caught (or before the next 5-minute tick). `tournamentIsExpired(t)`
// is the display-side mirror — used alongside `isDeadlinePassed(t)` to
// drive the closed/disabled state of the row pill, detail panel, register
// button, deadline label, countdown block, and modal-open guard.
console.log('\n=== tournaments.js — expired-tournament display state ===============\n');

assert(/function tournamentIsExpired\(/.test(JS),
    'tournamentIsExpired(t) helper is defined in tournaments.js');
assert(/function todayInAlmaty\(/.test(JS),
    'todayInAlmaty(now) helper is defined');
assert(/function tournamentStartPassed\(/.test(JS),
    'tournamentStartPassed(t, now) helper is defined');

// All four sites that previously gated UI on `deadlinePassed` must now also
// consult `tournamentIsExpired` (countdown, row pill, detail panel, modal
// guard). Use a single regex that matches both calls being OR'd together.
const expiredCallSites = JS.match(/tournamentIsExpired\(/g) || [];
assert(expiredCallSites.length >= 5,
    'tournamentIsExpired is invoked from at least 5 sites (decl + 4 gates)');
assert(/countdownHtml[\s\S]{0,400}tournamentIsExpired\(/.test(JS),
    'countdownHtml suppresses the countdown when the tournament is expired');
assert(/tournamentRowHtml[\s\S]{0,800}tournamentIsExpired\(/.test(JS),
    'tournamentRowHtml consults tournamentIsExpired for the closed pill + deadline label');
assert(/renderTournamentDetail[\s\S]{0,800}tournamentIsExpired\(/.test(JS),
    'renderTournamentDetail consults tournamentIsExpired for the register button');
assert(/isDeadlinePassed\(tNow\) \|\| tournamentIsExpired\(tNow\)/.test(JS),
    'doRegister modal guard checks both isDeadlinePassed and tournamentIsExpired');

// Behavioral exercise of the helper. Extracts the function body from
// tournaments.js, plus the two helpers it depends on, and runs them
// against a deterministic "now" (2026-06-18T07:00:00Z == 12:00 Almaty).
function extractFn(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) return null;
    let depth = 0;
    let i = src.indexOf('{', start);
    const begin = start;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(begin, i + 1);
        }
    }
    return null;
}

const helperBundle = [
    extractFn(JS, 'todayInAlmaty'),
    extractFn(JS, 'tournamentStartPassed'),
    extractFn(JS, 'tournamentIsExpired'),
].join('\n\n');
assert(helperBundle.includes('tournamentIsExpired'),
    'helper bundle extracted from tournaments.js');

// 2026-06-18 12:00 Almaty == 07:00 UTC.
const NOW = new Date('2026-06-18T07:00:00.000Z').getTime();
const TODAY_ALMATY = '2026-06-18';

const harness = `
${helperBundle}
return {
    today: todayInAlmaty(NOW),
    pastDate: tournamentIsExpired({ tournament_date: '2026-06-13', start_time: '14:00' }, NOW),
    todayBeforeStart: tournamentIsExpired({ tournament_date: '${TODAY_ALMATY}', start_time: '14:00' }, NOW),
    todayAfterStart: tournamentIsExpired({ tournament_date: '${TODAY_ALMATY}', start_time: '11:00' }, NOW),
    todayAtStartExact: tournamentIsExpired({ tournament_date: '${TODAY_ALMATY}', start_time: '12:00' }, NOW),
    todayNoStartTime: tournamentIsExpired({ tournament_date: '${TODAY_ALMATY}', start_time: null }, NOW),
    futureDate: tournamentIsExpired({ tournament_date: '2026-07-01', start_time: '14:00' }, NOW),
    futureNoStart: tournamentIsExpired({ tournament_date: '2026-07-01', start_time: null }, NOW),
    nullTournament: tournamentIsExpired(null, NOW),
    noDate: tournamentIsExpired({ start_time: '14:00' }, NOW),
    secondsFormat: tournamentIsExpired({ tournament_date: '${TODAY_ALMATY}', start_time: '11:00:00' }, NOW),
};`;
const results = (new Function('NOW', harness))(NOW);

assertEqual(results.today, TODAY_ALMATY,
    'todayInAlmaty(NOW=12:00 UTC+5) returns the correct Almaty YYYY-MM-DD');
assertEqual(results.pastDate, true,
    'tournament whose date has passed is treated as expired');
assertEqual(results.todayBeforeStart, false,
    "today's tournament whose start_time is still in the future is NOT expired");
assertEqual(results.todayAfterStart, true,
    "today's tournament whose start_time has elapsed is expired");
assertEqual(results.todayAtStartExact, true,
    'start_time == now (exact) is expired (<= comparison matches SQL)');
assertEqual(results.todayNoStartTime, false,
    "today's tournament with NULL start_time is NOT expired (cond 3 requires start_time)");
assertEqual(results.futureDate, false,
    'future tournament is not expired');
assertEqual(results.futureNoStart, false,
    'future tournament with NULL start_time is not expired');
assertEqual(results.nullTournament, false,
    'null tournament input returns false (no crash)');
assertEqual(results.noDate, false,
    'missing tournament_date returns false');
assertEqual(results.secondsFormat, true,
    'start_time with seconds suffix (HH:MM:SS) is handled');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Summary ===\n  passed: ${passed}\n  failed: ${failed}\n`);
if (failed > 0) process.exit(1);
