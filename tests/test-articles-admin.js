/**
 * Tests for the Articles ("Статьи") section in admin-v2.
 *
 * Coverage:
 *  (a) admin-v2.html — sidebar + More-menu entries (hidden by default), the
 *      #articlesAdminSection, the editor modal and the articles-admin.js tag.
 *  (b) admin-v2.js — menu items shown only for user_roles.can_manage_articles;
 *      hash routing, mobile showSection, More highlight and mobile title
 *      wiring for 'articlesAdmin'.
 *  (c) vercel.json — same-origin rewrites to www.chessempire.kz/api/articles.
 *  (d) i18n.js — every admin.articles.* key used exists in en, ru and kk.
 *  (e) articles-admin.js — one API base constant; no supabase-js writes.
 *  (f) Functional (vm sandbox) — can_manage_articles gate, Bearer token on
 *      every call, publish PATCH, delete needs confirm, editor POST/PATCH +
 *      inline API errors, cover upload, key create (shown once) and revoke.
 *  (g) can_manage_articles permission (stub DB): updateMenuVisibility and the
 *      #articlesAdmin hash for admin/coach with and without the flag, the
 *      admin-only API-keys tab, and the App Access grid toggle persisting
 *      user_roles.can_manage_articles. Migration 106 contents.
 *
 * Run: node tests/test-articles-admin.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
const ARTICLES = fs.readFileSync(path.join(ROOT, 'articles-admin.js'), 'utf8');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// ---------------------------------------------------------------------------
console.log('\n=== (a) admin-v2.html ===============================================\n');

const tagOf = id => (HTML.match(new RegExp(`<[^>]*id="${id}"[^>]*>`)) || [''])[0];

assert(/display:\s*none/.test(tagOf('menuArticles')), 'sidebar #menuArticles exists, hidden by default');
assert(/onclick="showArticlesManagement\(\)"/.test(tagOf('menuArticles')), '#menuArticles opens showArticlesManagement()');
assert(HTML.indexOf('id="menuArticles"') > HTML.indexOf('id="menuTournamentsAdmin"')
    && HTML.indexOf('id="menuArticles"') < HTML.indexOf('id="menuAppAccess"'),
    '#menuArticles sits right after Tournament Management');
assert(/display:\s*none/.test(tagOf('moreMenuArticles')), 'mobile More-menu #moreMenuArticles exists, hidden by default');
assert(/showMobileSection\('articlesAdmin', event\)/.test(tagOf('moreMenuArticles')), '#moreMenuArticles opens the articlesAdmin section');
assert(/id="articlesAdminSection" class="content-section"/.test(HTML), '#articlesAdminSection content section exists');
for (const id of ['articlesAdminSearch', 'articlesAdminStatusFilter', 'articlesAdminTableBody', 'articlesAdminCards',
    'articlesAdminNewBtn', 'articleKeysTableBody', 'articleKeyName', 'articleNewKeyBox', 'articleEditorModal',
    'articleSlug', 'articleTopic', 'articleStatus', 'articleReadMinutes', 'articleSortOrder', 'articleFeatured',
    'articleCoverFile', 'articleCoverPreview', 'articleCoverUrl', 'articleLangTitle', 'articleLangTeaser',
    'articleLangAuthor', 'articleLangBody', 'articleSiteLink']) {
    assert(HTML.includes(`id="${id}"`), `#${id} exists`);
}
assert(/id="articleLangBody"[^>]*contenteditable="true"/.test(HTML), 'article body is contenteditable');
for (const cmd of ['bold', 'italic', 'h2', 'h3', 'insertUnorderedList', 'insertOrderedList', 'link']) {
    assert(HTML.includes(`articleFormat('${cmd}')`), `toolbar has ${cmd}`);
}
for (const lang of ['ru', 'en', 'kk']) {
    assert(HTML.includes(`data-article-lang-tab="${lang}"`), `editor has a ${lang} tab`);
}
for (const topic of ['parents', 'beginners', 'tournaments']) {
    assert(HTML.includes(`<option value="${topic}"`), `topic option ${topic}`);
}
assert(HTML.indexOf('<script src="articles-admin.js') > HTML.indexOf('<script src="admin-v2.js'),
    'articles-admin.js is loaded after admin-v2.js');

// ---------------------------------------------------------------------------
console.log('\n=== (b) admin-v2.js wiring ==========================================\n');

const menuFn = JS.slice(JS.indexOf('function updateMenuVisibility()'), JS.indexOf('// Initialize dashboard'));
const articleShows = menuFn.match(/[^\n]*Articles\.style\.display = 'flex'[^\n]*/g) || [];
assert(articleShows.length === 4, 'articles menu is shown in exactly 4 places (sidebar + More, admin + non-admin)');
const flagBlocks = menuFn.match(/if \(userRole\.can_manage_articles === true\) \{[\s\S]*?\n    ?\}/g) || [];
assert(flagBlocks.length === 2 && flagBlocks.every(b => /menuArticles/.test(b) && /moreMenuArticles/.test(b)),
    'both branches show the articles menu only under userRole.can_manage_articles === true');
