/**
 * Tests for migration 058 — tournament uploads honor can_manage_ratings.
 *
 * Source-grep tests that verify:
 *   1. Migration 058 backfills both flags, adds the sync trigger, and
 *      expands RLS to honor either flag on tournaments_uploads,
 *      tournament_results, and rating_uploads.
 *   2. admin-v2.js locks the rounds field for fixed-kind tournaments and
 *      rejects mismatched rounds at commit time.
 *   3. i18n adds the roundsFixedMismatch key in en/ru/kk.
 *
 * Run: node tests/test-tournament-upload-rls-permissions.js
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

console.log('\n=== Migration 058 contents ====================================\n');
{
    const migPath = path.join(__dirname, '..', 'supabase', 'migrations',
        '058_tournament_uploads_honor_ratings_permission.sql');
    assert(fs.existsSync(migPath), 'migration 058 file exists');
    const sql = fs.readFileSync(migPath, 'utf8');

    // Backfill — both directions
    assert(/UPDATE\s+user_roles[\s\S]+?can_manage_tournaments\s*=\s*true[\s\S]+?can_manage_ratings\s*=\s*true/i.test(sql),
        'backfills can_manage_tournaments where can_manage_ratings = true');
    assert(/UPDATE\s+user_roles[\s\S]+?can_manage_ratings\s*=\s*true[\s\S]+?can_manage_tournaments\s*=\s*true/i.test(sql),
        'backfills can_manage_ratings where can_manage_tournaments = true');

    // Sync trigger
    assert(/CREATE OR REPLACE FUNCTION\s+sync_ratings_tournaments_permissions/i.test(sql),
        'creates sync_ratings_tournaments_permissions function');
    assert(/CREATE TRIGGER\s+sync_ratings_tournaments_permissions_trg/i.test(sql),
        'creates sync trigger on user_roles');
    assert(/BEFORE INSERT OR UPDATE/i.test(sql),
        'trigger fires BEFORE INSERT OR UPDATE');

    // RLS expansion — all 3 tables
    for (const table of ['tournaments_uploads', 'tournament_results', 'rating_uploads']) {
        const pat = new RegExp(`Authorized users manage ${table}[\\s\\S]+?` +
            `can_manage_ratings\\s*=\\s*true[\\s\\S]+?can_manage_tournaments\\s*=\\s*true`, 'i');
        assert(pat.test(sql), `RLS on ${table} accepts both flags`);
    }

    // Verification block
    assert(/RAISE EXCEPTION\s+'sync failed/i.test(sql),
        'includes verification that flags are in sync');

    // Wrapped in transaction
    assert(/\bBEGIN;[\s\S]+COMMIT;\s*$/i.test(sql.trim()),
        'migration is wrapped in BEGIN/COMMIT');
}

console.log('\n=== Frontend rounds-field lock (admin-v2.js) ==================\n');
{
    const adminPath = path.join(__dirname, '..', 'admin-v2.js');
    const src = fs.readFileSync(adminPath, 'utf8');

    // onCsvUploadKindChange locks the rounds field for fixed kinds
    const handlerStart = src.indexOf('function onCsvUploadKindChange');
    assert(handlerStart !== -1, 'onCsvUploadKindChange exists');
    const handlerBody = src.slice(handlerStart, handlerStart + 2000);
    assert(/roundsEl\.readOnly\s*=\s*true/.test(handlerBody),
        'fixed-kind branch sets roundsEl.readOnly = true');
    assert(/roundsEl\.disabled\s*=\s*true/.test(handlerBody),
        'fixed-kind branch sets roundsEl.disabled = true');
    assert(/roundsEl\.readOnly\s*=\s*false/.test(handlerBody),
        'rated branch re-enables the rounds field');

    // commitTournamentUpload guards fixed-kind round mismatch
    const commitStart = src.indexOf('async function commitTournamentUpload');
    assert(commitStart !== -1, 'commitTournamentUpload exists');
    const commitBody = src.slice(commitStart, commitStart + 6000);
    assert(/roundsByKind\[kind\]\s*&&\s*rounds\s*!==\s*roundsByKind\[kind\]/.test(commitBody),
        'commitTournamentUpload guards mismatched rounds for fixed kinds');
    assert(/roundsFixedMismatch/.test(commitBody),
        'guard surfaces the roundsFixedMismatch i18n key');
}

console.log('\n=== i18n roundsFixedMismatch key (en/ru/kk) ===================\n');
{
    const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
    const matches = i18nSrc.match(/"admin\.imports\.roundsFixedMismatch"\s*:/g) || [];
    assert(matches.length >= 3,
        `roundsFixedMismatch defined in 3+ locales (found ${matches.length})`);
}

console.log(`\n=== Summary ===================================================\n`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
