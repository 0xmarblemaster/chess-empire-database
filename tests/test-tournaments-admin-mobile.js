/**
 * Tests for the Tournaments admin mobile view (Option C — dashboard cards + FAB).
 *
 * Coverage:
 *  (a) admin-v2.html — mobile stat strip + cards containers, FAB wired to the
 *      create-tournament flow, and the registrations mobile list container.
 *  (b) i18n.js — admin.tournaments.mobile.* keys present in en/ru/kk with the
 *      expected Russian labels.
 *  (c) admin-styles.css — mobile card views hidden on desktop, revealed +
 *      styled inside the @media (max-width: 768px) block; FAB positioned above
 *      the bottom nav.
 *  (d) Functional — sandbox-execute renderTournamentsAdminMobileCards and the
 *      registrations renderer: stat strip totals, status-tab filtering, card
 *      contents (name/capacity/participants), empty state, weekend range.
 *
 * Run: node tests/test-tournaments-admin-mobile.js
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
const CSS = fs.readFileSync(path.join(ROOT, 'admin-styles.css'), 'utf8');

// ---------------------------------------------------------------------------
// (a) admin-v2.html — mobile containers + FAB
// ---------------------------------------------------------------------------
console.log('\n=== (a) admin-v2.html — mobile containers + FAB =====================\n');

assert(/class="tournaments-mobile"[^>]*id="tournamentsAdminMobile"/.test(HTML),
    'mobile dashboard container #tournamentsAdminMobile exists');
assert(HTML.includes('id="tournamentsAdminMobileStats"'),
    'mobile stat-strip container exists');
assert(HTML.includes('id="tournamentsAdminMobileCards"'),
    'mobile tournament cards container exists');
assert(/id="tournamentsAdminFab"[\s\S]{0,120}onclick="showCreateTournamentModal\(\)"/.test(HTML)
    || /class="tournaments-fab"[\s\S]{0,120}onclick="showCreateTournamentModal\(\)"/.test(HTML),
    'FAB wires to the existing showCreateTournamentModal() flow');
assert(HTML.includes('id="tournamentsAdminRegMobileCards"'),
    'registrations mobile list container exists');
// The FAB must live inside the tournaments section so it only shows there.
const sectionBlock = (() => {
    const start = HTML.indexOf('id="tournamentsAdminSection"');
    const end = HTML.indexOf('<!-- End Tournament Management Section -->', start);
    return HTML.slice(start, end);
})();
assert(sectionBlock.includes('id="tournamentsAdminFab"'),
    'FAB is scoped inside #tournamentsAdminSection');

// ---------------------------------------------------------------------------
// (b) i18n.js — admin.tournaments.mobile.* keys in en/ru/kk
// ---------------------------------------------------------------------------
console.log('\n=== (b) i18n.js — admin.tournaments.mobile.* keys ===================\n');

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

const MOBILE_KEYS = [
    'admin.tournaments.mobile.statActive',
    'admin.tournaments.mobile.statRegistrations',
    'admin.tournaments.mobile.statWeekend',
    'admin.tournaments.mobile.filled',
    'admin.tournaments.mobile.participants',
    'admin.tournaments.mobile.roundsSuffix',
];
const RU_LABELS = {
    'admin.tournaments.mobile.statActive': 'Активных',
    'admin.tournaments.mobile.statRegistrations': 'Регистраций',
    'admin.tournaments.mobile.statWeekend': 'В эти выходные',
    'admin.tournaments.mobile.filled': 'Заполнено',
    'admin.tournaments.mobile.participants': 'Участники',
    'admin.tournaments.mobile.roundsSuffix': 'туров',
};
for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of MOBILE_KEYS) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["']([^"']+)["']`);
        const m = block.match(re);
        assert(!!m, `${key} present in ${locale}`);
        if (m && locale === 'ru') {
            assertEqual(m[1], RU_LABELS[key], `${key} value in ru is "${RU_LABELS[key]}"`);
        }
    }
}

// ---------------------------------------------------------------------------
// (c) admin-styles.css — hidden on desktop, revealed inside 768px block
// ---------------------------------------------------------------------------
console.log('\n=== (c) admin-styles.css — mobile card view rules ===================\n');

// Desktop default: the mobile views + FAB are display:none somewhere BEFORE
// the media query.
const mediaIdx = CSS.lastIndexOf('@media (max-width: 768px)');
assert(mediaIdx >= 0, '@media (max-width: 768px) block exists');
const desktopPart = CSS.slice(0, mediaIdx);
assert(/\.tournaments-mobile[\s\S]{0,120}display:\s*none/.test(desktopPart)
    || /\.tournaments-mobile,[\s\S]{0,160}display:\s*none/.test(desktopPart),
    'tournaments-mobile hidden by default on desktop');

const mediaBlock = CSS.slice(mediaIdx);
assert(/\.tournaments-mobile\s*{[\s\S]*?display:\s*block/.test(mediaBlock),
    'mobile block reveals .tournaments-mobile');
assert(/\.tournaments-reg-mobile\s*{[\s\S]*?display:\s*block/.test(mediaBlock),
    'mobile block reveals .tournaments-reg-mobile');
assert(/\.tm-stats\s*{/.test(mediaBlock), 'stat strip styled (.tm-stats)');
assert(/\.tc\s*{/.test(mediaBlock), 'tournament card styled (.tc)');
assert(/\.tc-bar\s+i\s*{[\s\S]*?background:/.test(mediaBlock), 'capacity bar fill styled');
assert(/\.tc-menu\.is-open\s*{[\s\S]*?display:\s*block/.test(mediaBlock),
    'kebab menu opens via .tc-menu.is-open');
assert(/\.tournaments-fab\s*{[\s\S]*?position:\s*fixed/.test(mediaBlock),
    'FAB is fixed-positioned in the mobile block');
assert(/\.rm-card\s*{/.test(mediaBlock), 'registration mobile card styled (.rm-card)');
// FAB sits above the bottom nav (bottom offset > the ~64px nav height).
const fabBlock = mediaBlock.slice(mediaBlock.indexOf('.tournaments-fab'));
const bottomMatch = fabBlock.match(/bottom:\s*(\d+)px/);
assert(!!bottomMatch && Number(bottomMatch[1]) >= 64,
    'FAB bottom offset clears the mobile bottom nav');

// ---------------------------------------------------------------------------
// (d) Functional — render mobile cards + stats
// ---------------------------------------------------------------------------
console.log('\n=== (d) Functional — mobile renderers ===============================\n');

function extractFunctionSource(src, name, prefix = 'function') {
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
    function el(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id, value: '', innerHTML: '',
                style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
                setAttribute() {}, getAttribute() { return null; },
            });
        }
        return elements.get(id);
    }
    const document = {
        getElementById: (id) => el(id),
        querySelectorAll: () => ({ forEach: () => {} }),
        querySelector: () => null,
        addEventListener: () => {},
    };
    return { document, el };
}

const FN_NAMES = [
    '_tournamentsWeekendRange', '_computeTournamentsAdminStats',
    '_closeTournamentCardMenus', '_toggleTournamentCardMenu',
    '_wireTournamentCardMenuDismiss', 'renderTournamentsAdminMobileCards',
    '_computeAge', '_setRegMobilePlaceholder', 'renderTournamentsAdminRegMobileCards',
];

function makeSandbox(fakeDoc, rows, regCounts, statusTab, regRows) {
    const sources = FN_NAMES.map(name => {
        const src = extractFunctionSource(JS, name, 'function');
        if (!src) throw new Error(`Function ${name} not found`);
        return src;
    }).join('\n\n');

    const body = `
'use strict';
function _escapeHtml(s) { return String(s == null ? '' : s); }
function _tt(key) { return key; }
const lucide = { createIcons() {} };
const document = fakeDoc;
const window = { i18n: null };
const console = { log() {}, warn() {}, error() {} };
let tournamentsAdminList = ${JSON.stringify(rows)};
let tournamentsAdminRegCounts = new Map(${JSON.stringify(Array.from(regCounts.entries()))});
let tournamentsAdminStatusTab = ${JSON.stringify(statusTab)};
let tournamentsAdminCurrentRegRows = ${JSON.stringify(regRows || [])};
${sources}
return {
    _tournamentsWeekendRange, _computeTournamentsAdminStats,
    renderTournamentsAdminMobileCards, renderTournamentsAdminRegMobileCards,
    setTab: (v) => { tournamentsAdminStatusTab = v; },
};
`;
    return new Function('fakeDoc', body)(fakeDoc);
}

const rows = [
    { id: 't-open-1', name: 'Open A', tournament_date: '2026-07-01', start_time: '14:00', time_format: 'Rapid 15+5', registration_fee: 2500, rounds: 7, capacity: 24, status: 'open',      league: 'A', branch_name: 'Halyk' },
    { id: 't-open-2', name: 'Open B', tournament_date: '2026-06-20', start_time: '15:00', time_format: 'Blitz 5+0',  registration_fee: 0,    rounds: 9, capacity: 32, status: 'open',      league: 'B', branch_name: 'Halyk' },
    { id: 't-closed', name: 'Done',   tournament_date: '2026-05-01', start_time: '13:00', time_format: 'Rapid 15+5', registration_fee: 0,    rounds: 7, capacity: 24, status: 'closed',    league: 'C', branch_name: 'Halyk' },
    { id: 't-cancel', name: 'Killed', tournament_date: '2026-04-15', start_time: '12:00', time_format: 'Rapid 15+5', registration_fee: 0,    rounds: 7, capacity: 24, status: 'cancelled', league: 'D', branch_name: 'Halyk' },
];
const regCounts = new Map([['t-open-1', 18], ['t-open-2', 22], ['t-closed', 24]]);

// --- Weekend range is a valid Sat/Sun pair -----------------------------------
{
    const { document } = makeFakeDom();
    const api = makeSandbox(document, rows, regCounts, 'active');
    const [sat, sun] = api._tournamentsWeekendRange();
    assert(/^\d{4}-\d{2}-\d{2}$/.test(sat) && /^\d{4}-\d{2}-\d{2}$/.test(sun),
        'weekend range returns two ISO dates');
    assertEqual(new Date(sat + 'T00:00:00').getDay(), 6, 'first weekend day is a Saturday');
    const dayDiff = (new Date(sun + 'T00:00:00') - new Date(sat + 'T00:00:00')) / 86400000;
    assertEqual(dayDiff, 1, 'second weekend day is the day after Saturday');
}

// --- Stat strip totals -------------------------------------------------------
{
    const { document } = makeFakeDom();
    const api = makeSandbox(document, rows, regCounts, 'active');
    const s = api._computeTournamentsAdminStats();
    assertEqual(s.active, 2, 'stat: 2 active (open) tournaments');
    assertEqual(s.registrations, 64, 'stat: registrations summed across all (18+22+24)');
    assert(typeof s.weekend === 'number' && s.weekend >= 0, 'stat: weekend is a count');
}

// --- Active tab renders open cards with participants + capacity --------------
{
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, rows, regCounts, 'active');
    api.renderTournamentsAdminMobileCards();
    const statsHtml = el('tournamentsAdminMobileStats').innerHTML;
    assert(statsHtml.includes('>2<') && statsHtml.includes('>64<'),
        'stat strip rendered with active + registrations values');
    const html = el('tournamentsAdminMobileCards').innerHTML;
    assert(html.includes('t-open-1') && html.includes('t-open-2'), 'Active: open cards rendered');
    assert(!html.includes('t-closed') && !html.includes('t-cancel'), 'Active: closed/cancelled hidden');
    assert(html.includes('showTournamentParticipants(\'t-open-1\')'), 'card has participants handler');
    assert(html.includes('(18)'), 'participants button shows the count');
    assert(html.includes('18 / 24'), 'capacity meter shows count / capacity');
    assert(html.includes('showEditTournamentModal(\'t-open-1\')'), 'kebab menu wires the edit handler');
    assert(html.includes('cancelTournament(\'t-open-1\')'), 'kebab menu wires the cancel handler');
    assert(html.includes('deleteTournament(\'t-open-1\')'), 'kebab menu wires the delete handler');
    assert(html.includes('7 admin.tournaments.mobile.roundsSuffix'), 'rounds tag rendered');
    assert(html.includes('2500 ₸'), 'fee tag rendered');
}

// --- Closed tab renders closed + cancelled ----------------------------------
{
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, rows, regCounts, 'closed');
    api.renderTournamentsAdminMobileCards();
    const html = el('tournamentsAdminMobileCards').innerHTML;
    assert(html.includes('t-closed') && html.includes('t-cancel'), 'Closed: closed + cancelled rendered');
    assert(!html.includes('t-open-1'), 'Closed: open hidden');
}

// --- Empty filter → friendly empty state ------------------------------------
{
    const { document, el } = makeFakeDom();
    const onlyOpen = rows.filter(r => r.status === 'open');
    const api = makeSandbox(document, onlyOpen, regCounts, 'closed');
    api.renderTournamentsAdminMobileCards();
    const html = el('tournamentsAdminMobileCards').innerHTML;
    assert(html.includes('tm-empty') && html.includes('admin.tournaments.noTournaments'),
        'empty Closed filter shows the noTournaments empty state');
}

// --- Registrations mobile list (student + guest) ----------------------------
{
    const regRows = [
        {
            id: 'r-1', registered_at: '2026-06-01T10:00:00', student_id: 's-1',
            students: {
                first_name: 'Ivan', last_name: 'Petrov', age: 12, date_of_birth: null,
                branches: { name: 'Halyk' },
                student_current_ratings: { rating: 1450 },
            },
            tournament_guest_contacts: null,
        },
        {
            id: 'r-2', registered_at: '2026-06-01T11:00:00', student_id: null,
            students: null,
            tournament_guest_contacts: { first_name: 'Guest', last_name: 'Visitor', rating: 1200, age: 30 },
        },
    ];
    const { document, el } = makeFakeDom();
    const api = makeSandbox(document, rows, regCounts, 'active', regRows);
    api.renderTournamentsAdminRegMobileCards('2026-07-01');
    const html = el('tournamentsAdminRegMobileCards').innerHTML;
    assert(html.includes('Petrov Ivan'), 'student registration card shows the name');
    assert(html.includes('1450'), 'student card shows the rating');
    assert(html.includes('Visitor Guest'), 'guest registration card shows the name');
    assert(html.includes('admin.tournaments.guestBadge'), 'guest card shows the guest badge');
    assert(html.includes('removeRegistration(\'r-1\')') && html.includes('removeRegistration(\'r-2\')'),
        'both cards wire the remove handler');
}

// ---------------------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
