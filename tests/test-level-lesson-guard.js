/**
 * Student edit modal: Level can't be changed without also changing Lesson.
 *
 * Run: node tests/test-level-lesson-guard.js
 *
 * Covers:
 *   - validateLevelLessonChange truth table (up/down level, blanks, nulls, strings)
 *   - student.js saveStudentEdits + admin-v2.js submitEditStudent call the guard
 *     BEFORE any write (photo upload / updateStudent), toast + flag + return
 *   - Behavioural: submitEditStudent extracted and run in a vm sandbox — blocked
 *     save never calls updateStudent; level+lesson save does
 *   - guard script loaded before the page scripts in student.html + admin-v2.html
 *   - i18n: admin.form.levelNeedsLesson in en / kk / ru
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const STUDENT_JS = read('student.js');
const ADMIN_JS = read('admin-v2.js');
const STUDENT_HTML = read('student.html');
const ADMIN_HTML = read('admin-v2.html');
const I18N = read('i18n.js');
const { validateLevelLessonChange } = require('../level-lesson-guard.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function extractFunction(src, name) {
    const start = src.indexOf(`async function ${name}(`);
    if (start < 0) return null;
    let i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    return null;
}

console.log('\nvalidateLevelLessonChange');
const v = (o, n) => validateLevelLessonChange(o, n).ok;
assert(v({ level: 3, lesson: 40 }, { level: 3, lesson: 40 }) === true, 'nothing changed → ok');
assert(v({ level: 3, lesson: 40 }, { level: 3, lesson: 41 }) === true, 'only lesson changed → ok');
assert(v({ level: 3, lesson: 40 }, { level: 4, lesson: 1 }) === true, 'level + lesson changed → ok');
assert(v({ level: 3, lesson: 40 }, { level: 4, lesson: 40 }) === false, 'level up, lesson same → blocked');
assert(v({ level: 3, lesson: 40 }, { level: 2, lesson: 40 }) === false, 'level down, lesson same → blocked');
assert(v({ level: 3, lesson: 40 }, { level: '4', lesson: '40' }) === false, 'string inputs compared numerically');
assert(v({ level: '3', lesson: '40' }, { level: 3, lesson: 40 }) === true, 'string vs number same value → ok');
assert(v({ level: null, lesson: null }, { level: 2, lesson: null }) === false, 'null orig, level set, lesson blank → blocked');
assert(v({ level: null, lesson: null }, { level: 2, lesson: 1 }) === true, 'null orig, both set → ok');
assert(v({ level: undefined, lesson: undefined }, { level: '', lesson: '' }) === true, 'all blank → ok');
assert(validateLevelLessonChange({ level: 1, lesson: 5 }, { level: 2, lesson: 5 }).levelChanged === true, 'reports levelChanged');

console.log('\nstudent.js saveStudentEdits');
const saveFn = extractFunction(STUDENT_JS, 'saveStudentEdits');
assert(!!saveFn, 'saveStudentEdits found');
const sGuard = saveFn.indexOf('validateLevelLessonChange(');
assert(sGuard > 0, 'calls validateLevelLessonChange');
assert(sGuard < saveFn.indexOf('uploadStudentPhoto') && sGuard < saveFn.indexOf('updateStudent('), 'guard runs before photo upload / updateStudent');
assert(/student\.currentLevel[\s\S]{0,80}student\.currentLesson/.test(saveFn.slice(sGuard, sGuard + 300)), 'compares against stored student level/lesson');
assert(/levelNeedsLesson/.test(saveFn) && /flagLessonField\('editCurrentLesson'\)/.test(saveFn), 'toast + flags lesson field');

console.log('\nadmin-v2.js submitEditStudent');
const adminFn = extractFunction(ADMIN_JS, 'submitEditStudent');
assert(!!adminFn, 'submitEditStudent found');
const aGuard = adminFn.indexOf('validateLevelLessonChange(');
assert(aGuard > 0, 'calls validateLevelLessonChange');
assert(aGuard < adminFn.indexOf('uploadStudentPhoto') && aGuard < adminFn.indexOf('await updateStudent('), 'guard runs before photo upload / updateStudent');

console.log('\nadmin-v2.js submitEditStudent (sandboxed run)');
async function runAdmin(form) {
    const calls = { update: 0, toasts: [], flagged: 0 };
    const fd = new Map(Object.entries(form));
    const ctx = {
        console: { error() {}, log() {} },
        window: {
            students: [{ id: 's1', currentLevel: 3, currentLesson: 40, photoUrl: null }],
            branches: [], coaches: [], supabaseData: {},
        },
        FormData: function () { return { get: (k) => (fd.has(k) ? fd.get(k) : null) }; },
        document: { getElementById: (id) => (id === 'editStudentId' ? { value: 's1' } : { value: '' }) },
        t: (k) => k,
        calculateAge: () => null,
        showToast: (m, type) => calls.toasts.push([m, type]),
        validateLevelLessonChange,
        flagLessonField: () => { calls.flagged++; },
        updateStudent: async () => { calls.update++; return { success: false, error: 'stop' }; },
    };
    vm.createContext(ctx);
    vm.runInContext(adminFn + '\nthis.__fn = submitEditStudent;', ctx);
    await ctx.__fn({ preventDefault() {} });
    return calls;
}
(async () => {
    const base = { firstName: 'A', lastName: 'B' };
    let c = await runAdmin({ ...base, currentLevel: '4', currentLesson: '40' });
    assert(c.update === 0, 'level changed, lesson same → updateStudent NOT called');
    assert(c.toasts.some(([m, ty]) => m === 'admin.form.levelNeedsLesson' && ty === 'warning'), 'warning toast shown');
    assert(c.flagged === 1, 'lesson field flagged');

    c = await runAdmin({ ...base, currentLevel: '4', currentLesson: '' });
    assert(c.update === 0, 'level changed, lesson blank → blocked');

    c = await runAdmin({ ...base, currentLevel: '4', currentLesson: '1' });
    assert(c.update === 1, 'level + lesson changed → updateStudent called');

    c = await runAdmin({ ...base, currentLevel: '3', currentLesson: '41' });
    assert(c.update === 1, 'only lesson changed → updateStudent called');

    console.log('\nScript tags');
    for (const [name, html, page] of [['student.html', STUDENT_HTML, 'student.js'], ['admin-v2.html', ADMIN_HTML, 'admin-v2.js']]) {
        const g = html.indexOf('src="level-lesson-guard.js');
        assert(g > 0, `${name} loads level-lesson-guard.js`);
        assert(g < html.indexOf(`src="${page}`), `${name} loads guard before ${page}`);
    }

    console.log('\ni18n');
    const n = (I18N.match(/"admin\.form\.levelNeedsLesson":\s*"[^"]+"/g) || []).length;
    assert(n === 3, `admin.form.levelNeedsLesson defined in en/kk/ru (found ${n})`);
    assert(/"admin\.form\.levelNeedsLesson":\s*"[^"]*ступень[^"]*занятия/.test(I18N), 'ru message mentions ступень + занятия');

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
