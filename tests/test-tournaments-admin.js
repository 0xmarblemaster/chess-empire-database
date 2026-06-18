/**
 * Tests for the Tournament Management CRUD section in admin-v2.
 *
 * Coverage:
 *  (a) admin-v2.html — #tournamentsAdminSection exists with tab switcher,
 *      "+ New Tournament" button, tournaments table, registrations table,
 *      and the create/edit modal. Sidebar + More-menu entries are wired
 *      to showTournamentManagement() and labelled trophy.
 *  (b) i18n.js — admin.tournaments.* keys present in en/ru/kk with the
 *      expected canonical labels.
 *  (c) admin-v2.js — required functions are defined and exported; gate
 *      uses role === 'admin' (no can_manage_tournaments dependency).
 *  (d) Functional — execute the gate in a sandbox: admin passes,
 *      non-admin gets denied. Execute submit/delete/cancel/remove paths
 *      against a fake supabase client and assert on the API calls + toast.
 *  (e) Mobile CSS — admin-styles.css scopes #tournamentsAdminSection rules
 *      to the existing @media (max-width: 768px) block.
 *
 * Run: node tests/test-tournaments-admin.js
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
// (a) admin-v2.html — section + sidebar/More entries + modal
// ---------------------------------------------------------------------------
console.log('\n=== (a) admin-v2.html — section, menu entries, modal =================\n');

assert(HTML.includes('id="tournamentsAdminSection"'),
    '#tournamentsAdminSection exists in admin-v2.html');
assert(HTML.includes('id="menuTournamentsAdmin"'),
    'sidebar nav item #menuTournamentsAdmin exists');
assert(HTML.includes('id="moreMenuTournamentsAdmin"'),
    'mobile More-menu twin #moreMenuTournamentsAdmin exists');
assert(/onclick="showTournamentManagement\(\)"/.test(HTML),
    'menu entries wire to showTournamentManagement()');

// Both menu entries must use the trophy lucide icon, per spec.
const sidebarBlock = (() => {
    const start = HTML.indexOf('id="menuTournamentsAdmin"');
    return HTML.slice(start, start + 400);
})();
assert(/data-lucide="trophy"/.test(sidebarBlock),
    'sidebar entry uses the trophy lucide icon');

const moreEntryBlock = (() => {
    const start = HTML.indexOf('id="moreMenuTournamentsAdmin"');
    return HTML.slice(start, start + 600);
})();
assert(/data-lucide="trophy"/.test(moreEntryBlock),
    'mobile More-menu entry uses the trophy lucide icon');

// Section structure: title, new-tournament button, two-tab switcher,
// tournaments table headers (10 columns), registrations roster table.
const sectionBlock = (() => {
    const start = HTML.indexOf('id="tournamentsAdminSection"');
    const end = HTML.indexOf('<!-- End Tournament Management Section -->', start);
    return HTML.slice(start, end > 0 ? end : start + 8000);
})();

assert(/data-i18n="admin\.tournaments\.title"/.test(sectionBlock),
    'section header uses admin.tournaments.title');
assert(/onclick="showCreateTournamentModal\(\)"/.test(sectionBlock),
    '"+ New Tournament" button wires to showCreateTournamentModal()');
assert(/data-tournaments-admin-tab="tournaments"/.test(sectionBlock)
    && /data-tournaments-admin-tab="registrations"/.test(sectionBlock),
    'tab switcher has tournaments + registrations tabs');
assert(/id="tournamentsAdminTableBody"/.test(sectionBlock),
    'tournaments table tbody is present');
assert(/id="tournamentsAdminRegBody"/.test(sectionBlock),
    'registrations table tbody is present');
assert(/id="tournamentsAdminRegSelect"/.test(sectionBlock),
    'registrations tab has a tournament-select dropdown');

const REQUIRED_COL_KEYS = [
    'admin.tournaments.col.branch',
    'admin.tournaments.col.name',
    'admin.tournaments.col.date',
    'admin.tournaments.col.time',
    'admin.tournaments.col.format',
    'admin.tournaments.col.fee',
    'admin.tournaments.col.rounds',
    'admin.tournaments.col.status',
    'admin.tournaments.col.registered',
    'admin.tournaments.col.actions',
];
for (const key of REQUIRED_COL_KEYS) {
    const re = new RegExp(`data-i18n="${key.replace(/\./g, '\\.')}"`);
    assert(re.test(sectionBlock), `tournaments table renders the ${key} column header`);
}

// Modal
assert(HTML.includes('id="tournamentAdminModal"'),
    'tournament create/edit modal exists');
const modalBlock = (() => {
    const start = HTML.indexOf('id="tournamentAdminModal"');
    return HTML.slice(start, start + 8000);
})();
const REQUIRED_FORM_FIELDS = [
    'tournamentAdminBranch', 'tournamentAdminName', 'tournamentAdminInfo',
    'tournamentAdminDate', 'tournamentAdminStartTime', 'tournamentAdminTimeFormat',
    'tournamentAdminFee', 'tournamentAdminRounds', 'tournamentAdminCapacity',
    'tournamentAdminStatus', 'tournamentAdminLeague',
];
for (const id of REQUIRED_FORM_FIELDS) {
    assert(modalBlock.includes(`id="${id}"`),
        `modal has form field #${id}`);
}
assert(/onclick="submitTournamentAdminForm\(\)"/.test(modalBlock),
    'modal Save button wires to submitTournamentAdminForm()');

// ---------------------------------------------------------------------------
// (b) i18n.js — admin.tournaments.* keys in en/ru/kk
// ---------------------------------------------------------------------------
console.log('\n=== (b) i18n.js — admin.tournaments.* keys in en/ru/kk ===============\n');

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

const REQUIRED_I18N_KEYS = [
    'admin.tournaments.title',
    'admin.tournaments.newButton',
    'admin.tournaments.tabTournaments',
    'admin.tournaments.tabRegistrations',
    'admin.tournaments.col.branch',
    'admin.tournaments.col.name',
    'admin.tournaments.col.date',
    'admin.tournaments.col.time',
    'admin.tournaments.col.format',
    'admin.tournaments.col.fee',
    'admin.tournaments.col.rounds',
    'admin.tournaments.col.status',
    'admin.tournaments.col.registered',
    'admin.tournaments.col.actions',
    'admin.tournaments.action.edit',
    'admin.tournaments.action.cancel',
    'admin.tournaments.action.delete',
    'admin.tournaments.action.remove',
    'admin.tournaments.status.open',
    'admin.tournaments.status.closed',
    'admin.tournaments.status.cancelled',
    'admin.tournaments.form.branch',
    'admin.tournaments.form.name',
    'admin.tournaments.form.info',
    'admin.tournaments.form.date',
    'admin.tournaments.form.startTime',
    'admin.tournaments.form.timeFormat',
    'admin.tournaments.form.fee',
    'admin.tournaments.form.rounds',
    'admin.tournaments.form.capacity',
    'admin.tournaments.form.status',
    'admin.tournaments.form.league',
    'admin.tournaments.confirmDelete',
    'admin.tournaments.confirmCancel',
    'admin.tournaments.confirmRemove',
    'admin.tournaments.created',
    'admin.tournaments.updated',
    'admin.tournaments.deleted',
    'admin.tournaments.cancelled',
    'admin.tournaments.registrationRemoved',
    'admin.tournaments.error',
    'admin.tournaments.accessDenied',
    'admin.tournaments.selectTournament',
    'admin.tournaments.noRegistrations',
    'admin.tournaments.noTournaments',
];

const EXPECTED_LABELS = {
    en: {
        'admin.tournaments.title': 'Tournament Management',
        'admin.tournaments.newButton': '+ New Tournament',
        'admin.tournaments.tabTournaments': 'Tournaments',
        'admin.tournaments.tabRegistrations': 'Registrations',
        'admin.tournaments.status.open': 'Open',
        'admin.tournaments.status.cancelled': 'Cancelled',
    },
    ru: {
        'admin.tournaments.title': 'Управление турнирами',
        'admin.tournaments.newButton': '+ Новый турнир',
        'admin.tournaments.tabTournaments': 'Турниры',
        'admin.tournaments.tabRegistrations': 'Регистрации',
        'admin.tournaments.status.open': 'Открыт',
        'admin.tournaments.status.cancelled': 'Отменен',
    },
    kk: {
        'admin.tournaments.title': 'Турнирлерді басқару',
        'admin.tournaments.newButton': '+ Жаңа турнир',
        'admin.tournaments.tabTournaments': 'Турнирлер',
        'admin.tournaments.tabRegistrations': 'Тіркеулер',
        'admin.tournaments.status.open': 'Ашық',
        'admin.tournaments.status.cancelled': 'Бас тартылды',
    },
};

for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of REQUIRED_I18N_KEYS) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["']([^"']+)["']`);
        const m = block.match(re);
        assert(!!m, `${key} present in ${locale}`);
        const expected = EXPECTED_LABELS[locale][key];
        if (m && expected) {
            assertEqual(m[1], expected, `${key} value in ${locale} is "${expected}"`);
        }
    }
}

// ---------------------------------------------------------------------------
// (c) admin-v2.js — required functions defined, admin gate, hash routing
// ---------------------------------------------------------------------------
console.log('\n=== (c) admin-v2.js — function shapes ================================\n');

const REQUIRED_FNS = [
    'showTournamentManagement',
    'loadTournamentsAdminList',
    'switchTournamentAdminTab',
    'showCreateTournamentModal',
    'showEditTournamentModal',
    'submitTournamentAdminForm',
    'deleteTournament',
    'cancelTournament',
    'showTournamentRegistrations',
    'removeRegistration',
    'closeTournamentAdminModal',
];
for (const name of REQUIRED_FNS) {
    const re = new RegExp(`function\\s+${name}\\s*\\(`);
    assert(re.test(JS), `function ${name} is defined`);
}

// Gate: admin role bypasses; no can_manage_tournaments check expected.
const showFnStart = JS.indexOf('async function showTournamentManagement(');
const showFnBlock = JS.slice(showFnStart, showFnStart + 800);
assert(/userRole\?\.role\s*===\s*['"]admin['"]/.test(showFnBlock),
    'showTournamentManagement gates on userRole.role === "admin"');
assert(/admin\.tournaments\.accessDenied/.test(showFnBlock),
    'gate fires admin.tournaments.accessDenied toast');

// Hash routing — 'tournamentsAdmin' case wired into navigateToSection/showSection.
assert(/case 'tournamentsAdmin':/.test(JS),
    'navigateToSection has a tournamentsAdmin case');
assert(/section === 'tournamentsAdmin'/.test(JS),
    'showSection dispatches the tournamentsAdmin section');

// Sidebar admin grant — admin gets menuTournamentsAdmin + moreMenuTournamentsAdmin.
assert(/menuTournamentsAdmin\.style\.display\s*=\s*['"]flex['"]/.test(JS),
    'admin path reveals #menuTournamentsAdmin');
assert(/moreMenuTournamentsAdmin\.style\.display\s*=\s*['"]flex['"]/.test(JS),
    'admin path reveals #moreMenuTournamentsAdmin');

// CRUD calls use the documented supabase chains.
const submitFn = (() => {
    const s = JS.indexOf('async function submitTournamentAdminForm(');
    return JS.slice(s, s + 3000);
})();
assert(/\.from\(['"]tournaments['"]\)\.update\(/.test(submitFn),
    'submit uses supabase.from("tournaments").update(...) for edits');
assert(/\.from\(['"]tournaments['"]\)\.insert\(/.test(submitFn),
    'submit uses supabase.from("tournaments").insert(...) for new');

const deleteFn = (() => {
    const s = JS.indexOf('async function deleteTournament(');
    return JS.slice(s, s + 1500);
})();
assert(/confirm\(/.test(deleteFn),
    'deleteTournament prompts a confirmation before deleting');
assert(/\.from\(['"]tournaments['"]\)\.delete\(\)/.test(deleteFn),
    'deleteTournament uses supabase.from("tournaments").delete()');

const cancelFn = (() => {
    const s = JS.indexOf('async function cancelTournament(');
    return JS.slice(s, s + 1500);
})();
assert(/status:\s*['"]cancelled['"]/.test(cancelFn),
    'cancelTournament sets status to "cancelled"');

const regFn = (() => {
    const s = JS.indexOf('async function showTournamentRegistrations(');
    return JS.slice(s, s + 2000);
})();
assert(/\.from\(['"]tournament_registrations['"]\)/.test(regFn),
    'showTournamentRegistrations queries tournament_registrations');
assert(/students!inner\([\s\S]*?\bfirst_name\b[\s\S]*?\blast_name\b/.test(regFn),
    'showTournamentRegistrations joins to students for full names');

const removeFn = (() => {
    const s = JS.indexOf('async function removeRegistration(');
    return JS.slice(s, s + 1500);
})();
assert(/\.rpc\(['"]admin_remove_tournament_registration['"]/.test(removeFn),
    'removeRegistration deletes from tournament_registrations');

// ---------------------------------------------------------------------------
// (d) Functional — sandbox-execute the gate + CRUD paths
// ---------------------------------------------------------------------------
console.log('\n=== (d) Functional — gate, submit, delete, cancel, remove ==========\n');

function extractFunctionSource(src, name, prefix = 'async function') {
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

// Fake DOM: minimal stub so the functions don't blow up when they touch
// document/lucide. We don't render anything — the assertions look at the
// supabase calls + toast calls.
function makeFakeDom() {
    const elements = new Map();
    function el(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id, value: '', innerHTML: '', textContent: '',
                style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                setAttribute() {}, getAttribute() { return null; },
            });
        }
        return elements.get(id);
    }
    const document = {
        getElementById: (id) => el(id),
        querySelectorAll: () => ({ forEach: () => {} }),
        querySelector: () => null,
    };
    return { document, elements, el };
}

// Track supabase calls for assertions.
function makeSupabase({ tournamentsData = [], regData = [], regError = null } = {}) {
    const calls = [];
    function builder(opName, table) {
        const op = {
            _table: table, _op: opName, _filters: [], _payload: null,
            select(cols) { op._cols = cols; return op; },
            insert(payload) { op._op = 'insert'; op._payload = payload; return Promise.resolve({ data: null, error: null }); },
            update(payload) { op._op = 'update'; op._payload = payload; return op; },
            delete() { op._op = 'delete'; return op; },
            eq(col, val) { op._filters.push(['eq', col, val]); return op._op === 'update' || op._op === 'delete'
                ? Promise.resolve({ data: null, error: null }) : op; },
            in(col, vals) { op._filters.push(['in', col, vals]); return Promise.resolve({ data: table === 'tournament_registrations' ? regData : tournamentsData, error: regError }); },
            order() { return op; },
            then(resolve) {
                // .from('x').select('...').order(...) is awaited directly.
                if (table === 'branches') return resolve({ data: [{ id: 'b1', name: 'Halyk Arena' }], error: null });
                if (table === 'tournaments') return resolve({ data: tournamentsData, error: null });
                return resolve({ data: [], error: null });
            },
        };
        calls.push(op);
        return op;
    }
    const client = {
        from(table) { return builder('from', table); },
        rpc(name, params) {
            const op = { _op: 'rpc', _name: name, _params: params };
            calls.push(op);
            return Promise.resolve({ data: { ok: true }, error: null });
        },
    };
    return { client, calls };
}

// Sandbox harness — pulls every CRUD function and runs them with the fake
// document/supabase. We compile each function as an IIFE that returns
// references to the inner functions so we can call them.
function makeSandbox(fakeDoc, supabaseClient, supabaseAuth, toastCalls, confirmReturn) {
    const escapeHtmlSrc = `function _escapeHtml(s) { return String(s || ''); }`;
    const ttSrc         = `function _tt(key) { return key; }`;
    const toastSrc      = `function _tournamentsAdminToast(msg, type) { toastCalls.push({ msg, type }); }`;
    const lucideSrc     = `const lucide = { createIcons() {} };`;
    const switchSrc     = `function switchToSection() {}`;

    const fnNames = [
        'showTournamentManagement', 'switchTournamentAdminTab',
        'loadTournamentsAdminList', 'renderTournamentsAdminTable',
        '_populateTournamentsAdminBranchSelect', '_populateTournamentsAdminRegDropdown',
        'onTournamentsAdminRegSelectChange', 'showTournamentRegistrations',
        'removeRegistration', 'showCreateTournamentModal', 'showEditTournamentModal',
        'closeTournamentAdminModal', 'submitTournamentAdminForm',
        'deleteTournament', 'cancelTournament',
    ];
    const sources = fnNames.map(name => {
        let src = extractFunctionSource(JS, name, 'async function');
        if (!src) src = extractFunctionSource(JS, name, 'function');
        if (!src) throw new Error(`Function ${name} not found`);
        return src;
    }).join('\n\n');

    const stateSrc = `
        let tournamentsAdminList = [];
        let tournamentsAdminBranches = [];
        let tournamentsAdminRegCounts = new Map();
        let tournamentsAdminCurrentRegRows = [];
        let tournamentsAdminStatusTab = 'active';
    `;

    const body = `
'use strict';
${escapeHtmlSrc}
${ttSrc}
${toastSrc}
${lucideSrc}
${switchSrc}
${stateSrc}
const document = fakeDoc;
const window = { supabaseClient, supabaseAuth };
const confirm = () => confirmReturn;
const console = { log() {}, warn() {}, error() {} };
${sources}
return {
    showTournamentManagement, switchTournamentAdminTab,
    submitTournamentAdminForm, deleteTournament, cancelTournament,
    removeRegistration, showCreateTournamentModal, showEditTournamentModal,
    closeTournamentAdminModal, showTournamentRegistrations,
};
`;
    const runner = new Function('fakeDoc', 'supabaseClient', 'supabaseAuth', 'toastCalls', 'confirmReturn', body);
    return runner(fakeDoc, supabaseClient, supabaseAuth, toastCalls, confirmReturn);
}

// --- Gate: admin allowed -----------------------------------------------------
{
    const { document } = makeFakeDom();
    const toastCalls = [];
    const { client } = makeSupabase();
    const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
    const api = makeSandbox(document, client, auth, toastCalls, true);
    return api.showTournamentManagement(false).then(() => {
        const denied = toastCalls.find(c => c.msg === 'admin.tournaments.accessDenied' && c.type === 'error');
        assert(!denied, 'admin role does NOT see accessDenied toast');
    }).then(runNonAdmin).then(runCoachLikeAdmin).then(runSubmit).then(runDelete).then(runCancel).then(runRemove).then(finish);

    function runNonAdmin() {
        // --- Gate: non-admin denied --------------------------------------------
        const { document } = makeFakeDom();
        const toastCalls2 = [];
        const { client } = makeSupabase();
        const coachAuth = { getCurrentUserRole: () => ({ role: 'coach' }) };
        const api2 = makeSandbox(document, client, coachAuth, toastCalls2, true);
        return api2.showTournamentManagement(false).then(() => {
            const denied = toastCalls2.find(c => c.msg === 'admin.tournaments.accessDenied' && c.type === 'error');
            assert(!!denied, 'non-admin (coach) is denied with accessDenied toast');
        });
    }

    function runCoachLikeAdmin() {
        // --- Gate: null role denied --------------------------------------------
        const { document } = makeFakeDom();
        const toastCalls3 = [];
        const { client } = makeSupabase();
        const noAuth = { getCurrentUserRole: () => null };
        const api3 = makeSandbox(document, client, noAuth, toastCalls3, true);
        return api3.showTournamentManagement(false).then(() => {
            const denied = toastCalls3.find(c => c.msg === 'admin.tournaments.accessDenied' && c.type === 'error');
            assert(!!denied, 'null userRole is denied with accessDenied toast');
        });
    }

    function runSubmit() {
        // --- Submit (create new) — validates required fields, then inserts ----
        const { document, el } = makeFakeDom();
        // Pre-populate form fields.
        el('tournamentAdminId').value = '';
        el('tournamentAdminBranch').value = 'b1';
        el('tournamentAdminName').value = 'League C';
        el('tournamentAdminInfo').value = '';
        el('tournamentAdminDate').value = '2026-06-06';
        el('tournamentAdminStartTime').value = '14:00';
        el('tournamentAdminTimeFormat').value = 'Rapid 15+5';
        el('tournamentAdminFee').value = '2000';
        el('tournamentAdminRounds').value = '7';
        el('tournamentAdminCapacity').value = '24';
        el('tournamentAdminStatus').value = 'open';
        el('tournamentAdminLeague').value = 'C';
        el('tournamentAdminDeadline').value = '2026-06-05T18:00';

        const toastCalls4 = [];
        const { client, calls } = makeSupabase();
        const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
        const api4 = makeSandbox(document, client, auth, toastCalls4, true);
        return api4.submitTournamentAdminForm().then(() => {
            const insertCall = calls.find(c => c._op === 'insert' && c._table === 'tournaments');
            assert(!!insertCall, 'submit triggers an insert on tournaments');
            assertEqual(insertCall._payload.name, 'League C',
                'insert payload includes name');
            assertEqual(insertCall._payload.tournament_date, '2026-06-06',
                'insert payload includes tournament_date');
            assertEqual(insertCall._payload.status, 'open',
                'insert payload includes status');
            assertEqual(insertCall._payload.league, 'C',
                'insert payload includes league');
            const created = toastCalls4.find(c => c.msg === 'admin.tournaments.created' && c.type === 'success');
            assert(!!created, 'created toast fires on success');
        }).then(runSubmitValidation);
    }

    function runSubmitValidation() {
        // Missing name → no insert, error toast.
        const { document, el } = makeFakeDom();
        el('tournamentAdminId').value = '';
        el('tournamentAdminBranch').value = 'b1';
        el('tournamentAdminName').value = '';     // ← missing
        el('tournamentAdminInfo').value = '';
        el('tournamentAdminDate').value = '2026-06-06';
        el('tournamentAdminStartTime').value = '14:00';
        el('tournamentAdminTimeFormat').value = 'Rapid 15+5';
        el('tournamentAdminFee').value = '0';
        el('tournamentAdminRounds').value = '7';
        el('tournamentAdminCapacity').value = '24';
        el('tournamentAdminStatus').value = 'open';
        el('tournamentAdminLeague').value = 'C';

        const toastCalls5 = [];
        const { client, calls } = makeSupabase();
        const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
        const api5 = makeSandbox(document, client, auth, toastCalls5, true);
        return api5.submitTournamentAdminForm().then(() => {
            const insertCall = calls.find(c => c._op === 'insert');
            assert(!insertCall, 'missing name → no insert call');
            const errorToast = toastCalls5.find(c => c.type === 'error');
            assert(!!errorToast, 'missing name → error toast fired');
        });
    }

    function runDelete() {
        // --- Delete: confirms, then deletes -----------------------------------
        const { document } = makeFakeDom();
        const toastCalls6 = [];
        const { client, calls } = makeSupabase();
        const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
        // First run: user cancels confirmation → no delete.
        const apiNo = makeSandbox(document, client, auth, toastCalls6, /*confirmReturn=*/false);
        return apiNo.deleteTournament('t-1').then(() => {
            const del = calls.find(c => c._op === 'delete');
            assert(!del, 'deleteTournament respects confirm()=false (no API call)');
        }).then(() => {
            const toastCalls7 = [];
            const { client: client2, calls: calls2 } = makeSupabase();
            const apiYes = makeSandbox(document, client2, auth, toastCalls7, /*confirmReturn=*/true);
            return apiYes.deleteTournament('t-1').then(() => {
                const del = calls2.find(c => c._op === 'delete' && c._table === 'tournaments');
                assert(!!del, 'deleteTournament calls .from("tournaments").delete()');
                const filter = del._filters.find(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 't-1');
                assert(!!filter, 'deleteTournament filters by id = t-1');
                const deleted = toastCalls7.find(c => c.msg === 'admin.tournaments.deleted' && c.type === 'success');
                assert(!!deleted, 'deleted toast fires on success');
            });
        });
    }

    function runCancel() {
        // --- Cancel: sets status to 'cancelled' --------------------------------
        const { document } = makeFakeDom();
        const toastCalls8 = [];
        const { client, calls } = makeSupabase();
        const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
        const api = makeSandbox(document, client, auth, toastCalls8, true);
        return api.cancelTournament('t-2').then(() => {
            const upd = calls.find(c => c._op === 'update' && c._table === 'tournaments');
            assert(!!upd, 'cancelTournament calls .from("tournaments").update(...)');
            assertEqual(upd._payload, { status: 'cancelled' },
                'cancelTournament update payload is { status: "cancelled" }');
            const filter = upd._filters.find(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 't-2');
            assert(!!filter, 'cancelTournament filters by id = t-2');
            const cancelled = toastCalls8.find(c => c.msg === 'admin.tournaments.cancelled' && c.type === 'success');
            assert(!!cancelled, 'cancelled toast fires on success');
        });
    }

    function runRemove() {
        // --- Remove registration ----------------------------------------------
        const { document } = makeFakeDom();
        const toastCalls9 = [];
        const { client, calls } = makeSupabase();
        const auth = { getCurrentUserRole: () => ({ role: 'admin' }) };
        const api = makeSandbox(document, client, auth, toastCalls9, true);
        return api.removeRegistration('r-1').then(() => {
            const rpc = calls.find(c => c._op === 'rpc' && c._name === 'admin_remove_tournament_registration');
            assert(!!rpc, 'removeRegistration calls rpc("admin_remove_tournament_registration")');
            assertEqual(rpc._params.p_registration_id, 'r-1',
                'removeRegistration passes p_registration_id = r-1');
            const removed = toastCalls9.find(c => c.msg === 'admin.tournaments.registrationRemoved' && c.type === 'success');
            assert(!!removed, 'registrationRemoved toast fires on success');
        });
    }

    function finish() {
        // ---------------------------------------------------------------------------
        // (e) Mobile CSS — rules scoped inside the existing @media (max-width: 768px)
        // ---------------------------------------------------------------------------
        console.log('\n=== (e) admin-styles.css — mobile rules ============================\n');

        // The whole stylesheet has a single 768px media query, and our rules live
        // inside it. Verify the rule blocks are scoped to #tournamentsAdminSection.
        const mediaIdx = CSS.lastIndexOf('@media (max-width: 768px)');
        assert(mediaIdx >= 0, '@media (max-width: 768px) block exists');
        const mediaBlock = CSS.slice(mediaIdx);
        assert(/#tournamentsAdminSection \.header\s*{/.test(mediaBlock),
            'mobile rule for #tournamentsAdminSection .header exists');
        assert(/#tournamentsAdminSection \.header-title\s*{/.test(mediaBlock),
            'mobile rule hides duplicate #tournamentsAdminSection .header-title');
        assert(/#tournamentsAdminSection \.header-actions\s*{/.test(mediaBlock),
            'mobile rule stacks #tournamentsAdminSection .header-actions');
        assert(/#tournamentsAdminSection[\s\S]*?overflow-x:\s*auto/.test(mediaBlock),
            'mobile rule allows horizontal scroll on the wide tournaments table');

        console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
        if (failed > 0) process.exit(1);
    }
}
