/**
 * Tests for the Tournament Management toggle in App Access.
 *
 * Source-grep tests that verify:
 *   1. crud-management.js renders a can_manage_tournaments toggle in the
 *      App Access permission grid, right after the ratings toggle, and maps
 *      it to an i18n key + English fallback label.
 *   2. i18n.js defines access.permissions.manageTournaments in en/ru/kk.
 *   3. Migration 087 adds can_manage_tournaments to get_user_roles_with_emails
 *      and drops the migration-058 ratings/tournaments sync trigger while
 *      leaving the 060/062 coach auto-grant trigger untouched.
 *
 * Run: node tests/test-tournament-access-toggle.js
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

const repoRoot = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

console.log('\n=== crud-management.js permission grid =========================\n');
{
    const src = read('crud-management.js');

    // Toggle is rendered in the grid…
    assert(/createAppAccessPermissionToggle\(user,\s*'can_manage_tournaments'\)/.test(src),
        'grid renders the can_manage_tournaments toggle');

    // …positioned right after the ratings toggle (matches "Ещё" menu order).
    const grid = src.slice(src.indexOf('app-access-permission-grid'),
        src.indexOf('app-access-permission-grid') + 1200);
    const ratingsIdx = grid.indexOf("'can_manage_ratings'");
    const tournamentsIdx = grid.indexOf("'can_manage_tournaments'");
    const dataIdx = grid.indexOf("'can_manage_data'");
    assert(ratingsIdx !== -1 && tournamentsIdx !== -1 && dataIdx !== -1,
        'grid contains ratings, tournaments and data toggles');
    assert(ratingsIdx < tournamentsIdx && tournamentsIdx < dataIdx,
        'tournaments toggle sits directly after ratings, before data');

    // keyMap entry → i18n key.
    assert(/can_manage_tournaments:\s*'access\.permissions\.manageTournaments'/.test(src),
        'keyMap maps can_manage_tournaments to access.permissions.manageTournaments');

    // English fallback label.
    assert(/can_manage_tournaments:\s*'Tournament Management'/.test(src),
        'fallback label for can_manage_tournaments is "Tournament Management"');
}

console.log('\n=== i18n.js manageTournaments key (en/ru/kk) ===================\n');
{
    const i18nSrc = read('i18n.js');
    const matches = i18nSrc.match(/"access\.permissions\.manageTournaments"\s*:/g) || [];
    assert(matches.length >= 3,
        `access.permissions.manageTournaments defined in 3+ locales (found ${matches.length})`);
    assert(/"access\.permissions\.manageTournaments"\s*:\s*"Tournament Management"/.test(i18nSrc),
        'EN value is "Tournament Management"');
    assert(/"access\.permissions\.manageTournaments"\s*:\s*"Управление турнирами"/.test(i18nSrc),
        'RU value is "Управление турнирами"');
    assert(/"access\.permissions\.manageTournaments"\s*:\s*"Турнирлерді басқару"/.test(i18nSrc),
        'KK value is "Турнирлерді басқару"');
}

console.log('\n=== Migration 087 contents ====================================\n');
{
    const migPath = path.join('supabase', 'migrations', '087_tournament_access_toggle.sql');
    assert(fs.existsSync(path.join(repoRoot, migPath)), 'migration 087 file exists');
    const sql = read(migPath);

    assert(/DROP FUNCTION IF EXISTS get_user_roles_with_emails\(\)/i.test(sql),
        'drops get_user_roles_with_emails before recreate');
    assert(/CREATE OR REPLACE FUNCTION\s+get_user_roles_with_emails/i.test(sql),
        'recreates get_user_roles_with_emails');
    assert(/can_manage_tournaments\s+BOOLEAN/i.test(sql),
        'new function returns can_manage_tournaments column');
    assert(/SECURITY DEFINER/i.test(sql),
        'preserves SECURITY DEFINER');
    assert(/GRANT EXECUTE ON FUNCTION get_user_roles_with_emails\(\) TO authenticated/i.test(sql),
        're-grants EXECUTE to authenticated');

    assert(/DROP TRIGGER IF EXISTS sync_ratings_tournaments_permissions_trg/i.test(sql),
        'drops the migration-058 sync trigger');
    assert(/DROP FUNCTION IF EXISTS sync_ratings_tournaments_permissions/i.test(sql),
        'drops the sync trigger function');
    assert(!/DROP\s+(TRIGGER|FUNCTION)[^\n;]*default_coach_ratings_permission/i.test(sql)
        && !/CREATE\s+(OR REPLACE\s+)?(TRIGGER|FUNCTION)[^\n;]*default_coach_ratings_permission/i.test(sql),
        'does NOT drop/recreate the 060/062 coach auto-grant trigger');

    assert(/\bBEGIN;[\s\S]+COMMIT;\s*$/i.test(sql.trim()),
        'migration is wrapped in BEGIN/COMMIT');
}

console.log(`\n=== Summary ===================================================\n`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
