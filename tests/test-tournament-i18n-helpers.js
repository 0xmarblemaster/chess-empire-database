/**
 * Tests for the tournament display-layer i18n helpers shipped in i18n.js:
 *   - translateTimeFormat(format)
 *   - composeTournamentName({league, name}, branchName)
 *
 * These helpers replace raw rendering of the stored `name` / `time_format`
 * columns with structured composition that respects the current language.
 *
 * The harness loads i18n.js into a JSDOM-free sandbox (Node Function), then
 * exercises the helpers across EN / RU / KK + the fallback path.
 *
 * Run: node tests/test-tournament-i18n-helpers.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assertEqual(actual, expected, msg) {
    if (actual === expected) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// ---------------------------------------------------------------------------
// Load i18n.js into a sandboxed window-like global so the IIFE runs and
// publishes its helpers onto window. Provides minimal localStorage +
// document + CustomEvent shims.
// ---------------------------------------------------------------------------
const SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

function makeSandbox() {
    const win = {};
    const storage = new Map();
    const localStorage = {
        getItem: k => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: k => storage.delete(k),
        clear: () => storage.clear(),
    };
    // Minimal DOM stubs — translatePage() walks querySelectorAll results and
    // does an `instanceof Document` check we have to satisfy.
    function StubDocument() {}
    const document = Object.assign(new StubDocument(), {
        documentElement: { setAttribute() {} },
        addEventListener() {},
        dispatchEvent() {},
        querySelectorAll() { return []; },
    });
    win.localStorage = localStorage;
    win.document = document;
    win.CustomEvent = function CustomEvent(name, opts) { return { name, ...opts }; };
    const wrapped = `(function(window, localStorage, document, CustomEvent, Document) {\n${SRC}\nreturn window;\n})`;
    const fn = (new Function('return ' + wrapped))();
    return fn(win, localStorage, document, CustomEvent, StubDocument);
}

// ---------------------------------------------------------------------------
// Static source assertions — these guarantee the helpers + keys ship in the
// committed file, so a sandboxing regression doesn't silently pass the suite.
// ---------------------------------------------------------------------------
console.log('\n=== i18n.js — static source checks ===================================\n');

assert(/function translateTimeFormatTopLevel\s*\(/.test(SRC),
    'i18n.js declares function translateTimeFormatTopLevel(format)');
assert(/function composeTournamentNameTopLevel\s*\(/.test(SRC),
    'i18n.js declares function composeTournamentNameTopLevel(...)');
assert(/window\.translateTimeFormat\s*=\s*translateTimeFormatTopLevel/.test(SRC),
    'translateTimeFormat is exposed on window');
assert(/window\.composeTournamentName\s*=\s*composeTournamentNameTopLevel/.test(SRC),
    'composeTournamentName is exposed on window');
assert(/translateTimeFormat:\s*translateTimeFormatTopLevel/.test(SRC)
    && /composeTournamentName:\s*composeTournamentNameTopLevel/.test(SRC),
    'window.i18n exports both helpers');

// Translation keys for the leading category word must exist in all 3 locales.
const TIME_FORMAT_KEYS = ['rapid', 'blitz', 'classical', 'bullet', 'armageddon'];
for (const k of TIME_FORMAT_KEYS) {
    // 3 language blocks; the regex may also match the helper comment so we
    // tolerate >= 3 and require <= 4 (1 comment reference at most).
    const occurrences = (SRC.match(new RegExp(`"tournaments\\.timeFormat\\.${k}"`, 'g')) || []).length;
    assert(occurrences >= 3 && occurrences <= 4,
        `tournaments.timeFormat.${k} key appears 3 times in language blocks (saw ${occurrences})`);
}

// Grey-strip labels on the public tournament card — must include the
// "Registration" / "Start" prefix in every locale.
assert(/"tournaments\.registration\.closesAt":\s*"Registration Closes \{\{datetime\}\}"/.test(SRC),
    'EN: tournaments.registration.closesAt prefixes "Registration Closes"');
assert(/"tournaments\.registration\.closesAt":\s*"Закрытие регистрации: \{\{datetime\}\}"/.test(SRC),
    'RU: tournaments.registration.closesAt reads "Закрытие регистрации"');
assert(/"tournaments\.registration\.closesAt":\s*"Тіркеу жабылады: \{\{datetime\}\}"/.test(SRC),
    'KK: tournaments.registration.closesAt reads "Тіркеу жабылады"');
assert(/"tournaments\.startAt":\s*"Start \{\{time\}\}"/.test(SRC),
    'EN: tournaments.startAt → "Start {{time}}"');
assert(/"tournaments\.startAt":\s*"Старт \{\{time\}\}"/.test(SRC),
    'RU: tournaments.startAt → "Старт {{time}}"');
assert(/"tournaments\.startAt":\s*"Басталу \{\{time\}\}"/.test(SRC),
    'KK: tournaments.startAt → "Басталу {{time}}"');

// ---------------------------------------------------------------------------
// Behavioural — translateTimeFormat
// ---------------------------------------------------------------------------
console.log('\n=== translateTimeFormat() behaviour ==================================\n');

const win = makeSandbox();
const i18n = win.i18n;

win.setLanguage('en');
assertEqual(win.translateTimeFormat('Rapid 10+5'), 'Rapid 10+5',
    'EN: "Rapid 10+5" passes through unchanged');
assertEqual(win.translateTimeFormat('Blitz 5+0'), 'Blitz 5+0',
    'EN: "Blitz 5+0" passes through unchanged');

win.setLanguage('ru');
assertEqual(win.translateTimeFormat('Rapid 10+5'), 'Рапид 10+5',
    'RU: "Rapid 10+5" → "Рапид 10+5"');
assertEqual(win.translateTimeFormat('Blitz 5+0'), 'Блиц 5+0',
    'RU: "Blitz 5+0" → "Блиц 5+0"');
assertEqual(win.translateTimeFormat('Classical'), 'Классика',
    'RU: bare "Classical" → "Классика" (no numeric suffix)');
assertEqual(win.translateTimeFormat('Bullet 1+0'), 'Пуля 1+0',
    'RU: "Bullet 1+0" → "Пуля 1+0"');
assertEqual(win.translateTimeFormat('Armageddon 5+0'), 'Армагеддон 5+0',
    'RU: "Armageddon 5+0" → "Армагеддон 5+0"');

win.setLanguage('kk');
assertEqual(win.translateTimeFormat('Rapid 10+5'), 'Рапид 10+5',
    'KK: "Rapid 10+5" → "Рапид 10+5"');
assertEqual(win.translateTimeFormat('Blitz 3+2'), 'Блиц 3+2',
    'KK: "Blitz 3+2" → "Блиц 3+2"');

// Fallback / edge cases.
win.setLanguage('ru');
assertEqual(win.translateTimeFormat('Custom freeform format'), 'Custom freeform format',
    'unknown format is returned verbatim (no regex match)');
assertEqual(win.translateTimeFormat(''), '',
    'empty input returns empty');
assertEqual(win.translateTimeFormat(null), null,
    'null input returns null');
assertEqual(win.translateTimeFormat(undefined), undefined,
    'undefined input returns undefined');
assertEqual(win.translateTimeFormat('rapid 10+5'), 'Рапид 10+5',
    'case-insensitive match: lowercase "rapid" still translates');

// ---------------------------------------------------------------------------
// Behavioural — composeTournamentName
// ---------------------------------------------------------------------------
console.log('\n=== composeTournamentName() behaviour ================================\n');

win.setLanguage('ru');
assertEqual(
    win.composeTournamentName({ league: 'C', name: 'League C — Gagarin Park' }, 'Gagarin Park'),
    'Лига C — Гагарин Парк',
    'RU: (league=C, branch=Gagarin Park) → "Лига C — Гагарин Парк"');
assertEqual(
    win.composeTournamentName({ league: 'A+', name: 'League A+' }, 'Halyk Arena'),
    'Лига A+ — Халык Арена',
    'RU: league A+ resolves to leagueAPlus key');

win.setLanguage('en');
assertEqual(
    win.composeTournamentName({ league: 'C', name: 'League C — Gagarin Park' }, 'Gagarin Park'),
    'League C — Gagarin Park',
    'EN: (league=C, branch=Gagarin Park) → "League C — Gagarin Park"');

win.setLanguage('kk');
assertEqual(
    win.composeTournamentName({ league: 'C', name: 'League C — Gagarin Park' }, 'Gagarin Park'),
    'Лига C — Гагарин паркі',
    'KK: branch name is translated to the Kazakh form');

// No branch → just the league label.
win.setLanguage('ru');
assertEqual(
    win.composeTournamentName({ league: 'B' }, ''),
    'Лига B',
    'RU: league without branchName returns only the league label');

// Unknown branch → branchName passes through (translateBranchName fallback).
assertEqual(
    win.composeTournamentName({ league: 'A', name: '' }, 'Unmapped Branch'),
    'Лига A — Unmapped Branch',
    'RU: unmapped branchName is appended verbatim');

// Fallback path: no league → use window.localizeTournamentName (legacy) or
// pass through the stored name. We install a stub so we can prove the
// fallback is reachable; the real shim lives in tournaments.js.
win.localizeTournamentName = name => `LEGACY[${name}]`;
assertEqual(
    win.composeTournamentName({ league: null, name: 'Custom Tournament' }, 'Halyk Arena'),
    'LEGACY[Custom Tournament]',
    'fallback: league=null defers to window.localizeTournamentName');

assertEqual(
    win.composeTournamentName({ league: '', name: 'Spring Cup' }, 'Halyk Arena'),
    'LEGACY[Spring Cup]',
    'fallback: empty-string league defers to window.localizeTournamentName');

// Defensive — invalid input must not crash.
delete win.localizeTournamentName;
assertEqual(
    win.composeTournamentName({ league: null, name: 'No legacy helper' }, ''),
    'No legacy helper',
    'fallback: no league + no legacy helper → returns raw name');
assertEqual(
    win.composeTournamentName({}, ''), '',
    'empty tournament + empty branch → empty string');
assertEqual(
    win.composeTournamentName(null, null), '',
    'null tournament → empty string (no crash)');

// ---------------------------------------------------------------------------
// tournaments.js wire-up — calls composer + translateTimeFormat
// ---------------------------------------------------------------------------
console.log('\n=== tournaments.js — wire-up checks ==================================\n');

const TJS = fs.readFileSync(path.join(ROOT, 'tournaments.js'), 'utf8');
assert(/composeTournamentTitle\(t, branchName\)/.test(TJS),
    'tournaments.js row uses composeTournamentTitle(t, branchName)');
assert(/localizeTimeFormat\(t\.time_format\)/.test(TJS),
    'tournaments.js renders time_format via localizeTimeFormat()');
assert(/window\.i18n\.composeTournamentName/.test(TJS),
    'tournaments.js delegates to window.i18n.composeTournamentName');
assert(/window\.i18n\.translateTimeFormat/.test(TJS),
    'tournaments.js delegates to window.i18n.translateTimeFormat');
assert(/window\.localizeTournamentName\s*=\s*localizeTournamentName/.test(TJS),
    'tournaments.js exposes localizeTournamentName as the composer fallback');
// The branchName must be threaded through tournamentRowHtml.
assert(/function tournamentRowHtml\(t, branchName\)/.test(TJS),
    'tournamentRowHtml accepts branchName parameter');
// Grey strip wraps the start time with the localized "Start" prefix key.
assert(/tt\('tournaments\.startAt',\s*\{\s*time:\s*timeLabel\s*\}\)/.test(TJS),
    'tournamentRowHtml renders timeLabel via tournaments.startAt');

// ---------------------------------------------------------------------------
// admin-v2.js wire-up
// ---------------------------------------------------------------------------
console.log('\n=== admin-v2.js — wire-up checks =====================================\n');

const ADM = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
assert(/window\.i18n\.composeTournamentName/.test(ADM),
    'admin-v2.js uses composeTournamentName in renderTournamentsAdminTable');
assert(/window\.i18n\.translateTimeFormat/.test(ADM),
    'admin-v2.js uses translateTimeFormat in renderTournamentsAdminTable');
assert(/_autoTournamentName\(/.test(ADM),
    'admin-v2.js defines _autoTournamentName helper for new-tournament auto-fill');
assert(/_wireTournamentAutoFillName\(/.test(ADM),
    'admin-v2.js wires the name auto-fill listener on modal open');
// Excel export filename stays English — must not be touched.
assert(/_sanitizeFilename\([\s\S]{0,200}t\.name[\s\S]{0,200}t\.tournament_date[\s\S]{0,80}\.xlsx/.test(ADM),
    'Excel export filename still uses raw English t.name (intentional)');

// ---------------------------------------------------------------------------
// admin-v2.html — league input is now a <select>, name is optional
// ---------------------------------------------------------------------------
console.log('\n=== admin-v2.html — form-control changes =============================\n');

const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
assert(/<select id="tournamentAdminLeague"[\s\S]{0,400}value="A\+"[\s\S]{0,400}value="C"/.test(HTML),
    'tournamentAdminLeague is a <select> with A+/A/B/C options');
assert(/<input type="text" id="tournamentAdminName" class="form-input">/.test(HTML),
    'tournamentAdminName input no longer has required attribute');
assert(/data-i18n="admin\.tournaments\.form\.nameOptional"/.test(HTML),
    'name label uses the new optional-name i18n key');

// ---------------------------------------------------------------------------
// student.js — league badge label localizes
// ---------------------------------------------------------------------------
console.log('\n=== student.js — wire-up checks ======================================\n');

const STU = fs.readFileSync(path.join(ROOT, 'student.js'), 'utf8');
assert(/window\.i18n\.composeTournamentName/.test(STU),
    'student.js uses composeTournamentName for the recent-tournaments row');
assert(/leagues\.leagueAPlus/.test(STU),
    'student.js maps A+ league letter to leagues.leagueAPlus key');
assert(/leagues\.league\$\{leagueLetter\}/.test(STU),
    'student.js maps A/B/C league letter to leagues.leagueX key');

// ---------------------------------------------------------------------------
// Migration 048 — public RPC includes `league` field
// ---------------------------------------------------------------------------
console.log('\n=== migrations/048_public_schedule_include_league.sql ================\n');

const MIG_PATH = path.join(ROOT, 'migrations/048_public_schedule_include_league.sql');
assert(fs.existsSync(MIG_PATH), 'migrations/048_public_schedule_include_league.sql exists');
const MIG = fs.readFileSync(MIG_PATH, 'utf8');
assert(/CREATE OR REPLACE FUNCTION public\.get_public_tournament_schedule/.test(MIG),
    'migration 048 redefines get_public_tournament_schedule (idempotent)');
assert(/'league',\s*tw\.league/.test(MIG),
    "migration 048 adds 'league', tw.league to the inner jsonb_build_object");
assert(/GRANT EXECUTE ON FUNCTION public\.get_public_tournament_schedule\(\) TO anon, authenticated/.test(MIG),
    'migration 048 re-grants execute to anon + authenticated');

const SB_MIG_PATH = path.join(ROOT, 'supabase/migrations/20260618000000_public_schedule_include_league.sql');
assert(fs.existsSync(SB_MIG_PATH),
    'matching supabase/migrations timestamp file ships alongside migrations/048');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Summary ==========================================================`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