assert(/case 'articlesAdmin':\s*showArticlesManagement\(false\)/.test(JS), 'hash routing restores #articlesAdmin');
assert(/section === 'articlesAdmin'\)\s*\{\s*if \(typeof showArticlesManagement === 'function'\)/.test(JS), 'mobile showSection handles articlesAdmin');
const moreSubs = JS.match(/const\s+moreSubSections\s*=\s*\[[^\]]+\]/g) || [];
assert(moreSubs.length === 2 && moreSubs.every(d => d.includes("'articlesAdmin'")), 'both moreSubSections lists include articlesAdmin');
assert(/articlesAdmin: 'admin\.articles\.title'/.test(JS), 'mobileSectionTitles has articlesAdmin');

// ---------------------------------------------------------------------------
console.log('\n=== (c) vercel.json rewrites ========================================\n');

const rw = src => (VERCEL.rewrites || []).find(r => r.source === src);
assert(rw('/api/articles')?.destination === 'https://www.chessempire.kz/api/articles', '/api/articles → www.chessempire.kz/api/articles');
assert(rw('/api/articles/:path*')?.destination === 'https://www.chessempire.kz/api/articles/:path*', '/api/articles/:path* → www.chessempire.kz/api/articles/:path*');

// ---------------------------------------------------------------------------
console.log('\n=== (d) i18n keys in en/ru/kk =======================================\n');

const blocks = {
    en: I18N.slice(I18N.indexOf('    en: {'), I18N.indexOf('    kk: {')),
    kk: I18N.slice(I18N.indexOf('    kk: {'), I18N.indexOf('    ru: {')),
    ru: I18N.slice(I18N.indexOf('    ru: {'))
};
const used = new Set([...(HTML + ARTICLES).matchAll(/admin\.articles\.[A-Za-z0-9.]*[A-Za-z0-9]/g)].map(m => m[0]));
// Built from template strings in articles-admin.js.
['action.publish', 'action.unpublish', 'status.published', 'status.draft',
    'topic.parents', 'topic.beginners', 'topic.tournaments'].forEach(k => used.add(`admin.articles.${k}`));
used.delete('admin.articles.action');
used.delete('admin.articles.status');
used.delete('admin.articles.topic');
assert(used.size > 60, `found ${used.size} admin.articles.* keys in use`);
for (const [lang, block] of Object.entries(blocks)) {
    const missing = [...used].filter(k => !block.includes(`"${k}":`));
    assert(missing.length === 0, `${lang}: all keys present${missing.length ? ' — missing ' + missing.join(', ') : ''}`);
}
assert(blocks.ru.includes('"admin.articles.title": "Статьи"'), 'ru title is "Статьи"');

// ---------------------------------------------------------------------------
console.log('\n=== (e) articles-admin.js static checks =============================\n');

