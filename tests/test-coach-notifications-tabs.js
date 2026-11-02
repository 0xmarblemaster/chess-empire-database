/**
 * Coach bell — Unread / Read tabs + «Очистить» (coach-notifications.js,
 * migration 104).
 *
 *  - Pure helpers with the REAL i18n dictionaries: unread / read split,
 *    cleared rows excluded, 7-day window, newest-first read feed, tab bar
 *    (default tab, active class, unread count), per-tab empty text, «Очистить»
 *    only when the active tab has items, admin view (seen / cleared maps).
 *  - Controller driven in a vm with a fake DOM + fake Supabase client:
 *    coach «Очистить» on Unread → mark RPC with the shown ids (items move to
 *    Read), on Read → clear RPC with the shown ids (items leave the bell);
 *    the panel reopens on Unread; admin clears touch localStorage only.
 *  - Source checks: no .delete( anywhere, admin path never calls .rpc(,
 *    key names v2 / cleared-v1.
 *  - Migration 104: cleared_at column, clear RPC only clears READ rows of the
 *    caller, grants, no DELETE, prefill limited to Halyk + Online and 7 days,
 *    ON CONFLICT DO NOTHING; SELECT-only verify script.
 *  - i18n keys in en / kk / ru.
 *
 * Run: node tests/test-coach-notifications-tabs.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('coach-notifications.js');
const I18N = read('i18n.js');
const MIG = read('supabase/migrations/104_coach_notifications_cleared.sql');
const VERIFY = read('supabase/migrations/104_coach_notifications_cleared_verify.sql');
const strip = (s) => s.replace(/--[^\n]*/g, '');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const dictStart = I18N.indexOf('const translations = {');
const dictEnd = I18N.indexOf('\n};', dictStart) + 3;
const translations = vm.runInNewContext(`(${I18N.slice(dictStart + 'const translations = '.length, dictEnd - 1)})`);
const t = (key, params = {}) => String(translations.ru[key] ?? key)
    .replace(/\{\{(.*?)\}\}/g, (_, k) => params[k.trim()] ?? '');

function load() {
    const ctx = { module: { exports: {} }, t, console, Date };
    vm.runInNewContext(SRC, ctx);
    return ctx.module.exports;
}

const cn = load();
const ME = '44444444-4444-4444-8444-444444444444';
const HALYK = 'b146c01e-4a37-440e-84e7-4540358a21b9';
const ONLINE = '0b631805-16b9-4d9e-bbda-d595865cb96d';
const NOW = new Date(2026, 10, 2, 15, 0);
const at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
const row = (id, d, h, extra = {}) => ({
    id, status_history_id: `h-${id}`, student_id: `s-${id}`, student_name: `Ученик ${id}`, student_code: 'CE-1',
    assigned_coach_id: ME, assigned_coach_name: 'Асхат Сериков', branch_id: HALYK, branch_name: 'Halyk Arena',
    kind: 'new_student', created_at: at(d, h), read_at: null, cleared_at: null, ...extra,
});

console.log('\n=== unread / read split ===============================================\n');
const OLD = { ...row('old', 1, 1), created_at: new Date(2026, 9, 25, 10).toISOString() };
const OLD_READ = { ...OLD, id: 'oldr', read_at: at(1, 2) };
const LIST = [
    row('u1', 2, 12), row('u2', 2, 10),
    row('r1', 1, 9, { read_at: at(2, 11) }), row('r2', 2, 8, { read_at: at(2, 9) }),
    row('c1', 2, 7, { read_at: at(2, 8), cleared_at: at(2, 9) }),
    OLD, OLD_READ,
];
const ids = (l) => l.map((n) => n.id).join(',');
assert(ids(cn.unreadNotifications(LIST, NOW)) === 'u1,u2', 'unread = read_at null within 7 days');
assert(ids(cn.readNotifications(LIST, NOW)) === 'r2,r1', 'read = read_at set, not cleared, within 7 days, newest first');
assert(!cn.readNotifications(LIST, NOW).some((n) => n.id === 'c1'), 'cleared rows excluded from Read');
assert(!cn.unreadNotifications(LIST, NOW).some((n) => n.id === 'old')
    && !cn.readNotifications(LIST, NOW).some((n) => n.id === 'oldr'), '7-day window on both tabs');
