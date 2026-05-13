/**
 * Tournament importer xlsx-acceptance regression tests.
 *
 * Run: node tests/test-tournament-xlsx-accept.js
 *
 * Pins three things:
 *   1. The drop-zone accept attribute and drag-and-drop filter regex both
 *      include .csv/.txt/.xlsx/.xls (Task 1).
 *   2. All three locales of admin.tournaments.dropHint mention .xlsx (Task 1).
 *   3. dropHint is the *only* admin.tournaments.* key that mentions a file
 *      extension or "Excel", and all admin.tournaments.* keys are present in
 *      en/ru/kk (Task 6 audit conclusion).
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

// Task 6 — i18n only-where-needed audit.
// Conclusion to pin: inside admin.tournaments.*, dropHint is the *only*
// string that mentions a file extension or "Excel". This prevents future
// drift where someone adds .xlsx hints to other keys (e.g. `upload`) and
// then forgets to keep them in sync across locales, or removes .xlsx from
// dropHint and silently moves it elsewhere.
console.log('i18n.js — only dropHint mentions file types under admin.tournaments.*');
const tournamentKeyLines = i18n.split('\n').filter(l => /"admin\.tournaments\.[a-zA-Z]+"\s*:/.test(l));
const fileTypeMention = /\.(csv|txt|xlsx|xls)\b|\bExcel\b/i;
const offenders = tournamentKeyLines.filter(l =>
    fileTypeMention.test(l) && !l.includes('"admin.tournaments.dropHint"')
);
assert(offenders.length === 0,
    `no admin.tournaments.* string (other than dropHint) mentions a file type — found: ${offenders.map(s=>s.trim()).join(' | ')}`);

// Pin admin.tournaments.* key parity across en/ru/kk so a future translator
// can't silently leave a key untranslated.
const localeRegexes = {
    en: /^\s{4}en:\s*\{/,
    ru: /^\s{4}ru:\s*\{/,
    kk: /^\s{4}kk:\s*\{/,
};
const perLocale = { en: new Set(), ru: new Set(), kk: new Set() };
{
    let current = null;
    for (const line of i18n.split('\n')) {
        for (const loc of ['en','ru','kk']) {
            if (localeRegexes[loc].test(line)) current = loc;
        }
        const m = line.match(/"(admin\.tournaments\.[a-zA-Z]+)"\s*:/);
        if (m && current) perLocale[current].add(m[1]);
    }
}
const union = new Set([...perLocale.en, ...perLocale.ru, ...perLocale.kk]);
assert(union.size > 0, 'admin.tournaments.* keys are discoverable');
for (const loc of ['en', 'ru', 'kk']) {
    const missing = [...union].filter(k => !perLocale[loc].has(k));
    assert(missing.length === 0, `locale ${loc} has all admin.tournaments.* keys (missing: ${missing.join(', ') || 'none'})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
