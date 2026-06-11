/**
 * Public tournament schedule page.
 *
 *  - Lists branches (excluding НИШ and Zhandosova) with upcoming-tournament counts.
 *  - Branch click → expand to show upcoming tournaments (sorted by date).
 *  - Tournament click → detail panel with capacity meter, full-name roster,
 *    and a Register button.
 *  - Register modal → debounced student search → confirm → atomic RPC.
 *  - Live roster via Supabase Realtime with a 15s polling fallback.
 *
 * Vanilla JS, no build step. Designed to mirror ratings.js conventions.
 */

// Branches excluded from the public schedule. Values are the strings stored
// in branches.name. "NiS" is displayed externally; the DB row is "НИШ".
const EXCLUDED_BRANCHES = ['НИШ', 'Zhandosova'];

// Fallback polling interval (ms) when Realtime cannot connect.
const POLL_INTERVAL_MS = 15000;
// Time we wait for Realtime CHANNEL_SUBSCRIBED before activating polling.
const REALTIME_CONNECT_TIMEOUT_MS = 5000;
// Search debounce (ms) per task spec.
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;
const MIN_SEARCH_CHARS = 2;

const tournamentsApp = {
    branches: [],                  // [{ id, name, upcomingCount }]
    tournamentsByBranch: new Map(),// branchId -> [tournament]
    rostersByTournament: new Map(),// tournamentId -> [{ student_id, first_name, last_name }]
    expandedBranchId: null,
    expandedTournamentId: null,
    activeChannel: null,
    activePollTimer: null,
    activeTournamentId: null,
};

(async function init() {
    // Wait for supabase client (matches ratings.js pattern).
    let retries = 0;
    while (!window.supabaseClient && retries < 30) {
        await new Promise(r => setTimeout(r, 200));
        retries++;
    }
    if (!window.supabaseClient) {
        renderLoadError();
        return;
    }

    initLanguageSwitcher();
    document.addEventListener('languagechange', () => {
        applyI18nLabels();
        renderBranches();
        if (tournamentsApp.expandedBranchId) {
            renderBranchTournaments(tournamentsApp.expandedBranchId);
        }
        if (tournamentsApp.expandedTournamentId) {
            renderTournamentDetail(tournamentsApp.expandedTournamentId);
        }
    });

    initModal();
    await loadBranches();
    renderBranches();
    applyI18nLabels();
})();

// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------
function tt(key, params) {
    if (typeof window.t === 'function') return window.t(key, params);
    return key;
}

function currentLang() {
    if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
        return window.i18n.getCurrentLanguage();
    }
    return localStorage.getItem('ce_language') || 'en';
}

function applyI18nLabels() {
    document.title = tt('tournaments.title') + ' - Chess Empire';
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = tt(el.getAttribute('data-i18n'));
    });
    // Highlight active language button
    const lang = currentLang();
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

// Localize a branch name using the shared dictionary in i18n.js.
// Falls back to the raw DB value when the helper or key is missing.
function localizeBranchName(name) {
    if (!name) return name;
    if (window.i18n && typeof window.i18n.translateBranchName === 'function') {
        return window.i18n.translateBranchName(name);
    }
    return name;
}

// Tournament titles stored as exact league labels ("League A+", "League A",
// "League B", "League C") are mapped to the localized league name. Any other
// tournament name is returned untouched so custom titles keep their original
// wording.
const LEAGUE_NAME_KEYS = {
    'League A+': 'leagues.leagueAPlus',
    'League A': 'leagues.leagueA',
    'League B': 'leagues.leagueB',
    'League C': 'leagues.leagueC',
};

function localizeTournamentName(name) {
    if (!name) return name;
    const key = LEAGUE_NAME_KEYS[name.trim()];
    if (!key) return name;
    const translated = tt(key);
    return translated && translated !== key ? translated : name;
}

