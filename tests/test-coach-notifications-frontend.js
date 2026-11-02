/**
 * Coach notifications bell — frontend render helpers (coach-notifications.js).
 *
 *  - Render helpers evaluated in a vm with the REAL i18n dictionaries (ru):
 *    escaping of every snapshot field, unread vs read styling (teal unread
 *    item with both buttons; read item collapsed), «Вы — » prefix only for the
 *    viewer's own students, badge count / 99+, «Сегодня» / «Вчера» times.
 *  - Kinds: reactivated cards titled by previous_status (frozen / left) in
 *    en / ru / kk with the cn-item--reactivated modifier; unknown kind falls
 *    back to the new-student title. Frozen cards («Ученик заморожен») get
 *    cn-item--frozen and only «Карточка»; there is no 'left' kind.
 *  - i18n: every notifications.* key in en / kk / ru; RU copy = mockup A.
 *  - Wiring: script + stylesheet tags in admin-v2.html, coach-only activation,
 *    mark-read RPC, 60s poll + visibilitychange, no auto-read on open.
 *
 * Run: node tests/test-coach-notifications-frontend.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('coach-notifications.js');
const I18N = read('i18n.js');
const HTML = read('admin-v2.html');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Real dictionaries: evaluate the `const translations = {…};` literal only.
const dictStart = I18N.indexOf('const translations = {');
const dictEnd = I18N.indexOf('\n};', dictStart) + 3;
const translations = vm.runInNewContext(`(${I18N.slice(dictStart + 'const translations = '.length, dictEnd - 1)})`);

function load(lang) {
    const t = (key, params = {}) => {
        const v = (translations[lang] && translations[lang][key]) ?? translations.en[key] ?? key;
        return String(v).replace(/\{\{(.*?)\}\}/g, (_, k) => params[k.trim()] ?? '');
    };
    const ctx = { module: { exports: {} }, t, console, Date };
    vm.runInNewContext(SRC, ctx);
    return ctx.module.exports;
}

const ME = '44444444-4444-4444-8444-444444444444';
const OTHER = '77777777-7777-4777-8777-777777777777';
const NOW = new Date(2026, 10, 2, 15, 0);
const at = (d, h, m) => new Date(2026, 10, d, h, m).toISOString();
const base = {
    id: 'n1', student_id: 's1', student_name: 'Айсулу Нурланова', student_code: 'CE-00812',
    assigned_coach_id: ME, assigned_coach_name: 'Асхат Сериков', branch_name: 'Gagarin Park',
    created_at: at(2, 11, 42), read_at: null,
};

const cn = load('ru');

console.log('\n=== escaping ==========================================================\n');
assert(cn.escapeHtml(`<img src=x onerror="a('b')">&`) === '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;', 'escapeHtml escapes < > " \' &');
const evil = {
    ...base, id: '"><x', student_name: '<script>alert(1)</script>', student_code: '<b>CE</b>',
    assigned_coach_id: OTHER, assigned_coach_name: '<i>coach</i>', branch_name: '<u>br</u>',
};
const evilHtml = cn.renderItem(evil, ME, NOW);
assert(!/<script|<b>|<i>|<u>|"><x/.test(evilHtml), 'no raw markup from any snapshot field (unread)');
assert(evilHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'student name escaped');
assert(evilHtml.includes('&lt;i&gt;coach&lt;/i&gt;') && evilHtml.includes('&lt;u&gt;br&lt;/u&gt;') && evilHtml.includes('&lt;b&gt;CE&lt;/b&gt;'),
    'coach, branch and code escaped');
const evilRead = cn.renderItem({ ...evil, read_at: at(2, 12, 0) }, ME, NOW);
assert(!/<script|<u>/.test(evilRead), 'no raw markup (read item)');
assert(!cn.renderPanel([evil], ME, NOW).includes('<script'), 'panel escapes too');

console.log('\n=== unread item (mockup A) ============================================\n');
const unread = cn.renderItem(base, ME, NOW);
assert(/class="cn-item unread"/.test(unread), 'unread class (teal-50 + left bar)');
assert(unread.includes('● Новый ученик · из AmoCRM'), 'source label with dot');
assert(unread.includes('<div class="cn-name">Айсулу Нурланова</div>'), 'student name');
assert(unread.includes('<span>Тренер</span><span>Вы — Асхат Сериков</span>'), '«Вы — » prefix for own student');
assert(unread.includes('<span>Филиал</span><span>Gagarin Park</span>'), 'branch row');
assert(unread.includes('Сегодня, 11:42 · CE-00812'), 'time + student_code');
assert(unread.includes('data-action="schedule">В расписание</button>') && unread.includes('data-action="card">Карточка</button>'),
    'both buttons');
assert(unread.includes('<div class="cn-ava">АН</div>'), 'initials avatar');

const other = cn.renderItem({ ...base, assigned_coach_id: OTHER, assigned_coach_name: 'Дана Али' }, ME, NOW);
assert(other.includes('<span>Тренер</span><span>Дана Али</span>') && !other.includes('Вы —'), 'no prefix for another coach');
const noCoach = cn.renderItem({ ...base, assigned_coach_id: null, assigned_coach_name: null }, ME, NOW);
assert(noCoach.includes('<span>Тренер</span><span>Не назначен</span>'), 'no coach → «Не назначен»');
assert(cn.renderItem({ ...base, created_at: at(1, 9, 15) }, ME, NOW).includes('Вчера, 09:15'), 'yesterday');
assert(cn.renderItem({ ...base, created_at: at(20, 9, 5) }, ME, new Date(2026, 11, 1)).includes('20.11, 09:05'),
    'older this year → DD.MM');

console.log('\n=== read item =========================================================\n');
const readHtml = cn.renderItem({ ...base, created_at: at(1, 9, 15), read_at: at(1, 10, 0) }, ME, NOW);
assert(/class="cn-item read"/.test(readHtml) && !/unread/.test(readHtml), 'read class, not unread');
assert(!readHtml.includes('<button'), 'read item collapsed: no buttons');
assert(!readHtml.includes('cn-rows'), 'read item collapsed: no coach / branch rows');
assert(!readHtml.includes('●'), 'read item: no unread dot');
assert(readHtml.includes('Вчера · Gagarin Park'), 'read meta = day · branch');

console.log('\n=== badge + panel =====================================================\n');
const list = [base, { ...base, id: 'n2' }, { ...base, id: 'n3', read_at: at(2, 12, 0) }];
assert(cn.unreadCount(list) === 2, 'unreadCount counts read_at null');
assert(cn.badgeText(0) === '' && cn.badgeText(2) === '2' && cn.badgeText(100) === '99+', 'badge text: hidden / n / 99+');
const panel = cn.renderPanel(list, ME, NOW);
assert(panel.includes('<h3>Уведомления</h3>'), 'panel title');
assert(panel.includes('data-action="read-all">Прочитать все</button>'), '«Прочитать все» when unread exist');
assert(!cn.renderPanel([list[2]], ME, NOW).includes('read-all'), 'no «Прочитать все» when all read');
assert(cn.renderPanel([], ME, NOW).includes('Пока нет уведомлений'), 'empty state');
assert((panel.match(/class="cn-item /g) || []).length === 3, 'one item per notification');

const en = load('en');
assert(en.renderItem(base, ME, NOW).includes('You — Асхат Сериков'), 'EN prefix «You — »');
const kk = load('kk');
assert(kk.renderItem(base, ME, NOW).includes('Сіз — Асхат Сериков'), 'KK prefix «Сіз — »');

console.log('\n=== reactivated kind ==================================================\n');
const TITLES = {
    ru: ['Ученик вернулся из заморозки · AmoCRM', 'Выбывший ученик вернулся · AmoCRM', 'Новый ученик · из AmoCRM'],
    en: ['Student back from freeze · AmoCRM', 'Former student returned · AmoCRM', 'New student · from AmoCRM'],
    kk: ['Оқушы мұздатудан оралды · AmoCRM', 'Кеткен оқушы қайта оралды · AmoCRM', 'Жаңа оқушы · AmoCRM-нен'],
};
const frozenN = { ...base, kind: 'reactivated', previous_status: 'frozen' };
const leftN = { ...base, kind: 'reactivated', previous_status: 'left' };
for (const [lang, [frozenT, leftT, newT]] of Object.entries(TITLES)) {
    const m = load(lang);
    assert(m.renderItem(frozenN, ME, NOW).includes(`● ${frozenT}`), `${lang}: frozen → «${frozenT}»`);
    assert(m.renderItem(leftN, ME, NOW).includes(`● ${leftT}`), `${lang}: left → «${leftT}»`);
    assert(m.renderItem({ ...frozenN, read_at: at(2, 12, 0) }, ME, NOW).includes(`<div class="cn-t1">${frozenT}</div>`), `${lang}: read reactivated keeps its title`);
    assert(m.renderItem({ ...base, kind: 'mystery' }, ME, NOW).includes(`● ${newT}`), `${lang}: unknown kind → new-student title`);
    assert(m.renderItem({ ...base, kind: 'reactivated', previous_status: null }, ME, NOW).includes(`● ${newT}`), `${lang}: reactivated without previous_status → new-student title`);
}
const reHtml = cn.renderItem(frozenN, ME, NOW);
assert(/class="cn-item unread cn-item--reactivated"/.test(reHtml), 'unread reactivated item has the modifier class');
assert(reHtml.includes('<span>Тренер</span><span>Вы — Асхат Сериков</span>') && reHtml.includes('<span>Филиал</span><span>Gagarin Park</span>'),
    'reactivated card keeps coach + branch rows');
assert(reHtml.includes('data-action="schedule">') && reHtml.includes('data-action="card">'), 'reactivated card keeps both buttons');
assert(reHtml.includes('Сегодня, 11:42 · CE-00812'), 'reactivated card keeps time + student_code');
assert(!/cn-item--reactivated/.test(unread), 'new-student item has no modifier');
assert(/class="cn-item read cn-item--reactivated"/.test(cn.renderItem({ ...leftN, read_at: at(2, 12, 0) }, ME, NOW)), 'read reactivated item keeps the modifier');
const evilRe = cn.renderItem({ ...evil, kind: 'reactivated', previous_status: 'left' }, ME, NOW);
assert(!/<script|<b>|<i>|<u>|"><x/.test(evilRe), 'reactivated item escapes every snapshot field');
assert(!cn.renderItem({ ...base, kind: '"><script>', previous_status: '<b>' }, ME, NOW).includes('<script'), 'hostile kind / previous_status never rendered');
assert(cn.titleKey({ kind: 'reactivated', previous_status: 'frozen' }) === 'notifications.backFromFreeze'
    && cn.titleKey({ kind: 'reactivated', previous_status: 'left' }) === 'notifications.formerReturned'
    && cn.titleKey({ kind: 'new_student' }) === 'notifications.newStudentFromAmo', 'titleKey per kind');
const CSS = read('coach-notifications.css');
assert(/\.cn-item--reactivated\.unread \{[^}]*background:[^}]*box-shadow: inset 3px 0 0 #d97706/.test(CSS), 'amber accent for unread reactivated');

console.log('\n=== frozen kind =======================================================\n');
const FROZEN_TITLES = { ru: 'Ученик заморожен · AmoCRM', en: 'Student frozen · AmoCRM', kk: 'Оқушы мұздатылды · AmoCRM' };
const frozenKindN = { ...base, kind: 'frozen', previous_status: 'active' };
for (const [lang, title] of Object.entries(FROZEN_TITLES)) {
    const m = load(lang);
    assert(m.renderItem(frozenKindN, ME, NOW).includes(`● ${title}`), `${lang}: frozen → «${title}»`);
    assert(m.renderItem({ ...frozenKindN, previous_status: 'left' }, ME, NOW).includes(`● ${title}`), `${lang}: left → frozen uses the same title`);
    assert(m.renderItem({ ...frozenKindN, read_at: at(2, 12, 0) }, ME, NOW).includes(`<div class="cn-t1">${title}</div>`), `${lang}: read frozen keeps its title`);
}
const frHtml = cn.renderItem(frozenKindN, ME, NOW);
assert(/class="cn-item unread cn-item--frozen"/.test(frHtml), 'unread frozen item has the cn-item--frozen modifier');
assert(/class="cn-item read cn-item--frozen"/.test(cn.renderItem({ ...frozenKindN, read_at: at(2, 12, 0) }, ME, NOW)), 'read frozen item keeps the modifier');
assert(!frHtml.includes('data-action="schedule"') && frHtml.includes('data-action="card">Карточка</button>'),
    'frozen card: only «Карточка», no «В расписание»');
assert(frHtml.includes('<span>Тренер</span><span>Вы — Асхат Сериков</span>') && frHtml.includes('<span>Филиал</span><span>Gagarin Park</span>')
    && frHtml.includes('Сегодня, 11:42 · CE-00812'), 'frozen card keeps coach / branch / time + code rows');
assert(cn.titleKey({ kind: 'frozen', previous_status: 'active' }) === 'notifications.studentFrozen', 'titleKey frozen');
const evilFr = cn.renderItem({ ...evil, kind: 'frozen', previous_status: 'active' }, ME, NOW);
assert(!/<script|<b>|<i>|<u>|"><x/.test(evilFr), 'frozen item escapes every snapshot field');
assert(/\.cn-item--frozen\.unread \{[^}]*background:[^}]*box-shadow: inset 3px 0 0 #3b82f6/.test(CSS), 'cool blue accent for unread frozen');

console.log('\n=== no left kind ======================================================\n');
const leftKind = cn.renderItem({ ...base, kind: 'left', previous_status: 'active' }, ME, NOW);
assert(leftKind.includes('● Новый ученик · из AmoCRM') && !/cn-item--left/.test(leftKind), "kind 'left' is unknown → new-student fallback, no modifier");
assert(!/cn-item--left/.test(CSS) && !/cn-item--left|'left'\]|kind === 'left'/.test(SRC), 'no left kind in script / CSS');
assert(['en', 'kk', 'ru'].every((l) => !('notifications.studentLeft' in translations[l])), 'no studentLeft string in en / kk / ru');

console.log('\n=== i18n ==============================================================\n');
const KEYS = ['title', 'markAllRead', 'newStudentFromAmo', 'backFromFreeze', 'formerReturned', 'studentFrozen', 'coach', 'branch', 'you', 'noCoach', 'today', 'yesterday', 'toSchedule', 'card', 'empty'];
for (const k of KEYS) {
    const key = `notifications.${k}`;
    assert(['en', 'kk', 'ru'].every((l) => typeof translations[l][key] === 'string' && translations[l][key]), `${key} in en / kk / ru`);
}
const usedKeys = [...new Set([...SRC.matchAll(/tr\('(notifications\.\w+)'/g)].map((m) => m[1]))];
assert(usedKeys.length > 0 && usedKeys.every((k) => KEYS.includes(k.split('.')[1])), 'every key used by the script is defined');
const RU = {
    title: 'Уведомления', markAllRead: 'Прочитать все', newStudentFromAmo: 'Новый ученик · из AmoCRM',
    coach: 'Тренер', branch: 'Филиал', you: 'Вы — {{name}}', today: 'Сегодня', yesterday: 'Вчера',
    toSchedule: 'В расписание', card: 'Карточка',
};
for (const [k, v] of Object.entries(RU)) {
    assert(translations.ru[`notifications.${k}`] === v, `ru notifications.${k} = «${v}» (mockup)`);
}

console.log('\n=== wiring ============================================================\n');
const tagIdx = HTML.search(/<script src="coach-notifications\.js(\?v=\d+)?"><\/script>/);
assert(tagIdx !== -1, 'script tag in admin-v2.html');
assert(tagIdx > HTML.indexOf('<script src="auth-helpers.js'), 'loaded after auth-helpers.js');
assert(/<link rel="stylesheet" href="coach-notifications\.css(\?v=\d+)?">/.test(HTML), 'stylesheet linked');
assert(fs.existsSync(path.join(ROOT, 'coach-notifications.css')), 'stylesheet exists');
assert(/if \(!info \|\| !info\.coachId\) return;/.test(SRC), 'activates only for a coach (getRoleInfo coachId)');
assert(/\.mobile-header-actions/.test(SRC), 'bell in the mobile header actions');
assert(/rpc\('mark_coach_notifications_read', \{ ids: ids \|\| null \}\)/.test(SRC), 'marks read through the RPC');
assert(!/from\('coach_notifications'\)[^;]*\.(update|insert|delete|upsert)\(/.test(SRC), 'no direct table writes');
assert(/const POLL_MS = 60000;/.test(SRC) && /setInterval\(refresh, POLL_MS\)/.test(SRC), 'polls every 60s');
assert(/visibilitychange/.test(SRC), 'refreshes on visibilitychange');
assert(/const LIMIT = 30;/.test(SRC) && /\.limit\(LIMIT\)/.test(SRC), 'latest 30 notifications');
const openFn = SRC.slice(SRC.indexOf('function openPanel()'), SRC.indexOf('function close()'));
assert(openFn.length > 0 && !/markRead/.test(openFn), 'opening the panel does not mark read');
assert(/navigateToAttendanceStudent\(studentId\)/.test(SRC) && /viewStudent\(n\.student_id\)/.test(SRC),
    '«В расписание» → attendance, «Карточка» → student profile');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
