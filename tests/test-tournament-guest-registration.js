/**
 * Tests for the guest-registration feature (migrations 050+051 + admin UI + public roster).
 *
 * Coverage:
 *  (a) migration 050 — schema + RPC shape + RLS policy + display_name column.
 *      migration 051 — RPC replacement so guest display_name holds the full
 *      "Firstname Lastname" + backfill of existing guest rows.
 *  (b) admin-v2.html — Add-guest button, modal markup, six required fields.
 *  (c) admin-v2.js — left-join shape, render branch for guest rows,
 *      Phone/Email columns in Excel export, openAddGuestModal / closeAddGuestModal
 *      gate, submitAddGuest payload + RPC name.
 *  (d) tournaments.js — loadRoster no longer uses students!inner, emits a `display`
 *      field that prefers display_name for guests.
 *  (e) i18n — new keys present in en/ru/kk.
 *  (f) Sandbox-execute submitAddGuest with a stubbed Supabase client and assert
 *      payload shape + reason handling.
 *
 * Run: node tests/test-tournament-guest-registration.js
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
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        passed++; console.log(`  ✓ ${msg}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

const ROOT = path.resolve(__dirname, '..');
const MIG  = fs.readFileSync(path.join(ROOT, 'migrations', '050_tournament_guest_registrations.sql'), 'utf8');
const MIG051 = fs.readFileSync(path.join(ROOT, 'migrations', '051_tournament_guest_full_name.sql'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const JS   = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const TJS  = fs.readFileSync(path.join(ROOT, 'tournaments.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// ---------------------------------------------------------------------------
// (a) Migration 050 — schema, RPC, RLS
// ---------------------------------------------------------------------------
console.log('\n=== (a) migrations/050 — schema, RPC, RLS =========================\n');

assert(/CREATE TABLE IF NOT EXISTS tournament_guest_contacts/.test(MIG),
    'creates tournament_guest_contacts table');
assert(/registration_id\s+UUID\s+PRIMARY KEY\s+REFERENCES\s+tournament_registrations\(id\)\s+ON DELETE CASCADE/i.test(MIG),
    'PII row keyed by registration_id with ON DELETE CASCADE');
assert(/first_name\s+TEXT NOT NULL/i.test(MIG) && /last_name\s+TEXT NOT NULL/i.test(MIG),
    'first_name and last_name are NOT NULL');
assert(/age\s+INT NOT NULL CHECK \(age BETWEEN 4 AND 99\)/i.test(MIG),
    'age column has 4..99 bracket check');
assert(/phone\s+TEXT NOT NULL/i.test(MIG) && /email\s+TEXT NOT NULL/i.test(MIG),
    'phone + email are NOT NULL');
assert(/rating\s+INT,/i.test(MIG),
    'rating column is nullable (optional per spec)');
assert(/ENABLE ROW LEVEL SECURITY/i.test(MIG),
    'RLS is enabled on the PII table');
assert(/CREATE POLICY\s+tgc_read_authenticated[\s\S]*FOR SELECT[\s\S]*TO authenticated/i.test(MIG),
    'authenticated SELECT policy created (anon denied implicitly)');
// Only enforce that no *policy* grants INSERT/UPDATE/DELETE — `FOR UPDATE` as
// a row-lock inside SELECT statements is fine (and used by the RPC).
{
    const policyBlocks = MIG.match(/CREATE POLICY[\s\S]*?(?=;)/g) || [];
    const offending = policyBlocks.filter(p => /FOR\s+(INSERT|UPDATE|DELETE)\b/i.test(p));
    assert(offending.length === 0,
        'no public INSERT/UPDATE/DELETE policies — writes only via SECURITY DEFINER RPC');
}

assert(/ADD COLUMN IF NOT EXISTS display_name TEXT/i.test(MIG),
    'tournament_registrations gains display_name column (idempotent)');

// RPC signature must accept all six new guest params.
const sig = MIG.match(/CREATE OR REPLACE FUNCTION register_for_tournament\([\s\S]*?\)\s+RETURNS JSONB/);
assert(sig != null, 'register_for_tournament signature present');
if (sig) {
    const block = sig[0];
    for (const param of ['p_guest_first_name','p_guest_last_name','p_guest_rating','p_guest_age','p_guest_phone','p_guest_email']) {
        assert(block.includes(param), `RPC takes ${param}`);
    }
}

assert(/'duplicate_guest'/.test(MIG),
    'RPC returns duplicate_guest reason on email collision');
assert(/'invalid_input'/.test(MIG) && /'field'/.test(MIG),
    'RPC returns invalid_input with a field hint');
assert(/calc_league_from_rating\(p_guest_rating\)/.test(MIG),
    'RPC enforces league gate when guest rating + tournament league known');
assert(/INSERT INTO tournament_guest_contacts/.test(MIG),
    'RPC inserts into tournament_guest_contacts on guest path');

// Migration 051: full guest name in display_name + backfill.
assert(/v_full_name\s*:=\s*v_first\s*\|\|\s*' '\s*\|\|\s*v_last/.test(MIG051),
    'migration 051 composes v_full_name as "Firstname Lastname"');
assert(/INSERT INTO tournament_registrations[\s\S]*?display_name[\s\S]*?VALUES[\s\S]*?v_full_name,\s*\n\s*v_full_name/.test(MIG051),
    'migration 051 writes v_full_name into both player_name and display_name on guest INSERT');
assert(/UPDATE tournament_registrations[\s\S]*?SET display_name\s*=\s*player_name[\s\S]*?WHERE student_id IS NULL/.test(MIG051),
    'migration 051 backfills existing guest rows (display_name := player_name where student_id IS NULL)');
assert(/DROP FUNCTION IF EXISTS register_for_tournament\(UUID, UUID, TEXT, TEXT, TEXT\)/.test(MIG),
    'old 5-arg overload dropped so PostgREST dispatches to the new signature');
assert(/GRANT EXECUTE ON FUNCTION[\s\S]*register_for_tournament\(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, TEXT, TEXT\)/.test(MIG),
    'EXECUTE granted on the new 11-arg signature');

// ---------------------------------------------------------------------------
// (b) admin-v2.html — Add-guest button + modal
// ---------------------------------------------------------------------------
console.log('\n=== (b) admin-v2.html — Add-guest button + modal ==================\n');

assert(/id="tournamentsAdminAddGuestBtn"/.test(HTML),
    'Add-guest button exists in admin-v2.html');
assert(/onclick="openAddGuestModal\(\)"/.test(HTML),
    'Add-guest button wires to openAddGuestModal()');
assert(/id="tournamentsAdminAddGuestBtn"[\s\S]{0,400}disabled/.test(HTML),
    'Add-guest button starts disabled until a tournament is selected');

assert(/id="addGuestModal"/.test(HTML),
    'addGuestModal exists');
assert(/id="addGuestForm"/.test(HTML),
    'addGuestForm exists');

const modalBlock = (() => {
    const start = HTML.indexOf('id="addGuestModal"');
    const end = HTML.indexOf('<!-- Attendance Import Modal', start);
    return HTML.slice(start, end > 0 ? end : start + 4000);
})();
for (const fld of ['first_name','last_name','phone','email','age','rating']) {
    assert(new RegExp(`name="${fld}"`).test(modalBlock),
        `guest modal has input name="${fld}"`);
}
assert(/name="phone"[^>]*pattern=/.test(modalBlock),
    'phone input enforces pattern via HTML5');
assert(/name="age"[^>]*min="4"[^>]*max="99"/.test(modalBlock),
    'age input bounded 4..99');
assert(/name="rating"[^>]*min="0"[^>]*max="3500"/.test(modalBlock),
    'rating input bounded 0..3500');

// ---------------------------------------------------------------------------
// (c) admin-v2.js — handlers + Excel + render branch
// ---------------------------------------------------------------------------
console.log('\n=== (c) admin-v2.js — handlers, render branch, Excel ===============\n');

assert(/function openAddGuestModal\(/.test(JS),  'openAddGuestModal defined');
assert(/function closeAddGuestModal\(/.test(JS), 'closeAddGuestModal defined');
assert(/async function submitAddGuest\(/.test(JS),'submitAddGuest defined');
assert(/window\.openAddGuestModal\s*=/.test(JS), 'openAddGuestModal exported on window');
assert(/window\.closeAddGuestModal\s*=/.test(JS),'closeAddGuestModal exported on window');
assert(/window\.submitAddGuest\s*=/.test(JS),    'submitAddGuest exported on window');

const submitBlock = (() => {
    const s = JS.indexOf('async function submitAddGuest(');
    return JS.slice(s, s + 3000);
})();
for (const param of ['p_tournament_id','p_guest_first_name','p_guest_last_name','p_guest_phone','p_guest_email','p_guest_age','p_guest_rating']) {
    assert(submitBlock.includes(param), `submitAddGuest sends ${param}`);
}
assert(/\.rpc\(['"]register_for_tournament['"]/.test(submitBlock),
    'submitAddGuest calls register_for_tournament');
assert(/p_source[:\s]+['"]admin['"]/.test(submitBlock),
    'submitAddGuest stamps p_source = admin');

const regFn = (() => {
    const s = JS.indexOf('async function showTournamentRegistrations(');
    return JS.slice(s, s + 4000);
})();
assert(/tournament_guest_contacts\(/.test(regFn),
    'showTournamentRegistrations joins tournament_guest_contacts');
assert(/display_name/.test(regFn),
    'showTournamentRegistrations selects display_name');
assert(!/students!inner/.test(regFn.replace(/\/\/[^\n]*/g, '')),
    'showTournamentRegistrations no longer uses students!inner (code, comments excluded)');
