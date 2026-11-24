// ============================================================
// Articles Management (user_roles.can_manage_articles) — the public chessempire.kz/articles pages.
// Every read/write goes through the site's /api/articles API (proxied same-origin
// by vercel.json): it sanitizes the HTML and refreshes the public pages, so the
// dashboard never touches the articles table directly.
// ============================================================

const ARTICLES_API_BASE = '/api/articles';
const ARTICLES_SITE_URL = 'https://www.chessempire.kz';
const ARTICLE_TOPICS = ['parents', 'beginners', 'tournaments'];
const ARTICLE_LANGS = [
    { lang: 'ru', label: 'RU', author: 'author', sitePrefix: '' },
    { lang: 'en', label: 'EN', author: 'author_en', sitePrefix: '/en' },
    { lang: 'kk', label: 'KZ', author: 'author_kk', sitePrefix: '/kz' }
];
const ARTICLE_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ARTICLE_COVER_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_EMPTY_FORM = {
    slug: '', topic: 'parents', status: 'draft', author: '', author_en: '', author_kk: '',
    read_minutes: null, cover_url: '', featured: false, sort_order: 0,
    title_ru: '', title_en: '', title_kk: '', teaser_ru: '', teaser_en: '', teaser_kk: '',
    body_ru: '', body_en: '', body_kk: ''
};

let articlesAdminList = null;   // rows from GET /api/articles?all=1
let articleKeysList = null;     // rows from GET /api/articles/keys
// { slug: original slug or null for a new article, form, errors, lang }
let articleEditorState = null;

function _at(key, vars) {
    let s = (typeof t === 'function') ? t(key) : key;
    Object.entries(vars || {}).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
    return s;
}

function _articlesToast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
}

function _articlesEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function _articlesDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

class ArticlesApiError extends Error {
    constructor(status, message, fields) {
        super(message);
        this.status = status;
        this.fields = fields || {};
    }
}

