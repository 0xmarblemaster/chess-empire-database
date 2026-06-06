/**
 * Tests for migration 060 — every coach gets can_manage_ratings = true.
 *
 * Two layers:
 *   A. Source-grep — locks the migration intent at the SQL level (mirrors
 *      tests/test-tournament-upload-rls-permissions.js).
 *   B. Live DB — runs against the production Supabase project (papgci...)
 *      via the service role key, verifies:
 *        1. Every existing role = 'coach' row has can_manage_ratings = true
 *           (and, via the sync trigger from 058, can_manage_tournaments).
 *        2. A new coach row inserted with can_manage_ratings = false ends
 *           up with both flags true after the default-grant trigger fires.
 *        3. Flipping role from 'viewer' (the non-coach role allowed by
 *           the CHECK constraint, equivalent to the "student"/"non-coach"
 *           case in the spec) to 'coach' also flips both flags to true.
 *      Each live test creates a synthetic auth.users row, runs its check,
 *      and cleans up — no production data is touched.
 *
 * Run: node tests/test-all-coaches-ratings-permission.js
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

// =====================================================================
// A. Source-grep — migration 060 contents
// =====================================================================
console.log('\n=== Migration 060 contents ====================================\n');
{
    const migPath = path.join(__dirname, '..', 'supabase', 'migrations',
        '060_all_coaches_manage_ratings.sql');
    assert(fs.existsSync(migPath), 'migration 060 file exists');
    const sql = fs.readFileSync(migPath, 'utf8');

    // 1. Backfill on coaches only
    assert(/UPDATE\s+user_roles[\s\S]+?SET\s+can_manage_ratings\s*=\s*true[\s\S]+?WHERE\s+role\s*=\s*'coach'/i.test(sql),
        'backfills can_manage_ratings = true where role = coach');
    assert(/COALESCE\s*\(\s*can_manage_ratings\s*,\s*false\s*\)\s*=\s*false/i.test(sql),
        'backfill skips rows that already have the flag set');

    // 2. Default-grant trigger
    assert(/CREATE OR REPLACE FUNCTION\s+default_coach_ratings_permission/i.test(sql),
        'creates default_coach_ratings_permission function');
    assert(/CREATE TRIGGER\s+default_coach_ratings_permission_trg/i.test(sql),
        'creates default_coach_ratings_permission_trg trigger');
    assert(/BEFORE INSERT OR UPDATE OF\s+role/i.test(sql),
        'trigger fires BEFORE INSERT OR UPDATE OF role');
    assert(/NEW\.role\s*=\s*'coach'/i.test(sql),
        'trigger guards on NEW.role = coach');
    assert(/NEW\.can_manage_ratings\s*:=\s*true/i.test(sql),
        'trigger sets NEW.can_manage_ratings := true');
    assert(/NEW\.can_manage_tournaments\s*:=\s*true/i.test(sql),
        'trigger also sets NEW.can_manage_tournaments := true on role flip');

    // 3. Verification block
    assert(/RAISE EXCEPTION[\s\S]+?backfill failed/i.test(sql),
        'includes verification that all coaches have the flag');
    assert(/COUNT\s*\(\s*\*\s*\)\s+INTO\s+v_missing[\s\S]+?role\s*=\s*'coach'[\s\S]+?COALESCE\s*\(\s*can_manage_ratings\s*,\s*false\s*\)\s*=\s*false/i.test(sql),
        'verification counts coaches still missing the flag');

    // 4. Transaction wrapper
    assert(/\bBEGIN;[\s\S]+COMMIT;\s*$/i.test(sql.trim()),
        'migration is wrapped in BEGIN/COMMIT');

    // 5. Migration 058 deps still referenced
    assert(/sync_ratings_tournaments_permissions/i.test(sql),
        'comments reference the sync trigger from 058');
}

// =====================================================================
// B. Live DB tests — run against papgcizhfkngubwofjuo
// =====================================================================
// Skip live tests if @supabase/supabase-js isn't reachable (e.g. fresh
// checkout). Source-grep alone still passes CI.
let createClient;
try {
    ({ createClient } = require('@supabase/supabase-js'));
} catch (_) {
    try {
        ({ createClient } = require('/tmp/node_modules/@supabase/supabase-js'));
    } catch (_) { /* no client */ }
}

