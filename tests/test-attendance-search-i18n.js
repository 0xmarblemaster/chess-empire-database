/**
 * Tests the i18n keys used by the attendance student-search bar wired in
 * admin-v2.html: admin.attendance.searchStudent (placeholder) and
 * admin.attendance.noStudentsFound (empty-state inside the dropdown).
 *
 * Both must resolve to a non-empty, non-fallback string in en, ru and kk so
 * Russian- or Kazakh-speaking admins never see the raw English fallback
 * leaking through the placeholder or empty state.
 *
 * Run: node tests/test-attendance-search-i18n.js
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
                if (depth === 0) {
                    combined += src.slice(begin, i + 1);
                    break;
                }
            }
        }
    }
    return combined;
}

const EN_BLOCK = sliceLocale(I18N_SRC, 'en');
const RU_BLOCK = sliceLocale(I18N_SRC, 'ru');
const KK_BLOCK = sliceLocale(I18N_SRC, 'kk');

assert(EN_BLOCK.length > 0, 'extracted `en` locale block');
assert(RU_BLOCK.length > 0, 'extracted `ru` locale block');
assert(KK_BLOCK.length > 0, 'extracted `kk` locale block');

function valueFor(block, dottedKey) {
    // Locale blocks in i18n.js use double-quoted "admin.attendance.foo": "...".
    const escaped = dottedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`"${escaped}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = block.match(re);
    return m ? m[1] : null;
}

const REQUIRED_KEYS = [
    'admin.attendance.searchStudent',
    'admin.attendance.noStudentsFound',
];

console.log('\n=== every required key defined + non-empty in en, ru, kk =============\n');

for (const key of REQUIRED_KEYS) {
    for (const [name, block] of [['en', EN_BLOCK], ['ru', RU_BLOCK], ['kk', KK_BLOCK]]) {
        const v = valueFor(block, key);
        assert(typeof v === 'string' && v.length > 0,
            `[${name}] "${key}" defined and non-empty`);
    }
}

console.log('\n=== ru/kk translations are NOT identical to the english value ========\n');

// Catches the classic accidental copy-paste of the en value into ru/kk.
for (const key of REQUIRED_KEYS) {
    const enValue = valueFor(EN_BLOCK, key);
    const ruValue = valueFor(RU_BLOCK, key);
    const kkValue = valueFor(KK_BLOCK, key);
    if (enValue && ruValue) {
        assert(ruValue !== enValue, `[ru] "${key}" differs from English (no fallback)`);
    }
    if (enValue && kkValue) {
        assert(kkValue !== enValue, `[kk] "${key}" differs from English (no fallback)`);
    }
}

console.log('\n=== ru/kk values contain Cyrillic characters =========================\n');

// Both Russian and Kazakh translations should contain Cyrillic content for
// these labels — pure-ASCII would mean we forgot to translate.
const CYRILLIC = /[Ѐ-ӿ]/;
for (const key of REQUIRED_KEYS) {
    const ruValue = valueFor(RU_BLOCK, key);
    const kkValue = valueFor(KK_BLOCK, key);
    if (ruValue) assert(CYRILLIC.test(ruValue), `[ru] "${key}" contains Cyrillic characters`);
    if (kkValue) assert(CYRILLIC.test(kkValue), `[kk] "${key}" contains Cyrillic characters`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
