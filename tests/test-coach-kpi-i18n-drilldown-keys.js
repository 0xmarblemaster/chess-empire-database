/**
 * Tests that every `coachKpiDrill*` i18n key referenced by coach-kpi.js
 * resolves to a real (non-fallback) string in en / ru / kk. Catches the
 * "added a key in code, forgot to translate it" class of bug — without
 * this guard the production drilldown would silently show the English
 * fallback in a Russian or Kazakh session.
 *
 * Run: node tests/test-coach-kpi-i18n-drilldown-keys.js
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
const KPI_SRC = fs.readFileSync(path.join(ROOT, 'coach-kpi.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// Pull out every coachKpiDrill* key referenced from coach-kpi.js. We strip
// template-string prefixes like 'coachKpiDrillTitle_' (built as
// 'coachKpiDrillTitle_' + metric in the source) and instead explicitly
// enumerate the four metric-suffixed title keys it expands to at runtime.
const DRILL_KEY_RE = /coachKpiDrill[A-Za-z0-9_]+/g;
const rawMatches = Array.from(new Set(KPI_SRC.match(DRILL_KEY_RE) || []));
const referencedKeys = rawMatches
    .filter(k => !k.endsWith('_'))
    .concat([
        'coachKpiDrillTitle_active_players',
        'coachKpiDrillTitle_top3',
        'coachKpiDrillTitle_new_razryads',
        'coachKpiDrillTitle_promotions',
    ])
    .filter((k, i, arr) => arr.indexOf(k) === i);
assert(referencedKeys.length > 0, 'coach-kpi.js references at least one coachKpiDrill* key');

// Re-use the slicer from test-coach-kpi-i18n.js so we check the same
// locale-scoped block boundaries.
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

function valueFor(block, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `(?:"${escaped}"|\\b${escaped})\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`
    );
    const m = block.match(re);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : m[2];
}

const BLOCKS = {
    en: sliceLocale(I18N_SRC, 'en'),
    ru: sliceLocale(I18N_SRC, 'ru'),
    kk: sliceLocale(I18N_SRC, 'kk'),
};
assert(BLOCKS.en.length > 0, 'extracted `en` locale block');
assert(BLOCKS.ru.length > 0, 'extracted `ru` locale block');
assert(BLOCKS.kk.length > 0, 'extracted `kk` locale block');

console.log('\n=== every drilldown key referenced in coach-kpi.js is shipped in all locales ==\n');
for (const key of referencedKeys) {
    for (const locale of ['en', 'ru', 'kk']) {
        const v = valueFor(BLOCKS[locale], key);
        assert(typeof v === 'string' && v.length > 0,
            `[${locale}] "${key}" defined and non-empty`);
    }
}

console.log('\n=== ru/kk drilldown values differ from the english fallback ===========\n');
// The point of the sweep — a translation that just echoes the English
// string is the same bug as a missing key.
for (const key of referencedKeys) {
    const enValue = valueFor(BLOCKS.en, key);
    for (const locale of ['ru', 'kk']) {
        const v = valueFor(BLOCKS[locale], key);
        if (!enValue || !v) continue;
        assert(v !== enValue,
            `[${locale}] "${key}" differs from English ("${enValue}" → "${v}")`);
    }
}

console.log('\n=== ru/kk drilldown values carry locale-appropriate characters =========\n');
// Russian Cyrillic / Kazakh Cyrillic-with-extensions guard. Pure ASCII in
// ru or kk for a Drill* key is a smell — the back-arrow ("← Назад" etc.)
// still contains Cyrillic, so this check holds for every key in the set.
const CYRILLIC = /[Ѐ-ӿ]/;
for (const key of referencedKeys) {
    for (const locale of ['ru', 'kk']) {
        const v = valueFor(BLOCKS[locale], key);
        if (!v) continue;
        assert(CYRILLIC.test(v), `[${locale}] "${key}" contains Cyrillic content`);
    }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
