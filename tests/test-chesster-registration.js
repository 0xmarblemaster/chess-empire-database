/**
 * Tests for the Chesster app registration status feature.
 *
 * Layered like the other source-contract tests in this repo:
 *   1. Source-contract regex checks across the migration + touched JS/CSS files
 *      (catch accidental drift of the load-bearing lines).
 *   2. i18n key presence across all three dictionaries.
 *   3. Real pure-logic unit tests of the sync script's exported diff function
 *      (imported from the .mjs) — registered / newly_marked / cleared /
 *      unchanged, plus a pure-logic port of the render helper's three states
 *      (registered / unregistered / missing column).
 *
 * Run: node tests/test-chesster-registration.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

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

async function main() {
    // ========================================================================
    // 1. migration 088 — source contract
    // ========================================================================
    console.log('\n=== migration 088_chesster_registration.sql ==========================\n');

    const MIG_PATH = path.join(ROOT, 'supabase/migrations/088_chesster_registration.sql');
    assert(fs.existsSync(MIG_PATH), 'supabase/migrations/088_chesster_registration.sql exists');
    const MIG = fs.existsSync(MIG_PATH) ? fs.readFileSync(MIG_PATH, 'utf8') : '';

    assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG), 'wrapped in BEGIN;…COMMIT;');
    assert(/ALTER TABLE students\s*\n?\s*ADD COLUMN IF NOT EXISTS chesster_registered_at TIMESTAMPTZ NULL/.test(MIG),
        'adds students.chesster_registered_at TIMESTAMPTZ NULL (idempotent)');
    assert(/COMMENT ON COLUMN students\.chesster_registered_at/.test(MIG),
        'comments the new column');
    assert(/sync-chesster-registration\.mjs/.test(MIG),
        'comment references the sync script');

    // ========================================================================
    // 2. supabase-data.js — chesterRegisteredAt passthrough
    // ========================================================================
    console.log('\n=== supabase-data.js source contract =================================\n');

    const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
    assert(/chessterRegisteredAt: data\.chesster_registered_at \|\| null/.test(DATA_SRC),
        'getStudentById maps chessterRegisteredAt (undefined column -> null)');

    // ========================================================================
    // 3. student.js — render helper + insertion order
    // ========================================================================
    console.log('\n=== student.js source contract =======================================\n');

    const STUDENT_SRC = fs.readFileSync(path.join(ROOT, 'student.js'), 'utf8');

    assert(/function renderChessterStatusBox\(student\)/.test(STUDENT_SRC),
        'renderChessterStatusBox(student) helper is defined');
    assert(/const isRegistered = !!\(student && student\.chessterRegisteredAt\)/.test(STUDENT_SRC),
        'registration is derived from student.chessterRegisteredAt (missing -> false)');
    assert(/chesster-status--registered/.test(STUDENT_SRC) && /chesster-status--unregistered/.test(STUDENT_SRC),
        'helper emits both registered/unregistered state classes');
    assert(/mobile-order-0/.test(STUDENT_SRC),
        'panel carries mobile-order-0 so it sorts first on mobile');
    assert(/t\('chesster\.appStatus'\)/.test(STUDENT_SRC)
        && /t\('chesster\.registered'\)/.test(STUDENT_SRC)
        && /t\('chesster\.notRegistered'\)/.test(STUDENT_SRC),
        'helper uses the chesster.* i18n keys');

    // The panel must be inserted ABOVE the branch rank panel in renderProfile.
    const chessterIdx = STUDENT_SRC.indexOf('${renderChessterStatusBox(student)}');
    const branchRankIdx = STUDENT_SRC.indexOf('${renderLevelRankInfoBoxes(rankings).branchRankHTML}');
    assert(chessterIdx > -1 && branchRankIdx > -1 && chessterIdx < branchRankIdx,
        'renderChessterStatusBox is rendered before the branch rank panel in the overview grid');

    // ========================================================================
    // 4. student-styles.css — tint + mobile order
    // ========================================================================
    console.log('\n=== student-styles.css source contract ===============================\n');

    const CSS = fs.readFileSync(path.join(ROOT, 'student-styles.css'), 'utf8');
    assert(/\.chesster-status-item\.chesster-status--registered\s*\{[\s\S]*?#10b981/.test(CSS),
        'registered panel uses the green accent (#10b981)');
    assert(/\.chesster-status-item\.chesster-status--unregistered\s*\{[\s\S]*?#ef4444/.test(CSS),
        'unregistered panel uses the red accent (#ef4444)');
    assert(/\.overview-mobile-grid \.mobile-order-0 \{ order: 0; \}/.test(CSS),
        'mobile-order-0 rule exists (mirrors mobile-order-1..9)');

    // ========================================================================
    // 5. i18n.js — keys present in all three dictionaries
    // ========================================================================
    console.log('\n=== i18n keys in en / kk / ru ========================================\n');

    const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
    for (const key of ['chesster.appStatus', 'chesster.registered', 'chesster.notRegistered']) {
        const count = (I18N.match(new RegExp(`"${key.replace('.', '\\.')}":`, 'g')) || []).length;
        assert(count >= 3, `${key} defined in all three languages (found ${count})`);
    }
    // Spot-check the Russian labels required by the brief.
    assert(/"chesster\.registered": "Зарегистрирован"/.test(I18N),
        'RU registered label is «Зарегистрирован»');
    assert(/"chesster\.notRegistered": "Не зарегистрирован"/.test(I18N),
        'RU unregistered label is «Не зарегистрирован»');

    // ========================================================================
    // 6. sync script — real exported diff logic
    // ========================================================================
    console.log('\n=== sync-chesster-registration.mjs pure logic ========================\n');

    const scriptUrl = pathToFileURL(path.join(ROOT, 'scripts/sync-chesster-registration.mjs')).href;
    const { computeChessterRegistrationDiff, sameInstant } = await import(scriptUrl);

    assert(typeof computeChessterRegistrationDiff === 'function',
        'computeChessterRegistrationDiff is exported');
    assert(typeof sameInstant === 'function', 'sameInstant is exported');

    const NOW = '2026-09-17T00:00:00.000Z';
    const T1 = '2026-01-01T10:00:00.000Z';

    // newly_marked: registered student with NULL stamp.
    // unchanged (already correct): registered student whose stamp already matches.
    // cleared: unregistered student that still carries a stamp.
    // unchanged (never registered): no stamp, not in the set.
    const members = [
        { external_student_id: 's-new', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', role: 'student' },
        { external_student_id: 's-same', link_verified_at: T1, external_source: 'online', link_status: 'verified', role: 'student' }
    ];
    const students = [
        { id: 's-new', chesster_registered_at: null },
        { id: 's-same', chesster_registered_at: T1 },
        { id: 's-revoked', chesster_registered_at: T1 },
        { id: 's-never', chesster_registered_at: null }
    ];

    const diff = computeChessterRegistrationDiff({ members, students, now: NOW });

    assertEqual(diff.toSet, [{ id: 's-new', value: T1 }],
        'newly_marked: NULL-stamp registered student is set to link_verified_at');
    assertEqual(diff.toClear, ['s-revoked'],
        'cleared: unregistered student with a lingering stamp is cleared');
    assertEqual(
        { registered: diff.registered, newlyMarked: diff.newlyMarked, cleared: diff.cleared, unchanged: diff.unchanged, total: diff.total },
        { registered: 2, newlyMarked: 1, cleared: 1, unchanged: 2, total: 4 },
        'summary counts (registered/newly_marked/cleared/unchanged/total) are correct');
    assertEqual(diff.roles, ['student'], 'distinct roles are surfaced for operator visibility');

    // Fallback: registered with a NULL verified_at and no existing stamp -> now().
    const diffFallback = computeChessterRegistrationDiff({
        members: [{ external_student_id: 's-x', link_verified_at: null, external_source: 'chess_empire', link_status: 'verified' }],
        students: [{ id: 's-x', chesster_registered_at: null }],
        now: NOW
    });
    assertEqual(diffFallback.toSet, [{ id: 's-x', value: NOW }],
        'fallback: NULL link_verified_at with no stamp falls back to now()');

    // A verified link with NULL verified_at but an existing stamp keeps the stamp.
    const diffKeep = computeChessterRegistrationDiff({
        members: [{ external_student_id: 's-y', link_verified_at: null, external_source: 'chess_empire', link_status: 'verified' }],
        students: [{ id: 's-y', chesster_registered_at: T1 }],
        now: NOW
    });
    assertEqual(diffKeep.toSet, [], 'existing stamp is preserved when link_verified_at is NULL (no churn)');
    assertEqual(diffKeep.unchanged, 1, 'the preserved-stamp row counts as unchanged');

    // sameInstant tolerates formatting differences.
    assert(sameInstant('2026-01-01T10:00:00Z', '2026-01-01T10:00:00.000Z'),
        'sameInstant treats equal instants with different precision as equal');
    assert(sameInstant(null, null), 'sameInstant(null, null) is true');
    assert(!sameInstant(null, T1), 'sameInstant(null, ts) is false');

    // ========================================================================
    // 7. render helper — pure-logic port of the three states
    // ========================================================================
    console.log('\n=== render helper states (pure-logic port) ===========================\n');

    // Mirror of renderChessterStatusBox: only the state class + value text matter.
    function renderPort(student, tr) {
        const isRegistered = !!(student && student.chessterRegisteredAt);
        return {
            stateClass: isRegistered ? 'chesster-status--registered' : 'chesster-status--unregistered',
            value: isRegistered ? tr('chesster.registered') : tr('chesster.notRegistered')
        };
    }
    const tr = (k) => ({ 'chesster.registered': 'Зарегистрирован', 'chesster.notRegistered': 'Не зарегистрирован' }[k]);

    assertEqual(renderPort({ chessterRegisteredAt: T1 }, tr),
        { stateClass: 'chesster-status--registered', value: 'Зарегистрирован' },
        'registered student -> green registered panel');
    assertEqual(renderPort({ chessterRegisteredAt: null }, tr),
        { stateClass: 'chesster-status--unregistered', value: 'Не зарегистрирован' },
        'unregistered student -> red unregistered panel');
    assertEqual(renderPort({}, tr),
        { stateClass: 'chesster-status--unregistered', value: 'Не зарегистрирован' },
        'missing column (undefined) -> treated as unregistered, no error');

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