/** Calls the articles API with the signed-in admin's Supabase access token. */
async function articlesApi(path, init = {}) {
    const { data } = await window.supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new ArticlesApiError(401, _at('admin.articles.error.session'));
    const headers = { Authorization: `Bearer ${token}` };
    if (typeof init.body === 'string') headers['Content-Type'] = 'application/json';
    const res = await fetch(ARTICLES_API_BASE + path, { ...init, headers, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ArticlesApiError(res.status, body.error || `Request failed (${res.status})`, body.fields);
    return body;
}

function articleSiteUrl(slug, lang) {
    const l = ARTICLE_LANGS.find(x => x.lang === lang) || ARTICLE_LANGS[0];
    return `${ARTICLES_SITE_URL}${l.sitePrefix}/articles/${encodeURIComponent(slug)}`;
}

// ---------------------------------------------------------------------------
// Section + tabs
// ---------------------------------------------------------------------------

function canManageArticles() {
    return window.supabaseAuth?.getCurrentUserRole()?.can_manage_articles === true;
}

// API keys bypass per-user revocation of can_manage_articles, so only admins manage them.
function canManageArticleKeys() {
    return canManageArticles() && window.supabaseAuth.getCurrentUserRole().role === 'admin';
}

async function showArticlesManagement(updateHash = true) {
    if (!canManageArticles()) {
        _articlesToast(_at('admin.articles.accessDenied'), 'error');
        switchToSection('students');
        return;
    }
    const keysTabBtn = document.querySelector('[data-articles-admin-tab="keys"]');
    if (keysTabBtn) keysTabBtn.style.display = canManageArticleKeys() ? '' : 'none';
    switchToSection('articlesAdmin', updateHash);
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.getElementById('menuArticles');
    if (navItem) navItem.classList.add('active');
    await switchArticlesAdminTab('articles');
}
window.showArticlesManagement = showArticlesManagement;

async function switchArticlesAdminTab(tab) {
    const isKeys = tab === 'keys' && canManageArticleKeys();
    document.getElementById('articlesAdminTabArticles').style.display = isKeys ? 'none' : '';
    document.getElementById('articlesAdminTabKeys').style.display = isKeys ? '' : 'none';
    document.getElementById('articlesAdminNewBtn').style.display = isKeys ? 'none' : '';
    document.querySelectorAll('[data-articles-admin-tab]').forEach(btn => {
        const active = btn.getAttribute('data-articles-admin-tab') === (isKeys ? 'keys' : 'articles');
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (isKeys) await loadArticleKeys();
    else await loadArticlesAdminList();
}
window.switchArticlesAdminTab = switchArticlesAdminTab;

// ---------------------------------------------------------------------------
// Articles list
// ---------------------------------------------------------------------------

async function loadArticlesAdminList() {
    try {
        articlesAdminList = (await articlesApi('?all=1')).articles || [];
    } catch (e) {
        articlesAdminList = null;
        _articlesToast(e.message || _at('admin.articles.error.load'), 'error');
    }
    renderArticlesAdminList();
}
window.loadArticlesAdminList = loadArticlesAdminList;

function _filteredArticles() {
    const needle = (document.getElementById('articlesAdminSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('articlesAdminStatusFilter')?.value || '';
    return (articlesAdminList || []).filter(a =>
        (!status || a.status === status) &&
        (!needle || [a.slug, a.title_ru, a.title_en, a.title_kk].some(s => (s || '').toLowerCase().includes(needle))));
}

function _articleStatusBadge(status) {
    const published = status === 'published';
    return `<span class="article-status-badge ${published ? 'is-published' : 'is-draft'}">${_articlesEsc(_at(`admin.articles.status.${published ? 'published' : 'draft'}`))}</span>`;
}

function _articleActions(a) {
    const slug = _articlesEsc(a.slug);
    const publishKey = a.status === 'published' ? 'unpublish' : 'publish';
    return `
        <div class="action-buttons" style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button class="icon-button" data-article-action="edit" onclick="openArticleEditor('${slug}')" title="${_articlesEsc(_at('admin.articles.action.edit'))}">
                <i data-lucide="edit"></i>
            </button>
            <button class="icon-button" data-article-action="${publishKey}" onclick="toggleArticlePublished('${slug}')" title="${_articlesEsc(_at(`admin.articles.action.${publishKey}`))}" style="color:${a.status === 'published' ? '#d97706' : '#16a34a'};">
                <i data-lucide="${a.status === 'published' ? 'eye-off' : 'send'}"></i>
            </button>
            <button class="icon-button" data-article-action="delete" onclick="deleteArticle('${slug}')" title="${_articlesEsc(_at('admin.articles.action.delete'))}" style="color:#dc2626;">
                <i data-lucide="trash-2"></i>
            </button>
        </div>`;
}

function renderArticlesAdminList() {
    const tbody = document.getElementById('articlesAdminTableBody');
    const cards = document.getElementById('articlesAdminCards');
    if (!tbody || !cards) return;
    const rows = _filteredArticles();
    const topicLabel = topic => _at(`admin.articles.topic.${topic}`);

    if (!rows.length) {
        const msg = _articlesEsc(_at(articlesAdminList ? 'admin.articles.empty' : 'admin.articles.error.load'));
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#94a3b8;">${msg}</td></tr>`;
        cards.innerHTML = `<p class="articles-empty">${msg}</p>`;
        return;
    }

    tbody.innerHTML = rows.map(a => `
        <tr data-article-slug="${_articlesEsc(a.slug)}">
            <td><div style="font-weight:600;">${_articlesEsc(a.title_ru)}</div><div style="font-size:0.75rem; color:#64748b;">${_articlesEsc(a.slug)}</div></td>
            <td>${_articlesEsc(topicLabel(a.topic))}</td>
            <td>${_articleStatusBadge(a.status)}</td>
            <td>${a.featured ? '★' : '—'}</td>
            <td style="white-space:nowrap;">${_articlesEsc(_articlesDate(a.updated_at))}</td>
            <td>${_articleActions(a)}</td>
        </tr>`).join('');

    cards.innerHTML = rows.map(a => `
        <div class="article-card" data-article-slug="${_articlesEsc(a.slug)}">
            <div class="article-card-head">
                <div class="article-card-title">${_articlesEsc(a.title_ru)}</div>
                ${_articleStatusBadge(a.status)}
            </div>
            <div class="article-card-meta">${_articlesEsc(topicLabel(a.topic))}${a.featured ? ' · ★' : ''} · ${_articlesEsc(_articlesDate(a.updated_at))}</div>
            ${_articleActions(a)}
        </div>`).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderArticlesAdminList = renderArticlesAdminList;

async function toggleArticlePublished(slug) {
    const a = (articlesAdminList || []).find(x => x.slug === slug);
    if (!a) return;
    const publish = a.status !== 'published';
    try {
        await articlesApi(`/${encodeURIComponent(slug)}`, {
            method: 'PATCH', body: JSON.stringify({ status: publish ? 'published' : 'draft' })
        });
        _articlesToast(_at(publish ? 'admin.articles.toast.published' : 'admin.articles.toast.unpublished', { title: a.title_ru }), 'success');
        await loadArticlesAdminList();
    } catch (e) {
        _articlesToast(e.message, 'error');
    }
}
window.toggleArticlePublished = toggleArticlePublished;

async function deleteArticle(slug) {
    const a = (articlesAdminList || []).find(x => x.slug === slug);
    if (!a) return;
    if (!confirm(_at('admin.articles.confirmDelete', { title: a.title_ru }))) return;
    try {
        await articlesApi(`/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        _articlesToast(_at('admin.articles.toast.deleted', { title: a.title_ru }), 'success');
        await loadArticlesAdminList();
    } catch (e) {
        _articlesToast(e.message, 'error');
    }
}
window.deleteArticle = deleteArticle;

// ---------------------------------------------------------------------------
// Editor modal
// ---------------------------------------------------------------------------

const _articleField = id => document.getElementById(id);

function openArticleEditor(slug) {
    const existing = slug ? (articlesAdminList || []).find(a => a.slug === slug) : null;
    if (slug && !existing) return;
    const form = { ...ARTICLE_EMPTY_FORM };
    if (existing) Object.keys(form).forEach(k => { form[k] = existing[k] ?? ARTICLE_EMPTY_FORM[k]; });
    articleEditorState = { slug: existing ? existing.slug : null, form, errors: {}, lang: 'ru' };

    _articleField('articleEditorTitle').textContent = _at(existing ? 'admin.articles.editTitle' : 'admin.articles.newTitle');
    _articleField('articleSlug').value = form.slug;
    _articleField('articleTopic').value = form.topic;
    _articleField('articleStatus').value = form.status;
    _articleField('articleReadMinutes').value = form.read_minutes ?? '';
    _articleField('articleSortOrder').value = form.sort_order;
    _articleField('articleFeatured').checked = !!form.featured;
    _articleField('articleCoverUrl').value = form.cover_url || '';
    _renderArticleCover();
    _loadArticleLangFields();
    _renderArticleEditorChrome();
    _articleField('articleEditorModal').classList.add('active');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openArticleEditor = openArticleEditor;

function closeArticleEditor() {
    _articleField('articleEditorModal').classList.remove('active');
    articleEditorState = null;
}
window.closeArticleEditor = closeArticleEditor;

/** Copies the visible inputs into the editor state. */
function _syncArticleForm() {
    const s = articleEditorState;
    const f = s.form;
    f.slug = _articleField('articleSlug').value.trim().toLowerCase();
    f.topic = _articleField('articleTopic').value;
    f.status = _articleField('articleStatus').value;
    const minutes = _articleField('articleReadMinutes').value;
    f.read_minutes = minutes === '' ? null : Number(minutes);
    f.sort_order = Number(_articleField('articleSortOrder').value) || 0;
    f.featured = _articleField('articleFeatured').checked;
    f.cover_url = _articleField('articleCoverUrl').value.trim();
    const l = ARTICLE_LANGS.find(x => x.lang === s.lang);
    f[`title_${l.lang}`] = _articleField('articleLangTitle').value;
    f[`teaser_${l.lang}`] = _articleField('articleLangTeaser').value;
    f[l.author] = _articleField('articleLangAuthor').value;
    f[`body_${l.lang}`] = _articleField('articleLangBody').innerHTML.trim();
}

function _loadArticleLangFields() {
    const s = articleEditorState;
    const l = ARTICLE_LANGS.find(x => x.lang === s.lang);
    _articleField('articleLangTitle').value = s.form[`title_${l.lang}`] || '';
    _articleField('articleLangTeaser').value = s.form[`teaser_${l.lang}`] || '';
    _articleField('articleLangAuthor').value = s.form[l.author] || '';
    _articleField('articleLangBody').innerHTML = s.form[`body_${l.lang}`] || '';
}

function switchArticleEditorLang(lang) {
    _syncArticleForm();
    articleEditorState.lang = lang;
    _loadArticleLangFields();
    _renderArticleEditorChrome();
}
window.switchArticleEditorLang = switchArticleEditorLang;

// Field name → the error slot it shows in; per-language fields share one slot.
function _articleErrorSlot(field, lang) {
    if (field === 'author' || field === 'author_en' || field === 'author_kk') {
        return ARTICLE_LANGS.find(l => l.author === field)?.lang === lang ? 'lang_author' : null;
    }
    const m = field.match(/^(title|teaser|body)_(ru|en|kk)$/);
    if (m) return m[2] === lang ? `lang_${m[1]}` : null;
    return field;
}

function _articleLangHasError(lang) {
    return Object.keys(articleEditorState.errors).some(k =>
        k.endsWith(`_${lang}`) || ARTICLE_LANGS.find(l => l.lang === lang).author === k);
}

/** Tabs, inline errors and the "open on site" link for the current state. */
function _renderArticleEditorChrome() {
    const s = articleEditorState;
    document.querySelectorAll('[data-article-lang-tab]').forEach(btn => {
        const lang = btn.getAttribute('data-article-lang-tab');
        btn.classList.toggle('is-active', lang === s.lang);
        btn.setAttribute('aria-selected', lang === s.lang ? 'true' : 'false');
        btn.classList.toggle('has-error', _articleLangHasError(lang));
    });
    const label = ARTICLE_LANGS.find(l => l.lang === s.lang).label;
    document.querySelectorAll('[data-article-lang-label]').forEach(el => { el.textContent = label; });

    // Errors without a slot of their own (e.g. "_" or an unknown field) go to the general one.
    const shown = {};
    const general = [];
    Object.entries(s.errors).forEach(([field, msg]) => {
        const slot = _articleErrorSlot(field, s.lang);
        if (!slot) return; // belongs to another language tab
        if (slot !== '_' && document.querySelector(`[data-article-error="${slot}"]`)) shown[slot] = msg;
        else general.push(msg);
    });
    shown._ = general.join(' · ');
    document.querySelectorAll('[data-article-error]').forEach(el => {
        const msg = shown[el.getAttribute('data-article-error')];
        el.textContent = msg || '';
        el.style.display = msg ? '' : 'none';
    });

    const link = _articleField('articleSiteLink');
    const slug = s.slug;
    link.style.display = slug ? '' : 'none';
    if (slug) link.href = articleSiteUrl(slug, s.lang);
}

function _renderArticleCover() {
    const url = _articleField('articleCoverUrl').value.trim();
    const img = _articleField('articleCoverPreview');
    img.style.display = url ? '' : 'none';
    if (url) img.src = url;
    _articleField('articleCoverPlaceholder').style.display = url ? 'none' : '';
    _articleField('articleCoverRemove').style.display = url ? '' : 'none';
}
window.onArticleCoverUrlInput = _renderArticleCover;

function removeArticleCover() {
    _articleField('articleCoverUrl').value = '';
    _renderArticleCover();
}
window.removeArticleCover = removeArticleCover;

async function uploadArticleCover(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const s = articleEditorState;
    delete s.errors.cover_url;
    if (!ARTICLE_COVER_TYPES.includes(file.type)) s.errors.cover_url = _at('admin.articles.error.coverType');
    else if (file.size > ARTICLE_COVER_MAX_BYTES) s.errors.cover_url = _at('admin.articles.error.coverSize');
    if (s.errors.cover_url) return _renderArticleEditorChrome();

    const status = _articleField('articleCoverStatus');
    status.textContent = _at('admin.articles.uploading');
    try {
        const fd = new FormData();
        fd.append('file', file);
        const { url } = await articlesApi('/upload', { method: 'POST', body: fd });
        _articleField('articleCoverUrl').value = url;
        _renderArticleCover();
    } catch (e) {
        s.errors.cover_url = e.message;
    } finally {
        status.textContent = '';
        _renderArticleEditorChrome();
    }
}
window.uploadArticleCover = uploadArticleCover;

/** Toolbar: bold, italic, H2/H3, lists, link — on the contenteditable body. */
function articleFormat(cmd) {
    const body = _articleField('articleLangBody');
    body.focus();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    if (cmd === 'h2' || cmd === 'h3') {
        const current = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
        document.execCommand('formatBlock', false, current === cmd ? 'p' : cmd);
    } else if (cmd === 'link') {
        const url = window.prompt(_at('admin.articles.linkPrompt'));
        if (url && /^(https?:\/\/|\/(?!\/)|#)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
    } else {
        document.execCommand(cmd, false, null);
    }
}
window.articleFormat = articleFormat;

function _articlePayload() {
    const f = articleEditorState.form;
    const body = {
        ...f,
        cover_url: f.cover_url || null,
        author: f.author || null, author_en: f.author_en || null, author_kk: f.author_kk || null
    };
    // Empty read time: the API estimates it from the text on create, and keeps it on edit.
    if (body.read_minutes === null) delete body.read_minutes;
    return body;
}

async function saveArticle() {
    const s = articleEditorState;
    _syncArticleForm();
    s.errors = {};
    if (!s.form.slug) s.errors.slug = _at('admin.articles.error.slugRequired');
    if (!s.form.title_ru.trim()) s.errors.title_ru = _at('admin.articles.error.titleRequired');
    if (Object.keys(s.errors).length) return _showArticleErrors();

    const btn = _articleField('articleSaveBtn');
    btn.disabled = true;
    try {
        const body = JSON.stringify(_articlePayload());
        const { article } = s.slug
            ? await articlesApi(`/${encodeURIComponent(s.slug)}`, { method: 'PATCH', body })
            : await articlesApi('', { method: 'POST', body });
        _articlesToast(_at(article.status === 'published' ? 'admin.articles.toast.savedPublished' : 'admin.articles.toast.savedDraft'), 'success');
        closeArticleEditor();
        await loadArticlesAdminList();
    } catch (e) {
        if (Object.keys(e.fields || {}).length) {
            s.errors = e.fields;
            _showArticleErrors();
        } else {
            _articlesToast(e.message, 'error');
        }
    } finally {
        btn.disabled = false;
    }
}
window.saveArticle = saveArticle;

/** Jumps to a language tab with errors (when the current one has none) and repaints. */
function _showArticleErrors() {
    const s = articleEditorState;
    if (!_articleLangHasError(s.lang)) {
        const bad = ARTICLE_LANGS.find(l => _articleLangHasError(l.lang));
        if (bad) {
            s.lang = bad.lang;
            _loadArticleLangFields();
        }
    }
    _renderArticleEditorChrome();
    _articlesToast(_at('admin.articles.error.fixFields'), 'error');
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

async function loadArticleKeys() {
    try {
        articleKeysList = (await articlesApi('/keys')).keys || [];
    } catch (e) {
        articleKeysList = null;
        _articlesToast(e.message || _at('admin.articles.error.load'), 'error');
    }
    renderArticleKeys();
}
window.loadArticleKeys = loadArticleKeys;

function renderArticleKeys() {
    const tbody = document.getElementById('articleKeysTableBody');
    if (!tbody) return;
    if (!articleKeysList || !articleKeysList.length) {
        const msg = _articlesEsc(_at(articleKeysList ? 'admin.articles.keys.empty' : 'admin.articles.error.load'));
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:#94a3b8;">${msg}</td></tr>`;
        return;
    }
    tbody.innerHTML = articleKeysList.map(k => `
        <tr data-key-id="${_articlesEsc(k.id)}">
            <td style="font-weight:600;">${_articlesEsc(k.name)}</td>
            <td><code>${_articlesEsc(k.key_prefix)}…</code></td>
            <td style="white-space:nowrap;">${_articlesEsc(_articlesDate(k.created_at))}</td>
            <td style="white-space:nowrap;">${_articlesEsc(_articlesDate(k.last_used_at))}</td>
            <td style="white-space:nowrap;">${k.revoked_at ? _articlesEsc(_articlesDate(k.revoked_at)) : '—'}</td>
            <td>${k.revoked_at ? '' : `
                <button class="icon-button" data-key-action="revoke" onclick="revokeArticleKey('${_articlesEsc(k.id)}')" title="${_articlesEsc(_at('admin.articles.keys.revoke'))}" style="color:#dc2626;">
                    <i data-lucide="ban"></i>
                </button>`}</td>
        </tr>`).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderArticleKeys = renderArticleKeys;

async function createArticleKey() {
    const input = _articleField('articleKeyName');
    const err = _articleField('articleKeyNameError');
    const name = input.value.trim();
    err.textContent = '';
    if (!name) {
        err.textContent = _at('admin.articles.keys.nameRequired');
        return;
    }
    try {
        const res = await articlesApi('/keys', { method: 'POST', body: JSON.stringify({ name }) });
        input.value = '';
        _articleField('articleNewKeyName').textContent = name;
        _articleField('articleNewKeyValue').textContent = res.key;
        _articleField('articleNewKeyBox').style.display = '';
        await loadArticleKeys();
    } catch (e) {
        if (e.fields && e.fields.name) err.textContent = e.fields.name;
        else _articlesToast(e.message, 'error');
    }
}
window.createArticleKey = createArticleKey;

async function copyArticleNewKey() {
    try {
        await navigator.clipboard.writeText(_articleField('articleNewKeyValue').textContent);
        _articlesToast(_at('admin.articles.keys.copied'), 'success');
    } catch {
        _articlesToast(_at('admin.articles.keys.copyFailed'), 'error');
    }
}
window.copyArticleNewKey = copyArticleNewKey;

/** The plain key is only in the create response: once hidden, it is gone. */
function hideArticleNewKey() {
    _articleField('articleNewKeyValue').textContent = '';
    _articleField('articleNewKeyBox').style.display = 'none';
}
window.hideArticleNewKey = hideArticleNewKey;

async function revokeArticleKey(id) {
    const k = (articleKeysList || []).find(x => x.id === id);
    if (!k) return;
    if (!confirm(_at('admin.articles.keys.confirmRevoke', { name: k.name }))) return;
    try {
        await articlesApi(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
        _articlesToast(_at('admin.articles.keys.revoked', { name: k.name }), 'success');
        await loadArticleKeys();
    } catch (e) {
        _articlesToast(e.message, 'error');
    }
}
window.revokeArticleKey = revokeArticleKey;

document.addEventListener('languagechange', () => {
    if (articlesAdminList) renderArticlesAdminList();
    if (articleKeysList) renderArticleKeys();
    if (articleEditorState) _renderArticleEditorChrome();
});
