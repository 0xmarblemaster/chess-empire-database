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
    // 1b. migration 089 — email column
    // ========================================================================
    console.log('\n=== migration 089_chesster_email.sql =================================\n');

    const MIG89_PATH = path.join(ROOT, 'supabase/migrations/089_chesster_email.sql');
    assert(fs.existsSync(MIG89_PATH), 'supabase/migrations/089_chesster_email.sql exists');
    const MIG89 = fs.existsSync(MIG89_PATH) ? fs.readFileSync(MIG89_PATH, 'utf8') : '';

    assert(/BEGIN;[\s\S]+COMMIT;/.test(MIG89), 'wrapped in BEGIN;…COMMIT;');
    assert(/ALTER TABLE students\s*\n?\s*ADD COLUMN IF NOT EXISTS chesster_email TEXT NULL/.test(MIG89),
        'adds students.chesster_email TEXT NULL (idempotent)');
    assert(/COMMENT ON COLUMN students\.chesster_email/.test(MIG89),
        'comments the new email column');
    assert(/sync-chesster-registration\.mjs/.test(MIG89),
        'comment references the sync script');

    // ========================================================================
    // 2. supabase-data.js — chesterRegisteredAt passthrough
    // ========================================================================
    console.log('\n=== supabase-data.js source contract =================================\n');

    const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
    assert(/chessterRegisteredAt: data\.chesster_registered_at \|\| null/.test(DATA_SRC),
        'getStudentById maps chessterRegisteredAt (undefined column -> null)');
    assert(/chessterEmail: data\.chesster_email \|\| null/.test(DATA_SRC),
        'getStudentById maps chessterEmail (undefined column -> null)');

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
    assert(/chesster-status-banner/.test(STUDENT_SRC),
        'helper renders a full-width chesster-status-banner (not a grid cell)');
    assert(/escapeHtmlSafe\(email\)/.test(STUDENT_SRC),
        'synced email is HTML-escaped with escapeHtmlSafe');
    assert(/student\.chessterEmail/.test(STUDENT_SRC),
        'email line reads from student.chessterEmail');
    assert(/mobile-order-0/.test(STUDENT_SRC),
        'banner carries mobile-order-0 so it sorts first on mobile');
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
    assert(/\.chesster-status-banner\.chesster-status--registered\s*\{[\s\S]*?#10b981/.test(CSS),
        'registered banner uses the green accent (#10b981)');
    assert(/\.chesster-status-banner\.chesster-status--unregistered\s*\{[\s\S]*?#ef4444/.test(CSS),
        'unregistered banner uses the red accent (#ef4444)');
    assert(/\.overview-mobile-grid \.chesster-status-banner\s*\{[\s\S]*?grid-column: 1 \/ -1/.test(CSS),
        'banner spans the full overview grid width (grid-column: 1 / -1)');
    assert(!/\.chesster-status-item\b/.test(CSS),
        'dead grid-cell rules (.chesster-status-item) are removed');
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
    const { computeChessterRegistrationDiff, sameInstant, resolveMemberEmails, pickClerkEmail } = await import(scriptUrl);

    assert(typeof computeChessterRegistrationDiff === 'function',
        'computeChessterRegistrationDiff is exported');
    assert(typeof sameInstant === 'function', 'sameInstant is exported');

    const NOW = '2026-09-17T00:00:00.000Z';
    const T1 = '2026-01-01T10:00:00.000Z';

    // newly_marked: registered student with NULL stamp (+ email carried).
    // unchanged (already correct): registered student whose stamp already matches.
    // cleared: unregistered student that still carries a stamp.
    // unchanged (never registered): no stamp, not in the set.
    const members = [
        { external_student_id: 's-new', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', role: 'student', email: 'new@chesster.io' },
        { external_student_id: 's-same', link_verified_at: T1, external_source: 'online', link_status: 'verified', role: 'student', email: 'same@chesster.io' }
    ];
    const students = [
        { id: 's-new', chesster_registered_at: null, chesster_email: null },
        { id: 's-same', chesster_registered_at: T1, chesster_email: 'same@chesster.io' },
        { id: 's-revoked', chesster_registered_at: T1, chesster_email: 'gone@chesster.io' },
        { id: 's-never', chesster_registered_at: null, chesster_email: null }
    ];

    const diff = computeChessterRegistrationDiff({ members, students, now: NOW });

    assertEqual(diff.toSet, [{ id: 's-new', value: T1, email: 'new@chesster.io' }],
        'newly_marked: NULL-stamp registered student is set to link_verified_at + email');
    assertEqual(diff.toClear, ['s-revoked'],
        'cleared: unregistered student with a lingering stamp/email is cleared');
    assertEqual(
        { registered: diff.registered, newlyMarked: diff.newlyMarked, cleared: diff.cleared, unchanged: diff.unchanged, total: diff.total },
        { registered: 2, newlyMarked: 1, cleared: 1, unchanged: 2, total: 4 },
        'summary counts (registered/newly_marked/cleared/unchanged/total) are correct');
    assertEqual(diff.roles, ['student'], 'distinct roles are surfaced for operator visibility');

    // --- email-specific behavior (migration 089) -----------------------------

    // Email set on a newly registered student is carried through toSet.
    assertEqual(diff.toSet[0].email, 'new@chesster.io',
        'email set: newly registered student carries the membership email');

    // Email updated in Chesster while the timestamp is unchanged -> still a write.
    const diffEmailUpdate = computeChessterRegistrationDiff({
        members: [{ external_student_id: 's-e', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: 'fresh@chesster.io' }],
        students: [{ id: 's-e', chesster_registered_at: T1, chesster_email: 'stale@chesster.io' }],
        now: NOW
    });
    assertEqual(diffEmailUpdate.toSet, [{ id: 's-e', value: T1, email: 'fresh@chesster.io' }],
        'email updated: same timestamp but changed email still produces a write');
    assertEqual(diffEmailUpdate.emailChanged, 1, 'email_changed counter tracks email-only writes');

    // Email cleared when registration is revoked (student drops out of members).
    const diffEmailClear = computeChessterRegistrationDiff({
        members: [],
        students: [{ id: 's-r', chesster_registered_at: T1, chesster_email: 'bye@chesster.io' }],
        now: NOW
    });
    assertEqual(diffEmailClear.toClear, ['s-r'],
        'email cleared: revoked student is cleared (both columns set to NULL)');

    // Duplicate memberships: email follows the row whose verified_at wins.
    const T2 = '2026-05-05T12:00:00.000Z';
    const diffDup = computeChessterRegistrationDiff({
        members: [
            { external_student_id: 's-d', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: 'old@chesster.io' },
            { external_student_id: 's-d', link_verified_at: T2, external_source: 'online', link_status: 'verified', email: 'winner@chesster.io' }
        ],
        students: [{ id: 's-d', chesster_registered_at: null, chesster_email: null }],
        now: NOW
    });
    assertEqual(diffDup.toSet, [{ id: 's-d', value: T2, email: 'winner@chesster.io' }],
        'duplicates: timestamp AND email follow the latest verified_at membership');

    // Fallback: registered with a NULL verified_at and no existing stamp -> now().
    const diffFallback = computeChessterRegistrationDiff({
        members: [{ external_student_id: 's-x', link_verified_at: null, external_source: 'chess_empire', link_status: 'verified', email: 'x@chesster.io' }],
        students: [{ id: 's-x', chesster_registered_at: null, chesster_email: null }],
        now: NOW
    });
    assertEqual(diffFallback.toSet, [{ id: 's-x', value: NOW, email: 'x@chesster.io' }],
        'fallback: NULL link_verified_at with no stamp falls back to now()');

    // A verified link with NULL verified_at but an existing stamp+email keeps them.
    const diffKeep = computeChessterRegistrationDiff({
        members: [{ external_student_id: 's-y', link_verified_at: null, external_source: 'chess_empire', link_status: 'verified', email: 'y@chesster.io' }],
        students: [{ id: 's-y', chesster_registered_at: T1, chesster_email: 'y@chesster.io' }],
        now: NOW
    });
    assertEqual(diffKeep.toSet, [], 'existing stamp+email preserved when link_verified_at is NULL (no churn)');
    assertEqual(diffKeep.unchanged, 1, 'the preserved-stamp row counts as unchanged');

    // sameInstant tolerates formatting differences.
    assert(sameInstant('2026-01-01T10:00:00Z', '2026-01-01T10:00:00.000Z'),
        'sameInstant treats equal instants with different precision as equal');
    assert(sameInstant(null, null), 'sameInstant(null, null) is true');
    assert(!sameInstant(null, T1), 'sameInstant(null, ts) is false');

    // ========================================================================
    // 6b. Clerk email fallback — resolveMemberEmails (injectable resolver)
    // ========================================================================
    console.log('\n=== Clerk email fallback (resolveMemberEmails) =======================\n');

    assert(typeof resolveMemberEmails === 'function', 'resolveMemberEmails is exported');
    assert(typeof pickClerkEmail === 'function', 'pickClerkEmail is exported');

    // membership without email + resolver returns email -> email is written.
    {
        let calls = 0;
        const res = await resolveMemberEmails({
            members: [{ external_student_id: 's-1', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: null, user_id: 'usr_a' }],
            resolveEmail: async (uid) => { calls++; return uid === 'usr_a' ? 'a@clerk.io' : null; }
        });
        assertEqual(res.members[0].email, 'a@clerk.io', 'no-email membership gets the resolver email');
        assertEqual({ from: res.emailFromClerk, failed: res.emailLookupFailed, missing: res.missingEmail }, { from: 1, failed: 0, missing: 1 },
            'resolved membership counts as email_from_clerk (missing=1, failed=0)');
        assertEqual(calls, 1, 'resolver is called for the missing-email membership');
    }

    // membership without email + resolver returns null -> email stays null, counted as lookup-failed.
    {
        const res = await resolveMemberEmails({
            members: [{ external_student_id: 's-2', link_verified_at: T1, external_source: 'online', link_status: 'verified', email: '', user_id: 'usr_b' }],
            resolveEmail: async () => null
        });
        assertEqual(res.members[0].email || null, null, 'unresolved membership keeps a null email');
        assertEqual({ from: res.emailFromClerk, failed: res.emailLookupFailed, missing: res.missingEmail }, { from: 0, failed: 1, missing: 1 },
            'unresolved membership counts as email_lookup_failed');
        // The registration is still stamped: the diff treats it as registered regardless of email.
        const d = computeChessterRegistrationDiff({
            members: res.members,
            students: [{ id: 's-2', chesster_registered_at: null, chesster_email: null }],
            now: NOW
        });
        assertEqual(d.toSet, [{ id: 's-2', value: T1, email: null }],
            'lookup-failed membership is still stamped registered with a null email');
    }

    // membership WITH email -> resolver NOT called (no unnecessary Clerk hits).
    {
        let calls = 0;
        const res = await resolveMemberEmails({
            members: [{ external_student_id: 's-3', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: 'have@chesster.io', user_id: 'usr_c' }],
            resolveEmail: async () => { calls++; return 'should-not-be-used@clerk.io'; }
        });
        assertEqual(calls, 0, 'resolver is NOT called when the membership already has an email');
        assertEqual(res.members[0].email, 'have@chesster.io', 'existing email is left untouched');
        assertEqual({ from: res.emailFromClerk, failed: res.emailLookupFailed, missing: res.missingEmail }, { from: 0, failed: 0, missing: 0 },
            'membership with an email contributes nothing to the fallback counters');
    }

    // duplicate user_id memberships -> resolver called once (cache).
    {
        let calls = 0;
        const res = await resolveMemberEmails({
            members: [
                { external_student_id: 's-4a', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: null, user_id: 'usr_dup' },
                { external_student_id: 's-4b', link_verified_at: T1, external_source: 'online', link_status: 'verified', email: null, user_id: 'usr_dup' }
            ],
            resolveEmail: async () => { calls++; return 'dup@clerk.io'; }
        });
        assertEqual(calls, 1, 'duplicate user_id resolves via cache — resolver called once');
        assertEqual([res.members[0].email, res.members[1].email], ['dup@clerk.io', 'dup@clerk.io'],
            'both duplicate memberships receive the cached email');
        assertEqual(res.emailFromClerk, 2, 'both memberships count toward email_from_clerk');
    }

    // no resolver (CLERK_SECRET_KEY unset) -> fallback skipped, missing counted.
    {
        const res = await resolveMemberEmails({
            members: [{ external_student_id: 's-5', link_verified_at: T1, external_source: 'chess_empire', link_status: 'verified', email: null, user_id: 'usr_e' }]
        });
        assertEqual({ from: res.emailFromClerk, failed: res.emailLookupFailed, missing: res.missingEmail }, { from: 0, failed: 0, missing: 1 },
            'without a resolver the fallback is skipped and the miss is counted');
        assertEqual(res.members[0].email || null, null, 'membership email stays null when no resolver is supplied');
    }

    // pickClerkEmail selects the primary address, falling back to the first.
    assertEqual(pickClerkEmail({
        primary_email_address_id: 'e2',
        email_addresses: [{ id: 'e1', email_address: 'first@clerk.io' }, { id: 'e2', email_address: 'primary@clerk.io' }]
    }), 'primary@clerk.io', 'pickClerkEmail returns the primary_email_address_id match');
    assertEqual(pickClerkEmail({
        primary_email_address_id: 'missing',
        email_addresses: [{ id: 'e1', email_address: 'first@clerk.io' }]
    }), 'first@clerk.io', 'pickClerkEmail falls back to the first address when the primary id is absent');
    assertEqual(pickClerkEmail({ email_addresses: [] }), null, 'pickClerkEmail returns null when there are no addresses');

    // ========================================================================
    // 7. render helper — pure-logic port of the three states
    // ========================================================================
    console.log('\n=== render helper states (pure-logic port) ===========================\n');

    // Mirror of renderChessterStatusBox: state class, value text, and whether an
    // email line is rendered (registered AND a synced email present).
    function renderPort(student, tr) {
        const isRegistered = !!(student && student.chessterRegisteredAt);
        const email = isRegistered && student.chessterEmail ? String(student.chessterEmail) : '';
        return {
            stateClass: isRegistered ? 'chesster-status--registered' : 'chesster-status--unregistered',
            statusIcon: isRegistered ? 'check' : 'x',
            value: isRegistered ? tr('chesster.registered') : tr('chesster.notRegistered'),
            emailLine: email || null
        };
    }
    const tr = (k) => ({ 'chesster.registered': 'Зарегистрирован', 'chesster.notRegistered': 'Не зарегистрирован' }[k]);

    assertEqual(renderPort({ chessterRegisteredAt: T1, chessterEmail: 'me@chesster.io' }, tr),
        { stateClass: 'chesster-status--registered', statusIcon: 'check', value: 'Зарегистрирован', emailLine: 'me@chesster.io' },
        'registered + email -> green banner with the email line');
    assertEqual(renderPort({ chessterRegisteredAt: T1, chessterEmail: null }, tr),
        { stateClass: 'chesster-status--registered', statusIcon: 'check', value: 'Зарегистрирован', emailLine: null },
        'registered, no email -> green banner, no email line');
    assertEqual(renderPort({ chessterRegisteredAt: null, chessterEmail: 'ghost@chesster.io' }, tr),
        { stateClass: 'chesster-status--unregistered', statusIcon: 'x', value: 'Не зарегистрирован', emailLine: null },
        'unregistered -> red banner, no email line even if a stale email is present');
    assertEqual(renderPort({}, tr),
        { stateClass: 'chesster-status--unregistered', statusIcon: 'x', value: 'Не зарегистрирован', emailLine: null },
        'missing columns (undefined) -> treated as unregistered, no error');

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
