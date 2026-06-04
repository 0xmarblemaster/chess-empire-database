/**
 * Tests for the coach-page tournament cadence badge — Phase 4.
 * Run: node tests/test-coach-cadence-view.js
 *
 * Loads coach.js inside a Node-side stub of the browser globals it expects
 * (window, document, sessionStorage, lucide, the t() i18n helper) so the
 * pure-render helpers it exports — computeStudentCadence + renderCadenceBadge —
 * can be exercised against fixture data.
 */

// === minimal browser stubs ===============================================
const noop = () => {};
global.window = global;
global.document = {
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => null,
    body: { insertAdjacentHTML: noop, style: {} },
};
global.sessionStorage = { getItem: () => null, setItem: noop, removeItem: noop };
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
global.lucide = { createIcons: noop };
global.showToast = noop;

// i18n stub — only keys the cadence renderer needs.
const I18N = {
    'coach.cadence.active': 'Active',
    'coach.cadence.occasional': 'Occasional',
    'coach.cadence.inactive': 'Inactive',
};
global.t = (key) => I18N[key] || null;
global.i18n = { translateBranchName: (n) => n };

// Load the data layer first so coach.js can reach window.tournamentsData.
const tournamentsData = require('../supabase-data-tournaments.js');
global.tournamentsData = tournamentsData;

// Load coach.js — its top-level work is just attaching functions to `window`.
require('../coach.js');

const { computeStudentCadence, renderCadenceBadge, loadCoachStudentCadence } = global;

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

function daysAgo(refDate, days) {
    const d = new Date(refDate);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().split('T')[0];
}

// === smoke: functions wired up ===========================================
console.log('\n=== smoke ==============================================================\n');
assert(typeof computeStudentCadence === 'function', 'window.computeStudentCadence is a function');
assert(typeof renderCadenceBadge === 'function', 'window.renderCadenceBadge is a function');
assert(typeof loadCoachStudentCadence === 'function', 'window.loadCoachStudentCadence is a function');
assert(global.tournamentsData && global.tournamentsData._internal, 'tournamentsData data layer loaded');

// === computeStudentCadence — delegates to data-layer cutoffs =============
console.log('\n=== computeStudentCadence (4w / 8w cutoffs) =============================\n');
const today = new Date('2026-05-12T00:00:00Z');
assertEqual(computeStudentCadence(null, today), 'inactive', 'null lastDate → inactive');
assertEqual(computeStudentCadence(daysAgo(today, 7), today), 'active', '7 days ago → active');
assertEqual(computeStudentCadence(daysAgo(today, 28), today), 'active', '28 days ago (=4w) → active');
assertEqual(computeStudentCadence(daysAgo(today, 29), today), 'occasional', '29 days ago → occasional');
assertEqual(computeStudentCadence(daysAgo(today, 56), today), 'occasional', '56 days ago (=8w) → occasional');
assertEqual(computeStudentCadence(daysAgo(today, 57), today), 'inactive', '57 days ago (>8w) → inactive');
assertEqual(computeStudentCadence(daysAgo(today, 365), today), 'inactive', '365 days ago → inactive');

// === renderCadenceBadge — HTML output ====================================
console.log('\n=== renderCadenceBadge HTML output ======================================\n');
const activeStudent = { id: 'S1', status: 'active' };
const frozenStudent = { id: 'S2', status: 'frozen' };
const leftStudent = { id: 'S3', status: 'left' };

const recent = daysAgo(today, 5);
const oldish = daysAgo(today, 40);
const ancient = daysAgo(today, 120);

const activeBadge = renderCadenceBadge(activeStudent, recent, today);
assert(activeBadge.includes('coach-cadence-badge'), 'active badge has base class');
assert(activeBadge.includes('cadence-active'), 'active badge has cadence-active modifier');
assert(activeBadge.includes('Active'), 'active badge renders i18n label "Active"');
assert(activeBadge.includes('<span'), 'active badge is a <span>');
assert(activeBadge.includes('title="Active"'), 'active badge has title tooltip');

