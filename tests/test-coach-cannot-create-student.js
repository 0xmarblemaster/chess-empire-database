/**
 * Coaches can EDIT student cards but NOT CREATE them — admins (and API keys via
 * students-api, service role) only.
 *
 * Run: node tests/test-coach-cannot-create-student.js
 *
 * Covers:
 *   - canCreateStudents: admin → true, coach (even with can_edit_students) → false
 *   - "Add Student" buttons (sidebar + mobile nav) hidden in markup and only
 *     revealed by updateMenuVisibility for admins
 *   - addNewStudent guard in admin-v2.js and crud-handlers.js (toast + return)
 *   - Ratings CSV import: "create new student" option only offered to admins,
 *     resolveAmbiguousRow / confirmNewStudentRow guarded, importCSVRatings drops
 *     pending new-student rows for coaches so addStudent() is never called
 *   - RLS 42501 on insert → friendly toast; createStudent forwards error.code
 *   - i18n: students.createAdminOnly in en / ru / kk
 *   - Migration 105 (+ verify) content checks
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ADMIN_JS = read('admin-v2.js');
const CRUD_HANDLERS = read('crud-handlers.js');
const CRUD = read('crud.js');
const HTML = read('admin-v2.html');
const I18N = read('i18n.js');
const MIG = read('supabase/migrations/105_students_insert_admin_only.sql');
const VERIFY = read('supabase/migrations/105_students_insert_admin_only_verify.sql');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Pull a top-level `[async] function name(...) { ... }` out of a source file.
function extractFunction(src, name) {
    const m = new RegExp(`^(async )?function ${name}\\(`, 'm').exec(src);
    if (!m) throw new Error(`function ${name} not found`);
    let i = src.indexOf('{', m.index);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(m.index, i + 1);
}

const ADMIN = { role: 'admin' };
const COACH = { role: 'coach', can_edit_students: true, coachId: 'c1' };

function fakeEl() {
    return {
        style: {}, value: '', innerHTML: '', textContent: '', disabled: false,
        dataset: {},
        classList: { add() {}, remove() {} },
        reset() {}, addEventListener() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
        closest() { return null; },
    };
}

function makeCtx(role) {
    const els = {};
    const toasts = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        window: { supabaseAuth: { getCurrentUserRole: () => role } },
        document: { getElementById: (id) => (els[id] = els[id] || fakeEl()) },
        sessionStorage: { getItem: () => null },
        showToast: (msg, type) => toasts.push({ msg, type }),
        t: (k) => k,
        setTimeout() {},
        lucide: { createIcons() {} },
        populateBranchesDropdown() {},
        els, toasts,
    };
    return vm.createContext(ctx);
}

const ADMIN_FNS = ['canCreateStudents', 'updateMenuVisibility', 'addNewStudent',
    'resolveAmbiguousRow', 'confirmNewStudentRow', 'importCSVRatings']
    .map(n => extractFunction(ADMIN_JS, n)).join('\n');

function loadAdmin(role) {
    const ctx = makeCtx(role);
    vm.runInContext(ADMIN_FNS, ctx);
    return ctx;
}

console.log('\n=== canCreateStudents ==================================================\n');
assert(loadAdmin(ADMIN).canCreateStudents() === true, 'admin → can create');
assert(loadAdmin(COACH).canCreateStudents() === false, 'coach with can_edit_students → cannot create');
assert(loadAdmin(null).canCreateStudents() === false, 'no role → cannot create');

console.log('\n=== Add Student buttons ================================================\n');
assert(/<button id="addStudentBtn"[^>]*onclick="addNewStudent\(\)"[^>]*style="display: none;"/.test(HTML),
    'sidebar Add Student button has id and is hidden by default');
assert(/<button id="mobileAddStudentBtn"[^>]*onclick="addNewStudent\(\)"[^>]*style="display: none;"/.test(HTML),
    'mobile nav Add Student button has id and is hidden by default');
assert((HTML.match(/onclick="addNewStudent\(\)"/g) || []).length === 2, 'exactly two addNewStudent buttons');
{
    const ctx = loadAdmin(ADMIN);
    ctx.updateMenuVisibility();
    assert(ctx.els.addStudentBtn.style.display === '', 'admin → sidebar button shown');
    assert(ctx.els.mobileAddStudentBtn.style.display === '', 'admin → mobile button shown');
}
{
    const ctx = loadAdmin(COACH);
    ctx.updateMenuVisibility();
    assert(ctx.els.addStudentBtn.style.display === 'none', 'coach → sidebar button hidden');
    assert(ctx.els.mobileAddStudentBtn.style.display === 'none', 'coach → mobile button hidden');
}

console.log('\n=== addNewStudent guard (admin-v2.js) ==================================\n');
{
    const ctx = loadAdmin(COACH);
    ctx.addNewStudent();
    assert(ctx.toasts.length === 1 && ctx.toasts[0].msg === 'students.createAdminOnly', 'coach → admin-only toast');
    assert(!ctx.els.addStudentModal, 'coach → modal never touched');
}
{
    const ctx = loadAdmin(ADMIN);
    const added = [];
    ctx.document.getElementById = (id) => {
        const el = ctx.els[id] = ctx.els[id] || fakeEl();
        if (id === 'addStudentModal') el.classList = { add: (c) => added.push(c), remove() {} };
        return el;
    };
    ctx.addNewStudent();
    assert(ctx.toasts.length === 0 && added.includes('active'), 'admin → modal opens');
}

console.log('\n=== addNewStudent guard (crud-handlers.js) =============================\n');
{
    const ctx = makeCtx(COACH);
    vm.runInContext(extractFunction(CRUD_HANDLERS, 'addNewStudent'), ctx);
    ctx.addNewStudent();
    assert(ctx.toasts.length === 1 && ctx.toasts[0].msg === 'students.createAdminOnly', 'coach → admin-only toast');
    assert(!ctx.els.studentModalTitle, 'coach → student modal never touched');
}
{
    const ctx = makeCtx(ADMIN);
    let opened = null;
    Object.assign(ctx, { branches: [], updateStudentAgeDisplay() {}, openModal: (id) => { opened = id; } });
    ctx.document.createElement = fakeEl;
    vm.runInContext(extractFunction(CRUD_HANDLERS, 'addNewStudent'), ctx);
    ctx.addNewStudent();
    assert(opened === 'studentModal' && ctx.toasts.length === 0, 'admin → student modal opens');
}

console.log('\n=== Ratings CSV import ================================================\n');
assert(/if \(canCreateStudents\(\)\) \{\s*options \+= `<option value="__new__">/.test(ADMIN_JS),
    '"create new student" option only rendered for admins');
assert(ADMIN_JS.includes(`options += \`<option value="__skip__">`), 'skip option still offered to everyone');
{
    const ctx = loadAdmin(COACH);
    const sel = fakeEl();
    sel.value = '__new__';
    sel.dataset = { rowIndex: '3', rowName: 'Ivan' };
    ctx.renderNewStudentFormHtml = () => { throw new Error('form rendered for coach'); };
    ctx.resolveAmbiguousRow(sel);
    assert(sel.value === '' && ctx.toasts[0].msg === 'students.createAdminOnly', 'resolveAmbiguousRow __new__ blocked for coach');
}
{
    const ctx = loadAdmin(COACH);
    ctx.csvParsedData = [];
    ctx.confirmNewStudentRow({ closest() { throw new Error('form read for coach'); } }, 0);
    assert(ctx.csvParsedData.length === 0 && ctx.toasts[0].msg === 'students.createAdminOnly', 'confirmNewStudentRow blocked for coach');
}

async function runImport(role, rows) {
    const ctx = loadAdmin(role);
    vm.runInContext(`var csvParsedData = ${JSON.stringify(rows)}; var csvImportKind = 'rating';
        var committed = null; function commitRatingUpload() { committed = csvParsedData; }
        function commitTournamentUpload() {}`, ctx);
    await ctx.importCSVRatings();
    return ctx;
}
const ROWS = [
    { studentId: 's1', rating: 1200 },
    { __pendingStudent: { firstName: 'New', lastName: 'Kid', branchId: 'b1' }, studentId: null, rating: 1100 },
];

(async () => {
    {
        const ctx = await runImport(COACH, ROWS);
        assert(ctx.committed.length === 1 && ctx.committed[0].studentId === 's1', 'coach → pending new-student rows dropped before commit');
        assert(ctx.committed.every(r => !r.__pendingStudent), 'coach → no __pendingStudent reaches addStudent()');
        assert(ctx.toasts[0].msg === 'students.createAdminOnly', 'coach → admin-only toast on import');
    }
    {
        const ctx = await runImport(COACH, [ROWS[1]]);
        assert(ctx.committed === null, 'coach → nothing left to import → no commit');
    }
    {
        const ctx = await runImport(ADMIN, ROWS);
        assert(ctx.committed.length === 2 && ctx.toasts.length === 0, 'admin → pending rows kept');
    }

    console.log('\n=== RLS 42501 → friendly toast =========================================\n');
    assert(/return \{ success: false, error: error\.message, code: error\.code \}/.test(CRUD), 'createStudent forwards error.code');
    const submitSrc = extractFunction(ADMIN_JS, 'submitAddStudent');
    assert(/err\.code = result\.code;/.test(submitSrc), 'submitAddStudent carries result.code onto the error');
    assert(submitSrc.includes(`error.code === '42501' ? t('students.createAdminOnly')`), 'submitAddStudent maps 42501 to students.createAdminOnly');

    console.log('\n=== i18n ===============================================================\n');
    const dictStart = I18N.indexOf('const translations = {');
    const dictEnd = I18N.indexOf('\n};', dictStart) + 3;
    const translations = vm.runInNewContext(`(${I18N.slice(dictStart + 'const translations = '.length, dictEnd - 1)})`);
    for (const lang of ['en', 'ru', 'kk']) {
        const v = translations[lang]['students.createAdminOnly'];
        assert(typeof v === 'string' && v.length > 0, `${lang}: students.createAdminOnly present`);
    }
    assert(translations.ru['students.createAdminOnly'] !== translations.en['students.createAdminOnly'], 'ru translated');
    assert(translations.kk['students.createAdminOnly'] !== translations.en['students.createAdminOnly'], 'kk translated');

    console.log('\n=== migration 105 ======================================================\n');
    const sql = MIG.replace(/--.*$/gm, '');
    assert(/BEGIN;[\s\S]*COMMIT;/.test(sql), 'wrapped in BEGIN/COMMIT');
    assert(/DROP POLICY IF EXISTS "Authorized users can insert students" ON students;/.test(sql), 'drops insert policy idempotently');
    assert(/CREATE POLICY "Authorized users can insert students"\s+ON students FOR INSERT\s+TO authenticated\s+WITH CHECK/.test(sql),
        'recreates insert policy FOR INSERT TO authenticated');
    assert(/ur\.user_id = auth\.uid\(\)/.test(sql) && /ur\.role = 'admin'/.test(sql), 'WITH CHECK requires role = admin');
    assert(!/can_edit_students/.test(sql), 'no can_edit_students in executable SQL');
    assert(!/update students|delete students|FOR UPDATE|FOR DELETE/i.test(sql), 'update/delete policies untouched');
    assert(!/ALTER TABLE|DROP COLUMN/i.test(sql), 'flag / columns untouched');
    assert(!/\b(INSERT INTO|UPDATE|DELETE FROM|CREATE|DROP|ALTER)\b/i.test(VERIFY.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")),
        'verify script is read-only');
    assert(/with_check NOT LIKE '%can_edit_students%'/.test(VERIFY), 'verify: insert check excludes can_edit_students');
    assert(/Authorized users can update students/.test(VERIFY) && /Authorized users can delete students/.test(VERIFY),
        'verify: update/delete policies still checked');

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
})();
