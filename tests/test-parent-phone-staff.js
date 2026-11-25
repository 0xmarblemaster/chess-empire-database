/**
 * Tests for the staff-only parent phone tile on the student profile (option A)
 * and for migration 107 (anon may not read private students columns).
 *
 * Extracts the REAL render helpers from student.js / constants.js (brace
 * matching on the function name) and evaluates them in a vm context, loads
 * supabase-data.js with a fake Supabase client for studentColumnsForSession,
 * plus source-contract checks on anon-reachable students queries, the
 * migration files and the i18n dictionaries.
 *
 * Run: node tests/test-parent-phone-staff.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`function ${name} not found`);
    const open = src.indexOf('{', src.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
}

const STUDENT_SRC = read('student.js');
const CONSTANTS_SRC = read('constants.js');
const DATA_SRC = read('supabase-data.js');
const I18N = read('i18n.js');

const PUBLIC = ['id', 'first_name', 'last_name', 'age', 'date_of_birth', 'gender', 'photo_url',
    'branch_id', 'coach_id', 'razryad', 'status', 'current_level', 'current_lesson', 'total_lessons',
    'created_at', 'updated_at', 'chesster_registered_at', 'student_code'];
const PRIVATE = ['parent_name', 'parent_phone', 'parent_email', 'chesster_email', 'amocrm_customer_id'];
const PRIVATE_RE = new RegExp(`\\b(${PRIVATE.join('|')})\\b`);

const EN = {
    'chesster.appStatus': 'Chesster App',
    'chesster.registered': 'Registered',
    'chesster.notRegistered': 'Not registered',
    'amocrm.label': 'amoCRM ID',
    'amocrm.notLinked': 'Not linked',
    'amocrm.copy': 'Copy',
    'amocrm.copied': 'Copied',
    'amocrm.phoneLabel': 'Parent phone',
    'amocrm.call': 'Call',
    'amocrm.whatsapp': 'WhatsApp',
    'amocrm.noPhone': 'No phone'
};

const ctx = vm.createContext({ t: (key) => EN[key], sessionStorage: { getItem: () => null } });
vm.runInContext([
    ...['formatPhoneDisplay', 'phoneDigits'].map((n) => extractFunction(CONSTANTS_SRC, n)),
    ...['escapeHtmlSafe', 'renderChessterStatusBox', 'renderAmocrmIdBox', 'renderParentPhoneBox', 'renderStaffReferenceRow']
        .map((n) => extractFunction(STUDENT_SRC, n)),
].join('\n\n'), ctx);

console.log('\n=== formatPhoneDisplay / phoneDigits =================================\n');

assert(ctx.formatPhoneDisplay('+77012345678') === '+7 701 234 56 78', '+77012345678 → +7 701 234 56 78');
for (const v of ['87012345678', '8 701 234 56 78', '+7701234567', '+770123456789', 'call mom', '+1 555 0100']) {
    assert(ctx.formatPhoneDisplay(v) === v, `"${v}" returned unchanged`);
}
assert(ctx.formatPhoneDisplay(null) === '' && ctx.formatPhoneDisplay(undefined) === '', 'null/undefined → ""');
assert(ctx.phoneDigits('+7 (701) 234-56-78') === '77012345678', 'phoneDigits strips non-digits');
assert(ctx.phoneDigits(null) === '', 'phoneDigits(null) → ""');
assert(/window\.formatPhoneDisplay = formatPhoneDisplay;/.test(CONSTANTS_SRC)
    && /window\.phoneDigits = phoneDigits;/.test(CONSTANTS_SRC), 'helpers exported on window from constants.js');
assert(!/function (formatPhoneDisplay|phoneDigits)\(/.test(STUDENT_SRC), 'helpers not redeclared in student.js');

console.log('\n=== renderParentPhoneBox =============================================\n');

const linked = ctx.renderParentPhoneBox({ parentPhone: '+77012345678' });
assert(linked.includes('Parent phone') && linked.includes('data-lucide="phone"'), 'label + phone icon');
assert(linked.includes('+7 701 234 56 78'), 'shows formatted number');
assert(linked.includes('href="tel:+77012345678"'), 'Call → tel:+77012345678');
assert(linked.includes('href="https://wa.me/77012345678"'), 'WhatsApp → https://wa.me/77012345678');
assert(/wa\.me\/77012345678" target="_blank" rel="noopener noreferrer"/.test(linked), 'WhatsApp opens in new tab with rel="noopener noreferrer"');
assert(linked.includes('>Call<') && linked.includes('>WhatsApp<'), 'button labels');
assert(/class="parent-phone-copy" data-phone="\+77012345678"/.test(linked), 'copy button carries raw value in data-phone');
assert(/data-lucide="copy"/.test(linked) && /aria-label="Copy"/.test(linked) && /title="Copy"/.test(linked), 'copy button is icon-only with aria-label/title');
assert(!/onclick/i.test(linked), 'no inline JS');
assert(linked.includes('parent-phone--linked') && !linked.includes('parent-phone--empty'), 'linked state class');

const raw = ctx.renderParentPhoneBox({ parentPhone: '8 (701) 234-56-78' });
assert(raw.includes('8 (701) 234-56-78'), 'non-E.164 value shown as-is');
assert(raw.includes('href="tel:+87012345678"') && raw.includes('wa.me/87012345678'), 'buttons use digits from the raw value');

const short = ctx.renderParentPhoneBox({ parentPhone: '12-34' });
assert(short.includes('12-34') && !short.includes('tel:') && !short.includes('wa.me') && !short.includes('parent-phone-copy'),
    'fewer than 7 digits → text only, no buttons');

for (const [label, value] of [['null', null], ['undefined', undefined], ["''", '']]) {
    const html = ctx.renderParentPhoneBox({ parentPhone: value });
    assert(html.includes('No phone') && html.includes('parent-phone--empty'), `${label}: "No phone" muted state`);
    assert(html.includes('data-lucide="phone-off"'), `${label}: phone-off icon`);
    assert(!html.includes('tel:') && !html.includes('wa.me') && !html.includes('parent-phone-copy'), `${label}: no buttons`);
    assert(!/undefined|null/.test(html), `${label}: no "undefined"/"null" text`);
}
assert(ctx.renderParentPhoneBox(null).includes('No phone'), 'null student → "No phone"');

const xss = ctx.renderParentPhoneBox({ parentPhone: '<img src=x onerror=alert(1)>"1234567' });
assert(!xss.includes('<img') && xss.includes('&lt;img'), 'HTML in value is escaped');
assert(!/data-phone="[^"]*"1234567"/.test(xss) && xss.includes('&quot;1234567'), 'quotes escaped inside data-phone');

console.log('\n=== renderStaffReferenceRow + gate ===================================\n');

const row = ctx.renderStaffReferenceRow({ amocrmCustomerId: 882213, parentPhone: '+77012345678' });
const iAmo = row.indexOf('amocrm-status-banner');
const iPhone = row.indexOf('parent-phone-banner');
assert(row.indexOf('chesster-status--') < iAmo && iAmo > 0 && iPhone > iAmo, 'phone box comes after the amoCRM box');
assert(/isLoggedIn\(\)\s*\?\s*renderStaffReferenceRow\(student\)\s*:\s*''/.test(STUDENT_SRC), 'isLoggedIn() gate on the staff row is still present');
assert(/closest\('\.amocrm-copy, \.parent-phone-copy'\)/.test(STUDENT_SRC) && /button\.dataset\.phone/.test(STUDENT_SRC),
    'delegated copy handler covers .parent-phone-copy via data-phone');

console.log('\n=== CSS ===============================================================\n');
const CSS = read('student-styles.css');
assert(/\.staff-reference-row \{[^}]*grid-template-columns: 1fr 1fr 1\.25fr;/.test(CSS), 'staff row is 3 columns on desktop');
assert(/@media \(max-width: 1024px\) \{[^@]*grid-template-columns: 1fr 1fr;[^@]*\.parent-phone-banner \{\s*grid-column: 1 \/ -1;/.test(CSS),
    '≤1024px: 2 columns, phone tile spans both');
assert(/\.parent-phone-call \{\s*background: #1d4ed8;/.test(CSS) && /\.parent-phone-whatsapp \{\s*background: #25d366;/.test(CSS), 'Call / WhatsApp colours');
assert(/\.parent-phone-copy \{[^}]*border: 1px solid #bfdbfe;/.test(CSS), 'copy button border like .amocrm-copy');

console.log('\n=== studentColumnsForSession =========================================\n');

const window = { supabaseClient: {} };
vm.runInContext(DATA_SRC, vm.createContext({ window, console: { error() {}, log() {}, warn() {} } }));
const pubList = window.STUDENT_PUBLIC_COLUMNS.split(',').map((s) => s.trim());
const staffList = window.STUDENT_STAFF_COLUMNS.split(',').map((s) => s.trim());
assert(JSON.stringify([...pubList].sort()) === JSON.stringify([...PUBLIC].sort()), `STUDENT_PUBLIC_COLUMNS = the 18 public columns (got ${pubList.length})`);
assert(JSON.stringify([...staffList].sort()) === JSON.stringify([...PUBLIC, ...PRIVATE].sort()), 'STUDENT_STAFF_COLUMNS = public + 5 private');

(async () => {
    window.supabaseClient = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } }, error: null }) } };
    assert(await window.studentColumnsForSession() === window.STUDENT_STAFF_COLUMNS, 'with session → STAFF');
    window.supabaseClient = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } };
    assert(await window.studentColumnsForSession() === window.STUDENT_PUBLIC_COLUMNS, 'without session → PUBLIC');
    window.supabaseClient = { auth: { getSession: async () => { throw new Error('boom'); } } };
    assert(await window.studentColumnsForSession() === window.STUDENT_PUBLIC_COLUMNS, 'getSession throws → PUBLIC');
    window.supabaseClient = {};
    assert(await window.studentColumnsForSession() === window.STUDENT_PUBLIC_COLUMNS, 'no auth object → PUBLIC');

    // Mappers: absent private columns → null (anon row shape).
    const selects = [];
    const anonRow = { id: 's', first_name: 'A', last_name: 'B', student_code: 'CE-00001' };
    function builder() {
        const b = new Proxy({}, {
            get(_t, prop) {
                if (prop === 'then') return (res) => res({ data: b._single ? anonRow : [anonRow], error: null });
                if (prop === '_single') return selects._single;
                return (...args) => {
                    if (prop === 'select') selects.push(args[0]);
                    if (prop === 'single') selects._single = true;
                    return b;
                };
            },
        });
        return b;
    }
    window.supabaseClient = { from: () => { selects._single = false; return builder(); }, auth: { getSession: async () => ({ data: { session: null } }) } };
    const one = await window.supabaseData.getStudentById('s');
    for (const k of ['parentName', 'parentPhone', 'parentEmail', 'chessterEmail', 'amocrmCustomerId']) {
        assert(one[k] === null, `getStudentById: ${k} = null when column absent`);
    }
    assert(!PRIVATE_RE.test(selects[0]) && !/\*/.test(selects[0]), 'getStudentById (anon): select has no private column and no *');
    const all = await window.supabaseData.getStudents();
    for (const k of ['parentName', 'parentPhone', 'parentEmail', 'amocrmCustomerId']) {
        assert(all[0][k] === null, `getStudents: ${k} = null when column absent`);
    }
    assert(!PRIVATE_RE.test(selects[1]) && !/\*/.test(selects[1]), 'getStudents (anon): select has no private column and no *');
    await window.supabaseData.searchStudents('a');
    assert(!PRIVATE_RE.test(selects[2]) && !/\*/.test(selects[2]), 'searchStudents (anon): select has no private column and no *');

    console.log('\n=== static scan: anon-reachable students queries ======================\n');

    const FILES = ['supabase-data.js', 'student-stats.html', 'student.js', 'progress-ranking.js', 'tournaments.js',
        'ratings.js', 'app.js', 'index.html', 'branch.js', 'branch.html', 'coach.js', 'coach.html', 'student.html',
        'supabase-data-tournaments.js'].filter((f) => fs.existsSync(path.join(ROOT, f)));
    let scanned = 0;
    for (const file of FILES) {
        const src = read(file);
        for (const m of src.matchAll(/\.from\(\s*['"`]students['"`]\s*\)/g)) {
            const tail = src.slice(m.index + m[0].length);
            const end = tail.search(/;|\.from\(/);
            const chain = end === -1 ? tail : tail.slice(0, end);
            const sel = chain.match(/\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")?/);
            if (!sel) continue; // delete / update without returning
            const line = src.slice(0, m.index).split('\n').length;
            // insert/update(...).select(...) run authenticated only (RLS) — allowed.
            if (/\.(insert|update)\(/.test(chain.slice(0, sel.index))) continue;
            scanned++;
            const arg = sel[1] || '';
            assert(arg !== '' && !/^[`'"]\s*\*/.test(arg), `${file}:${line} students select is not * / no-arg`);
            assert(!PRIVATE_RE.test(arg), `${file}:${line} students select names no private column`);
        }
        for (const m of src.matchAll(/\bstudents(?:![a-z_]+)?\(([^)]*)\)/g)) {
            if (/^\s*\*/.test(m[1])) assert(false, `${file}: embedded students(*)`);
            else if (PRIVATE_RE.test(m[1])) assert(false, `${file}: embedded students(...) names a private column`);
        }
    }
    assert(scanned >= 10, `scanned ${scanned} anon-reachable students selects`);
    const stats = read('student-stats.html');
    const statsCols = (stats.match(/const STUDENT_PUBLIC_COLUMNS = ((?:'[^']*'\s*\+?\s*)+);/) || [])[1] || '';
    assert(statsCols.replace(/'\s*\+\s*'/g, '').replace(/'/g, '').split(',').map((s) => s.trim()).sort().join() === [...PUBLIC].sort().join(),
        'student-stats.html STUDENT_PUBLIC_COLUMNS matches the 18 public columns');
    assert(/\.select\(`\$\{STUDENT_PUBLIC_COLUMNS\}, branches\(name\)/.test(stats), 'student-stats.html selects the public column list');

    console.log('\n=== migration 107 =====================================================\n');

    const MIG = read('supabase/migrations/107_students_private_columns_anon.sql');
    const code = MIG.replace(/--[^\n]*/g, '');
    assert(/REVOKE SELECT ON public\.students FROM anon;/.test(code), 'revokes table-level SELECT from anon');
    const grant = code.match(/GRANT SELECT \(([^)]*)\) ON public\.students TO anon;/);
    const granted = grant ? grant[1].split(',').map((s) => s.trim()).sort() : [];
    assert(JSON.stringify(granted) === JSON.stringify([...PUBLIC].sort()), `grants exactly the 18 public columns (got ${granted.length})`);
    assert(!PRIVATE_RE.test(grant ? grant[1] : ''), 'grants none of the 5 private columns');
    assert(!/\bDROP\b|\bALTER\b|\bauthenticated\b/i.test(code), 'touches nothing else (no DROP/ALTER/authenticated)');
    const VERIFY = read('supabase/migrations/107_students_private_columns_anon_verify.sql');
    PRIVATE.forEach((c) => assert(VERIFY.includes(`'${c}'`), `verify references private column ${c}`));
    assert(/has_column_privilege\('anon', 'public\.students', col, 'SELECT'\)/.test(VERIFY)
        && /has_column_privilege\('authenticated'/.test(VERIFY), 'verify checks anon + authenticated column privileges');
    assert(!/\b(INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/.test(VERIFY.replace(/--[^\n]*/g, '')), 'verify is read-only');

    console.log('\n=== i18n ==============================================================\n');
    const KEYS = {
        'amocrm.phoneLabel': ['Parent phone', 'Ата-ананың телефоны', 'Телефон родителя'],
        'amocrm.call': ['Call', 'Қоңырау шалу', 'Позвонить'],
        'amocrm.whatsapp': ['WhatsApp', 'WhatsApp', 'WhatsApp'],
        'amocrm.noPhone': ['No phone', 'телефон жоқ', 'нет телефона'],
    };
    for (const [key, values] of Object.entries(KEYS)) {
        const found = [...I18N.matchAll(new RegExp(`"${key.replace('.', '\\.')}": "([^"]*)"`, 'g'))].map((m) => m[1]);
        assert(JSON.stringify(found) === JSON.stringify(values), `${key} in en / kk / ru = ${values.join(' / ')}`);
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