assert(/badge-guest/.test(regFn) || /guest-row/.test(regFn),
    'showTournamentRegistrations marks guest rows visually');

const xlsxFn = (() => {
    const s = JS.indexOf('async function downloadTournamentRegistrationsExcel(');
    return JS.slice(s, s + 4000);
})();
assert(/admin\.tournaments\.col\.phone/.test(xlsxFn),
    'Excel export adds Phone column');
assert(/admin\.tournaments\.col\.email/.test(xlsxFn),
    'Excel export adds Email column');
assert(/tournament_guest_contacts/.test(xlsxFn),
    'Excel export reads tournament_guest_contacts for guest rows');

// ---------------------------------------------------------------------------
// (d) tournaments.js — loadRoster join + display
// ---------------------------------------------------------------------------
console.log('\n=== (d) tournaments.js — public roster shape ======================\n');

const rosterFn = (() => {
    const s = TJS.indexOf('async function loadRoster(');
    return TJS.slice(s, s + 1500);
})();
assert(rosterFn.length > 0, 'loadRoster found in tournaments.js');
assert(!/students!inner/.test(rosterFn),
    'loadRoster no longer uses students!inner');
assert(/display_name/.test(rosterFn),
    'loadRoster selects display_name for guest rows');
assert(/r\.display/.test(TJS) || /\.display\b/.test(rosterFn),
    'loadRoster output exposes a `display` field used by the render layer');

