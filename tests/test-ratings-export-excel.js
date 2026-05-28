/**
 * Tests for the "Export Excel" button on the Ratings Management dashboard.
 *
 * Covers:
 *  (a) admin-v2.html — button wired to exportRatingsExcel(), uses download
 *      lucide icon, sits inside #ratingsSection .header-actions BEFORE the
 *      Import data button.
 *  (b) i18n.js — admin.ratings.exportButton + status keys present in en/ru/kk
 *      with the requested English/Russian labels.
 *  (c) admin-v2.js — exportRatingsExcel() is defined, queries
 *      student_ratings + students!inner, filters status IN [active, frozen],
 *      de-duplicates per student, sorts by rating DESC, produces a workbook
 *      with sheet name "Sheet1", A1="Name", B1 is a real Excel DATE cell
 *      (type 'd', format 'yyyy-mm-dd') holding the latest rating_date, and
 *      ignores students whose status is 'left'.
 *  (d) Round-trip — the produced file is re-readable by the existing
 *      previewRatingCsvFile parser path (skip row 1, take [name, rating] from
 *      row 2 onward).
 *
 * Run: node tests/test-ratings-export-excel.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

console.log('\n=== (a) admin-v2.html — Export Excel button placement ===========\n');

const ratingsHeader = (() => {
    const start = HTML.indexOf('id="ratingsSection"');
    assert(start > 0, '#ratingsSection found in admin-v2.html');
    const headerEnd = HTML.indexOf('</div>\n                </div>\n\n                <div id="ratingsViewMain">', start);
    return HTML.slice(start, headerEnd > 0 ? headerEnd : start + 4000);
})();

assert(/onclick="exportRatingsExcel\(\)"/.test(ratingsHeader),
    'Export Excel button is wired to exportRatingsExcel()');
assert(/data-i18n="admin\.ratings\.exportButton"/.test(ratingsHeader),
    'Export button label uses admin.ratings.exportButton i18n key');
assert(/data-lucide="download"/.test(ratingsHeader),
    'Export button uses the download lucide icon');

const exportIdx = ratingsHeader.indexOf('exportRatingsExcel');
const importIdx = ratingsHeader.indexOf('openCSVImportModal');
assert(exportIdx > 0 && importIdx > exportIdx,
    'Export Excel button appears BEFORE the Import data button');

console.log('\n=== (b) i18n.js — exportButton + status keys in en/ru/kk ==========\n');

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

const EXPECTED_LABELS = {
    en: { 'admin.ratings.exportButton': 'Export Excel' },
    ru: { 'admin.ratings.exportButton': 'Скачать Excel' },
    kk: { 'admin.ratings.exportButton': null }, // any non-empty string is acceptable
};
const REQUIRED_KEYS = [
    'admin.ratings.exportButton',
    'admin.ratings.exportSuccess',
    'admin.ratings.exportError',
    'admin.ratings.exportEmpty',
];

for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of REQUIRED_KEYS) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["']([^"']+)["']`);
        const m = block.match(re);
        assert(!!m, `${key} present in ${locale}`);
        if (m && EXPECTED_LABELS[locale] && EXPECTED_LABELS[locale][key]) {
            assert(m[1] === EXPECTED_LABELS[locale][key],
                `${key} value in ${locale} is "${EXPECTED_LABELS[locale][key]}" (got "${m[1]}")`);
        }
    }
}

console.log('\n=== (c) admin-v2.js — exportRatingsExcel() function shape ==========\n');

assert(/async function exportRatingsExcel\(\)/.test(JS),
    'exportRatingsExcel() defined as async function');

const fnStart = JS.indexOf('async function exportRatingsExcel()');
const fnBlock = JS.slice(fnStart, fnStart + 4000);

assert(/can_manage_ratings/.test(fnBlock),
    'function gates on can_manage_ratings');
assert(/\.from\(['"]student_ratings['"]\)/.test(fnBlock),
    'function queries student_ratings table directly (not the RPC)');
assert(/students!inner\(/.test(fnBlock),
    'function inner-joins students for first_name/last_name/status');
assert(/get_rating_leaderboard/.test(fnBlock) === false,
    'function does NOT call get_rating_leaderboard RPC');
assert(/\['active',\s*'frozen'\]|\["active",\s*"frozen"\]/.test(fnBlock),
    'function filters students.status IN [active, frozen]');
assert(/XLSX\.utils\.aoa_to_sheet/.test(fnBlock),
    'function builds the sheet via XLSX.utils.aoa_to_sheet');
assert(/['"]Sheet1['"]/.test(fnBlock),
    'function appends the sheet with name "Sheet1"');
assert(/ws\['B1'\]\.t\s*=\s*['"]d['"]/.test(fnBlock),
    "function forces ws['B1'].t = 'd' (real Excel DATE cell)");
assert(/ws\['B1'\]\.z\s*=\s*['"]yyyy-mm-dd['"]/.test(fnBlock),
    "function sets ws['B1'].z = 'yyyy-mm-dd'");
assert(/Рейтинг \$\{dd\}\.\$\{mm\}\.\$\{yyyy\}\.xlsx/.test(fnBlock),
    'function uses filename "Рейтинг DD.MM.YYYY.xlsx" (Cyrillic prefix)');
assert(/admin\.ratings\.exportSuccess/.test(fnBlock),
    'function toasts admin.ratings.exportSuccess on success');
assert(/admin\.ratings\.exportError/.test(fnBlock),
    'function toasts admin.ratings.exportError on failure');

console.log('\n=== (d) Functional round-trip — eval & exercise the function =====\n');

// Pull just the function source out of admin-v2.js and run it in a sandbox.
function extractFunctionSource(src, name) {
    const start = src.indexOf(`async function ${name}(`);
    if (start < 0) return null;
    let depth = 0;
    let i = src.indexOf('{', start);
    const begin = start;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(begin, i + 1);
        }
    }
    return null;
}

const fnSrc = extractFunctionSource(JS, 'exportRatingsExcel');
assert(!!fnSrc, 'exportRatingsExcel source extracted');

// Capture the workbook by stubbing XLSX.writeFile.
let capturedWb = null;
let capturedFilename = null;
const xlsxStub = Object.assign({}, XLSX, {
    writeFile(wb, filename) {
        capturedWb = wb;
        capturedFilename = filename;
    },
});

const toastCalls = [];
function showToast(msg, type) { toastCalls.push({ msg, type }); }
function t(key) { return key; }

// Mock data: 4 students total — 1 active + 1 frozen + 1 left, plus a second
// rating for the active student (older). Expected output excludes 'left',
// dedupes the active student to its later rating, sorts by rating DESC.
const ratingsRows = [
    { student_id: 'a', rating: 1100, rating_date: '2026-04-01', students: { first_name: 'Иван',  last_name: 'Иванов',  status: 'active' } },
    { student_id: 'a', rating: 1250, rating_date: '2026-04-28', students: { first_name: 'Иван',  last_name: 'Иванов',  status: 'active' } },
    { student_id: 'b', rating: 1500, rating_date: '2026-04-20', students: { first_name: 'Пётр',  last_name: 'Петров',  status: 'frozen' } },
    { student_id: 'c', rating: 1700, rating_date: '2026-04-15', students: { first_name: 'Бывший', last_name: 'Уход', status: 'left'   } },
];

const fakeQuery = {
    _filteredOutLeft: false,
    select() { return this; },
    in(col, values) {
        assertEqual(col, 'students.status',
            'function filters on students.status column');
        assertEqual(values.sort(), ['active', 'frozen'].sort(),
            'function filters students.status IN [active, frozen]');
        // Apply the filter ourselves so the test mirrors the real RLS behaviour.
        const filtered = ratingsRows.filter(r => values.includes(r.students.status));
        return Promise.resolve({ data: filtered, error: null });
    },
};
const supabaseClient = { from(tbl) {
    assertEqual(tbl, 'student_ratings', 'function reads from student_ratings');
    return fakeQuery;
} };
const supabaseAuth = { getCurrentUserRole: () => ({ role: 'admin', can_manage_ratings: true }) };

// Sandbox: declare bindings the function source closes over, then eval.
const sandbox = `
'use strict';
const window = { supabaseClient, supabaseAuth };
const XLSX = xlsxStub;
${fnSrc}
return exportRatingsExcel();
`;
const runner = new Function('supabaseClient', 'supabaseAuth', 'xlsxStub', 'showToast', 't', 'console', sandbox);

(async () => {
    await runner(supabaseClient, supabaseAuth, xlsxStub, showToast, t, console);

    assert(!!capturedWb, 'XLSX.writeFile was invoked (workbook captured)');
    assert(capturedFilename && /^Рейтинг \d{2}\.\d{2}\.\d{4}\.xlsx$/.test(capturedFilename),
        `filename matches "Рейтинг DD.MM.YYYY.xlsx" (got "${capturedFilename}")`);

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    assertEqual(capturedFilename, `Рейтинг ${dd}.${mm}.${yyyy}.xlsx`,
        'filename uses TODAY local date');

    // Round-trip: write the workbook to a buffer and read it back via xlsx.
    const buf = XLSX.write(capturedWb, { type: 'buffer', bookType: 'xlsx' });
    const reread = XLSX.read(buf, { type: 'buffer', cellDates: true });

    assertEqual(reread.SheetNames, ['Sheet1'],
        'workbook has exactly one sheet named "Sheet1"');
    const ws = reread.Sheets['Sheet1'];

    // A1 / B1 inspection
    assert(ws['A1'] && ws['A1'].v === 'Name',
        'A1 cell value is the literal text "Name"');
    assert(ws['B1'] && ws['B1'].t === 'd',
        "B1 cell type is 'd' (Excel DATE cell, not text)");
    const b1Date = ws['B1'].v instanceof Date ? ws['B1'].v : new Date(ws['B1'].v);
    assertEqual(b1Date.toISOString().slice(0, 10), '2026-04-28',
        'B1 cell value is the latest rating_date among exported rows (2026-04-28)');

    // Body rows: should be Петров Пётр (1500) first, Иванов Иван (1250) second.
    // The 'left' student must be absent. Older rating row for the active student
    // must have been deduped away.
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    assertEqual(aoa.length, 3,
        'sheet has 3 rows: header + 2 body rows (left student excluded, dedup applied)');

    assertEqual(aoa[1][0], 'Петров Пётр',
        'row 2 is the highest-rated student (frozen included)');
    assertEqual(aoa[1][1], 1500, 'row 2 rating is 1500');
    assertEqual(aoa[2][0], 'Иванов Иван',
        'row 3 is the second-highest student');
    assertEqual(aoa[2][1], 1250,
        'row 3 rating is the LATER rating (1250), not the stale 1100');

    // Round-trip: the existing previewRatingCsvFile parser path at admin-v2.js
    // line ~4432 reads [row[0], row[1]] for rows i=1..N. Simulate it.
    const parserRows = [];
    for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (row && row[0]) {
            parserRows.push({ name: String(row[0]).trim(), rating: parseInt(row[1]) || 0 });
        }
    }
    assertEqual(parserRows.length, 2,
        'previewRatingCsvFile-style parser reads exactly 2 data rows');
    assertEqual(parserRows[0], { name: 'Петров Пётр', rating: 1500 },
        'parser row 1 round-trips name + rating');
    assertEqual(parserRows[1], { name: 'Иванов Иван', rating: 1250 },
        'parser row 2 round-trips name + rating');

    // Success toast fired.
    assert(toastCalls.some(c => c.msg === 'admin.ratings.exportSuccess' && c.type === 'success'),
        'showToast fired with admin.ratings.exportSuccess on success');

    // ──────────────────────────────────────────────────────────────────────
    // Permission gate: a coach without can_manage_ratings must bail out.
    capturedWb = null;
    capturedFilename = null;
    toastCalls.length = 0;
    const blockedAuth = { getCurrentUserRole: () => ({ role: 'coach', can_manage_ratings: false }) };
    const sandbox2 = `
'use strict';
const window = { supabaseClient, supabaseAuth };
const XLSX = xlsxStub;
${fnSrc}
return exportRatingsExcel();
`;
    const runner2 = new Function('supabaseClient', 'supabaseAuth', 'xlsxStub', 'showToast', 't', 'console', sandbox2);
    await runner2(supabaseClient, blockedAuth, xlsxStub, showToast, t, console);
    assert(capturedWb === null, 'permission-gated user does NOT trigger a download');
    assert(toastCalls.some(c => c.type === 'error'),
        'permission-gated user gets an error toast');

    console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
    if (failed > 0) process.exit(1);
})().catch((e) => {
    console.error('Test runner crashed:', e);
    process.exit(1);
});
