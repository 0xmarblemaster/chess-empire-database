/**
 * Tests for the Upload Document drop zone on the Ratings Management page.
 *
 * Covers:
 *  - admin-v2.html: #ratingsUploadDropZone exists inside #ratingsViewMain and
 *    appears BEFORE the manual rating entry form (#ratingStudentSelect).
 *  - admin-v2.js: _wireRatingsUploadDropZone is defined, idempotent via
 *    window.__ratingsDropZoneWired, called from showRatingsManagement, opens
 *    the CSV import modal on click, and forwards dropped files into
 *    #csvFileInput via a change event.
 *  - i18n.js: admin.ratings.uploadCardTitle + admin.ratings.uploadHint
 *    present in en/ru/kk.
 *
 * Run: node tests/test-ratings-upload-dropzone.js
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
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

console.log('\n=== (a) admin-v2.html — drop zone markup + DOM ordering\n');

assert(/id="ratingsUploadDropZone"/.test(HTML),
    '#ratingsUploadDropZone present');
assert(/data-i18n="admin\.ratings\.uploadCardTitle"/.test(HTML),
    'card title uses admin.ratings.uploadCardTitle i18n key');
assert(/data-i18n="admin\.ratings\.uploadHint"/.test(HTML),
    'drop hint uses admin.ratings.uploadHint i18n key');
assert(/data-lucide="cloud-upload"/.test(HTML),
    'cloud-upload icon present inside drop zone');

// Drop zone lives inside ratingsViewMain.
const mainStart = HTML.indexOf('id="ratingsViewMain"');
const mainEnd = HTML.indexOf('<!-- End ratingsViewMain -->');
assert(mainStart > 0 && mainEnd > mainStart,
    'ratingsViewMain block delimiters located');
const mainBlock = HTML.slice(mainStart, mainEnd);
assert(/id="ratingsUploadDropZone"/.test(mainBlock),
    'drop zone lives inside #ratingsViewMain');

// Drop zone must appear BEFORE #ratingStudentSelect (the manual entry form).
const dzIdx = mainBlock.indexOf('id="ratingsUploadDropZone"');
const formIdx = mainBlock.indexOf('id="ratingStudentSelect"');
assert(dzIdx >= 0 && formIdx > dzIdx,
    'drop zone precedes manual rating entry form in source order');

// The existing Import data button must still be present (Option A — keep both).
assert(/onclick="openCSVImportModal\(\)"/.test(HTML),
    'header Import data button still wired to openCSVImportModal');

console.log('\n=== (b) admin-v2.js — wiring function + call site\n');

assert(/function _wireRatingsUploadDropZone\(\)/.test(JS),
    '_wireRatingsUploadDropZone() defined');

const fnStart = JS.indexOf('function _wireRatingsUploadDropZone()');
const fnBlock = JS.slice(fnStart, fnStart + 2500);

assert(/window\.__ratingsDropZoneWired/.test(fnBlock),
    'wiring is idempotent via window.__ratingsDropZoneWired');
assert(/getElementById\(['"]ratingsUploadDropZone['"]\)/.test(fnBlock),
    'reads #ratingsUploadDropZone');
assert(/openCSVImportModal\(\)/.test(fnBlock),
    'click handler calls openCSVImportModal()');
assert(/'dragenter'[\s\S]{0,40}'dragover'|'dragover'[\s\S]{0,40}'dragenter'/.test(fnBlock),
    'dragenter + dragover handlers wired');
assert(/dragleave/.test(fnBlock),
    'dragleave handler wired');
assert(/preventDefault\(\)/.test(fnBlock),
    'preventDefault called inside drag/drop handlers');
assert(/#3b82f6/.test(fnBlock) && /#eff6ff/.test(fnBlock),
    'hover styling uses blue border + light blue background');
assert(/dataTransfer[\s\S]{0,80}files/.test(fnBlock),
    'drop reads e.dataTransfer.files');
assert(/getElementById\(['"]csvFileInput['"]\)[\s\S]{0,200}\.files\s*=\s*files/.test(fnBlock),
    'drop assigns dropped files to #csvFileInput.files');
assert(/dispatchEvent\(new Event\(['"]change['"]/.test(fnBlock),
    'drop dispatches a change event on #csvFileInput');

// Call site: showRatingsManagement invokes the wiring function.
const showStart = JS.indexOf('function showRatingsManagement(');
assert(showStart >= 0, 'showRatingsManagement defined');
const showBlock = JS.slice(showStart, showStart + 1500);
assert(/_wireRatingsUploadDropZone\(\)/.test(showBlock),
    'showRatingsManagement calls _wireRatingsUploadDropZone()');

console.log('\n=== (c) i18n.js — uploadCardTitle + uploadHint in en/ru/kk\n');

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

const NEW_KEYS = [
    'admin.ratings.uploadCardTitle',
    'admin.ratings.uploadHint',
];

for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of NEW_KEYS) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["'][^"']+["']`);
        assert(re.test(block), `${key} present in ${locale}`);
    }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
