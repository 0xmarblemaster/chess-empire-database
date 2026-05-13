/**
 * Task 1 regression test — accept attribute, drop filter, and dropHint i18n
 * strings on the tournaments importer must include .xlsx (and .xls).
 *
 * Run: node tests/test-tournament-xlsx-accept.js
 *
 * This guards the small surface touched by Task 1 so a future refactor
 * doesn't accidentally drop xlsx from the accept list, the drag-and-drop
 * filter regex, or the user-facing dropHint strings.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const adminV2 = fs.readFileSync(path.join(__dirname, '..', 'admin-v2.js'), 'utf8');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('admin-v2.js — tournament drop zone');
assert(
    adminV2.includes('id="tournamentFileInput" accept=".csv,.txt,.xlsx,.xls"'),
    'tournamentFileInput accept attribute lists csv, txt, xlsx, xls'
);
assert(
    !/id="tournamentFileInput" accept="\.csv,\.txt"/.test(adminV2),
    'old csv/txt-only accept attribute is gone'
);

// The drop filter regex must accept all four extensions. We extract the
// regex literal next to the tournament drop handler and test it against
// representative filenames.
const dropRegexMatch = adminV2.match(/dataTransfer\?\.files \|\| \[\]\)\s*\.filter\(f => (\/[^\/]+\/i)\.test\(f\.name\)\)/);
assert(dropRegexMatch !== null, 'tournament drop-zone filter regex is locatable');
if (dropRegexMatch) {
    const re = new RegExp(dropRegexMatch[1].slice(1, -2), 'i');
    for (const name of ['a.csv', 'a.txt', 'a.xlsx', 'a.xls', 'A.XLSX']) {
        assert(re.test(name), `drop filter accepts ${name}`);
    }
    for (const name of ['a.pdf', 'a.docx', 'photo.jpg']) {
        assert(!re.test(name), `drop filter rejects ${name}`);
    }
}

console.log('i18n.js — dropHint strings mention .xlsx');
const dropHintLines = i18n.split('\n').filter(l => l.includes('"admin.tournaments.dropHint"'));
assert(dropHintLines.length === 3, 'exactly three dropHint translations exist (en/ru/kk)');
for (const line of dropHintLines) {
    assert(line.includes('.xlsx'), `dropHint mentions .xlsx — ${line.trim()}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