// ---------------------------------------------------------------------------
// (e) i18n keys — en/ru/kk
// ---------------------------------------------------------------------------
console.log('\n=== (e) i18n keys — en/ru/kk =====================================\n');

const REQUIRED_KEYS = [
    'admin.tournaments.addGuest',
    'admin.tournaments.guestBadge',
    'admin.tournaments.col.phone',
    'admin.tournaments.col.email',
    'admin.tournaments.guestModal.title',
    'admin.tournaments.guestForm.firstName',
    'admin.tournaments.guestForm.lastName',
    'admin.tournaments.guestForm.phone',
    'admin.tournaments.guestForm.email',
    'admin.tournaments.guestForm.age',
    'admin.tournaments.guestForm.rating',
    'admin.tournaments.guestForm.submit',
    'admin.tournaments.guestRegistered',
    'admin.tournaments.duplicateGuest',
    'admin.tournaments.ineligibleGuest',
    'admin.tournaments.invalid_first_name',
    'admin.tournaments.invalid_last_name',
    'admin.tournaments.invalid_phone',
    'admin.tournaments.invalid_email',
    'admin.tournaments.invalid_age',
    'admin.tournaments.invalid_rating',
];

function block(lang) {
    // each language block is delimited by `${lang}: {` ... `}`
    const start = I18N.indexOf(`    ${lang}: {`);
    if (start < 0) return '';
    // crude: take 70 KB of content forward, which covers the largest block.
    return I18N.slice(start, start + 80000);
}
for (const lang of ['en','ru','kk']) {
    const b = block(lang);
    for (const k of REQUIRED_KEYS) {
        assert(b.includes(`"${k}"`),
            `i18n[${lang}] has "${k}"`);
    }
}

