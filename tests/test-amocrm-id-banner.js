/**
 * Tests for the staff-only amoCRM ID banner + reference row on the student profile.
 *
 * Extracts the REAL render helpers from student.js (brace matching on the
 * function name) and evaluates them in a vm context with stubbed `t` and
 * `sessionStorage`, plus source-contract checks on the overview template,
 * supabase-data.js mapper and i18n dictionaries.
 *
 * Run: node tests/test-amocrm-id-banner.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const STUDENT_SRC = fs.readFileSync(path.join(ROOT, 'student.js'), 'utf8');

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`function ${name} not found in student.js`);
    const open = src.indexOf('{', src.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
}

const EN = {
    'chesster.appStatus': 'Chesster App',
    'chesster.registered': 'Registered',
    'chesster.notRegistered': 'Not registered',
    'amocrm.label': 'amoCRM ID',
    'amocrm.notLinked': 'Not linked',
    'amocrm.copy': 'Copy',
    'amocrm.copied': 'Copied'
};

const storage = {};
const ctx = vm.createContext({
    t: (key) => EN[key],
    sessionStorage: {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = String(v); },
        removeItem: (k) => { delete storage[k]; }
    }
});
const FNS = ['isLoggedIn', 'escapeHtmlSafe', 'renderChessterStatusBox', 'renderAmocrmIdBox', 'renderStaffReferenceRow'];
vm.runInContext(FNS.map((n) => extractFunction(STUDENT_SRC, n)).join('\n\n'), ctx);
// Same guarded expression the overview template uses.
const renderGuarded = (student) => vm.runInContext(
    `isLoggedIn() ? renderStaffReferenceRow(student) : ''`,
    Object.assign(ctx, { student })
);

console.log('\n=== renderAmocrmIdBox ================================================\n');

const linked = ctx.renderAmocrmIdBox({ amocrmCustomerId: 882213 });
assert(linked.includes('amoCRM ID') && linked.includes('882213'), 'linked: shows label and ID 882213');
assert(linked.includes('amocrm-status--linked') && !linked.includes('amocrm-status--unlinked'), 'linked: amocrm-status--linked class');
assert(linked.includes('data-amocrm-id="882213"') && linked.includes('class="amocrm-copy"'), 'linked: copy button carries data-amocrm-id="882213"');
assert(linked.includes('Copy'), 'linked: copy button label');

for (const [label, value] of [['null', null], ['undefined', undefined], ["''", '']]) {
    const html = ctx.renderAmocrmIdBox({ amocrmCustomerId: value });
    assert(html.includes('Not linked'), `${label}: shows "Not linked"`);
    assert(html.includes('amocrm-status--unlinked'), `${label}: amocrm-status--unlinked class`);
    assert(!/>\s*0\s*</.test(html), `${label}: never renders 0`);
    assert(!html.includes('data-amocrm-id'), `${label}: no copy button`);
}
assert(ctx.renderAmocrmIdBox(null).includes('Not linked'), 'missing student: "Not linked"');

const long = ctx.renderAmocrmIdBox({ amocrmCustomerId: 9007199254740991 });
assert(long.includes('>9007199254740991<') && long.includes('data-amocrm-id="9007199254740991"'), 'very long ID rendered in full');

const evil = ctx.renderAmocrmIdBox({ amocrmCustomerId: '"><script>x</script>' });
assert(!evil.includes('<script>') && evil.includes('&quot;&gt;&lt;script&gt;'), 'ID is HTML-escaped in text and attribute');

console.log('\n=== staff reference row visibility ===================================\n');

const student = { chessterRegisteredAt: '2026-01-01T00:00:00Z', chessterEmail: 'parent@example.com', amocrmCustomerId: 882213 };

storage.userRole = JSON.stringify({ role: 'coach' });
const loggedIn = renderGuarded(student);
assert(loggedIn.includes('staff-reference-row') && loggedIn.includes('mobile-order-0'), 'logged in: staff-reference-row with mobile-order-0');
assert(loggedIn.includes('Chesster App') && loggedIn.includes('amoCRM ID'), 'logged in: row contains both banners');
assert(loggedIn.includes('parent@example.com'), 'logged in: Chesster email shown');

delete storage.userRole;
const loggedOut = renderGuarded(student);
assert(loggedOut === '', 'logged out: guarded expression yields empty string');
assert(!loggedOut.includes('Chesster App') && !loggedOut.includes('amoCRM ID') && !loggedOut.includes('parent@example.com'),
    'logged out: no Chesster, amoCRM or email markup');

console.log('\n=== source contracts =================================================\n');

assert(STUDENT_SRC.includes("${isLoggedIn() ? renderStaffReferenceRow(student) : ''}"), 'overview template gates the row behind isLoggedIn()');
const rowFn = extractFunction(STUDENT_SRC, 'renderStaffReferenceRow');
assert(STUDENT_SRC.split('${renderChessterStatusBox(').length - 1 === 1 && rowFn.includes('renderChessterStatusBox(student)'),
    'renderChessterStatusBox is only called from renderStaffReferenceRow (never unguarded)');
assert((STUDENT_SRC.match(/chessterEmail/g) || []).length === 2, 'chessterEmail is only read inside renderChessterStatusBox');
assert(/closest\('\.amocrm-copy'\)/.test(STUDENT_SRC) && /navigator\.clipboard\.writeText\(button\.dataset\.amocrmId\)/.test(STUDENT_SRC),
    'copy uses a delegated listener reading the data attribute');

const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
assert(DATA_SRC.includes('amocrmCustomerId: data.amocrm_customer_id ?? null'), 'supabase-data.js maps amocrmCustomerId with ??');

const CSS = fs.readFileSync(path.join(ROOT, 'student-styles.css'), 'utf8');
assert(/\.overview-mobile-grid \.staff-reference-row\s*\{[^}]*grid-template-columns: 1fr 1fr/.test(CSS), 'desktop: two equal columns');
assert(/@media \(max-width: 768px\)\s*\{\s*\.overview-mobile-grid \.staff-reference-row\s*\{[^}]*grid-template-columns: 1fr;[^}]*order: 0/.test(CSS),
    'mobile: one column, order 0');
assert(/\.amocrm-status-banner\.amocrm-status--linked\s*\{[^}]*#3b82f6/.test(CSS), 'linked banner is blue');
assert(/\.amocrm-status-banner\.amocrm-status--unlinked\s*\{[^}]*#cbd5e1/.test(CSS), 'unlinked banner is grey');

console.log('\n=== i18n keys in en / kk / ru ========================================\n');

const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
for (const key of ['amocrm.label', 'amocrm.notLinked', 'amocrm.copy', 'amocrm.copied']) {
    const count = (I18N.match(new RegExp(`"${key.replace('.', '\\.')}":`, 'g')) || []).length;
    assert(count === 3, `${key} defined in all three languages (found ${count})`);
}
for (const [key, val] of [['notLinked', 'Not linked'], ['notLinked', 'Не привязан'], ['notLinked', 'Байланыстырылмаған'],
                          ['copied', 'Скопировано'], ['copied', 'Көшірілді']]) {
    assert(I18N.includes(`"amocrm.${key}": "${val}"`), `amocrm.${key} = «${val}»`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
