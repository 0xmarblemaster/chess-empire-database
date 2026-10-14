/**
 * Tests for the amoCRM ID linked / not-linked filter on the admin student list.
 *
 * Extracts the REAL filter helpers from admin-v2.js (brace matching on the
 * function name) and evaluates them in a vm context with stubbed `students`,
 * `currentFilters`, `t` and `document`, plus source-contract checks on
 * supabase-data.js, admin-v2.html and the i18n dictionaries.
 *
 * Run: node tests/test-admin-amocrm-filter.js
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

const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

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

const FUNCS = ['isAmocrmLinked', 'getFilteredStudents',
    'getAmocrmFilterCounts', 'updateAmocrmFilterLabels', 'resetFilters'];

function makeContext(students) {
    const elements = {};
    const el = (id) => (elements[id] = elements[id] || { value: 'x' });
    const options = { linked: { textContent: '' }, unlinked: { textContent: '' } };
    elements.amocrmFilter = {
        value: 'linked',
        querySelector: (sel) => options[sel.match(/value="(\w+)"/)[1]]
    };
    const ctx = {
        students,
        currentFilters: { status: 'all', branch: 'all', coach: 'all', level: 'all', amocrm: 'all', search: '' },
        t: (key, params) => `${key}:${params.count}`,
        document: { getElementById: el },
        loadStudents: () => { ctx.loadCalls++; },
        loadCalls: 0,
        options,
        elements
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(DATA_SRC, 'studentCodeMatches'), ctx);
    vm.runInContext(FUNCS.map(n => extractFunction(ADMIN_SRC, n)).join('\n'), ctx);
    // `currentFilters` is reassigned by resetFilters(); expose a getter on the context global
    vm.runInContext('this.getFilters = () => currentFilters;', ctx);
    return ctx;
}

const S = (id, amocrmCustomerId, branch = 'A', extra = {}) =>
    ({ id, firstName: `F${id}`, lastName: `L${id}`, status: 'active', branch, coach: 'C', currentLevel: 1, studentCode: null, amocrmCustomerId, ...extra });

console.log('\nisAmocrmLinked');
{
    const ctx = makeContext([]);
    const linked = (v) => ctx.isAmocrmLinked({ amocrmCustomerId: v });
    for (const v of [0, '0', '', null, undefined, -5, '-5', NaN, 'abc', 1.5, '  ']) {
        assert(linked(v) === false, `${JSON.stringify(v) ?? String(v)} → not linked`);
    }
    assert(linked(12345) === true, '12345 → linked');
    assert(linked('12345') === true, "'12345' → linked");
    assert(ctx.isAmocrmLinked({}) === false, 'missing field → not linked');
    assert(ctx.isAmocrmLinked(null) === false, 'null student → not linked');
}

console.log('\ngetFilteredStudents');
{
    const students = [S(1, 12345, 'A'), S(2, '777', 'B'), S(3, null, 'A'), S(4, 0, 'B'), S(5, '', 'A'), S(6, undefined, 'A')];
    const ctx = makeContext(students);
    const ids = () => ctx.getFilteredStudents().map(s => s.id).join(',');

    assert(ids() === '1,2,3,4,5,6', 'all → every student');
    ctx.currentFilters.amocrm = 'linked';
    assert(ids() === '1,2', 'linked → only positive IDs');
    ctx.currentFilters.amocrm = 'unlinked';
    assert(ids() === '3,4,5,6', 'unlinked → null/0/empty/undefined');

    ctx.currentFilters.branch = 'A';
    assert(ids() === '3,5,6', 'unlinked + branch A');
    ctx.currentFilters.amocrm = 'linked';
    assert(ids() === '1', 'linked + branch A');
    assert(ctx.getFilteredStudents(true).map(s => s.id).join(',') === '1,3,5,6', 'ignoreAmocrm keeps other filters only');
}

console.log('\ngetAmocrmFilterCounts / updateAmocrmFilterLabels');
{
    const students = [S(1, 12345, 'A'), S(2, '777', 'B'), S(3, null, 'A'), S(4, 0, 'B'), S(5, '', 'A', { status: 'frozen' })];
    const ctx = makeContext(students);
    let c = ctx.getAmocrmFilterCounts();
    assert(c.linked === 2 && c.unlinked === 3, 'no filters → 2 linked / 3 unlinked');

    ctx.currentFilters.amocrm = 'linked';
    c = ctx.getAmocrmFilterCounts();
    assert(c.linked === 2 && c.unlinked === 3, 'amocrm filter itself is ignored by counts');

    ctx.currentFilters.branch = 'A';
    c = ctx.getAmocrmFilterCounts();
    assert(c.linked === 1 && c.unlinked === 2, 'branch filter respected');

    ctx.currentFilters.status = 'active';
    c = ctx.getAmocrmFilterCounts();
    assert(c.linked === 1 && c.unlinked === 1, 'status filter respected');

    ctx.currentFilters.search = 'f3';
    c = ctx.getAmocrmFilterCounts();
    assert(c.linked === 0 && c.unlinked === 1, 'search filter respected');

    ctx.updateAmocrmFilterLabels();
    assert(ctx.options.linked.textContent === 'admin.filters.amocrm.linkedCount:0', 'linked option label gets count');
    assert(ctx.options.unlinked.textContent === 'admin.filters.amocrm.unlinkedCount:1', 'unlinked option label gets count');
}

console.log('\nresetFilters');
{
    const ctx = makeContext([]);
    ctx.currentFilters.amocrm = 'unlinked';
    ctx.resetFilters();
    assert(ctx.getFilters().amocrm === 'all', 'currentFilters.amocrm reset to all');
    assert(ctx.elements.amocrmFilter.value === 'all', '#amocrmFilter value reset to all');
    assert(ctx.loadCalls === 1, 'reloads list');
}

console.log('\nadmin-v2.js wiring');
{
    assert(/let currentFilters = \{[^}]*amocrm: 'all'/.test(ADMIN_SRC), "currentFilters defaults amocrm: 'all'");
    assert(/getElementById\('amocrmFilter'\)\.addEventListener\('change'[\s\S]{0,120}currentFilters\.amocrm = e\.target\.value;\s*loadStudents\(\);/.test(ADMIN_SRC),
        'change listener updates currentFilters.amocrm and reloads');
    assert(/updateResultCount\(filteredStudents\.length\);\s*updateAmocrmFilterLabels\(\);/.test(extractFunction(ADMIN_SRC, 'loadStudents')),
        'loadStudents refreshes counts');
    assert(/applyTranslations\(\);[\s\S]*updateAmocrmFilterLabels\(\);/.test(extractFunction(ADMIN_SRC, 'applyAdminTranslations')),
        'applyAdminTranslations refreshes counts after applyTranslations');
}

console.log('\nsupabase-data.js getStudents');
{
    const fn = DATA_SRC.slice(DATA_SRC.indexOf('async getStudents()'), DATA_SRC.indexOf('async getStudentById('));
    const select = fn.match(/\.select\(`([\s\S]*?)`\)/)[1];
    assert(/\bamocrm_customer_id\b/.test(select), 'select includes amocrm_customer_id');
    assert(fn.includes('amocrmCustomerId: student.amocrm_customer_id ?? null'), 'mapping sets amocrmCustomerId');
}

console.log('\nadmin-v2.html');
{
    const m = HTML_SRC.match(/<select class="filter-select" id="amocrmFilter">([\s\S]*?)<\/select>/);
    assert(!!m, '#amocrmFilter select exists');
    const values = m ? [...m[1].matchAll(/<option value="(\w+)"/g)].map(x => x[1]) : [];
    assert(values.join(',') === 'all,linked,unlinked', 'options all/linked/unlinked with "all" first');
    assert(HTML_SRC.indexOf('id="amocrmFilter"') > HTML_SRC.indexOf('id="levelFilter"'), 'placed after #levelFilter');
    assert(HTML_SRC.includes('data-i18n="admin.filters.amocrm"'), 'label is translated');
}

console.log('\ni18n.js');
{
    const blocks = { en: '\n    en: {', kk: '\n    kk: {', ru: '\n    ru: {' };
    const starts = Object.fromEntries(Object.entries(blocks).map(([k, marker]) => [k, I18N_SRC.indexOf(marker)]));
    const order = Object.entries(starts).sort((a, b) => a[1] - b[1]);
    const keys = ['admin.filters.amocrm', 'admin.filters.amocrm.all', 'admin.filters.amocrm.linked',
        'admin.filters.amocrm.unlinked', 'admin.filters.amocrm.linkedCount', 'admin.filters.amocrm.unlinkedCount'];
    order.forEach(([lang, start], i) => {
        assert(start !== -1, `${lang} block found`);
        const block = I18N_SRC.slice(start, i + 1 < order.length ? order[i + 1][1] : undefined);
        for (const key of keys) {
            const re = new RegExp(`"${key.replace(/\./g, '\\.')}": "([^"]*)"`);
            const v = block.match(re);
            assert(!!v && v[1].length > 0, `${lang}: ${key}`);
            if (v && key.endsWith('Count')) assert(v[1].includes('{{count}}'), `${lang}: ${key} has {{count}}`);
        }
    });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