assert(cn.visibleNotifications === cn.unreadNotifications, 'visibleNotifications is an alias of unreadNotifications');

console.log('\n=== tab rendering =====================================================\n');
const tabBtn = (html, tab) => (html.match(new RegExp(`<button[^>]*data-tab="${tab}"[^>]*>[\\s\\S]*?</button>`)) || [''])[0];
const def = cn.renderPanel(LIST, ME, NOW);
assert(def.includes('<h3>Уведомления</h3>'), 'header title');
assert(/class="cn-tab cn-tab-active" data-action="tab" data-tab="unread"/.test(def), 'default tab = Unread (active)');
assert(/class="cn-tab" data-action="tab" data-tab="read"/.test(def), 'Read tab inactive by default');
assert(tabBtn(def, 'unread').includes('Непрочитанные') && tabBtn(def, 'unread').includes('<span class="cn-tab-count">2</span>'),
    'Unread tab label + count');
assert(tabBtn(def, 'read').includes('Прочитанные') && !tabBtn(def, 'read').includes('cn-tab-count'), 'Read tab label, no count');
assert((def.match(/class="cn-item unread/g) || []).length === 2 && !/class="cn-item read/.test(def), 'Unread tab lists unread items');
assert(def.includes('data-action="clear">Очистить</button>'), '«Очистить» on non-empty Unread tab');

const rd = cn.renderPanel(LIST, ME, NOW, 'read');
assert(/class="cn-tab cn-tab-active" data-action="tab" data-tab="read"/.test(rd) && /class="cn-tab" data-action="tab" data-tab="unread"/.test(rd),
    'Read tab active when chosen');
assert(tabBtn(rd, 'unread').includes('<span class="cn-tab-count">2</span>'), 'unread count still shown on the Read tab');
const readItems = rd.match(/class="cn-item read[^"]*" data-id="([^"]+)" data-action="open"/g) || [];
assert(readItems.length === 2 && rd.indexOf('data-id="r2"') < rd.indexOf('data-id="r1"'), 'Read tab: compact read rows, newest first');
assert(!/class="cn-item unread/.test(rd) && !rd.includes('data-id="c1"'), 'Read tab: no unread, no cleared');
assert(rd.includes('data-action="clear">Очистить</button>'), '«Очистить» on non-empty Read tab');

const onlyUnread = cn.renderPanel([row('u1', 2, 12)], ME, NOW, 'read');
assert(onlyUnread.includes('<div class="cn-empty">Нет прочитанных уведомлений</div>'), 'Read tab empty text');
assert(!onlyUnread.includes('data-action="clear"'), '«Очистить» hidden on an empty Read tab');
const onlyRead = cn.renderPanel([row('r1', 2, 9, { read_at: at(2, 10) })], ME, NOW, 'unread');
assert(onlyRead.includes('<div class="cn-empty">Нет новых уведомлений</div>'), 'Unread tab empty text');
assert(!onlyRead.includes('data-action="clear"'), '«Очистить» hidden on an empty Unread tab');
assert(!onlyRead.includes('cn-tab-count'), 'no count badge when nothing unread');
assert(cn.renderPanel([], ME, NOW, 'bogus').includes('data-tab="unread"') && /cn-tab-active" data-action="tab" data-tab="unread"/.test(cn.renderPanel([], ME, NOW, 'bogus')),
    'unknown tab falls back to Unread');

console.log('\n=== admin view ========================================================\n');
const FAN = [row('a1', 2, 12, { status_history_id: 'H1' }), row('a2', 2, 12, { status_history_id: 'H1' }),
    row('b1', 2, 10, { status_history_id: 'H2' }), row('c1', 2, 9, { status_history_id: 'H3', read_at: at(2, 10) })];
const view = cn.adminView(FAN, { H2: at(2, 11) }, { H3: at(2, 11) }, NOW);
assert(ids(view) === 'a1,b1', 'adminView dedupes events and drops cleared ones');
assert(ids(cn.unreadNotifications(view, NOW)) === 'a1', 'admin unread = not seen');
assert(ids(cn.readNotifications(view, NOW)) === 'b1', 'admin read = seen and not cleared');
assert(cn.adminView([FAN[3]], {}, {}, NOW)[0].read_at === null, "a coach's read_at does not mark it read for the admin");

console.log('\n=== controller (fake DOM + Supabase) ==================================\n');

function fakeEl(tag) {
    const el = {
        tag, className: '', hidden: false, innerHTML: '', children: [], attrs: {}, handlers: {},
        classList: { add() {} },
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(type, fn) { this.handlers[type] = fn; },
        appendChild(c) { this.children.push(c); },
        insertBefore(c) { this.children.unshift(c); },
        querySelector() { return this.badge || (this.badge = fakeEl('span')); },
    };
    return el;
}

// Finds an element by data-action / data-id in the rendered panel HTML.
function clickTarget(panel, action, attrs = {}) {
    const itemId = attrs.itemId;
    return {
        closest(sel) {
            if (sel === '[data-action]') {
                return {
                    getAttribute: (k) => (k === 'data-action' ? action : k === 'data-tab' ? attrs.tab : null),
                    closest: (s) => (s === '.cn-item' && itemId ? { getAttribute: () => itemId } : null),
                };
            }
            return null;
        },
    };
}

function makeEnv({ admin = false, rows = [], store = {} }) {
    const calls = { rpc: [], from: [], ops: [] };
    const builder = (table) => {
        const q = { table, ops: [], head: false };
        const chain = new Proxy(q, {
            get(target, prop) {
                if (prop === 'then') {
                    let result;
                    if (table === 'coaches') result = { data: { branch_id: HALYK, coach_branches: [] }, error: null };
                    else if (q.head) result = { count: rows.filter((r) => !r.read_at).length, error: null };
                    else {
                        const clearedFilter = q.ops.some(([op, a]) => op === 'is' && a[0] === 'cleared_at');
                        result = { data: rows.filter((r) => !clearedFilter || !r.cleared_at).map((r) => ({ ...r })), error: null };
                    }
                    return (res) => res(result);
                }
                if (prop in target && prop !== 'ops') return target[prop];
                if (prop === 'ops') return target.ops;
                return (...args) => {
                    calls.ops.push([table, prop, args]);
                    q.ops.push([prop, args]);
                    if (prop === 'select' && args[1] && args[1].head) q.head = true;
                    return chain;
                };
            },
        });
        return chain;
    };
    const client = {
        from(table) { calls.from.push(table); return builder(table); },
        rpc(name, args) {
            calls.rpc.push([name, args]);
            for (const r of rows) {
                if (!args.ids.includes(r.id)) continue;
                if (name === 'mark_coach_notifications_read' && !r.read_at) r.read_at = NOW.toISOString();
                if (name === 'clear_coach_notifications' && r.read_at && !r.cleared_at) r.cleared_at = NOW.toISOString();
            }
            return Promise.resolve({ error: null });
        },
    };
    const body = fakeEl('body');
    const document = {
        readyState: 'complete', hidden: false, body,
        createElement: (tag) => fakeEl(tag),
        querySelector: () => null,
        addEventListener() {},
    };
    const localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    };
    const window = {
        supabaseClient: client, localStorage,
        authHelpers: { getRoleInfo: async () => (admin ? { isAdmin: true } : { coachId: ME }) },
    };
    const ctx = { window, document, t, console, Date, setInterval: () => 0, Promise };
    vm.runInNewContext(SRC, ctx);
    const panel = () => body.children.find((c) => c.className === 'cn-panel');
    const click = async (action, attrs) => {
        await panel().handlers.click({ stopPropagation() {}, target: clickTarget(panel(), action, attrs) });
        await flush();
    };
    const bell = () => body.children.find((c) => /cn-bell-desktop/.test(c.className));
    return { calls, store, rows, panel, bell, click };
}

const flush = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 10; i++) await flush(); }

(async () => {
    // Coach.
    const now = Date.now();
    const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
    const coachRows = () => [
        { ...row('u1', 2, 12), created_at: iso(10) }, { ...row('u2', 2, 12), created_at: iso(20) },
        { ...row('r1', 2, 12), created_at: iso(30), read_at: iso(25) },
    ];
    const env = makeEnv({ rows: coachRows() });
    await settle();
    const coachList = env.calls.ops.filter(([tb, op]) => tb === 'coach_notifications');
    assert(coachList.some(([, op, a]) => op === 'is' && a[0] === 'cleared_at' && a[1] === null), 'coach list query: cleared_at IS NULL');
    assert(coachList.some(([, op, a]) => op === 'limit' && a[0] === 200), 'coach list query: limit 200');
    assert(coachList.some(([, op, a]) => op === 'is' && a[0] === 'read_at' && a[1] === null), 'badge head query keeps read_at IS NULL');
    assert(env.panel() && !env.panel().hidden, 'auto-opens on new unread');
    assert(/cn-tab-active" data-action="tab" data-tab="unread"/.test(env.panel().innerHTML), 'auto-open lands on the Unread tab');

    await env.click('tab', { tab: 'read' });
    assert(/cn-tab-active" data-action="tab" data-tab="read"/.test(env.panel().innerHTML), 'clicking the Read tab switches tabs');
    assert(env.panel().innerHTML.includes('data-id="r1"') && !env.panel().innerHTML.includes('data-id="u1"'), 'Read tab shows the read row');
    await env.click('open', { itemId: 'r1' });
    assert(env.calls.rpc.length === 0, 'clicking a read card changes no state (no RPC)');

    await env.click('tab', { tab: 'unread' });
    await env.click('clear');
    assert(env.calls.rpc.length === 1 && env.calls.rpc[0][0] === 'mark_coach_notifications_read'
        && JSON.stringify(env.calls.rpc[0][1].ids) === JSON.stringify(['u1', 'u2']), 'Unread «Очистить» → mark RPC with the shown unread ids');
    assert(env.panel().innerHTML.includes('Нет новых уведомлений'), 'Unread tab now empty');

    await env.click('tab', { tab: 'read' });
    const readHtml = env.panel().innerHTML;
    assert(['u1', 'u2', 'r1'].every((id) => readHtml.includes(`data-id="${id}"`)), 'cleared-unread items moved to the Read tab');
    await env.click('clear');
    assert(env.calls.rpc.length === 2 && env.calls.rpc[1][0] === 'clear_coach_notifications'
        && JSON.stringify([...env.calls.rpc[1][1].ids].sort()) === JSON.stringify(['r1', 'u1', 'u2']), 'Read «Очистить» → clear RPC with the shown read ids');
    assert(env.panel().innerHTML.includes('Нет прочитанных уведомлений'), 'Read tab now empty (rows left the bell)');
    assert(env.rows.every((r) => r.cleared_at) && env.rows.length === 3, 'rows still exist, only stamped cleared_at');

    // Closing + reopening from the Read tab lands on Unread.
    const bell = env.bell();
    bell.handlers.click({ stopPropagation() {} });
    assert(env.panel().hidden, 'bell click closes the panel');
    bell.handlers.click({ stopPropagation() {} });
    await settle();
    assert(!env.panel().hidden && /cn-tab-active" data-action="tab" data-tab="unread"/.test(env.panel().innerHTML),
        'reopening resets to the Unread tab');

    // Clicking an unread card marks just that one read.
    const env2 = makeEnv({ rows: coachRows() });
    await settle();
    await env2.click('card', { itemId: 'u2' });
    assert(env2.calls.rpc.length === 1 && JSON.stringify(env2.calls.rpc[0]) === JSON.stringify(['mark_coach_notifications_read', { ids: ['u2'] }]),
        'clicking an unread card marks only it read');
    await env2.click('tab', { tab: 'read' });
    assert(env2.panel().innerHTML.includes('data-id="u2"'), 'clicked card moved to the Read tab');

    // Admin.
    const store = {};
    const adminRows = [
        { ...row('a1', 2, 12, { status_history_id: 'H1' }), created_at: iso(10) },
        { ...row('a2', 2, 12, { status_history_id: 'H1', recipient_coach_id: 'x' }), created_at: iso(10) },
        { ...row('b1', 2, 12, { status_history_id: 'H2', branch_id: ONLINE }), created_at: iso(20) },
    ];
    const adm = makeEnv({ admin: true, rows: adminRows, store });
    await settle();
    assert(!adm.panel().hidden && /data-tab="unread"/.test(adm.panel().innerHTML), 'admin bell auto-opens on Unread');
    await adm.click('clear');
    const seen = JSON.parse(store['cn-admin-seen-v2'] || '{}');
    assert('H1' in seen && 'H2' in seen, 'admin Unread «Очистить» → all events in cn-admin-seen-v2');
    await adm.click('tab', { tab: 'read' });
    assert(adm.panel().innerHTML.includes('data-id="a1"') && adm.panel().innerHTML.includes('data-id="b1"'), 'admin events moved to Read');
    await adm.click('clear');
    const cleared = JSON.parse(store['cn-admin-cleared-v1'] || '{}');
    assert('H1' in cleared && 'H2' in cleared, 'admin Read «Очистить» → events in cn-admin-cleared-v1');
    assert(adm.panel().innerHTML.includes('Нет прочитанных уведомлений'), 'admin Read tab empty after clear');
    assert(adm.calls.rpc.length === 0, 'admin path never calls an RPC');
    assert(Object.keys(store).some((k) => k === 'cn-autopen-v2:admin'), 'auto-open marker key cn-autopen-v2:admin');

    // Stored admin state is pruned after 8 days on init.
    const stale = new Date(now - 9 * 864e5).toISOString();
    const store2 = { 'cn-admin-cleared-v1': JSON.stringify({ OLD: stale, H9: iso(5) }), 'cn-admin-seen-v1': '{"H1":"x"}' };
    makeEnv({ admin: true, rows: [], store: store2 });
    await settle();
    const c2 = JSON.parse(store2['cn-admin-cleared-v1']);
    assert(!('OLD' in c2) && 'H9' in c2, 'cleared map pruned after 8 days');
    assert(store2['cn-admin-seen-v2'] === '{}', 'v1 seen state ignored (v2 starts empty)');

    console.log('\n=== source checks =====================================================\n');
    assert(!/\.delete\(/.test(SRC), 'no .delete( in coach-notifications.js');
    assert(/const ADMIN_SEEN_KEY = 'cn-admin-seen-v2';/.test(SRC) && /const ADMIN_CLEARED_KEY = 'cn-admin-cleared-v1';/.test(SRC)
        && /const AUTOPEN_KEY = 'cn-autopen-v2:';/.test(SRC), 'key names v2 / cleared-v1 / autopen-v2');
    for (const fn of ['function markSeen(', 'function markCleared(', 'function applyAdminState(']) {
        const start = SRC.indexOf(fn);
        const body = SRC.slice(start, SRC.indexOf('\n    }\n', start));
        assert(start !== -1 && !/\.rpc\(/.test(body), `${fn.slice(9, -1)} never calls .rpc(`);
    }
    for (const [fn, divert] of [['async function markRead(', 'markSeen(ids)'], ['async function clearRead(', 'markCleared(ids)']]) {
        const start = SRC.indexOf(fn);
        const body = SRC.slice(start, SRC.indexOf('\n    }\n', start));
        assert(new RegExp(`^\\s*if \\(state\\.admin\\) return ${divert.replace(/[()]/g, '\\$&')};`, 'm').test(body)
            && body.indexOf('state.admin') < body.indexOf('.rpc('), `${fn.slice(15, -1)} diverts admins before .rpc(`);
    }
    const refreshAdmin = SRC.slice(SRC.indexOf('if (state.admin) {', SRC.indexOf('async function refresh()')), SRC.indexOf('const [list, count]'));
    assert(!/\.rpc\(/.test(refreshAdmin), 'admin refresh never calls .rpc(');
    assert(/rpc\('clear_coach_notifications', \{ ids \}\)/.test(SRC), 'clear RPC called with ids');
    assert(!/notifications\.markAllRead/.test(SRC) && !/read-all/.test(SRC), '«Прочитать все» removed');
    const CSS = read('coach-notifications.css');
    assert(/\.cn-tab \{[^}]*min-height: 40px/.test(CSS) && /\.cn-clear \{[^}]*min-height: 40px/.test(CSS), '≥40px tap targets for tabs and «Очистить»');
    assert(/\.cn-tab-active \{[^}]*border-bottom-color: #0d9488/.test(CSS), 'teal active tab underline');
    assert(!/cn-mark-all/.test(CSS), 'old .cn-mark-all style removed');

    console.log('\n=== i18n ==============================================================\n');
    const KEYS = {
        'notifications.tabUnread': ['Unread', 'Непрочитанные', 'Оқылмаған'],
        'notifications.tabRead': ['Read', 'Прочитанные', 'Оқылған'],
        'notifications.clear': ['Clear', 'Очистить', 'Тазалау'],
        'notifications.emptyRead': ['No read notifications', 'Нет прочитанных уведомлений', 'Оқылған хабарландыру жоқ'],
    };
    for (const [k, [en, ru, kk]] of Object.entries(KEYS)) {
        assert(translations.en[k] === en && translations.ru[k] === ru && translations.kk[k] === kk, `${k} in en / ru / kk`);
    }

    console.log('\n=== migration 104 =====================================================\n');
    const CODE = strip(MIG);
    assert(/^\s*BEGIN;/m.test(CODE) && /COMMIT;\s*$/.test(CODE), 'wrapped in BEGIN / COMMIT');
    assert(/ALTER TABLE coach_notifications ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;/.test(CODE), 'cleared_at column, idempotent');
    const fn = (CODE.match(/CREATE OR REPLACE FUNCTION clear_coach_notifications\(([^)]*)\)([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/) || []);
    assert(fn.length && /ids UUID\[\] DEFAULT NULL/.test(fn[1]), 'clear_coach_notifications(ids uuid[] default null)');
    assert(fn.length && /RETURNS INTEGER/.test(fn[2]) && /SECURITY DEFINER/.test(fn[2]) && /SET search_path = public/.test(fn[2]),
        'returns integer, SECURITY DEFINER, search_path = public');
    assert(fn.length && /SET cleared_at = now\(\)\s*\n\s*WHERE/.test(fn[3]), 'only cleared_at is written');
    assert(fn.length && /cn\.cleared_at IS NULL/.test(fn[3]) && /cn\.read_at IS NOT NULL/.test(fn[3]), 'only read, not-yet-cleared rows');
    assert(fn.length && /cn\.recipient_coach_id IN \(SELECT coach_notifications_my_coach_ids\(\)\)/.test(fn[3]), "only the caller's rows");
    assert(fn.length && /\(ids IS NULL OR cn\.id = ANY \(ids\)\)/.test(fn[3]), 'null ids = all of mine');
    assert(/REVOKE ALL ON FUNCTION clear_coach_notifications\(UUID\[\]\) FROM PUBLIC, anon;/.test(CODE)
        && /GRANT EXECUTE ON FUNCTION clear_coach_notifications\(UUID\[\]\) TO authenticated;/.test(CODE), 'revoked from PUBLIC/anon, granted to authenticated');
    assert(!/\bDELETE\b/i.test(CODE) && !/\bTRUNCATE\b/i.test(CODE), 'no DELETE / TRUNCATE anywhere');
    assert(!/GRANT[^;]*\b(UPDATE|DELETE|ALL)\b[^;]*ON coach_notifications/i.test(CODE) && !/CREATE POLICY/i.test(CODE), 'no table write grant or policy');
    const prefill = CODE.slice(CODE.indexOf('WITH ev AS'));
    assert(/h\.created_at >= now\(\) - interval '7 days'/.test(prefill) && !/'3 days'/.test(prefill), 'prefill window = 7 days');
    const branchIn = (prefill.match(/s\.branch_id IN \(([^)]*)\)/) || [])[1] || '';
    assert(branchIn.includes(`'${HALYK}'`) && branchIn.includes(`'${ONLINE}'`) && (branchIn.match(/'[0-9a-f-]{36}'/g) || []).length === 2,
        'prefill limited to Halyk Arena + Online');
    assert(/h\.changed_by_type = 'api'/.test(prefill), 'prefill: students-api events only');
    assert(/ON CONFLICT \(recipient_coach_id, status_history_id\) DO NOTHING;/.test(prefill), 'prefill: ON CONFLICT DO NOTHING');
    const p103 = strip(read('supabase/migrations/103_coach_notifications_backfill_3d.sql'));
    const insert = (s) => s.slice(s.indexOf('INSERT INTO'), s.indexOf('ON CONFLICT'));
    assert(insert(p103) === insert(prefill), 'prefill insert identical to 103');

    const VCODE = strip(VERIFY);
    assert(/READ-ONLY/.test(VERIFY), 'verify header says read-only');
    assert(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(VCODE.replace(/'[^']*'/g, "''")), 'verify script is SELECT-only');
    for (const c of ['cleared_at column (timestamptz, nullable)', 'clear function is security definer',
        'anon cannot execute clear function', 'no DELETE / UPDATE grant to anon / authenticated']) {
        assert(VERIFY.includes(`'${c}'`), `verify checks ${c}`);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