assert((ARTICLES.match(/['"`]\/api\/articles/g) || []).length === 1, 'the /api/articles base URL is a single constant');
assert(/const ARTICLES_API_BASE = '\/api\/articles';/.test(ARTICLES), 'ARTICLES_API_BASE = "/api/articles"');
assert(!/\.from\(\s*['"`]articles/.test(ARTICLES + JS), 'no supabase-js access to the articles tables');
assert(!/\.(insert|update|upsert|delete)\(/.test(ARTICLES), 'articles-admin.js has no supabase-js writes');
assert(/Authorization: `Bearer \$\{token\}`/.test(ARTICLES), 'articlesApi sets the Bearer header');

// ---------------------------------------------------------------------------
console.log('\n=== (f) functional (vm sandbox) =====================================\n');

function makeEl(id) {
    const classes = new Set();
    return {
        id, value: '', textContent: '', innerHTML: '', checked: false, disabled: false, href: '', src: '',
        files: null, style: {}, attrs: {},
        classList: {
            add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
            toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
        },
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, focus() {}
    };
}

const ARTICLE = {
    id: 'a1', slug: 'age-to-start', topic: 'parents', status: 'draft', featured: true, sort_order: 0,
    author: 'Coach', author_en: null, author_kk: null, read_minutes: 4, cover_url: null,
    title_ru: 'С какого возраста', title_en: 'What age', title_kk: 'Қай жастан',
    teaser_ru: 't', teaser_en: 't', teaser_kk: 't', body_ru: '<p>x</p>', body_en: '', body_kk: '',
    updated_at: '2026-11-20T10:00:00Z'
};

const ADMIN_WITH_FLAG = { role: 'admin', can_manage_articles: true };

function sandbox({ userRole = ADMIN_WITH_FLAG, confirmResult = true, token = 'tok-123', respond } = {}) {
    const els = {};
    const calls = [];
    const toasts = [];
    const sections = [];
    const confirms = [];
    const ctx = {
        console,
        URLSearchParams, FormData: class { constructor() { this.parts = []; } append(k, v) { this.parts.push([k, v]); } },
        document: {
            getElementById: id => (els[id] ||= makeEl(id)),
            querySelectorAll: () => [],
            querySelector: sel => (sel === '[data-articles-admin-tab="keys"]' ? (els.articlesKeysTabBtn ||= makeEl('articlesKeysTabBtn')) : null),
            addEventListener() {}, execCommand() {}, queryCommandValue: () => ''
        },
        window: {
            supabaseAuth: { getCurrentUserRole: () => userRole },
            supabaseClient: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } },
            prompt: () => null
        },
        navigator: { clipboard: { writeText: async () => {} } },
        t: k => k,
        showToast: (msg, type) => toasts.push({ msg, type }),
        switchToSection: (s, h) => sections.push([s, h]),
        confirm: msg => { confirms.push(msg); return confirmResult; },
        fetch: async (url, init = {}) => {
            calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
            const [status, body] = (respond && respond(url, init)) || [200, {}];
            return { ok: status < 400, status, json: async () => body };
        }
    };
    vm.createContext(ctx);
    vm.runInContext(ARTICLES, ctx);
    return { ctx, els, calls, toasts, sections, confirms };
}

const listResponder = extra => (url, init) => {
    const r = extra && extra(url, init);
    if (r) return r;
    if (url === '/api/articles?all=1') return [200, { articles: [ARTICLE] }];
    if (url === '/api/articles/keys' && (init.method || 'GET') === 'GET') {
        return [200, { keys: [{ id: 'k1', name: 'Bot', key_prefix: 'cea_abcd', created_at: '2026-11-01T00:00:00Z', last_used_at: null, revoked_at: null }] }];
    }
    return [200, {}];
};

(async () => {
    // Gate
    {
        const s = sandbox({ userRole: { role: 'coach' } });
        await s.ctx.showArticlesManagement();
        assert(!s.sections.some(x => x[0] === 'articlesAdmin') && s.calls.length === 0, 'no flag: section not opened, no API call');
        assert(s.toasts.some(x => x.msg === 'admin.articles.accessDenied' && x.type === 'error'), 'no flag: access-denied toast');
        assert(s.sections.some(x => x[0] === 'students'), 'no flag: redirected to students');
        const n = sandbox({ userRole: null });
        await n.ctx.showArticlesManagement();
        assert(!n.sections.some(x => x[0] === 'articlesAdmin'), 'no role: section not opened');
    }

    // Open + list
    {
        const s = sandbox({ respond: listResponder() });
        await s.ctx.showArticlesManagement();
        assert(s.sections[0] && s.sections[0][0] === 'articlesAdmin', "admin: switchToSection('articlesAdmin')");
        assert(s.calls[0]?.url === '/api/articles?all=1', 'admin: loads GET /api/articles?all=1');
        assert(s.calls.every(c => c.headers.Authorization === 'Bearer tok-123'), 'every call sends the session Bearer token');
        assert(s.els.articlesAdminTableBody.innerHTML.includes('age-to-start'), 'list renders the article row');
        assert(s.els.articlesAdminCards.innerHTML.includes('age-to-start'), 'mobile cards render the article');

        s.els.articlesAdminSearch.value = 'nothing-like-this';
        s.ctx.renderArticlesAdminList();
        assert(s.els.articlesAdminTableBody.innerHTML.includes('admin.articles.empty'), 'search filters the list');
        s.els.articlesAdminSearch.value = '';
        s.els.articlesAdminStatusFilter.value = 'published';
        s.ctx.renderArticlesAdminList();
        assert(!s.els.articlesAdminTableBody.innerHTML.includes('age-to-start'), 'status filter hides drafts');
        s.els.articlesAdminStatusFilter.value = '';

        // Publish
        await s.ctx.toggleArticlePublished('age-to-start');
        const patch = s.calls.find(c => c.method === 'PATCH');
        assert(patch && patch.url === '/api/articles/age-to-start' && JSON.parse(patch.body).status === 'published',
            'publish → PATCH /api/articles/:slug {status: published}');
        assert(patch && patch.headers['Content-Type'] === 'application/json', 'JSON bodies are sent as application/json');
    }

    // Delete requires confirm
    {
        const s = sandbox({ confirmResult: false, respond: listResponder() });
        await s.ctx.loadArticlesAdminList();
        await s.ctx.deleteArticle('age-to-start');
        assert(s.confirms.length === 1, 'delete asks for confirmation');
        assert(!s.calls.some(c => c.method === 'DELETE'), 'cancelled confirm → no DELETE');
        const ok = sandbox({ confirmResult: true, respond: listResponder() });
        await ok.ctx.loadArticlesAdminList();
        await ok.ctx.deleteArticle('age-to-start');
        assert(ok.calls.some(c => c.method === 'DELETE' && c.url === '/api/articles/age-to-start'), 'confirmed → DELETE /api/articles/:slug');
    }

    // No session → no request
    {
        const s = sandbox({ token: null });
        await s.ctx.loadArticlesAdminList();
        assert(s.calls.length === 0, 'no session token → no request sent');
        assert(s.toasts.some(x => x.type === 'error'), 'no session token → error toast');
    }

    // Editor: create with inline API validation errors, then success
    {
        let fail = true;
        const s = sandbox({
            respond: listResponder((url, init) => {
                if (url === '/api/articles' && init.method === 'POST') {
                    return fail ? [400, { error: 'Validation failed', fields: { slug: 'Slug may only contain a-z', title_en: 'At most 200 characters' } }]
                        : [201, { article: { ...ARTICLE, slug: 'new-one' } }];
                }
            })
        });
        s.ctx.openArticleEditor();
        assert(s.els.articleEditorModal.classList.contains('active'), 'new article opens the editor modal');
        s.ctx.saveArticle();
        await new Promise(r => setImmediate(r));
        assert(!s.calls.some(c => c.method === 'POST'), 'empty slug/title → blocked client-side, no POST');

        s.els.articleSlug.value = 'New-One';
        s.els.articleLangTitle.value = 'Новая';
        s.els.articleLangBody.innerHTML = '<p>Текст</p>';
        await s.ctx.saveArticle();
        const post = s.calls.find(c => c.method === 'POST');
        const body = post && JSON.parse(post.body);
        assert(post && post.url === '/api/articles', 'create → POST /api/articles');
        assert(body && body.slug === 'new-one' && body.title_ru === 'Новая' && body.body_ru === '<p>Текст</p>' && body.topic === 'parents',
            'POST body carries slug (lower-cased), topic, RU title and body');
        assert(body && !('read_minutes' in body) && body.cover_url === null, 'empty read time is left to the API; empty cover is null');
        assert(s.els.articleEditorModal.classList.contains('active'), 'API validation error keeps the editor open');
        assert(s.toasts.some(x => x.msg === 'admin.articles.error.fixFields'), 'API field errors → "fix the fields" toast');
        const state = vm.runInContext('articleEditorState', s.ctx);
        assert(state.errors.slug === 'Slug may only contain a-z', 'API field errors are kept for inline display');
        assert(state.lang === 'en', 'jumps to the EN tab, which holds a field error');

        fail = false;
        await s.ctx.saveArticle();
        assert(!s.els.articleEditorModal.classList.contains('active'), 'successful save closes the editor');
        assert(s.toasts.some(x => x.msg === 'admin.articles.toast.savedDraft'), 'draft save toast');
    }

    // Editor: edit → PATCH with original slug, language tabs keep their text, site link
    {
        const s = sandbox({ respond: listResponder((url, init) => init.method === 'PATCH' ? [200, { article: ARTICLE }] : null) });
        await s.ctx.loadArticlesAdminList();
        s.ctx.openArticleEditor('age-to-start');
        assert(s.els.articleSlug.value === 'age-to-start' && s.els.articleLangTitle.value === 'С какого возраста', 'edit pre-fills the form');
        assert(s.els.articleSiteLink.href === 'https://www.chessempire.kz/articles/age-to-start', '"open on site" link (RU)');
        s.ctx.switchArticleEditorLang('en');
        assert(s.els.articleLangTitle.value === 'What age', 'EN tab shows the EN title');
        assert(s.els.articleSiteLink.href === 'https://www.chessempire.kz/en/articles/age-to-start', '"open on site" link (EN)');
        s.els.articleLangTitle.value = 'What age, really';
        s.ctx.switchArticleEditorLang('kk');
        assert(s.els.articleSiteLink.href === 'https://www.chessempire.kz/kz/articles/age-to-start', '"open on site" link (KZ)');
        s.ctx.switchArticleEditorLang('ru');
        s.els.articleStatus.value = 'published';
        await s.ctx.saveArticle();
        const patch = s.calls.find(c => c.method === 'PATCH');
        const body = patch && JSON.parse(patch.body);
        assert(patch && patch.url === '/api/articles/age-to-start', 'edit → PATCH /api/articles/<original slug>');
        assert(body && body.title_en === 'What age, really' && body.title_ru === 'С какого возраста' && body.status === 'published',
            'PATCH keeps edits made on other language tabs');
    }

    // Cover upload
    {
        const s = sandbox({ respond: listResponder((url) => url === '/api/articles/upload' ? [201, { url: 'https://cdn.example/c.png' }] : null) });
        s.ctx.openArticleEditor();
        await s.ctx.uploadArticleCover({ files: [{ type: 'image/gif', size: 10 }], value: 'x' });
        assert(!s.calls.some(c => c.url === '/api/articles/upload'), 'GIF cover rejected client-side');
        await s.ctx.uploadArticleCover({ files: [{ type: 'image/png', size: 6 * 1024 * 1024 }], value: 'x' });
        assert(!s.calls.some(c => c.url === '/api/articles/upload'), '>5 MB cover rejected client-side');
        await s.ctx.uploadArticleCover({ files: [{ type: 'image/png', size: 1000 }], value: 'x' });
        const up = s.calls.find(c => c.url === '/api/articles/upload');
        assert(up && up.method === 'POST' && up.headers.Authorization === 'Bearer tok-123' && !up.headers['Content-Type'],
            'cover → multipart POST /api/articles/upload with Bearer (browser sets the boundary)');
        assert(s.els.articleCoverUrl.value === 'https://cdn.example/c.png' && s.els.articleCoverPreview.src === 'https://cdn.example/c.png',
            'uploaded cover URL fills the field and the preview');
    }

    // API keys
    {
        const s = sandbox({
            respond: listResponder((url, init) => {
                if (url === '/api/articles/keys' && init.method === 'POST') return [201, { key: 'cea_SECRET', apiKey: { id: 'k2' } }];
            })
        });
        await s.ctx.switchArticlesAdminTab('keys');
        assert(s.calls.some(c => c.url === '/api/articles/keys' && c.method === 'GET'), 'keys tab → GET /api/articles/keys');
        assert(s.els.articleKeysTableBody.innerHTML.includes('cea_abcd'), 'keys list shows the prefix');
        await s.ctx.createArticleKey();
        assert(!s.calls.some(c => c.method === 'POST'), 'empty key name → no POST');
        s.els.articleKeyName.value = 'Content bot';
        await s.ctx.createArticleKey();
        const post = s.calls.find(c => c.method === 'POST');
        assert(post && JSON.parse(post.body).name === 'Content bot', 'create key → POST /api/articles/keys {name}');
        assert(s.els.articleNewKeyValue.textContent === 'cea_SECRET' && s.els.articleNewKeyBox.style.display === '', 'new key is shown');
        s.ctx.hideArticleNewKey();
        assert(s.els.articleNewKeyValue.textContent === '' && s.els.articleNewKeyBox.style.display === 'none', '"Done" wipes the key from the page');

        await s.ctx.revokeArticleKey('k1');
        assert(s.confirms.length === 1, 'revoke asks for confirmation');
        assert(s.calls.some(c => c.method === 'DELETE' && c.url === '/api/articles/keys/k1'), 'revoke → DELETE /api/articles/keys/:id');
    }

    // -----------------------------------------------------------------------
    console.log('\n=== (g) can_manage_articles permission ==============================\n');

    // updateMenuVisibility() from admin-v2.js, run against a stub DOM.
    const MENU_SRC = JS.slice(JS.indexOf('// Only admins may create students'), JS.indexOf('// Initialize dashboard'));
    function menusFor(userRole) {
        const els = {};
        const ctx = {
            console: { log() {}, warn() {} },
            document: { getElementById: id => (els[id] ||= makeEl(id)) },
            window: { supabaseAuth: { getCurrentUserRole: () => userRole } },
            sessionStorage: { getItem: () => null }
        };
        vm.createContext(ctx);
        vm.runInContext(MENU_SRC + '\nupdateMenuVisibility();', ctx);
        return {
            sidebar: els.menuArticles?.style.display === 'flex',
            more: els.moreMenuArticles?.style.display === 'flex',
            mgmtTitle: els.managementSectionTitle?.style.display
        };
    }
    // Opening #articlesAdmin directly: the hash router calls showArticlesManagement(false).
    async function openHash(userRole) {
        const s = sandbox({ userRole, respond: listResponder() });
        await s.ctx.showArticlesManagement(false);
        return s;
    }

    // (a) admin with the flag
    {
        const m = menusFor({ role: 'admin', can_manage_articles: true });
        assert(m.sidebar && m.more, 'admin + flag: sidebar and More-menu «Статьи» shown');
        const s = await openHash({ role: 'admin', can_manage_articles: true });
        assert(s.sections.some(x => x[0] === 'articlesAdmin' && x[1] === false), 'admin + flag: #articlesAdmin opens');
        assert(s.els.articlesKeysTabBtn.style.display === '', 'admin + flag: API-keys tab visible');
        await s.ctx.switchArticlesAdminTab('keys');
        assert(s.calls.some(c => c.url === '/api/articles/keys'), 'admin + flag: keys tab loads keys');
    }
    // (b) admin without the flag
    {
        const m = menusFor({ role: 'admin', can_manage_articles: false });
        assert(!m.sidebar && !m.more, 'admin without flag: no «Статьи» menu');
        assert(!menusFor({ role: 'admin' }).sidebar, 'admin with flag missing (pre-106 row): no «Статьи» menu');
        const s = await openHash({ role: 'admin', can_manage_articles: false });
        assert(!s.sections.some(x => x[0] === 'articlesAdmin') && s.calls.length === 0, 'admin without flag: #articlesAdmin denied, no API call');
        assert(s.toasts.some(x => x.msg === 'admin.articles.accessDenied'), 'admin without flag: access-denied toast');
        assert(s.sections.some(x => x[0] === 'students'), 'admin without flag: redirected to students');
    }
    // (c) coach with the flag
    {
        const m = menusFor({ role: 'coach', can_manage_articles: true });
        assert(m.sidebar && m.more, 'coach + flag: sidebar and More-menu «Статьи» shown');
        assert(m.mgmtTitle === 'block', 'coach + flag: counts toward the Management section title');
        const s = await openHash({ role: 'coach', can_manage_articles: true });
        assert(s.sections.some(x => x[0] === 'articlesAdmin'), 'coach + flag: #articlesAdmin opens');
        assert(s.els.articlesAdminTableBody.innerHTML.includes('age-to-start'), 'coach + flag: article list renders');
        assert(s.els.articlesKeysTabBtn.style.display === 'none', 'coach + flag: API-keys tab hidden');
        const before = s.calls.length;
        await s.ctx.switchArticlesAdminTab('keys');
        assert(!s.calls.slice(before).some(c => c.url.startsWith('/api/articles/keys')), 'coach + flag: forcing the keys tab never calls the keys API');
        assert(s.els.articlesAdminTabKeys.style.display === 'none', 'coach + flag: keys panel stays hidden');
    }
    // (d) coach without the flag
    {
        const m = menusFor({ role: 'coach', can_manage_articles: false });
        assert(!m.sidebar && !m.more, 'coach without flag: no «Статьи» menu');
        assert(m.mgmtTitle === 'none', 'coach without flag (no other perms): Management title hidden');
        const s = await openHash({ role: 'coach', can_manage_articles: false });
        assert(!s.sections.some(x => x[0] === 'articlesAdmin') && s.calls.length === 0, 'coach without flag: #articlesAdmin denied, no API call');
        assert(s.toasts.some(x => x.msg === 'admin.articles.accessDenied'), 'coach without flag: access-denied toast');
    }
    // (e) App Access grid toggle (crud-management.js) against a stub user_roles table
    {
        const CRUD = fs.readFileSync(path.join(ROOT, 'crud-management.js'), 'utf8');
        const GRID_SRC = CRUD.slice(CRUD.indexOf('function displayAppAccessUsers(users)'), CRUD.indexOf('async function deleteAppAccessUser'));
        const userRolesTable = [
            { user_id: 'u-coach', role: 'coach', can_manage_articles: false },
            { user_id: 'u-admin', role: 'admin', can_manage_articles: false }
        ];
        const messages = [];
        const container = { innerHTML: '', querySelectorAll: () => [] };
        const ctx = {
            console,
            document: { getElementById: id => (id === 'appAccessUsersList' ? container : null) },
            lucide: { createIcons() {} },
            showAppAccessMessage: (type, msg) => messages.push(type),
            window: {
                supabaseAuth: { isAdmin: () => true },
                supabaseClient: {
                    from: table => ({
                        update: patch => ({
                            eq: async (col, val) => {
                                userRolesTable.filter(r => table === 'user_roles' && r[col] === val).forEach(r => Object.assign(r, patch));
                                return { error: null };
                            }
                        })
                    })
                }
            }
        };
        vm.createContext(ctx);
        vm.runInContext(GRID_SRC, ctx);
        ctx.displayAppAccessUsers(userRolesTable.map(r => ({ ...r, email: `${r.user_id}@x.kz` })));
        const html = container.innerHTML;
        const toggleRe = uid => new RegExp(`<input type="checkbox"[^>]*\\s(disabled\\s+)?data-user-id="${uid}"\\s+data-permission="can_manage_articles"`);
        assert(toggleRe('u-coach').test(html), 'App Access grid renders the can_manage_articles toggle for a coach');
        const adminToggle = html.match(toggleRe('u-admin'));
        assert(adminToggle && !adminToggle[1], 'admin card renders an enabled can_manage_articles toggle');
        assert(html.includes('Article Management'), 'toggle label falls back to "Article Management"');

        for (const [uid, value] of [['u-coach', true], ['u-admin', true], ['u-coach', false]]) {
            await ctx.handleAppAccessPermissionChange({ target: { dataset: { userId: uid, permission: 'can_manage_articles' }, checked: value } });
            assert(userRolesTable.find(r => r.user_id === uid).can_manage_articles === value,
                `flipping the toggle persists user_roles.can_manage_articles = ${value} for ${uid}`);
        }
        assert(messages.every(m => m === 'success'), 'toggle saves report success');
    }
    // i18n + migration 106
    {
        for (const [lang, label] of [['en', 'Article Management'], ['ru', 'Управление статьями'], ['kk', 'Мақалаларды басқару']]) {
            assert(blocks[lang].includes(`"access.permissions.manageArticles": "${label}"`), `${lang}: access.permissions.manageArticles = "${label}"`);
        }
        const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/106_articles_permission.sql'), 'utf8');
        assert(/ADD COLUMN IF NOT EXISTS can_manage_articles BOOLEAN NOT NULL DEFAULT false/i.test(sql), '106 adds can_manage_articles NOT NULL DEFAULT false');
        assert(/DROP FUNCTION IF EXISTS get_user_roles_with_emails\(\)/.test(sql) && /can_manage_articles BOOLEAN,/.test(sql)
            && /COALESCE\(ur\.can_manage_articles, FALSE\) AS can_manage_articles/.test(sql), '106 recreates get_user_roles_with_emails with can_manage_articles');
        assert(/SECURITY DEFINER/.test(sql) && /GRANT EXECUTE ON FUNCTION get_user_roles_with_emails\(\) TO authenticated/.test(sql), '106 keeps SECURITY DEFINER and the authenticated grant');
        assert(/UPDATE user_roles\s+SET can_manage_articles = true\s+WHERE role = 'admin'/.test(sql), '106 backfills admins');
        assert(!/CREATE\s+(OR REPLACE\s+)?TRIGGER/i.test(sql), '106 adds no auto-grant trigger');
        assert(fs.existsSync(path.join(ROOT, 'supabase/migrations/106_articles_permission_verify.sql')), '106 verify script exists');
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
