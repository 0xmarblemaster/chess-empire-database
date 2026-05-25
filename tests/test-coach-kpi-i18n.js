/**
 * Tests for the Coach KPI dashboard i18n keys in i18n.js.
 *
 * The dashboard reads camelCase keys via `t(key, fallback)` from coach-kpi.js
 * (filter pills, league labels, hero card labels, insight headings, empty
 * state). This test guards that every key shipped for the Coach Performance
 * section is defined in BOTH the `en` and `ru` locale blocks with a non-empty
 * value, so a missing translation in one locale fails CI loudly rather than
 * falling back silently to the English string.
 *
 * Run: node tests/test-coach-kpi-i18n.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = actual === expected;
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const ROOT = path.resolve(__dirname, '..');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// Carve out the `en:` and `ru:` blocks so we can run assertions per locale
// without picking up matches from the other locale. i18n.js has TWO
// translations objects (legacy flat-key dict + active nested tree) — we
// concatenate every match per locale so a key defined in either block
// satisfies the contract.
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

assert(EN_BLOCK.length > 0, 'extracted `en` locale block');
assert(RU_BLOCK.length > 0, 'extracted `ru` locale block');

const REQUIRED_KEYS = [
    'coachKpiTitle',
    'coachKpiSchoolView',
    'coachKpiBranchView',
    'coachKpiCoachView',
    'coachKpiActiveStudents',
    'coachKpiTournamentsYtd',
    'coachKpiTop3',
    'coachKpiPromotions',
    'coachKpiNewRazryads',
    'coachKpiParticipation',
    'coachKpiScore',
    'coachKpiTimeWindow30d',
    'coachKpiTimeWindow90d',
    'coachKpiTimeWindowYtd',
    // coachKpiTimeWindowAll intentionally absent — All time was dropped Phase 2.
    'coachKpiLeagueAll',
    'coachKpiLeagueA',
    'coachKpiLeagueB',
    'coachKpiLeagueC',
    'coachKpiInactiveStudent',
    'coachKpiTopPerformer',
    'coachKpiBiggestClimber',
    'coachKpiEmptyState',
    // Phase-2 polish: renderer-side keys threaded via opts.t — both blocks must define them.
    'coachKpiWindowGroup',
    'coachKpiLeagueGroup',
    'coachKpiBranchGroup',
    'coachKpiBranchAll',
    'coachKpiEmptyTitle',
    'coachKpiNoDataYet',
    'coachKpiChartUnavailable',
    'coachKpiTournaments',
    'coachKpiAvgPlace',
    'coachKpiRazryadKMS',
    'coachKpiRazryad1st',
    'coachKpiRazryad2nd',
    'coachKpiRazryad3rd',
    'coachKpiRazryad4th',
    'coachKpiRazryadNone',
    'coachKpiColCoach',
    'coachKpiColActive',
    'coachKpiColActivePlayers',
    'coachKpiColParticipation',
    'coachKpiColTournaments',
    'coachKpiColTop3',
    'coachKpiColPromotions',
    'coachKpiColRazryads',
    // coachKpiActivePlayers + coachKpiColActivePlayers added for the new
    // "Active players" hero card / leaderboard column.
    'coachKpiActivePlayers',
    // coachKpiColScore + coachKpiColRatingGained intentionally absent —
    // both columns were retired from the v1 leaderboard.
];

function valueFor(block, key) {
    // Legacy outer dict uses double-quoted string keys/values; the active
    // inner tree uses unquoted JS identifier keys with single-quoted values.
    // Accept either form so the same set of REQUIRED_KEYS works against both.
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `(?:"${escapedKey}"|\\b${escapedKey})\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`
    );
    const m = block.match(re);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : m[2];
}

console.log('\n=== every required key exists in `en` and `ru` ========================\n');

for (const key of REQUIRED_KEYS) {
    const enValue = valueFor(EN_BLOCK, key);
    const ruValue = valueFor(RU_BLOCK, key);
    assert(typeof enValue === 'string' && enValue.length > 0,
        `[en] "${key}" defined and non-empty`);
    assert(typeof ruValue === 'string' && ruValue.length > 0,
        `[ru] "${key}" defined and non-empty`);
}

console.log('\n=== ru translations are not just the english string ===================\n');

// Sanity check — every Russian value should differ from its English
// counterpart (catches accidental copy-paste of the en block into ru). A
// handful of brand-y strings legitimately repeat across locales, but for this
// set every label has Cyrillic content.
for (const key of REQUIRED_KEYS) {
    const enValue = valueFor(EN_BLOCK, key);
    const ruValue = valueFor(RU_BLOCK, key);
    if (enValue && ruValue) {
        assert(ruValue !== enValue, `[ru] "${key}" differs from English`);
    }
}

console.log('\n=== english spot-checks ===============================================\n');

assertEqual(valueFor(EN_BLOCK, 'coachKpiTitle'), 'Coach Performance',
    'coachKpiTitle = "Coach Performance"');
assertEqual(valueFor(EN_BLOCK, 'coachKpiTimeWindow30d'), '30 days',
    'coachKpiTimeWindow30d = "30 days"');
assertEqual(valueFor(EN_BLOCK, 'coachKpiLeagueA'), 'League A',
    'coachKpiLeagueA = "League A"');

console.log('\n=== russian spot-checks (cyrillic content) ============================\n');

// Russian labels MUST contain Cyrillic characters; a value that's pure ASCII
// would mean we forgot to translate it.
const CYRILLIC = /[Ѐ-ӿ]/;
// `coachKpiLeagueA/B/C` legitimately keep the latin league letter in their
// Russian form ("Лига A"), so the Cyrillic check skips those two trailing
// glyphs by requiring at least one Cyrillic char anywhere in the value.
for (const key of REQUIRED_KEYS) {
    const v = valueFor(RU_BLOCK, key);
    if (!v) continue;
    assert(CYRILLIC.test(v), `[ru] "${key}" contains Cyrillic characters`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