// ---------------------------------------------------------------------------
// (f) sandbox-exec submitAddGuest — happy path + error reasons
// ---------------------------------------------------------------------------

function makeFakeDom(formValues, selValue) {
    const elements = new Map();
    function el(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id, value: '', innerHTML: '', textContent: '',
                style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                setAttribute() {}, getAttribute() { return null; },
                reset() {},
            });
        }
        return elements.get(id);
    }
    // Pre-seed the select + add-guest form.
    const sel = el('tournamentsAdminRegSelect');
    sel.value = selValue;
    const form = el('addGuestForm');
    form.first_name = { value: formValues.first_name };
    form.last_name  = { value: formValues.last_name };
    form.phone      = { value: formValues.phone };
    form.email      = { value: formValues.email };
    form.age        = { value: formValues.age };
    form.rating     = { value: formValues.rating };
    form.reset = () => {};
    const document = {
        getElementById: (id) => el(id),
        querySelectorAll: () => ({ forEach: () => {} }),
        querySelector: () => null,
    };
    return { document, el, form };
}

function makeStubSupabase(rpcReply) {
    const calls = [];
    return {
        client: {
            from() { return { select() { return this; }, eq() { return this; }, order() { return Promise.resolve({ data: [], error: null }); } }; },
            rpc(name, params) {
                calls.push({ name, params });
                return Promise.resolve(rpcReply);
            },
        },
        calls,
    };
}

function loadHandlers(fakeDom, supabase) {
    const toastCalls = [];
    // Distinct return value so the production fallback heuristic
    // (`if (t && t !== key)`) treats the key as resolved.
    function _ttSrc()  { return `function _tt(k){ return 'TRANSLATED:' + k; }`; }
    function helpers() {
        return `
            function _escapeHtml(s){ return String(s||''); }
            function _tournamentsAdminToast(msg, type){ toastCalls.push({msg, type}); }
            function _setRegDownloadEnabled(){}
            function _setRegAddGuestEnabled(){}
            function _populateTournamentsAdminRegDropdown(){}
            async function loadTournamentsAdminList(){}
            async function showTournamentRegistrations(){}
        `;
    }
    function extract(name, prefix) {
        const start = JS.indexOf(`${prefix} ${name}(`);
        if (start < 0) return null;
        let depth = 0;
        let i = JS.indexOf('{', start);
        for (; i < JS.length; i++) {
            if (JS[i] === '{') depth++;
            else if (JS[i] === '}') { depth--; if (depth === 0) return JS.slice(start, i + 1); }
        }
        return null;
    }
    const sources = [
        extract('_normalisePhone', 'function'),
        extract('_handleGuestRpcReason', 'function'),
        extract('openAddGuestModal', 'function'),
        extract('closeAddGuestModal', 'function'),
        extract('submitAddGuest', 'async function'),
    ].filter(Boolean).join('\n\n');

    const body = `
'use strict';
${_ttSrc()}
${helpers()}
const document = fakeDoc;
const window = { supabaseClient };
const lucide = { createIcons(){} };
const console = { log(){}, warn(){}, error(){} };
${sources}
return { submitAddGuest, openAddGuestModal, closeAddGuestModal, toastCalls };
`;
    const fn = new Function('fakeDoc', 'supabaseClient', 'toastCalls', body);
    return fn(fakeDom.document, supabase.client, toastCalls);
}