const occBadge = renderCadenceBadge(activeStudent, oldish, today);
assert(occBadge.includes('cadence-occasional'), 'occasional badge has cadence-occasional modifier');
assert(occBadge.includes('Occasional'), 'occasional badge renders "Occasional" label');
assert(!occBadge.includes('cadence-active'), 'occasional badge does NOT have cadence-active');

const inactBadge = renderCadenceBadge(activeStudent, ancient, today);
assert(inactBadge.includes('cadence-inactive'), 'inactive badge has cadence-inactive modifier');
assert(inactBadge.includes('Inactive'), 'inactive badge renders "Inactive" label');

const noPlayBadge = renderCadenceBadge(activeStudent, null, today);
assert(noPlayBadge.includes('cadence-inactive'), 'student with no plays → inactive badge');

// === only active students get a badge ====================================
console.log('\n=== status gate (only active students render a badge) ===================\n');
assertEqual(renderCadenceBadge(frozenStudent, recent, today), '', 'frozen student → empty string');
assertEqual(renderCadenceBadge(leftStudent, recent, today), '', 'left student → empty string');
assertEqual(renderCadenceBadge(null, recent, today), '', 'null student → empty string');
assertEqual(renderCadenceBadge({ id: 'X', status: null }, recent, today), '', 'missing status → empty string');

// === fallback when i18n lookup misses ====================================
console.log('\n=== i18n fallback ======================================================\n');
const origT = global.t;
global.t = () => null;            // simulate missing translations
const fallback = renderCadenceBadge(activeStudent, recent, today);
assert(fallback.includes('Active'), 'falls back to capitalized cadence name when i18n key missing');
global.t = origT;

// === loadCoachStudentCadence — picks newest tournament_date per student ==
console.log('\n=== loadCoachStudentCadence groups newest date per student ==============\n');
{
    const students = [
        { id: 'S1', status: 'active' },
        { id: 'S2', status: 'active' },
        { id: 'S3', status: 'frozen' },   // should be skipped — only active students are queried
    ];
    const rows = [
        { student_id: 'S1', upload: { tournament_date: '2026-04-12' } },
        { student_id: 'S1', upload: { tournament_date: '2026-05-03' } },  // newer — should win
        { student_id: 'S2', upload: { tournament_date: '2026-03-01' } },
        { student_id: 'S2', upload: { tournament_date: null } },          // skip null dates
    ];
    let captured = null;
    global.window.supabaseClient = {
        from(table) {
            const state = { ids: null };
            const api = {
                select() { return api; },
                in(_c, vals) { state.ids = vals; return api; },
                then(resolve, reject) {
                    captured = { table, ids: state.ids };
                    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                },
            };
            return api;
        },
    };

    return loadCoachStudentCadence(students).then(map => {
        assertEqual(captured.table, 'tournament_results', 'queries tournament_results table');
        assertEqual(captured.ids.sort(), ['S1', 'S2'], 'only active student ids queried (S3 skipped)');
        assertEqual(map.get('S1'), '2026-05-03', 'S1 → newest date wins (2026-05-03)');
        assertEqual(map.get('S2'), '2026-03-01', 'S2 → 2026-03-01');
        assert(!map.has('S3'), 'frozen student S3 not in result map');

        // No active students → empty map, no query.
        global.window.supabaseClient = null;
        return loadCoachStudentCadence([]).then(empty => {
            assertEqual(empty.size, 0, 'empty students → empty map');

            // Supabase client missing → safe empty map.
            return loadCoachStudentCadence(students).then(noClient => {
                assertEqual(noClient.size, 0, 'no client → empty map (no crash)');

                console.log(`\n${'='.repeat(64)}`);
                console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
                console.log(`${'='.repeat(64)}\n`);
                process.exit(failed > 0 ? 1 : 0);
            });
        });
    });
}
