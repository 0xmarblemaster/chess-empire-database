/**
 * Tests for the Active/Closed sub-tab strip inside the admin-v2
 * Tournament Management → Tournaments tab.
 *
 * Coverage:
 *  (a) admin-v2.html — the sub-tab strip is rendered inside
 *      #tournamentsAdminTabTournaments using kpi-view-switcher styles,
 *      with Active selected by default and both buttons wired to
 *      switchTournamentsAdminStatusTab(...).
 *  (b) i18n.js — tournaments.statusTab.active and tournaments.statusTab.closed
 *      are present in en/ru/kk with the expected canonical labels.
 *  (c) admin-v2.js — tournamentsAdminStatusTab state var is declared,
 *      switchTournamentsAdminStatusTab is defined + exported on window,
 *      showTournamentManagement resets the status tab to 'active' on entry,
 *      renderTournamentsAdminTable filters rows by status.
 *  (d) Functional — sandbox-execute renderTournamentsAdminTable for both
 *      Active and Closed and assert which rows ended up in the table HTML.
 *
 * Run: node tests/test-tournaments-admin-status-tabs.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
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

// ---------------------------------------------------------------------------
// (a) HTML — sub-tab strip inside #tournamentsAdminTabTournaments
// ---------------------------------------------------------------------------
console.log('\n=== (a) admin-v2.html — Active/Closed sub-tab strip ==================\n');

const tournamentsTabBlock = (() => {
    const start = HTML.indexOf('id="tournamentsAdminTabTournaments"');
    assert(start >= 0, '#tournamentsAdminTabTournaments still present');
    const end = HTML.indexOf('id="tournamentsAdminTabRegistrations"', start);
    return HTML.slice(start, end > 0 ? end : start + 4000);
})();

assert(/class="kpi-view-switcher"[^>]*aria-label="Tournament status filter"/.test(tournamentsTabBlock),
    'sub-tab strip uses kpi-view-switcher class with status filter aria-label');
assert(/data-tournaments-admin-status-tab="active"/.test(tournamentsTabBlock),
    'Active sub-tab button exists');
assert(/data-tournaments-admin-status-tab="closed"/.test(tournamentsTabBlock),
    'Closed sub-tab button exists');
// Locate the Active sub-tab button and check it carries the is-active class
// — order of attributes inside the <button> tag is not guaranteed.
const activeBtnTag = (() => {
    const idx = tournamentsTabBlock.indexOf('data-tournaments-admin-status-tab="active"');
    if (idx < 0) return '';
    const tagStart = tournamentsTabBlock.lastIndexOf('<', idx);
    const tagEnd = tournamentsTabBlock.indexOf('>', idx);
    return tournamentsTabBlock.slice(tagStart, tagEnd + 1);
})();
assert(/class="[^"]*\bis-active\b[^"]*"/.test(activeBtnTag),
    'Active sub-tab is selected by default (is-active)');
assert(/data-tournaments-admin-status-tab="active"[^>]*aria-selected="true"/.test(tournamentsTabBlock),
    'Active sub-tab has aria-selected="true"');
assert(/data-tournaments-admin-status-tab="closed"[^>]*aria-selected="false"/.test(tournamentsTabBlock),
    'Closed sub-tab has aria-selected="false"');
assert(/onclick="switchTournamentsAdminStatusTab\('active'\)"/.test(tournamentsTabBlock),
    'Active sub-tab is wired to switchTournamentsAdminStatusTab("active")');
assert(/onclick="switchTournamentsAdminStatusTab\('closed'\)"/.test(tournamentsTabBlock),
    'Closed sub-tab is wired to switchTournamentsAdminStatusTab("closed")');
assert(/data-i18n="tournaments\.statusTab\.active"/.test(tournamentsTabBlock),
    'Active sub-tab uses data-i18n="tournaments.statusTab.active"');
assert(/data-i18n="tournaments\.statusTab\.closed"/.test(tournamentsTabBlock),
    'Closed sub-tab uses data-i18n="tournaments.statusTab.closed"');

// The strip must live BEFORE the table-container so it sits above the table.
const stripIdx = tournamentsTabBlock.indexOf('kpi-view-switcher');
const tableIdx = tournamentsTabBlock.indexOf('table-container');
assert(stripIdx >= 0 && tableIdx > stripIdx,
    'sub-tab strip is rendered above the tournaments table');

// ---------------------------------------------------------------------------
// (b) i18n.js — tournaments.statusTab.* in en/ru/kk
// ---------------------------------------------------------------------------
console.log('\n=== (b) i18n.js — tournaments.statusTab.{active,closed} ==============\n');

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

const EXPECTED_I18N = {
    en: {
        'tournaments.statusTab.active': 'Active',
        'tournaments.statusTab.closed': 'Closed',
    },
    ru: {
        'tournaments.statusTab.active': 'Активные',
        'tournaments.statusTab.closed': 'Закрытые',
    },
    kk: {
        'tournaments.statusTab.active': 'Белсенді',
        'tournaments.statusTab.closed': 'Жабық',
    },
};

for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of Object.keys(EXPECTED_I18N[locale])) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["']([^"']+)["']`);
        const m = block.match(re);
        assert(!!m, `${key} present in ${locale}`);
        if (m) {
            assertEqual(m[1], EXPECTED_I18N[locale][key],
                `${key} value in ${locale} is "${EXPECTED_I18N[locale][key]}"`);
        }
    }
}

// ---------------------------------------------------------------------------
// (c) admin-v2.js — state, switch function, reset, filter
// ---------------------------------------------------------------------------
console.log('\n=== (c) admin-v2.js — state var, switch fn, reset, filter ============\n');

assert(/let\s+tournamentsAdminStatusTab\s*=\s*['"]active['"]/.test(JS),
    'tournamentsAdminStatusTab state var declared and initialized to "active"');

assert(/function\s+switchTournamentsAdminStatusTab\s*\(/.test(JS),
    'switchTournamentsAdminStatusTab(...) function declared');

assert(/window\.switchTournamentsAdminStatusTab\s*=\s*switchTournamentsAdminStatusTab/.test(JS),
    'switchTournamentsAdminStatusTab exported on window');

// showTournamentManagement resets the status sub-tab back to Active on entry.
const showFnStart = JS.indexOf('async function showTournamentManagement(');
const showFnBlock = JS.slice(showFnStart, showFnStart + 1200);
assert(/tournamentsAdminStatusTab\s*=\s*['"]active['"]/.test(showFnBlock),
    'showTournamentManagement resets tournamentsAdminStatusTab to "active"');
assert(/switchTournamentsAdminStatusTab\s*\(\s*['"]active['"]/.test(showFnBlock),
    'showTournamentManagement calls switchTournamentsAdminStatusTab("active", ...)');

// renderTournamentsAdminTable reads the state var and filters rows.
const renderFnStart = JS.indexOf('function renderTournamentsAdminTable(');
const renderFnBlock = JS.slice(renderFnStart, renderFnStart + 3000);
assert(/tournamentsAdminStatusTab/.test(renderFnBlock),
    'renderTournamentsAdminTable reads tournamentsAdminStatusTab');
assert(/row\.status\s*===\s*['"]open['"]/.test(renderFnBlock),
    'renderTournamentsAdminTable matches Active to row.status === "open"');
assert(/row\.status\s*===\s*['"]closed['"][\s\S]{0,80}row\.status\s*===\s*['"]cancelled['"]/.test(renderFnBlock),
    'renderTournamentsAdminTable matches Closed to row.status in ("closed","cancelled")');

// ---------------------------------------------------------------------------
// (d) Functional — execute renderTournamentsAdminTable in a sandbox
// ---------------------------------------------------------------------------
console.log('\n=== (d) Functional — Active/Closed filter splits rows correctly ======\n');

function extractFunctionSource(src, name, prefix) {
    const start = src.indexOf(`${prefix} ${name}(`);
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

function makeFakeDom() {
    const elements = new Map();
    const matchedBtns = [];
    function el(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id, value: '', innerHTML: '', textContent: '',
                style: {},
                classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                setAttribute() {}, getAttribute() { return null; },
            });
        }
        return elements.get(id);
    }
    const document = {
        getElementById: (id) => el(id),
        querySelectorAll: (sel) => {
            if (sel === '[data-tournaments-admin-status-tab]') {
                if (matchedBtns.length === 0) {
                    for (const tab of ['active', 'closed']) {
                        let isActive = false;
                        matchedBtns.push({
                            _tab: tab,
                            getAttribute(name) { return name === 'data-tournaments-admin-status-tab' ? tab : null; },
                            classList: {
                                toggle(_cls, val) { isActive = !!val; },
                                add() {}, remove() {}, contains() { return isActive; },
                            },
                            setAttribute() {},
                        });
                    }
                }
                return { forEach: (cb) => matchedBtns.forEach(cb) };
            }
            return { forEach: () => {} };
        },
        querySelector: () => null,
    };
    return { document, elements, el };
}

const RENDER_SRC = extractFunctionSource(JS, 'renderTournamentsAdminTable', 'function');
const SWITCH_SRC = extractFunctionSource(JS, 'switchTournamentsAdminStatusTab', 'function');
assert(!!RENDER_SRC, 'extracted renderTournamentsAdminTable source');
assert(!!SWITCH_SRC, 'extracted switchTournamentsAdminStatusTab source');

function makeSandbox(fakeDoc, rows) {
    const escapeHtmlSrc = `function _escapeHtml(s) { return String(s == null ? '' : s); }`;
    const ttSrc = `function _tt(key) { return key; }`;
    const stateSrc = `
        let tournamentsAdminList = ${JSON.stringify(rows)};
        let tournamentsAdminRegCounts = new Map();
        let tournamentsAdminStatusTab = 'active';
        const window = {};
        const lucide = { createIcons() {} };
    `;
    const body = `
'use strict';
${escapeHtmlSrc}
${ttSrc}
${stateSrc}
const document = fakeDoc;
${RENDER_SRC}
${SWITCH_SRC}
return { renderTournamentsAdminTable, switchTournamentsAdminStatusTab,
         getTab: () => tournamentsAdminStatusTab,
         setTab: (v) => { tournamentsAdminStatusTab = v; } };
`;
    return new Function('fakeDoc', body)(fakeDoc);
}

// Build a representative mixed list — 2 open, 1 closed, 1 cancelled.
const sampleRows = [
    { id: 't-open-1',   branch_id: 'b1', name: 'Open A',   tournament_date: '2026-07-01', start_time: '14:00', time_format: 'Rapid 15+5', registration_fee: 0, rounds: 7, capacity: 24, status: 'open',      league: 'A', branch_name: 'Halyk' },
    { id: 't-open-2',   branch_id: 'b1', name: 'Open B',   tournament_date: '2026-06-20', start_time: '15:00', time_format: 'Rapid 15+5', registration_fee: 0, rounds: 7, capacity: 24, status: 'open',      league: 'B', branch_name: 'Halyk' },
    { id: 't-closed',   branch_id: 'b1', name: 'Done',     tournament_date: '2026-05-01', start_time: '13:00', time_format: 'Rapid 15+5', registration_fee: 0, rounds: 7, capacity: 24, status: 'closed',    league: 'C', branch_name: 'Halyk' },
    { id: 't-cancel',   branch_id: 'b1', name: 'Killed',   tournament_date: '2026-04-15', start_time: '12:00', time_format: 'Rapid 15+5', registration_fee: 0, rounds: 7, capacity: 24, status: 'cancelled', league: 'D', branch_name: 'Halyk' },
];

// --- Active tab: only open rows render ----------------------------------
{
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, sampleRows);
    api.renderTournamentsAdminTable();
    const html = el('tournamentsAdminTableBody').innerHTML;
    assert(html.includes('t-open-1'),  'Active: t-open-1 rendered');
    assert(html.includes('t-open-2'),  'Active: t-open-2 rendered');
    assert(!html.includes('t-closed'), 'Active: t-closed NOT rendered');
    assert(!html.includes('t-cancel'), 'Active: t-cancel NOT rendered');
}

// --- Closed tab: closed + cancelled rows render -------------------------
{
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, sampleRows);
    api.switchTournamentsAdminStatusTab('closed');
    const html = el('tournamentsAdminTableBody').innerHTML;
    assert(!html.includes('t-open-1'), 'Closed: t-open-1 NOT rendered');
    assert(!html.includes('t-open-2'), 'Closed: t-open-2 NOT rendered');
    assert(html.includes('t-closed'),  'Closed: t-closed rendered');
    assert(html.includes('t-cancel'),  'Closed: t-cancel rendered');
    assertEqual(api.getTab(), 'closed', 'switchTournamentsAdminStatusTab("closed") updates state');
}

// --- Unknown tab names normalize to "active" ----------------------------
{
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, sampleRows);
    api.switchTournamentsAdminStatusTab('whatever');
    assertEqual(api.getTab(), 'active',
        'unknown sub-tab name normalizes to "active"');
    const html = el('tournamentsAdminTableBody').innerHTML;
    assert(html.includes('t-open-1') && !html.includes('t-closed'),
        'unknown sub-tab name renders the Active filter');
}

// --- Empty Closed set falls back to the noTournaments message ----------
{
    const { document, el } = makeFakeDom();
    const onlyOpen = sampleRows.filter(r => r.status === 'open');
    const api = makeSandbox(document, onlyOpen);
    api.switchTournamentsAdminStatusTab('closed');
    const html = el('tournamentsAdminTableBody').innerHTML;
    assert(html.includes('admin.tournaments.noTournaments'),
        'Closed tab with no closed/cancelled rows shows noTournaments message');
}

// ---------------------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