function initLanguageSwitcher() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            if (typeof window.setLanguage === 'function') {
                window.setLanguage(lang);
            } else {
                localStorage.setItem('ce_language', lang);
                location.reload();
            }
            applyI18nLabels();
        });
    });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadBranches() {
    const supabase = window.supabaseClient;
    const today = new Date().toISOString().slice(0, 10);

    // Fetch all branches; filter client-side to keep the EXCLUDED_BRANCHES
    // list as the single source of truth.
    const { data: branches, error } = await supabase
        .from('branches')
        .select('id, name')
        .order('name', { ascending: true });

    if (error) {
        console.error('Failed to load branches:', error);
        renderLoadError();
        return;
    }

    const visible = (branches || []).filter(b => !EXCLUDED_BRANCHES.includes(b.name));

    // Fetch upcoming tournaments for all visible branches in one query.
    const branchIds = visible.map(b => b.id);
    let tournaments = [];
    if (branchIds.length > 0) {
        const { data: tdata, error: terr } = await supabase
            .from('tournaments')
            .select('id, branch_id, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status')
            .in('branch_id', branchIds)
            .gte('tournament_date', today)
            .order('tournament_date', { ascending: true });
        if (terr) {
            console.error('Failed to load tournaments:', terr);
        } else {
            tournaments = tdata || [];
        }
    }

    const countByBranch = new Map();
    const byBranch = new Map();
    for (const t of tournaments) {
        countByBranch.set(t.branch_id, (countByBranch.get(t.branch_id) || 0) + 1);
        if (!byBranch.has(t.branch_id)) byBranch.set(t.branch_id, []);
        byBranch.get(t.branch_id).push(t);
    }

    tournamentsApp.branches = visible.map(b => ({
        id: b.id,
        name: b.name,
        upcomingCount: countByBranch.get(b.id) || 0,
    }));
    tournamentsApp.tournamentsByBranch = byBranch;

    // Pre-compute registration counts for visible tournaments so the
    // capacity pill is accurate on first render.
    await loadRegistrationCounts(tournaments.map(t => t.id));
}

async function loadRegistrationCounts(tournamentIds) {
    if (!tournamentIds || tournamentIds.length === 0) return;
    const supabase = window.supabaseClient;
    const { data, error } = await supabase
        .from('tournament_registrations')
        .select('tournament_id')
        .in('tournament_id', tournamentIds);
    if (error) { console.error('reg count load failed:', error); return; }

    const counts = new Map();
    for (const r of data || []) {
        counts.set(r.tournament_id, (counts.get(r.tournament_id) || 0) + 1);
    }
    for (const [, list] of tournamentsApp.tournamentsByBranch) {
        for (const t of list) {
            if (counts.has(t.id)) t._regCount = counts.get(t.id);
            else if (typeof t._regCount === 'undefined') t._regCount = 0;
        }
    }
}

async function loadRoster(tournamentId) {
    const supabase = window.supabaseClient;
    const { data, error } = await supabase
        .from('tournament_registrations')
        .select('student_id, registered_at, students!inner(first_name, last_name)')
        .eq('tournament_id', tournamentId)
        .order('registered_at', { ascending: true });
    if (error) { console.error('roster load failed:', error); return []; }
    return (data || []).map(r => ({
        student_id: r.student_id,
        first_name: r.students?.first_name || '',
        last_name: r.students?.last_name || '',
    }));
}

// Refresh a single tournament's current status + capacity from the DB,
// since registering may have flipped status to 'closed'.
async function refreshTournamentRow(tournamentId) {
    const supabase = window.supabaseClient;
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, branch_id, status, capacity')
        .eq('id', tournamentId)
        .maybeSingle();
    if (error || !data) return;
    const list = tournamentsApp.tournamentsByBranch.get(data.branch_id) || [];
    const found = list.find(t => t.id === tournamentId);
    if (found) {
        found.status = data.status;
        found.capacity = data.capacity;
    }
}

// ---------------------------------------------------------------------------
// Rendering — branches
// ---------------------------------------------------------------------------
function renderBranches() {
    const container = document.getElementById('branchesContainer');
    if (tournamentsApp.branches.length === 0) {
        container.innerHTML = `<div class="empty-row">${escapeHtml(tt('tournaments.noUpcoming'))}</div>`;
        return;
    }

    const html = tournamentsApp.branches.map(b => branchCardHtml(b)).join('');
    container.innerHTML = `<div class="branches">${html}</div>`;

    container.querySelectorAll('.branch-header').forEach(el => {
        el.addEventListener('click', () => toggleBranch(el.dataset.branchId));
    });

    if (tournamentsApp.expandedBranchId) {
        renderBranchTournaments(tournamentsApp.expandedBranchId);
    }
}

