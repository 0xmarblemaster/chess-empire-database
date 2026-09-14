/**
 * Tests for the Titled Tournament ("Турнир Разрядников", league code 'R') feature.
 * Spec: tasks/titled-tournament-spec.md, PRD_RAZRYAD_TOURNAMENTS.md
 *
 * Eligibility is read straight from students.razryad: ANY student with
 * razryad != 'none' may self-register for an 'R' tournament. There is no
 * confirmation step — manually-entered razryads count the same as
 * system-detected ones. Guests need an admin (p_force); admin force always wins.
 *
 * Layered like the other source-contract tests in this repo:
 *   1. Source-contract regex checks across migration 084 + the touched
 *      JS/TS/HTML files (catch accidental drift of the load-bearing lines).
 *   2. A pure-logic port of the register_for_tournament 'R'-gate decision,
 *      exercised against the eligibility cases the spec enumerates plus an
 *      A/B/C regression guard.
 *
 * Run: node tests/test-titled-tournaments.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Forbidden legacy tokens, assembled at runtime so the literal strings never
// appear in any tracked source file (the repo-wide grep in FIX_RAZRYAD_GATE.md
// must return ZERO hits). We only ever assert on their ABSENCE.
const LEGACY_COL    = ['razryad', 'confirmed'].join('_');   // snake_case column
const LEGACY_CAMEL  = 'razryad' + 'Confirmed';              // camelCase field
const LEGACY_REASON = ['no', 'confirmed', 'razryad'].join('_');
const LEGACY_TOGGLE = 'toggle' + LEGACY_CAMEL.charAt(0).toUpperCase() + LEGACY_CAMEL.slice(1);
const LEGACY_KEY    = 'admin.modals.add.' + LEGACY_CAMEL;

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 1. migration 084 — source contract
// ============================================================================
console.log('\n=== migration 084_titled_tournaments.sql ============================\n');

const MIG_PATH = path.join(ROOT, 'supabase/migrations/084_titled_tournaments.sql');
assert(fs.existsSync(MIG_PATH), 'supabase/migrations/084_titled_tournaments.sql exists');
const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');
assert(!new RegExp(LEGACY_COL).test(MIG),
    'migration no longer references the legacy confirmed column');
assert(/DROP CONSTRAINT IF EXISTS tournaments_league_check/.test(MIG),
    'idempotently rebuilds the league CHECK constraint');
assert(/CHECK \(league IS NULL OR league IN \('A\+', 'A', 'B', 'C', 'R'\)\)/.test(MIG),
    "league CHECK now allows 'R' (and keeps A+/A/B/C)");
assert(/p_force boolean DEFAULT FALSE/.test(MIG),
    'register_for_tournament gains a trailing p_force boolean (default FALSE)');
assert(/'reason', 'no_razryad'/.test(MIG),
    "student self-registration into 'R' without a razryad returns reason 'no_razryad'");
assert(/'reason', 'guests_admin_only'/.test(MIG),
    "guest self-registration into 'R' (no force) returns reason 'guests_admin_only'");
// The 'R' razryad gate must be bypassable by p_force.
assert(/IF v_tournament_league = 'R' THEN[\s\S]*?IF NOT p_force THEN[\s\S]*?no_razryad/.test(MIG),
    "the 'R' razryad gate is skipped when p_force is true (admin override)");
// The guest 'R' block must be bypassable by p_force.
assert(/v_tournament_league = 'R' AND NOT p_force[\s\S]*?guests_admin_only/.test(MIG),
    "the guest 'R' block only fires when NOT p_force");
// A/B/C rating gate + League-C level gate must still be present unchanged.
assert(/calc_league_from_rating\(COALESCE\(v_student_rating, 0\)\)/.test(MIG),
    'A/B/C rating gate preserved (calc_league_from_rating on student rating)');
assert(/'reason', 'level_too_low'/.test(MIG),
    'League C level gate (migration 066) preserved');
// Grants: 12-arg signature, anon/PUBLIC revoked.
assert(/DROP FUNCTION IF EXISTS register_for_tournament\(\s*UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT\s*\)/.test(MIG),
    'drops the old 11-arg overload');
assert(/REVOKE EXECUTE ON FUNCTION register_for_tournament\([\s\S]*?BOOLEAN\s*\) FROM anon, PUBLIC/.test(MIG),
    'revokes anon + PUBLIC on the new 12-arg signature');
assert(/GRANT EXECUTE ON FUNCTION register_for_tournament\([\s\S]*?BOOLEAN\s*\) TO authenticated, service_role/.test(MIG),
    'grants authenticated + service_role on the new 12-arg signature');

// ============================================================================
// 2. i18n.js — keys in all three locales (en / kk / ru)
// ============================================================================
console.log('\n=== i18n keys (en/kk/ru) ============================================\n');

const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
function countKey(key) {
    const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '":', 'g');
    return (I18N.match(re) || []).length;
}
[
    'leagues.leagueR',
    'tournaments.noRazryad',
    'tournaments.guestsAdminOnly',
    'tournaments.titledOnlyNote',
    'admin.tournaments.form.leagueR',
    'admin.tournaments.noRazryad',
    'admin.tournaments.guestsAdminOnly',
].forEach(k => assert(countKey(k) === 3, `i18n key "${k}" present in all 3 locales`));
assert(countKey(LEGACY_KEY) === 0,
    'confirmed-checkbox label key removed from i18n');
assert(!new RegExp(LEGACY_COL + '|' + LEGACY_CAMEL).test(I18N),
    'i18n has no legacy confirmed references');
assert(/"leagues\.leagueR": "Турнир Разрядников"/.test(I18N),
    'RU leagues.leagueR is «Турнир Разрядников»');
assert(/"tournaments\.noRazryad": "Регистрация доступна только ученикам с разрядом\./.test(I18N),
    'RU rejection message matches the spec wording (no "confirmed")');
assert(!/подтверждённым разрядом/.test(I18N),
    'RU rejection/note dropped the word «подтверждённым»');
assert(/'R': 'leagues\.leagueR'/.test(I18N),
    "i18n composer map includes 'R' -> leagues.leagueR");

// ============================================================================
// 3. admin-v2.html — league option, no confirmed checkbox
// ============================================================================
console.log('\n=== admin-v2.html ===================================================\n');

const AHTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
assert(/<option value="R" data-i18n="admin\.tournaments\.form\.leagueR">/.test(AHTML),
    'league dropdown has the Titled (R) option');
assert(!new RegExp(LEGACY_CAMEL + '|' + LEGACY_TOGGLE).test(AHTML),
    'no razryad-confirmed checkbox remains in the student modals');

// ============================================================================
// 4. admin-v2.js — form wiring, admin bypass, reason toasts
// ============================================================================
console.log('\n=== admin-v2.js =====================================================\n');

const AJS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
assert(!new RegExp(LEGACY_CAMEL + '|' + LEGACY_TOGGLE).test(AJS),
    'no legacy confirmed wiring remains in admin-v2.js');
assert(/p_force:            true/.test(AJS),
    'admin guest registration passes p_force: true (bypass path)');
assert(/reason === 'no_razryad'[\s\S]*?admin\.tournaments\.noRazryad/.test(AJS),
    'guest RPC reason handler maps no_razryad to a toast');
assert(/reason === 'guests_admin_only'[\s\S]*?admin\.tournaments\.guestsAdminOnly/.test(AJS),
    'guest RPC reason handler maps guests_admin_only to a toast');

// ============================================================================
// 5. supabase-data.js — no legacy confirmed persistence
// ============================================================================
console.log('\n=== supabase-data.js ================================================\n');

const SDATA = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
assert(!new RegExp(LEGACY_COL + '|' + LEGACY_CAMEL).test(SDATA),
    'supabase-data.js no longer reads/writes the legacy confirmed field');

// ============================================================================
// 6. edge function — reason mapping to HTTP 409
// ============================================================================
console.log('\n=== tournaments-api edge function ===================================\n');

const TAPI = fs.readFileSync(path.join(ROOT, 'supabase/functions/tournaments-api/index.ts'), 'utf8');
assert(!new RegExp(LEGACY_REASON).test(TAPI),
    'edge function no longer references the legacy reason');
assert(/'no_razryad', 'guests_admin_only'/.test(TAPI),
    'Reason union includes no_razryad + guests_admin_only');
assert(/reason === 'no_razryad' \? 409/.test(TAPI),
    'no_razryad maps to HTTP 409');
assert(/reason === 'guests_admin_only'    \? 409/.test(TAPI),
    'guests_admin_only maps to HTTP 409');

// ============================================================================
// 7. public tournaments page — the localized R note
// ============================================================================
console.log('\n=== tournaments.js public page ======================================\n');

const TJS = fs.readFileSync(path.join(ROOT, 'tournaments.js'), 'utf8');
assert(/t\.league === 'R' \? `<p class="titled-note">\$\{escapeHtml\(tt\('tournaments\.titledOnlyNote'\)\)\}<\/p>` : ''/.test(TJS),
    "renders the localized razryad note only for league 'R' tournaments");
assert(/'League R': 'leagues\.leagueR'/.test(TJS),
    "tournaments.js league-label map includes 'League R'");

// ============================================================================
// 8. pure-logic port — the register_for_tournament 'R' gate decision
// ============================================================================
console.log('\n=== pure logic: R-gate decision =====================================\n');

// Faithful JS mirror of the eligibility branch in migration 084's RPC. Only the
// gate decision is modeled (structural checks like capacity/deadline are out of
// scope here); returns { ok, reason }. Eligibility for 'R' reads student.razryad
// alone — any value other than null/'none' passes.
function decide({ league, isGuest, force, student, guestRating }) {
    if (isGuest) {
        if (league === 'R' && !force) return { ok: false, reason: 'guests_admin_only' };
        // 'R' is not rating-derived → skip the rating gate for it.
        if (guestRating != null && league != null && league !== 'R') {
            const req = calcLeague(guestRating);
            if (req !== league) return { ok: false, reason: 'ineligible' };
        }
        return { ok: true, reason: null };
    }
    // student path
    if (league === 'R') {
        if (!force) {
            const r = student.razryad;
            if (r == null || r === 'none') {
                return { ok: false, reason: 'no_razryad' };
            }
        }
        return { ok: true, reason: null };
    }
    if (league != null) {
        const req = calcLeague(student.rating || 0);
        if (req !== league) return { ok: false, reason: 'ineligible' };
        if (league === 'C' && student.level != null && student.level < 2) {
            return { ok: false, reason: 'level_too_low' };
        }
    }
    return { ok: true, reason: null };
}
// Mirror of calc_league_from_rating (migration 049): C < 450 <= B <= 800 < A.
function calcLeague(rating) {
    if (rating < 450) return 'C';
    if (rating <= 800) return 'B';
    return 'A';
}

// -- the eligibility cases --------------------------------------------------
assertEqual(
    decide({ league: 'R', isGuest: false, force: false,
             student: { razryad: '3rd' } }),
    { ok: true, reason: null },
    'a student holding a razryad may self-register for R');

assertEqual(
    decide({ league: 'R', isGuest: false, force: false,
             student: { razryad: 'KMS' } }),
    { ok: true, reason: null },
    'a manually-entered razryad counts the same (KMS eligible)');

assertEqual(
    decide({ league: 'R', isGuest: false, force: false,
             student: { razryad: 'none' } }),
    { ok: false, reason: 'no_razryad' },
    "razryad 'none' is rejected (no_razryad)");

assertEqual(
    decide({ league: 'R', isGuest: false, force: false,
             student: {} }),
    { ok: false, reason: 'no_razryad' },
    'a missing razryad is rejected (no_razryad)');

assertEqual(
    decide({ league: 'R', isGuest: true, force: false, guestRating: null }),
    { ok: false, reason: 'guests_admin_only' },
    'guest self-registration into R is rejected (guests_admin_only)');

assertEqual(
    decide({ league: 'R', isGuest: false, force: true,
             student: { razryad: 'none' } }),
    { ok: true, reason: null },
    'admin force-register of a non-razryad student into R is allowed');

assertEqual(
    decide({ league: 'R', isGuest: true, force: true, guestRating: null }),
    { ok: true, reason: null },
    'admin adds a guest to R (force) is allowed');

// -- A/B/C regression guard -------------------------------------------------
assertEqual(
    decide({ league: 'C', isGuest: false, force: false,
             student: { rating: 300, level: 2, razryad: 'none' } }),
    { ok: true, reason: null },
    'regression: a League-C-eligible student is unaffected by the R gate');

assertEqual(
    decide({ league: 'B', isGuest: false, force: false,
             student: { rating: 300, level: 5, razryad: '1st' } }),
    { ok: false, reason: 'ineligible' },
    'regression: B rating gate still rejects a C-rated student');

assertEqual(
    // force does NOT loosen the A/B/C rating gate (admin guest add keeps its
    // door check for non-R leagues).
    decide({ league: 'B', isGuest: true, force: true, guestRating: 300 }),
    { ok: false, reason: 'ineligible' },
    'regression: A/B/C guest rating gate is unchanged even under force');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