async function runSandbox() {
    console.log('\n=== (f) sandbox — submitAddGuest payload + reason handling ========\n');

    // happy path
    {
        const fakeDom = makeFakeDom({
            first_name: 'Alice', last_name: 'Wonder', phone: '+7 700 1234567',
            email: 'A@B.Co', age: '12', rating: '300',
        }, 'tid-1');
        const { client, calls } = makeStubSupabase({ data: { ok: true, registration_id: 'r-1' }, error: null });
        const { submitAddGuest, toastCalls } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        assert(calls.length === 1 && calls[0].name === 'register_for_tournament',
            'happy path: register_for_tournament RPC fired exactly once');
        const p = calls[0].params;
        assertEqual(p.p_tournament_id, 'tid-1', 'happy path: tournament id forwarded');
        assertEqual(p.p_guest_first_name, 'Alice', 'happy path: first_name passed');
        assertEqual(p.p_guest_last_name, 'Wonder', 'happy path: last_name passed');
        assertEqual(p.p_guest_email, 'a@b.co', 'happy path: email lower-cased');
        assertEqual(p.p_guest_age, 12, 'happy path: age parsed to int');
        assertEqual(p.p_guest_rating, 300, 'happy path: rating parsed to int');
        assertEqual(p.p_source, 'admin', 'happy path: source stamped admin');
        const ok = toastCalls.find(t => t.msg === 'TRANSLATED:admin.tournaments.guestRegistered');
        assert(!!ok, 'happy path: success toast fired');
    }

    // optional rating omitted → null forwarded (not 0, not NaN)
    {
        const fakeDom = makeFakeDom({
            first_name: 'Bob', last_name: 'Knight', phone: '+7 700 0000000',
            email: 'bob@x.io', age: '8', rating: '',
        }, 'tid-2');
        const { client, calls } = makeStubSupabase({ data: { ok: true }, error: null });
        const { submitAddGuest } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        assertEqual(calls[0].params.p_guest_rating, null,
            'optional rating: empty string becomes null (not NaN, not 0)');
    }

    // duplicate_guest reason → toast resolves to the dedicated i18n key
    {
        const fakeDom = makeFakeDom({
            first_name: 'Carol', last_name: 'Doe', phone: '+7 700 0000000',
            email: 'carol@x.io', age: '20', rating: '',
        }, 'tid-3');
        const { client, calls } = makeStubSupabase({
            data: { ok: false, reason: 'duplicate_guest' }, error: null,
        });
        const { submitAddGuest, toastCalls } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        const dup = toastCalls.find(t => t.msg === 'TRANSLATED:admin.tournaments.duplicateGuest');
        assert(!!dup, 'duplicate_guest path: dedicated toast fires');
    }

    // invalid_input with field=email → toast resolves to invalid_email key
    {
        const fakeDom = makeFakeDom({
            first_name: 'Dan', last_name: 'Q', phone: '+7 700 0000000',
            email: 'not-an-email', age: '30', rating: '',
        }, 'tid-4');
        const { client, calls } = makeStubSupabase({
            data: { ok: false, reason: 'invalid_input', field: 'email' }, error: null,
        });
        const { submitAddGuest, toastCalls } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        const fld = toastCalls.find(t => t.msg === 'TRANSLATED:admin.tournaments.invalid_email');
        assert(!!fld, 'invalid_input(field=email): field-specific toast fires');
    }

    // ineligible reason → toast contains template + leagues substituted
    {
        const fakeDom = makeFakeDom({
            first_name: 'Eve', last_name: 'X', phone: '+7 700 0000000',
            email: 'eve@x.io', age: '14', rating: '200',
        }, 'tid-5');
        const { client, calls } = makeStubSupabase({
            data: { ok: false, reason: 'ineligible',
                    student_league: 'C', tournament_league: 'A',
                    student_rating: 200 },
            error: null,
        });
        const { submitAddGuest, toastCalls } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        const ineligible = toastCalls.find(t => /ineligibleGuest/.test(t.msg));
        assert(!!ineligible, 'ineligible path: ineligibleGuest toast fires');
    }

    // No tournament selected → no RPC, early return with toast
    {
        const fakeDom = makeFakeDom({
            first_name: 'A', last_name: 'B', phone: '+7 700 0000000',
            email: 'a@b.io', age: '14', rating: '',
        }, '');
        const { client, calls } = makeStubSupabase({ data: { ok: true }, error: null });
        const { submitAddGuest, toastCalls } = loadHandlers(fakeDom, { client, calls });
        await submitAddGuest({ preventDefault() {}, target: fakeDom.form });
        assert(calls.length === 0, 'gate: no RPC when tournament not selected');
        assert(toastCalls.length > 0, 'gate: a "select a tournament" toast fired');
    }
}

(async () => {
    try { await runSandbox(); }
    catch (e) {
        failed++;
        console.error('sandbox threw:', e && e.stack || e);
    }
    console.log(`\n--- ${passed} passed, ${failed} failed ---`);
    if (failed > 0) process.exit(1);
})();