function branchCardHtml(b) {
    const expanded = b.id === tournamentsApp.expandedBranchId;
    const badge = b.upcomingCount > 0
        ? `<span class="count-badge">${escapeHtml(tt('tournaments.upcoming', { count: b.upcomingCount }))}</span>`
        : `<span class="count-badge zero">${escapeHtml(tt('tournaments.noUpcoming'))}</span>`;
    return `
        <div class="branch-card ${expanded ? 'expanded' : ''}" data-branch-card="${escapeAttr(b.id)}">
            <div class="branch-header" data-branch-id="${escapeAttr(b.id)}" role="button" tabindex="0" aria-expanded="${expanded}">
                <div class="branch-name">${escapeHtml(localizeBranchName(b.name))}</div>
                <div style="display:flex; align-items:center; gap:10px;">
                    ${badge}
                    <svg class="branch-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="branch-body" data-branch-body="${escapeAttr(b.id)}"></div>
        </div>`;
}

function toggleBranch(branchId) {
    if (tournamentsApp.expandedBranchId === branchId) {
        tournamentsApp.expandedBranchId = null;
        tournamentsApp.expandedTournamentId = null;
        teardownLiveUpdates();
    } else {
        tournamentsApp.expandedBranchId = branchId;
        tournamentsApp.expandedTournamentId = null;
        teardownLiveUpdates();
    }
    renderBranches();
}

function renderBranchTournaments(branchId) {
    const body = document.querySelector(`[data-branch-body="${cssEscape(branchId)}"]`);
    if (!body) return;
    const tournaments = tournamentsApp.tournamentsByBranch.get(branchId) || [];

    if (tournaments.length === 0) {
        body.innerHTML = `<div class="tournaments-list"><div class="empty-row">${escapeHtml(tt('tournaments.noUpcoming'))}</div></div>`;
        return;
    }

    body.innerHTML = `<div class="tournaments-list">${tournaments.map(tournamentRowHtml).join('')}</div>`;

    body.querySelectorAll('.tournament-summary').forEach(el => {
        el.addEventListener('click', () => toggleTournament(el.dataset.tournamentId));
    });

    if (tournamentsApp.expandedTournamentId) {
        renderTournamentDetail(tournamentsApp.expandedTournamentId);
    }
}

function tournamentRowHtml(t) {
    const expanded = t.id === tournamentsApp.expandedTournamentId;
    const dateLabel = formatDate(t.tournament_date);
    const timeLabel = formatTime(t.start_time);
    const regCount = t._regCount || 0;
    const isFull = regCount >= t.capacity;
    const isClosed = t.status !== 'open';
    let pillHtml;
    if (isClosed || isFull) {
        pillHtml = `<span class="pill full">${regCount}/${t.capacity}</span>`;
    } else {
        pillHtml = `<span class="pill">${regCount}/${t.capacity}</span>`;
    }
    return `
        <div class="tournament-row ${expanded ? 'expanded' : ''}" data-tournament-row="${escapeAttr(t.id)}">
            <div class="tournament-summary" data-tournament-id="${escapeAttr(t.id)}" role="button" tabindex="0">
                <div>
                    <div class="tournament-title">${escapeHtml(localizeTournamentName(t.name))}</div>
                    <div class="tournament-meta" style="margin-top:4px;">
                        <span>${escapeHtml(dateLabel)}</span>
                        <span>·</span>
                        <span>${escapeHtml(timeLabel)}</span>
                    </div>
                </div>
                <div class="tournament-meta">${pillHtml}</div>
            </div>
            <div class="tournament-detail" data-tournament-detail="${escapeAttr(t.id)}"></div>
        </div>`;
}

function toggleTournament(tournamentId) {
    if (tournamentsApp.expandedTournamentId === tournamentId) {
        tournamentsApp.expandedTournamentId = null;
        teardownLiveUpdates();
        renderBranchTournaments(tournamentsApp.expandedBranchId);
        return;
    }
    tournamentsApp.expandedTournamentId = tournamentId;
    teardownLiveUpdates();
    renderBranchTournaments(tournamentsApp.expandedBranchId);
    // Kick off live roster loading.
    refreshTournamentLive(tournamentId);
    startLiveUpdates(tournamentId);
}

async function refreshTournamentLive(tournamentId) {
    const roster = await loadRoster(tournamentId);
    tournamentsApp.rostersByTournament.set(tournamentId, roster);

    // Update the in-memory tournament with the live registration count and
    // refresh status (registration could have closed the tournament).
    const t = findTournament(tournamentId);
    if (t) {
        t._regCount = roster.length;
        await refreshTournamentRow(tournamentId);
    }

    renderBranchTournaments(tournamentsApp.expandedBranchId);
}

