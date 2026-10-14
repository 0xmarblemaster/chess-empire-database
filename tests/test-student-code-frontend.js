/**
 * Frontend support for the permanent Student ID (students.student_code, CE-00452).
 *
 *  - Profile: the REAL renderStudentCode() from student.js (vm) renders
 *    "ID: CE-00452" for every viewer (not gated behind isLoggedIn), nothing
 *    when the code is missing; i18n keys in en / kk / ru.
 *  - Search: studentCodeMatches() (supabase-data.js) + supabaseData.searchStudents
 *    run in a vm against a fake Supabase client — the code is OR-ed into the
 *    server filter only for digit queries and an exact code sorts first; the
 *    admin / attendance / home-page client filters match by code.
 *  - Data layer: every explicit students column list includes student_code,
 *    mappers expose studentCode, addStudent / updateStudent never send it.
 *  - Add-student double-submit: the REAL submitAddStudent() from admin-v2.js
 *    (vm) creates exactly one student for two rapid submits, disables the
 *    button while saving and re-enables it (and the guard) on error.
 *
 * Run: node tests/test-student-code-frontend.js
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
    const start = src.search(new RegExp(`(async )?function ${name}\\(`));
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
const DATA_SRC = read('supabase-data.js');
const ADMIN_SRC = read('admin-v2.js');
const APP_SRC = read('app.js');
const COACH_SRC = read('coach.js');
const I18N = read('i18n.js');

// ---------------------------------------------------------------------------
console.log('\n=== profile: renderStudentCode =======================================\n');
const EN = { 'studentCode.label': 'ID', 'studentCode.title': 'Permanent Student ID' };
const pctx = vm.createContext({ t: (k) => EN[k] });
vm.runInContext(['escapeHtmlSafe', 'renderStudentCode'].map((n) => extractFunction(STUDENT_SRC, n)).join('\n\n'), pctx);
const badge = pctx.renderStudentCode({ studentCode: 'CE-00452' });
assert(/>ID: <span class="student-code-value">CE-00452<\/span>/.test(badge), 'renders "ID: CE-00452"');
assert(badge.includes('class="student-code-badge"') && badge.includes('title="Permanent Student ID"'), 'badge class + tooltip');
assert(pctx.renderStudentCode({ studentCode: 'CE-123456' }).includes('CE-123456'), 'renders 6-digit codes in full');
for (const [label, v] of [['null', null], ['undefined', undefined], ["''", '']]) {
    assert(pctx.renderStudentCode({ studentCode: v }) === '', `${label} code → no markup (pre-migration safe)`);
}
assert(pctx.renderStudentCode({ studentCode: '<b>x</b>' }).includes('&lt;b&gt;'), 'escapes the value');
assert(/<h1 class="student-name">\$\{student\.firstName\} \$\{student\.lastName\}<\/h1>\s*\$\{renderStudentCode\(student\)\}/.test(STUDENT_SRC),
    'profile header shows the code right under the name');
assert(!/isLoggedIn\(\)\s*\?\s*renderStudentCode/.test(STUDENT_SRC), 'code is shown to all viewers (not gated by isLoggedIn)');
assert(!/editStudentCode|id="editStudentCode"|student_code/.test(STUDENT_SRC), 'edit form has no student_code field and never writes it');

console.log('\n=== i18n ==============================================================\n');
for (const key of ['studentCode.label', 'studentCode.title']) {
    const count = (I18N.match(new RegExp(`"${key.replace('.', '\\.')}":`, 'g')) || []).length;
    assert(count === 3, `${key} defined in en / kk / ru (found ${count})`);
}
for (const v of ['Permanent Student ID', 'Постоянный ID ученика', 'Оқушының тұрақты ID-і']) {
    assert(I18N.includes(`"studentCode.title": "${v}"`), `studentCode.title = «${v}»`);
}

// ---------------------------------------------------------------------------
console.log('\n=== data layer in a vm with a fake Supabase client ===================\n');
const calls = [];
let nextResult = { data: [], error: null };
function builder(table) {
    const rec = { table, ops: [] };
    calls.push(rec);
    const b = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'then') {
                return (res, rej) => Promise.resolve(nextResult).then(res, rej);
            }
            return (...args) => { rec.ops.push([prop, args]); return b; };
        },
    });
    return b;
}
const window = { supabaseClient: { from: builder } };
const dctx = vm.createContext({ window, console: { error() {}, log() {}, warn() {} } });
vm.runInContext(DATA_SRC, dctx);
const data = window.supabaseData;
const match = window.studentCodeMatches;

assert(typeof match === 'function', 'studentCodeMatches exported on window');
for (const q of ['CE-00452', 'ce-00452', ' CE-00452 ', '00452', '452', 'CE-004']) {
    assert(match('CE-00452', q) === true, `"${q}" matches CE-00452`);
}
for (const q of ['Ce', 'ce-', 'CE', '', '999']) {
    assert(match('CE-00452', q) === false, `"${q}" does not match CE-00452`);
}
assert(match(null, '00452') === false && match(undefined, '1') === false, 'missing code never matches');

(async () => {
    // searchStudents: digit query → student_code OR-ed in; exact code sorts first.
    calls.length = 0;
    nextResult = { error: null, data: [
        { id: 'b', student_code: 'CE-04520', first_name: 'Aaa', last_name: 'Aaa' },
        { id: 'a', student_code: 'CE-00452', first_name: 'Zed', last_name: 'Zed' },
    ] };
    const res = await data.searchStudents('ce-00452');
    const orArg = calls[0].ops.find(([op]) => op === 'or')[1][0];
    assert(orArg.includes('student_code.ilike.%ce-00452%'), 'digit query: server filter ORs student_code');
    assert(res[0].id === 'a' && res[0].studentCode === 'CE-00452', 'exact code sorts first + studentCode mapped');
    calls.length = 0;
    nextResult = { error: null, data: [] };
    await data.searchStudents('ivan');
    assert(!calls[0].ops.find(([op]) => op === 'or')[1][0].includes('student_code'), 'name query: student_code not searched');

    // getStudents: select + mapper.
    calls.length = 0;
    nextResult = { error: null, data: [{ id: 'x', student_code: 'CE-00007', first_name: 'A', last_name: 'B' }] };
    const all = await data.getStudents();
    const sel = calls[0].ops.find(([op]) => op === 'select')[1][0];
    assert(/\bstudent_code\b/.test(sel), 'getStudents selects student_code');
    assert(all[0].studentCode === 'CE-00007', 'getStudents maps studentCode');

    // addStudent / updateStudent: never send student_code; map it back.
    calls.length = 0;
    nextResult = { error: null, data: { id: 'n', student_code: 'CE-00999', first_name: 'N', last_name: 'M' } };
    const created = await data.addStudent({ firstName: 'N', lastName: 'M', studentCode: 'CE-00001', student_code: 'CE-00001' });
    const insertArg = calls[0].ops.find(([op]) => op === 'insert')[1][0][0];
    assert(!('student_code' in insertArg), 'addStudent never sends student_code (DB assigns it)');
    assert(created.studentCode === 'CE-00999', 'addStudent returns the DB-assigned studentCode');
    calls.length = 0;
    const updated = await data.updateStudent('n', { firstName: 'N', lastName: 'M', studentCode: 'CE-00001' });
    const upd = calls.find((c) => c.ops.some(([op]) => op === 'update'));
    assert(!('student_code' in upd.ops.find(([op]) => op === 'update')[1][0]), 'updateStudent never sends student_code (immutable)');
    assert(updated.studentCode === 'CE-00999', 'updateStudent maps studentCode');

    calls.length = 0;
    nextResult = { error: null, data: { id: 'p', student_code: 'CE-00031', first_name: 'P', last_name: 'Q' } };
    assert((await data.getStudentById('p')).studentCode === 'CE-00031', 'getStudentById maps studentCode (profile)');

    // ------------------------------------------------------------------
    console.log('\n=== explicit column lists ============================================\n');
    for (const [file, src] of [['supabase-data.js', DATA_SRC], ['supabase-data-tournaments.js', read('supabase-data-tournaments.js')], ['progress-ranking.js', read('progress-ranking.js')]]) {
        const lists = [
            ...[...src.matchAll(/\.from\('students'\)\s*\.select\((`[^`]*`|'[^']*')/g)].map((m) => m[1]),
            ...[...src.matchAll(/student:students\(([^)]*)\)/g)].map((m) => m[0]),
        ].filter((s) => /first_name/.test(s) && !/^[`']\s*\*/.test(s.trim()));
        assert(lists.length > 0, `${file}: has explicit students lists`);
        lists.forEach((s) => assert(/student_code/.test(s), `${file}: ${s.replace(/\s+/g, ' ').slice(0, 80)}`));
    }

    // ------------------------------------------------------------------
    console.log('\n=== client-side search + list rendering ==============================\n');
    const filterFn = extractFunction(ADMIN_SRC, 'getFilteredStudents');
    assert(/studentCodeMatches\(student\.studentCode, searchTerm\)/.test(filterFn), 'admin students table search matches code');
    assert((ADMIN_SRC.match(/studentCodeMatches\((s|student)\.studentCode, searchLower\)/g) || []).length === 2,
        'attendance search + add-to-calendar search match code');
    assert(/studentCodeMatches\(student\.studentCode, searchTerm\)/.test(APP_SRC), 'home page local fallback search matches code');
    assert(/<div class="student-code">\$\{student\.studentCode\}<\/div>/.test(extractFunction(ADMIN_SRC, 'loadStudents')), 'admin table row shows the code');
    assert(/\$\{student\.studentCode \? `\$\{student\.studentCode\} • ` : ''\}/.test(ADMIN_SRC), 'admin mobile card shows the code');
    assert(/<span class="student-code">\$\{student\.studentCode\}<\/span>/.test(COACH_SRC), 'coach student list shows the code');
    assert(/<span>\$\{student\.studentCode\}<\/span>/.test(APP_SRC), 'home search dropdown shows the code');

    // Evaluate the real getFilteredStudents.
    const fctx = vm.createContext({
        studentCodeMatches: match,
        currentFilters: { status: 'all', branch: 'all', coach: 'all', level: 'all', search: '00452' },
        students: [
            { firstName: 'Ann', lastName: 'Lee', studentCode: 'CE-00452', status: 'active' },
            { firstName: 'Bob', lastName: 'Ray', studentCode: 'CE-00453', status: 'active' },
        ],
    });
    vm.runInContext(filterFn, fctx);
    const ids = (s) => s.map((x) => x.studentCode);
    const viaCode = vm.runInContext('getFilteredStudents()', fctx);
    assert(JSON.stringify(ids(viaCode)) === '["CE-00452"]', `"00452" finds exactly CE-00452 (got ${JSON.stringify(ids(viaCode))})`);
    fctx.currentFilters.search = 'ce-00453';
    assert(JSON.stringify(ids(vm.runInContext('getFilteredStudents()', fctx))) === '["CE-00453"]', '"ce-00453" finds CE-00453');
    fctx.currentFilters.search = 'ann';
    assert(JSON.stringify(ids(vm.runInContext('getFilteredStudents()', fctx))) === '["CE-00452"]', 'name search unchanged');

    // ------------------------------------------------------------------
    console.log('\n=== add-student double-submit guard ==================================\n');
    const guardDecl = (ADMIN_SRC.match(/let addStudentInFlight = false;/) || [''])[0];
    assert(guardDecl !== '', 'module-level in-flight flag');
    const submitSrc = extractFunction(ADMIN_SRC, 'submitAddStudent');

    const button = { disabled: false };
    let createCalls = 0;
    let settle = null;
    const toasts = [];
    const form = { fields: {
        firstName: 'Ann', lastName: 'Lee', age: '9', branch: 'B1', coach: 'C One', status: 'active',
    } };
    const sctx = vm.createContext({
        window: { branches: [{ id: 'b1', name: 'B1' }], coaches: [{ id: 'c1', firstName: 'C', lastName: 'One' }], students: [] },
        document: {
            getElementById: (id) => (id === 'addStudentForm' ? form : null),
            querySelector: (sel) => (sel === 'button[type="submit"][form="addStudentForm"]' ? button : null),
        },
        FormData: function (f) { this.get = (k) => (k in f.fields ? f.fields[k] : null); },
        createStudent: () => { createCalls++; return new Promise((res, rej) => { settle = { res, rej }; }); },
        showToast: (msg, type) => toasts.push(type),
        t: (k) => k,
        closeAddStudentModal() {}, loadStudents() {}, updateStats() {}, populateFilterDropdowns() {},
        console: { error() {}, log() {} },
    });
    vm.runInContext(`${guardDecl}\n${submitSrc}`, sctx);
    const ev = () => ({ preventDefault() {} });

    const p1 = sctx.submitAddStudent(ev());
    const p2 = sctx.submitAddStudent(ev());
    assert(createCalls === 1, `two rapid submits → createStudent called once (got ${createCalls})`);
    assert(button.disabled === true, 'submit button disabled while saving');
    settle.res({ success: true, student: { id: 'new' } });
    await Promise.all([p1, p2]);
    assert(button.disabled === false, 'button re-enabled after success');
    assert(toasts.filter((x) => x === 'success').length === 1, 'exactly one success toast');

    const p3 = sctx.submitAddStudent(ev());
    assert(createCalls === 2, 'a later submit is allowed again');
    settle.rej(new Error('network down'));
    await p3;
    assert(button.disabled === false, 'button re-enabled on error');
    const p4 = sctx.submitAddStudent(ev());
    assert(createCalls === 3, 'guard released on error (retry possible)');
    settle.res({ success: true, student: { id: 'retry' } });
    await p4;

    form.fields.firstName = '';
    await sctx.submitAddStudent(ev());
    assert(createCalls === 3 && button.disabled === false, 'validation failure never locks the form');

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
