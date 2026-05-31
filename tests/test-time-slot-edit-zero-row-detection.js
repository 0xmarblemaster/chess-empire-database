/**
 * Tests the silent-failure guard added to admin-v2.js for time-slot
 * edit/delete. Migration 043 created a Coaches-RLS policy that joins
 * user_roles.coach_id; before this fix, coaches with NULL coach_id
 * silently matched 0 rows on UPDATE/DELETE and the modal closed as if
 * the change had succeeded.
 *
 * The fix has two halves:
 *   1. saveTimeSlotEdit / deleteTimeSlot now append .select() to the
 *      Supabase mutation and throw `admin.attendance.editTimeSlot.errPermission`
 *      when the returned array is empty.
 *   2. The errPermission i18n key is defined in en, ru and kk.
 *
 * Run: node tests/test-time-slot-edit-zero-row-detection.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

function fnBody(src, name) {
    const start = src.indexOf(`async function ${name}(`);
    if (start < 0) return '';
    let depth = 0;
    let i = src.indexOf('{', start);
    const begin = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(begin, i + 1);
        }
    }
    return '';
}

console.log('\n=== admin-v2.js saveTimeSlotEdit zero-row guard =====================\n');

// Migration 049 swapped the in-place .update() for the edit_time_slot_versioned
// RPC, so the post-call guard now checks `!data` (the RPC returns the new/updated
// row or null when RLS silently drops the underlying UPDATE).
const saveBody = fnBody(ADMIN_SRC, 'saveTimeSlotEdit');
assert(saveBody.length > 0, 'located saveTimeSlotEdit function body');
assert(/\.rpc\(\s*['"]edit_time_slot_versioned['"]/.test(saveBody),
    'routes through the edit_time_slot_versioned RPC (no direct .update)');
assert(!/\.from\(['"]time_slots['"]\)\s*\.update\(/.test(saveBody),
    'no longer calls .from(\'time_slots\').update() directly');
assert(/const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+window\.supabaseClient/.test(saveBody),
    'destructures both data and error from the response');
assert(/if\s*\(\s*!data\s*\)/.test(saveBody),
    'has explicit zero-row guard (!data after RPC)');
assert(/admin\.attendance\.editTimeSlot\.errPermission/.test(saveBody),
    'zero-row branch references errPermission i18n key');

console.log('\n=== admin-v2.js deleteTimeSlot zero-row guard =======================\n');

const delBody = fnBody(ADMIN_SRC, 'deleteTimeSlot');
assert(delBody.length > 0, 'located deleteTimeSlot function body');
assert(/\.from\(['"]time_slots['"]\)/.test(delBody), 'still targets time_slots table');
assert(/\.delete\(\)\s*\.eq\(['"]id['"]\s*,\s*id\)\s*\.select\(\)/.test(delBody),
    'delete().eq(id).select() chain is present');
assert(/const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+window\.supabaseClient/.test(delBody),
    'destructures both data and error from the response');
assert(/if\s*\(\s*!data\s*\|\|\s*data\.length\s*===\s*0\s*\)/.test(delBody),
    'has explicit zero-row guard (!data || data.length === 0)');
assert(/admin\.attendance\.editTimeSlot\.errPermission/.test(delBody),
    'zero-row branch references errPermission i18n key');

console.log('\n=== i18n errPermission defined in en, ru, kk ========================\n');

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

function valueFor(block, dottedKey) {
    const escaped = dottedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`"${escaped}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = block.match(re);
    return m ? m[1] : null;
}

const EN = sliceLocale(I18N_SRC, 'en');
const RU = sliceLocale(I18N_SRC, 'ru');
const KK = sliceLocale(I18N_SRC, 'kk');
const KEY = 'admin.attendance.editTimeSlot.errPermission';

const enVal = valueFor(EN, KEY);
const ruVal = valueFor(RU, KEY);
const kkVal = valueFor(KK, KEY);

assert(typeof enVal === 'string' && enVal.length > 0, `[en] "${KEY}" defined`);
assert(typeof ruVal === 'string' && ruVal.length > 0, `[ru] "${KEY}" defined`);
assert(typeof kkVal === 'string' && kkVal.length > 0, `[kk] "${KEY}" defined`);

const CYRILLIC = /[Ѐ-ӿ]/;
if (ruVal) assert(CYRILLIC.test(ruVal), `[ru] "${KEY}" is in Cyrillic`);
if (kkVal) assert(CYRILLIC.test(kkVal), `[kk] "${KEY}" is in Cyrillic`);
if (enVal && ruVal) assert(ruVal !== enVal, `[ru] "${KEY}" differs from English`);
if (enVal && kkVal) assert(kkVal !== enVal, `[kk] "${KEY}" differs from English`);

console.log('\n=== migration 047 backfill present ==================================\n');

const migPath = path.join(ROOT, 'supabase/migrations/047_backfill_user_roles_coach_id.sql');
assert(fs.existsSync(migPath), 'migration 047_backfill_user_roles_coach_id.sql exists');
const migSql = fs.existsSync(migPath) ? fs.readFileSync(migPath, 'utf8') : '';
assert(/INSERT INTO user_roles/i.test(migSql), 'migration inserts into user_roles');
assert(/ON CONFLICT\s*\(user_id\)\s*DO UPDATE/i.test(migSql),
    'migration is idempotent via ON CONFLICT (user_id) DO UPDATE');
assert(/user_roles\.role\s*<>\s*'admin'/i.test(migSql),
    'migration WHERE clause protects admin rows from overwrite');
assert(/coach_id\s+IS DISTINCT FROM\s+EXCLUDED\.coach_id/i.test(migSql),
    'migration only updates rows whose coach_id actually changes');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