function findTournament(tournamentId) {
    for (const [, list] of tournamentsApp.tournamentsByBranch) {
        const t = list.find(x => x.id === tournamentId);
        if (t) return t;
    }
    return null;
}

function renderTournamentDetail(tournamentId) {
    const panel = document.querySelector(`[data-tournament-detail="${cssEscape(tournamentId)}"]`);
    if (!panel) return;
    const t = findTournament(tournamentId);
    if (!t) return;

    const roster = tournamentsApp.rostersByTournament.get(tournamentId) || [];
    const regCount = roster.length || t._regCount || 0;
    const isFull = regCount >= t.capacity;
    const isClosed = t.status !== 'open' || isFull;

    const fillPct = Math.min(100, Math.round((regCount / Math.max(1, t.capacity)) * 100));
    let fillClass = '';
    if (fillPct >= 100) fillClass = 'full';
    else if (fillPct >= 75) fillClass = 'warn';

    const rosterHtml = roster.length === 0
        ? `<div class="roster-empty">${escapeHtml(tt('tournaments.noResults'))}</div>`
        : `<div class="roster-list">${roster.map((r, i) =>
              `<div class="roster-item"><span class="roster-num">${i + 1}.</span><span>${escapeHtml((r.first_name + ' ' + r.last_name).trim())}</span></div>`
            ).join('')}</div>`;

    const btnLabel = isClosed
        ? tt('tournaments.registrationClosed')
        : tt('tournaments.registerButton');

    panel.innerHTML = `
        <div class="detail-inner">
            ${t.info ? `<div class="info-box">${escapeHtml(t.info)}</div>` : ''}
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.date'))}</div>
                    <div class="value">${escapeHtml(formatDate(t.tournament_date))}</div>
                </div>
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.time'))}</div>
                    <div class="value">${escapeHtml(formatTime(t.start_time))}</div>
                </div>
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.format'))}</div>
                    <div class="value">${escapeHtml(t.time_format || '—')}</div>
                </div>
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.fee'))}</div>
                    <div class="value">${escapeHtml(formatFee(t.registration_fee))}</div>
                </div>
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.rounds'))}</div>
                    <div class="value">${t.rounds}</div>
                </div>
                <div class="detail-item">
                    <div class="label">${escapeHtml(tt('tournaments.fields.capacity'))}</div>
                    <div class="value">${regCount}/${t.capacity}</div>
                    <div class="capacity-bar"><div class="capacity-fill ${fillClass}" style="width:${fillPct}%"></div></div>
                </div>
            </div>
            <div class="detail-item" style="margin-bottom:14px;">
                <div class="label">${escapeHtml(tt('tournaments.fields.roster'))}</div>
            </div>
            <div class="roster">${rosterHtml}</div>
            <button type="button" class="register-btn" data-register-for="${escapeAttr(t.id)}" ${isClosed ? 'disabled' : ''}>
                ${escapeHtml(btnLabel)}
            </button>
        </div>`;

    const btn = panel.querySelector('[data-register-for]');
    if (btn && !btn.disabled) {
        btn.addEventListener('click', () => openRegisterModal(t.id));
    }
}

function renderLoadError() {
    document.getElementById('branchesContainer').innerHTML =
        `<div class="loading">${escapeHtml(tt('tournaments.loadError'))}</div>`;
}

