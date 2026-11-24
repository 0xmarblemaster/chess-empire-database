/**
 * Tests for the Articles ("Статьи") section in admin-v2.
 *
 * Coverage:
 *  (a) admin-v2.html — sidebar + More-menu entries (hidden, admin-only), the
 *      #articlesAdminSection, the editor modal and the articles-admin.js tag.
 *  (b) admin-v2.js — menu items flipped only in the admin branch of
 *      updateMenuVisibility; hash routing, mobile showSection, More highlight
 *      and mobile title wiring for 'articlesAdmin'.
 *  (c) vercel.json — same-origin rewrites to www.chessempire.kz/api/articles.
 *  (d) i18n.js — every admin.articles.* key used exists in en, ru and kk.
 *  (e) articles-admin.js — one API base constant; no supabase-js writes.
 *  (f) Functional (vm sandbox) — admin gate, Bearer token on every call,
 *      publish PATCH, delete needs confirm, editor POST/PATCH + inline API
 *      errors, cover upload, key create (shown once) and revoke.
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

const adminBranch = JS.slice(JS.indexOf("if (userRole.role === 'admin') {"), JS.indexOf('// For non-admins, show based on specific permissions'));
assert(/menuArticles\.style\.display = 'flex'/.test(adminBranch), 'admin branch shows #menuArticles');
assert(/moreMenuArticles\.style\.display = 'flex'/.test(adminBranch), 'admin branch shows #moreMenuArticles');
const nonAdmin = JS.slice(JS.indexOf('// For non-admins, show based on specific permissions'), JS.indexOf('// Initialize dashboard'));
assert(!/menuArticles|moreMenuArticles/.test(nonAdmin), 'no permission flag shows the articles menu to non-admins');
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

function sandbox({ role = 'admin', confirmResult = true, token = 'tok-123', respond } = {}) {
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
            querySelectorAll: () => [], querySelector: () => null,
            addEventListener() {}, execCommand() {}, queryCommandValue: () => ''
        },
        window: {
            supabaseAuth: { getCurrentUserRole: () => (role ? { role } : null) },
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
        const s = sandbox({ role: 'coach' });
        await s.ctx.showArticlesManagement();
        assert(s.sections.length === 0 && s.calls.length === 0, 'non-admin: section not opened, no API call');
        assert(s.toasts.some(x => x.msg === 'admin.articles.accessDenied' && x.type === 'error'), 'non-admin: access-denied toast');
        const n = sandbox({ role: null });
        await n.ctx.showArticlesManagement();
        assert(n.sections.length === 0, 'no role: section not opened');
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

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
