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
    // Flips true after the schedule RPC resolves. Renders gated on this
    // keep the HTML shell visible (so "No tournaments" never flashes).
    loaded: false,
    // When a branch is expanded, every tournament under it renders fully
    // expanded — there's no separate summary→detail middle step. Live
    // updates run for every visible tournament concurrently.
    activeTournamentIds: new Set(),
    activeChannels: [],            // [{ id, channel }]
    activePollTimer: null,
};

(async function init() {
    // Wait for the Supabase client without busy-waiting. supabase-client.js
    // dispatches `supabaseClientReady` the moment the global is assigned.
    if (!window.supabaseClient) {
        await new Promise(resolve => {
            if (window.__supabaseClientReady) return resolve();
            window.addEventListener('supabaseClientReady', resolve, { once: true });
        });
    }
    if (!window.supabaseClient) {
        renderLoadError();
        return;
    }

    initLanguageSwitcher();
    document.addEventListener('languagechange', () => {
        applyI18nLabels();
        localizeShell();
        if (tournamentsApp.loaded) {
            renderBranches();
            if (tournamentsApp.expandedBranchId) {
                renderBranchTournaments(tournamentsApp.expandedBranchId);
            }
        }
    });

    initModal();
    // Localize the HTML shell (branch names + "Loading…" pills) so the
    // pre-RPC paint matches the current language. The shell stays visible
    // until the RPC resolves — no "No tournaments" flash.
    applyI18nLabels();
    localizeShell();

    await loadTournamentSchedule();
    renderBranches();
    applyI18nLabels();

    // Re-render every 60s so registration-deadline transitions flip the UI
    // even when the page sits idle (no Realtime event, no user interaction).
    setInterval(() => {
        if (tournamentsApp.expandedBranchId) {
            renderBranchTournaments(tournamentsApp.expandedBranchId);
        }
    }, 60000);

    // Per-second tick for the flip-clock countdown. Updates numerals only —
    // no DOM rebuild. Fires a one-shot live refresh when a deadline crosses
    // zero so the panel flips to the closed state.
    setInterval(tickCountdowns, 1000);
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
    return localStorage.getItem('ce_language') || 'ru';
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

// Localize the static shell rendered straight into tournaments.html so the
// pre-RPC paint shows the right language. Once loadTournamentSchedule()
// resolves, renderBranches() replaces the shell — so this is only relevant
// for the moments between first paint and the RPC finishing.
function localizeShell() {
    document.querySelectorAll('[data-shell-branch-name]').forEach(el => {
        const raw = el.getAttribute('data-shell-branch-name');
        el.textContent = localizeBranchName(raw);
    });
    document.querySelectorAll('[data-shell-loading]').forEach(el => {
        el.textContent = tt('common.loading');
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
// Expose so i18n.js's composeTournamentName can use it as a fallback for
// legacy/custom tournament names (where league is null).
if (typeof window !== 'undefined') {
    window.localizeTournamentName = localizeTournamentName;
}

// Resolve a branch name for `branchId` by checking the in-memory branches
// list loaded from the public schedule RPC. Returns '' when not found.
function branchNameById(branchId) {
    if (!branchId) return '';
    const b = (tournamentsApp.branches || []).find(x => x.id === branchId);
    return b ? b.name : '';
}

// Compose a tournament display name from the structured (league, branch)
// pair when both are present. Falls back to per-string lookup of the stored
// DB name for legacy/custom rows.
function composeTournamentTitle(t, branchName) {
    if (window.i18n && typeof window.i18n.composeTournamentName === 'function') {
        return window.i18n.composeTournamentName(
            { league: t.league, name: t.name },
            branchName,
        );
    }
    return localizeTournamentName(t.name);
}

// Translate the leading category word of a time-format string. Falls back
// to the raw value when the helper or key is missing.
function localizeTimeFormat(format) {
    if (window.i18n && typeof window.i18n.translateTimeFormat === 'function') {
        return window.i18n.translateTimeFormat(format);
    }
    return format;
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
// Single RPC call replaces the previous 3 sequential round-trips
// (branches → tournaments → registration_counts). See
// supabase/migrations/20260612120000_get_public_tournament_schedule.sql.
async function loadTournamentSchedule() {
    const supabase = window.supabaseClient;
    const { data, error } = await supabase.rpc('get_public_tournament_schedule');
    if (error) {
        console.error('Failed to load tournament schedule:', error);
        renderLoadError();
        return;
    }

    const branches = (data && Array.isArray(data.branches)) ? data.branches : [];
    const visible = branches.filter(b => !EXCLUDED_BRANCHES.includes(b.name));

    const byBranch = new Map();
    for (const b of visible) {
        const list = (b.upcoming_tournaments || []).map(t => ({
            ...t,
            _regCount: typeof t.registration_count === 'number' ? t.registration_count : 0,
        }));
        byBranch.set(b.id, list);
    }

    tournamentsApp.tournamentsByBranch = byBranch;
    tournamentsApp.branches = visible.map(b => ({
        id: b.id,
        name: b.name,
        upcomingCount: (byBranch.get(b.id) || []).length,
    }));
    tournamentsApp.loaded = true;
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
        .select('id, branch_id, status, capacity, registration_deadline')
        .eq('id', tournamentId)
        .maybeSingle();
    if (error || !data) return;
    const list = tournamentsApp.tournamentsByBranch.get(data.branch_id) || [];
    const found = list.find(t => t.id === tournamentId);
    if (found) {
        found.status = data.status;
        found.capacity = data.capacity;
        found.registration_deadline = data.registration_deadline;
    }
}

// True when a deadline is set and the current moment is past it.
function isDeadlinePassed(t) {
    if (!t || !t.registration_deadline) return false;
    const d = new Date(t.registration_deadline);
    if (isNaN(d.getTime())) return false;
    return Date.now() > d.getTime();
}

// Asia/Almaty is UTC+5, no DST — shift `now` and slice YYYY-MM-DD.
function todayInAlmaty(now) {
    const t = typeof now === 'number' ? now : Date.now();
    return new Date(t + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// True when `tournament_date + start_time` interpreted in Asia/Almaty has
// already elapsed. Returns false when either field is missing.
function tournamentStartPassed(t, now) {
    if (!t || !t.tournament_date || !t.start_time) return false;
    const raw = String(t.start_time);
    const timeStr = raw.length === 5 ? `${raw}:00` : raw;
    const ts = new Date(`${t.tournament_date}T${timeStr}+05:00`);
    if (isNaN(ts.getTime())) return false;
    return ts.getTime() <= (typeof now === 'number' ? now : Date.now());
}

// Display-side mirror of close_expired_tournaments(): true when either
// (a) tournament_date < today (Almaty), or (b) the (date + start_time)
// Almaty instant has elapsed. The DB cron + admin pre-call persist the
// status flip; this lets the public page render the correct state in
// the meantime, even on rows the cron hasn't reached yet.
function tournamentIsExpired(t, now) {
    if (!t || !t.tournament_date) return false;
    if (t.tournament_date < todayInAlmaty(now)) return true;
    return tournamentStartPassed(t, now);
}

// Flip-clock countdown markup. Tick is driven by tickCountdowns() once a
// second; we only render the static skeleton + initial values here. Returns
// '' when the tournament has no deadline, is already closed, or the deadline
// has already passed — in those cases the standard closed-state UI handles
// the messaging.
function countdownHtml(t) {
    if (!t || !t.registration_deadline) return '';
    if (t.status !== 'open') return '';
    if (isDeadlinePassed(t)) return '';
    if (tournamentIsExpired(t)) return '';
    const ms = new Date(t.registration_deadline).getTime() - Date.now();
    const parts = countdownParts(ms);
    const urgency = countdownUrgencyClass(ms);
    return `
        <div class="countdown-block ${urgency}" data-countdown-for="${escapeAttr(t.id)}" data-countdown-deadline="${escapeAttr(t.registration_deadline)}">
            <div class="countdown-label">${escapeHtml(tt('tournaments.countdown.label'))}</div>
            <div class="countdown-cards">
                <div class="countdown-card">
                    <div class="countdown-number" data-cd-unit="days">${parts.days}</div>
                    <span class="countdown-unit" data-i18n="tournaments.countdown.days">${escapeHtml(tt('tournaments.countdown.days'))}</span>
                </div>
                <div class="countdown-card">
                    <div class="countdown-number" data-cd-unit="hours">${parts.hours}</div>
                    <span class="countdown-unit" data-i18n="tournaments.countdown.hours">${escapeHtml(tt('tournaments.countdown.hours'))}</span>
                </div>
                <div class="countdown-card">
                    <div class="countdown-number" data-cd-unit="minutes">${parts.minutes}</div>
                    <span class="countdown-unit" data-i18n="tournaments.countdown.minutes">${escapeHtml(tt('tournaments.countdown.minutes'))}</span>
                </div>
                <div class="countdown-card">
                    <div class="countdown-number" data-cd-unit="seconds">${parts.seconds}</div>
                    <span class="countdown-unit" data-i18n="tournaments.countdown.seconds">${escapeHtml(tt('tournaments.countdown.seconds'))}</span>
                </div>
            </div>
        </div>`;
}

function countdownParts(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const days    = Math.floor(totalSec / 86400);
    const hours   = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    return {
        days:    String(days).padStart(2, '0'),
        hours:   pad(hours),
        minutes: pad(minutes),
        seconds: pad(seconds),
    };
}

// Amber under 3h, red + pulse under 1h. Mirrors the page's existing
// warn-amber + close-red conventions.
function countdownUrgencyClass(ms) {
    if (ms < 60 * 60 * 1000) return 'critical';
    if (ms < 3 * 60 * 60 * 1000) return 'urgent';
    return '';
}

// One global 1s tick. Only writes numerals + toggles urgency classes —
// never re-renders the panel. When a deadline crosses zero it fires a
// one-shot live refresh so the panel flips to the closed state.
function tickCountdowns() {
    const blocks = document.querySelectorAll('[data-countdown-for]');
    if (blocks.length === 0) return;
    const now = Date.now();
    blocks.forEach(block => {
        const deadlineRaw = block.getAttribute('data-countdown-deadline');
        if (!deadlineRaw) return;
        const deadline = new Date(deadlineRaw).getTime();
        if (isNaN(deadline)) return;
        const ms = deadline - now;
        if (ms <= 0) {
            if (!block.dataset.fired) {
                block.dataset.fired = '1';
                const id = block.getAttribute('data-countdown-for');
                if (id) refreshTournamentLive(id);
            }
            return;
        }
        const parts = countdownParts(ms);
        const d = block.querySelector('[data-cd-unit="days"]');
        const h = block.querySelector('[data-cd-unit="hours"]');
        const m = block.querySelector('[data-cd-unit="minutes"]');
        const s = block.querySelector('[data-cd-unit="seconds"]');
        if (d) d.textContent = parts.days;
        if (h) h.textContent = parts.hours;
        if (m) m.textContent = parts.minutes;
        if (s) s.textContent = parts.seconds;
        const cls = countdownUrgencyClass(ms);
        block.classList.toggle('urgent',   cls === 'urgent');
        block.classList.toggle('critical', cls === 'critical');
    });
}

// Localized "Closes <date> <time>" for the upcoming-state deadline label.
function formatDeadline(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const lang = currentLang();
    const map = { en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' };
    try {
        return d.toLocaleString(map[lang] || 'en-US', {
            day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (e) {
        return d.toISOString();
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
    teardownLiveUpdates();
    if (tournamentsApp.expandedBranchId === branchId) {
        tournamentsApp.expandedBranchId = null;
    } else {
        tournamentsApp.expandedBranchId = branchId;
    }
    renderBranches();
    if (tournamentsApp.expandedBranchId) {
        activateBranchLiveUpdates(tournamentsApp.expandedBranchId);
    }
}

// Load rosters + subscribe to Realtime for every tournament in the branch.
// Called once per branch expansion. The render pass paints the detail
// panel for every tournament; this populates the live state behind it.
function activateBranchLiveUpdates(branchId) {
    const tournaments = tournamentsApp.tournamentsByBranch.get(branchId) || [];
    const ids = tournaments.map(t => t.id);
    tournamentsApp.activeTournamentIds = new Set(ids);
    for (const id of ids) refreshTournamentLive(id);
    startLiveUpdates(ids);
}

function renderBranchTournaments(branchId) {
    const body = document.querySelector(`[data-branch-body="${cssEscape(branchId)}"]`);
    if (!body) return;
    const tournaments = tournamentsApp.tournamentsByBranch.get(branchId) || [];

    if (tournaments.length === 0) {
        body.innerHTML = `<div class="tournaments-list"><div class="empty-row">${escapeHtml(tt('tournaments.noUpcoming'))}</div></div>`;
        return;
    }

    const branchName = branchNameById(branchId);
    body.innerHTML = `<div class="tournaments-list">${tournaments.map(t => tournamentRowHtml(t, branchName)).join('')}</div>`;

    for (const t of tournaments) {
        renderTournamentDetail(t.id);
    }
}

function tournamentRowHtml(t, branchName) {
    // Every row under the active branch renders fully expanded — no
    // summary→detail click step. Adding `expanded` class triggers the
    // CSS that lifts the detail panel's max-height.
    const expanded = true;
    const dateLabel = formatDate(t.tournament_date);
    const timeLabel = formatTime(t.start_time);
    const regCount = t._regCount || 0;
    const isFull = regCount >= t.capacity;
    const deadlinePassed = isDeadlinePassed(t);
    const expired = tournamentIsExpired(t);
    const isClosed = t.status !== 'open' || deadlinePassed || expired;
    let pillHtml;
    if (isClosed || isFull) {
        pillHtml = `<span class="pill full">${regCount}/${t.capacity}</span>`;
    } else {
        pillHtml = `<span class="pill">${regCount}/${t.capacity}</span>`;
    }
    const deadlineNote = t.registration_deadline && !deadlinePassed && !expired
        ? `<span>·</span><span>${escapeHtml(tt('tournaments.registration.closesAt', { datetime: formatDeadline(t.registration_deadline) }))}</span>`
        : '';
    return `
        <div class="tournament-row ${expanded ? 'expanded' : ''}" data-tournament-row="${escapeAttr(t.id)}">
            <div class="tournament-summary">
                <div>
                    <div class="tournament-title">${escapeHtml(composeTournamentTitle(t, branchName))}</div>
                    <div class="tournament-meta" style="margin-top:4px;">
                        <span>${escapeHtml(dateLabel)}</span>
                        <span>·</span>
                        <span>${escapeHtml(timeLabel)}</span>
                        ${deadlineNote}
                    </div>
                </div>
                <div class="tournament-meta">${pillHtml}</div>
            </div>
            <div class="tournament-detail" data-tournament-detail="${escapeAttr(t.id)}"></div>
        </div>`;
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
    const deadlinePassed = isDeadlinePassed(t);
    const expired = tournamentIsExpired(t);
    const isClosed = t.status !== 'open' || isFull || deadlinePassed || expired;

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
                    <div class="value">${escapeHtml(localizeTimeFormat(t.time_format) || '—')}</div>
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
            ${countdownHtml(t)}
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
function startLiveUpdates(tournamentIds) {
    const ids = Array.isArray(tournamentIds) ? tournamentIds : [tournamentIds];
    if (ids.length === 0) return;
    const supabase = window.supabaseClient;
    if (!supabase || typeof supabase.channel !== 'function') {
        startPolling(ids);
        return;
    }

    const subscribed = new Set();
    for (const id of ids) {
        const channel = supabase
            .channel(`tournament_registrations:${id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tournament_registrations',
                filter: `tournament_id=eq.${id}`,
            }, () => {
                if (tournamentsApp.activeTournamentIds.has(id)) {
                    refreshTournamentLive(id);
                }
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') subscribed.add(id);
            });
        tournamentsApp.activeChannels.push({ id, channel });
    }

    // If any subscription hasn't confirmed within 5s, fall back to polling
    // for the whole batch.
    setTimeout(() => {
        if (subscribed.size < ids.length
            && ids.every(id => tournamentsApp.activeTournamentIds.has(id))) {
            console.warn('Realtime did not connect for all tournaments, falling back to polling');
            startPolling(ids);
        }
    }, REALTIME_CONNECT_TIMEOUT_MS);
}

function startPolling(tournamentIds) {
    if (tournamentsApp.activePollTimer) return;
    const ids = Array.isArray(tournamentIds) ? tournamentIds : [tournamentIds];
    tournamentsApp.activePollTimer = setInterval(() => {
        // Stop polling once the branch collapses.
        if (![...tournamentsApp.activeTournamentIds].some(id => ids.includes(id))) {
            clearInterval(tournamentsApp.activePollTimer);
            tournamentsApp.activePollTimer = null;
            return;
        }
        for (const id of ids) {
            if (tournamentsApp.activeTournamentIds.has(id)) {
                refreshTournamentLive(id);
            }
        }
    }, POLL_INTERVAL_MS);
}

function teardownLiveUpdates() {
    tournamentsApp.activeTournamentIds = new Set();
    if (tournamentsApp.activeChannels && tournamentsApp.activeChannels.length > 0) {
        const sb = window.supabaseClient;
        for (const { channel } of tournamentsApp.activeChannels) {
            try {
                if (sb && typeof sb.removeChannel === 'function') {
                    sb.removeChannel(channel);
                } else if (channel && typeof channel.unsubscribe === 'function') {
                    channel.unsubscribe();
                }
            } catch (e) { /* swallow */ }
        }
        tournamentsApp.activeChannels = [];
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
        const tournLabel = `${composeTournamentTitle(t, branchNameById(t.branch_id))} — ${formatDate(t.tournament_date)}`;
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

    // Client-side deadline guard — defense in depth. The RPC will reject too,
    // but this avoids a needless round-trip when the deadline expired or the
    // tournament date/start_time passed while the modal was open.
    const tNow = findTournament(tournamentId);
    if (tNow && (isDeadlinePassed(tNow) || tournamentIsExpired(tNow))) {
        showToast(tt('tournaments.registrationClosed'), 'info');
        closeRegisterModal();
        refreshTournamentLive(tournamentId);
        return;
    }

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
        case 'deadline_passed':
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
    const n = Number(fee || 0);
    if (n === 0) return tt('tournaments.fee.free');
    const amount = n.toLocaleString(currentLang() === 'en' ? 'en-US' : 'ru-RU');
    return tt('tournaments.fee.kzt', { amount });
}