const SUPABASE_URL = 'https://papgcizhfkngubwofjuo.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGdjaXpoZmtuZ3Vid29manVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTkzMDM1MSwiZXhwIjoyMDc3NTA2MzUxfQ.XwEjEJIxZ6J_3C9UZQ3hvrlm3GsfOCxMz3lYUK_trKg';

async function withSyntheticUser(supabase, fn) {
    const email = `test-mig-060-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test-fixture.invalid`;
    const password = 'rand-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true,
    });
    if (createErr) throw createErr;
    const userId = created.user.id;
    try {
        await fn(userId);
    } finally {
        // user_roles FK cascades on user delete, so this clears both rows.
        await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
}

async function runLive() {
    if (!createClient) {
        console.log('\n=== Live DB tests skipped (no @supabase/supabase-js) ==========\n');
        return;
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    console.log('\n=== Live: every coach has can_manage_ratings = true ===========\n');
    {
        const { data, error } = await supabase
            .from('user_roles')
            .select('user_id, role, can_manage_ratings, can_manage_tournaments')
            .eq('role', 'coach');
        assert(!error, `query coaches: ${error ? error.message : 'ok'}`);
        if (!error) {
            const total = data.length;
            const missing = data.filter(r => r.can_manage_ratings !== true);
            const missingT = data.filter(r => r.can_manage_tournaments !== true);
            assert(missing.length === 0,
                `all ${total} coaches have can_manage_ratings = true (missing: ${missing.length})`);
            assert(missingT.length === 0,
                `all ${total} coaches have can_manage_tournaments = true (missing: ${missingT.length})`);
        }
    }

    console.log('\n=== Live: default-grant trigger on INSERT =====================\n');
    {
        await withSyntheticUser(supabase, async (userId) => {
            const { data, error } = await supabase
                .from('user_roles')
                .insert({
                    user_id: userId,
                    role: 'coach',
                    can_manage_ratings: false,
                    can_manage_tournaments: false,
                })
                .select('user_id, role, can_manage_ratings, can_manage_tournaments')
                .single();
            assert(!error, `insert coach row: ${error ? error.message : 'ok'}`);
            if (!error) {
                assert(data.can_manage_ratings === true,
                    'newly inserted coach has can_manage_ratings = true');
                assert(data.can_manage_tournaments === true,
                    'newly inserted coach has can_manage_tournaments = true');
            }
        });
    }

    console.log('\n=== Live: role flip viewer -> coach grants the flag ===========\n');
    {
        await withSyntheticUser(supabase, async (userId) => {
            const ins = await supabase
                .from('user_roles')
                .insert({
                    user_id: userId,
                    role: 'viewer',
                    can_manage_ratings: false,
                    can_manage_tournaments: false,
                })
                .select('user_id, role, can_manage_ratings, can_manage_tournaments')
                .single();
            assert(!ins.error, `insert viewer row: ${ins.error ? ins.error.message : 'ok'}`);
            if (!ins.error) {
                assert(ins.data.can_manage_ratings === false,
                    'viewer insert leaves can_manage_ratings = false');
                assert(ins.data.can_manage_tournaments === false,
                    'viewer insert leaves can_manage_tournaments = false');
            }

            const upd = await supabase
                .from('user_roles')
                .update({ role: 'coach' })
                .eq('user_id', userId)
                .select('user_id, role, can_manage_ratings, can_manage_tournaments')
                .single();
            assert(!upd.error, `flip role to coach: ${upd.error ? upd.error.message : 'ok'}`);
            if (!upd.error) {
                assert(upd.data.role === 'coach', 'role is now coach');
                assert(upd.data.can_manage_ratings === true,
                    'viewer->coach flip sets can_manage_ratings = true');
                assert(upd.data.can_manage_tournaments === true,
                    'viewer->coach flip sets can_manage_tournaments = true');
            }
        });
    }
}

(async () => {
    try {
        await runLive();
    } catch (e) {
        failed++;
        console.error(`  ✗ live tests crashed: ${e && e.message ? e.message : e}`);
    }
    console.log(`\n=== Summary ===================================================\n`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