// ---------------------------------------------------------------------------
// Live updates — Supabase Realtime + 15s polling fallback
// ---------------------------------------------------------------------------
function startLiveUpdates(tournamentId) {
    tournamentsApp.activeTournamentId = tournamentId;
    const supabase = window.supabaseClient;
    if (!supabase || typeof supabase.channel !== 'function') {
        startPolling(tournamentId);
        return;
    }

    let subscribed = false;
    const channel = supabase
        .channel(`tournament_registrations:${tournamentId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tournament_registrations',
            filter: `tournament_id=eq.${tournamentId}`,
        }, () => {
            if (tournamentsApp.activeTournamentId === tournamentId) {
                refreshTournamentLive(tournamentId);
                if (tournamentsApp.expandedTournamentId === tournamentId) {
                    renderTournamentDetail(tournamentId);
                }
            }
        })
        .subscribe(status => {
            if (status === 'SUBSCRIBED') subscribed = true;
        });
    tournamentsApp.activeChannel = channel;

    // If Realtime hasn't subscribed within 5s, fall back to polling.
    setTimeout(() => {
        if (!subscribed && tournamentsApp.activeTournamentId === tournamentId) {
            console.warn('Realtime did not connect, falling back to polling');
            startPolling(tournamentId);
        }
    }, REALTIME_CONNECT_TIMEOUT_MS);
}

function startPolling(tournamentId) {
    if (tournamentsApp.activePollTimer) return;
    tournamentsApp.activePollTimer = setInterval(() => {
        if (tournamentsApp.activeTournamentId !== tournamentId) {
            clearInterval(tournamentsApp.activePollTimer);
            tournamentsApp.activePollTimer = null;
            return;
        }
        refreshTournamentLive(tournamentId).then(() => {
            if (tournamentsApp.expandedTournamentId === tournamentId) {
                renderTournamentDetail(tournamentId);
            }
        });
    }, POLL_INTERVAL_MS);
}

function teardownLiveUpdates() {
    tournamentsApp.activeTournamentId = null;
    if (tournamentsApp.activeChannel) {
        try {
            const sb = window.supabaseClient;
            if (sb && typeof sb.removeChannel === 'function') {
                sb.removeChannel(tournamentsApp.activeChannel);
            } else if (typeof tournamentsApp.activeChannel.unsubscribe === 'function') {
                tournamentsApp.activeChannel.unsubscribe();
            }
        } catch (e) { /* swallow */ }
        tournamentsApp.activeChannel = null;
    }
    if (tournamentsApp.activePollTimer) {
        clearInterval(tournamentsApp.activePollTimer);
        tournamentsApp.activePollTimer = null;
    }
}

// ---------------------------------------------------------------------------
// Registration modal
// ---------------------------------------------------------------------------
let modalState = { tournamentId: null, mode: 'search', searchTimer: null, results: [] };

function initModal() {
    const overlay = document.getElementById('registerModal');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeRegisterModal();
    });
    document.getElementById('registerModalClose').addEventListener('click', closeRegisterModal);
}

function openRegisterModal(tournamentId) {
    modalState.tournamentId = tournamentId;
    modalState.mode = 'search';
    modalState.results = [];
    renderModalBody();
    document.getElementById('registerModal').classList.add('open');
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('open');
    if (modalState.searchTimer) {
        clearTimeout(modalState.searchTimer);
        modalState.searchTimer = null;
    }
    modalState = { tournamentId: null, mode: 'search', searchTimer: null, results: [] };
}

function renderModalBody() {
    const body = document.getElementById('registerModalBody');
    if (modalState.mode === 'search') {
        body.innerHTML = `
            <input type="text" class="search-input" id="studentSearchInput"
                placeholder="${escapeAttr(tt('tournaments.searchStudent'))}"
                autocomplete="off"
                autocapitalize="off">
            <div class="search-hint" id="studentSearchHint">${escapeHtml(tt('tournaments.searchHint'))}</div>
            <div class="search-results" id="studentSearchResults"></div>`;
        const input = document.getElementById('studentSearchInput');
        input.focus();
        input.addEventListener('input', onSearchInput);
    } else if (modalState.mode === 'confirm') {
        const student = modalState.confirmStudent;
        const t = findTournament(modalState.tournamentId);
        const fullName = (student.first_name + ' ' + student.last_name).trim();
        const tournLabel = `${localizeTournamentName(t.name)} — ${formatDate(t.tournament_date)}`;
        body.innerHTML = `
            <div class="confirm-box">
                <p>${escapeHtml(tt('tournaments.confirmRegister', { name: fullName, tournament: tournLabel }))}</p>
                <div class="confirm-actions">
                    <button type="button" class="btn-secondary" id="confirmCancelBtn">${escapeHtml(tt('tournaments.cancel'))}</button>
                    <button type="button" class="btn-primary" id="confirmRegisterBtn">${escapeHtml(tt('tournaments.confirm'))}</button>
                </div>
            </div>`;
        document.getElementById('confirmCancelBtn').addEventListener('click', () => {
            modalState.mode = 'search';
            renderModalBody();
        });
        document.getElementById('confirmRegisterBtn').addEventListener('click', doRegister);
    }
}

function onSearchInput(e) {
    const q = e.target.value.trim();
    if (modalState.searchTimer) clearTimeout(modalState.searchTimer);
    const hint = document.getElementById('studentSearchHint');
    const results = document.getElementById('studentSearchResults');

    if (q.length < MIN_SEARCH_CHARS) {
        if (hint) { hint.style.display = ''; hint.textContent = tt('tournaments.searchHint'); }
        results.innerHTML = '';
        return;
    }

    modalState.searchTimer = setTimeout(() => doSearch(q), SEARCH_DEBOUNCE_MS);
}

async function doSearch(q) {
    const supabase = window.supabaseClient;
    const hint = document.getElementById('studentSearchHint');
    const results = document.getElementById('studentSearchResults');
    if (!results) return;

    const sanitized = q.replace(/[%_]/g, ''); // strip SQL LIKE wildcards
    const filter = `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`;
    const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, status, branch_id, branches(name)')
        .or(filter)
        .in('status', ['active', 'frozen'])
        .order('last_name', { ascending: true })
        .limit(SEARCH_LIMIT);

    if (error) {
        console.error('student search failed:', error);
        if (hint) { hint.style.display = ''; hint.textContent = tt('tournaments.loadError'); }
        return;
    }
    modalState.results = data || [];
    if (modalState.results.length === 0) {
        if (hint) { hint.style.display = ''; hint.textContent = tt('tournaments.noResults'); }
        results.innerHTML = '';
        return;
    }
    if (hint) hint.style.display = 'none';
    results.innerHTML = modalState.results.map(s => `
        <div class="search-row" data-student-id="${escapeAttr(s.id)}">
            <div class="name">${escapeHtml((s.first_name + ' ' + s.last_name).trim())}</div>
            <span class="branch-chip">${escapeHtml(localizeBranchName(s.branches?.name || ''))}</span>
        </div>`).join('');
    results.querySelectorAll('.search-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.studentId;
            const student = modalState.results.find(r => r.id === id);
            if (!student) return;
            modalState.mode = 'confirm';
            modalState.confirmStudent = student;
            renderModalBody();
        });
    });
}

async function doRegister() {
    const supabase = window.supabaseClient;
    const tournamentId = modalState.tournamentId;
    const studentId = modalState.confirmStudent.id;
    const btn = document.getElementById('confirmRegisterBtn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    const { data, error } = await supabase.rpc('register_for_tournament', {
        p_tournament_id: tournamentId,
        p_student_id: studentId,
    });

    if (error) {
        console.error('register RPC error:', error);
        showToast(tt('tournaments.loadError'), 'error');
        if (btn) { btn.disabled = false; btn.textContent = tt('tournaments.confirm'); }
        return;
    }

    handleRegisterResult(data, tournamentId);
}

function handleRegisterResult(data, tournamentId) {
    const result = data || {};
    if (result.ok) {
        showToast(tt('tournaments.registeredSuccess'), 'success');
        closeRegisterModal();
        refreshTournamentLive(tournamentId);
        return;
    }
    switch (result.reason) {
        case 'full':
            showToast(tt('tournaments.registrationFull'), 'warning');
            closeRegisterModal();
            refreshTournamentLive(tournamentId);
            break;
        case 'closed':
            showToast(tt('tournaments.registrationClosed'), 'info');
            closeRegisterModal();
            refreshTournamentLive(tournamentId);
            break;
        case 'duplicate':
            showToast(tt('tournaments.alreadyRegistered'), 'info');
            closeRegisterModal();
            break;
        case 'not_found':
            showToast(tt('tournaments.tournamentNotFound'), 'error');
            closeRegisterModal();
            break;
        default:
            showToast(tt('tournaments.loadError'), 'error');
            closeRegisterModal();
    }
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
function showToast(message, type) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.25s ease-in';
    }, 2750);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function escapeAttr(s) { return escapeHtml(s); }

function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
}

function formatDate(d) {
    if (!d) return '—';
    const lang = currentLang();
    const map = { en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' };
    try {
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString(map[lang] || 'en-US', {
            weekday: 'short', day: 'numeric', month: 'short',
        });
    } catch (e) {
        return d;
    }
}

function formatTime(t) {
    if (!t) return '—';
    // Trim seconds if present (e.g., "14:00:00" -> "14:00")
    return String(t).slice(0, 5);
}

function formatFee(fee) {
    const amount = Number(fee || 0).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ru-RU');
    return tt('tournaments.fee.kzt', { amount });
}
