/**
 * Coach KPI Dashboard — fetch, aggregate, and render helpers for the
 * Coach Performance section (PRD_COACH_KPI.md, Phase 2).
 *
 * Three views — School / Branch / Coach — call into the
 * `analytics-tournaments` edge function with the actions:
 *   - school_kpi_summary
 *   - coach_leaderboard
 *   - coach_kpi_summary
 *
 * Role scoping is delegated to `coach-kpi-role-lock.js` so this module owns
 * data shaping, formatting, and DOM wiring only.
 *
 * The module follows the project's dual-export convention: pure helpers and
 * fetch wrappers are usable from Node tests, while DOM render functions are
 * guarded behind a `document` check.
 */

(function () {
    'use strict';

    const roleLock = (typeof require === 'function')
        ? require('./coach-kpi-role-lock.js')
        : (typeof window !== 'undefined' ? window.coachKpiRoleLock : null);

    // PRD originally listed an "all-time" preset, but it was never tuned for
    // the leaderboard math and was dropped from the UI (spec §4 default =
    // current calendar month, with 30d/90d/ytd as the user-facing presets).
    const TIME_WINDOWS = Object.freeze(['30d', '90d', 'ytd']);
    const DEFAULT_WINDOW = '90d';
    // League A is intentionally absent — it was retired from the internal
    // tournament rotation in COACH_KPI_PHASE2_SPEC.md §10 ("League A — not
    // part of internal tournament rotation"). Only B and C are filterable.
    const LEAGUES = Object.freeze(['all', 'B', 'C', 'R3', 'R4']);
    const DEFAULT_LEAGUE = 'all';
    const DEFAULT_BRANCH = 'all';
    const DEFAULT_COACH = 'all';
    const SCORE_THRESHOLDS = Object.freeze({ red: 40, amber: 70 });
    const EMPTY_STATE_MESSAGE = 'No data yet for this window.';

    const WINDOW_LABELS = Object.freeze({
        '30d': '30 days',
        '90d': '90 days',
        'ytd': 'YTD',
    });
    const LEAGUE_LABELS = Object.freeze({
        all: 'All tournaments',
        B: 'League B',
        C: 'League C',
        R3: '3rd razryad',
        R4: '4th razryad',
    });
    // The internal-tournament charts (renderTournamentsByLeagueStackedBar /
    // renderTournamentsByLeagueBar) still display historical League A counts
    // when the source data includes them — that's a passive read-side display,
    // not an interactive filter, so keep A in the plot order even though the
    // user-facing pill is gone.
    const LEAGUE_PLOT_LABELS = Object.freeze({
        A: 'League A',
        B: 'League B',
        C: 'League C',
    });

    // Hero-card variant → drilldown metric. The other three variants
    // (active-students, participation, tournaments) intentionally stay
    // non-interactive — the drilldown only has handlers for these four.
    const DRILLABLE_METRICS = Object.freeze({
        'active-players': 'active_players',
        'top3': 'top3',
        'razryads': 'new_razryads',
        'promotions': 'promotions',
    });
    const METRIC_TO_VARIANT = Object.freeze({
        'active_players': 'active-players',
        'top3': 'top3',
        'new_razryads': 'razryads',
        'promotions': 'promotions',
    });
    const METRIC_TITLES = Object.freeze({
        'active_players': 'Active players',
        'top3': 'Top-3 finishes',
        'new_razryads': 'New razryads',
        'promotions': 'Promotions',
    });

    // Razryad order + colors match the existing branch / coach doughnuts in
    // admin-v2.js so the dashboards read consistently.
    const RAZRYAD_ORDER = Object.freeze(['KMS', '1st', '2nd', '3rd', '4th', 'None']);
    const RAZRYAD_COLORS = Object.freeze([
        '#d97706', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#94a3b8',
    ]);
    const LEAGUE_PLOT_ORDER = Object.freeze(['A', 'B', 'C']);
    const LEAGUE_COLORS = Object.freeze({
        A: '#d97706',
        B: '#3b82f6',
        C: '#10b981',
    });

    function pad2(n) { return String(n).padStart(2, '0'); }
    function ymd(date) {
        return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }

    /**
     * Resolve a window preset to `{ start, end, days, preset }`. Dates are
     * ISO `YYYY-MM-DD`. `now` is injectable for tests.
     *   - 30d / 90d  → last N days inclusive
     *   - ytd        → Jan 1 of current year through today
     * Unknown preset falls back to the default window.
     */
    function resolveTimeWindow(preset, now) {
        const today = now instanceof Date ? new Date(now.getTime()) : new Date();
        const end = ymd(today);
        const chosen = TIME_WINDOWS.includes(preset) ? preset : DEFAULT_WINDOW;
        if (chosen === 'ytd') {
            const start = `${today.getUTCFullYear()}-01-01`;
            const startMs = Date.UTC(today.getUTCFullYear(), 0, 1);
            const days = Math.floor((today.getTime() - startMs) / 86400000) + 1;
            return { start, end, days, preset: chosen };
        }
        const days = chosen === '30d' ? 30 : 90;
        const startDate = new Date(today.getTime() - (days - 1) * 86400000);
        return { start: ymd(startDate), end, days, preset: chosen };
    }

    /**
     * Color bucket for the composite coach score (PRD §4):
     *   red <40, amber 40–70, green >70.
     * Non-numeric input → 'red' so a missing score never reads as success.
     */
    function scoreColor(score) {
        if (typeof score !== 'number' || !Number.isFinite(score)) return 'red';
        if (score < SCORE_THRESHOLDS.red) return 'red';
        if (score <= SCORE_THRESHOLDS.amber) return 'amber';
        return 'green';
    }

    /**
     * Format the composite score as an integer 0–100. Non-numeric → '—'.
     */
    function formatScore(score) {
        if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
        return String(Math.round(Math.max(0, Math.min(100, score))));
    }

    /**
     * Format a hero stat value. Numbers are locale-rounded; null/undefined
     * become an em-dash placeholder so empty cards don't read as zero.
     */
    function formatHeroValue(value, opts) {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return '—';
            const o = opts || {};
            if (o.percent) return `${Math.round(value * 10) / 10}%`;
            if (o.signed && value > 0) return `+${Math.round(value)}`;
            return String(Math.round(value * 100) / 100);
        }
        return String(value);
    }

    // PRD-named aliases for the 5 pure helpers spelled out in §Task 3. The
    // existing `scoreColor` / `formatHeroValue` cover the same logic with a
    // broader signature; these expose the simpler, name-stable surface the PRD
    // promises to UI code and tests.
    function computeScoreBadgeColor(score) {
        return scoreColor(score);
    }

    function formatPercent(num) {
        if (typeof num !== 'number' || !Number.isFinite(num)) return '—';
        return `${Math.round(num)}%`;
    }

    function formatRatingDelta(num) {
        if (typeof num !== 'number' || !Number.isFinite(num)) return '—';
        const r = Math.round(num);
        if (r > 0) return `+${r}`;
        return String(r);
    }

    // Inactivity rule (PRD §5 "Inactive student" insight): a student with no
    // tournament in the last 90 days is inactive. Missing / invalid date →
    // inactive (we cannot prove activity). `asOfDate` is injectable for tests.
    const INACTIVE_THRESHOLD_DAYS = 90;
    function isStudentInactive(lastTournamentDate, asOfDate) {
        if (lastTournamentDate === null || lastTournamentDate === undefined || lastTournamentDate === '') {
            return true;
        }
        const last = (lastTournamentDate instanceof Date)
            ? lastTournamentDate
            : new Date(lastTournamentDate);
        const lastMs = last.getTime();
        if (!Number.isFinite(lastMs)) return true;
        const asOfMs = (asOfDate === undefined || asOfDate === null)
            ? Date.now()
            : (asOfDate instanceof Date ? asOfDate.getTime() : Number(asOfDate));
        if (!Number.isFinite(asOfMs)) return true;
        return (asOfMs - lastMs) > INACTIVE_THRESHOLD_DAYS * 86400000;
    }

    /**
     * Stable sort of a coach leaderboard. Numeric columns sort descending by
     * default (more is better); `coach_name` and `branches` sort ascending.
     * Unknown keys fall back to `total_tournaments` desc — the headline visible
     * metric once the composite Score column was retired.
     */
    function sortLeaderboard(rows, sortKey, direction) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        const ascDefault = sortKey === 'coach_name' || sortKey === 'branches';
        const dir = (direction === 'asc' || direction === 'desc')
            ? direction
            : (ascDefault ? 'asc' : 'desc');
        const mult = dir === 'asc' ? 1 : -1;
        const key = (sortKey && (sortKey in (list[0] || {}))) ? sortKey : 'total_tournaments';

        return list
            .map((row, i) => ({ row, i }))
            .sort((a, b) => {
                const va = a.row[key];
                const vb = b.row[key];
                const an = (va === null || va === undefined);
                const bn = (vb === null || vb === undefined);
                if (an && bn) return a.i - b.i;
                if (an) return 1;
                if (bn) return -1;
                if (typeof va === 'number' && typeof vb === 'number') {
                    if (va === vb) return a.i - b.i;
                    return (va - vb) * mult;
                }
                const sa = String(va).toLowerCase();
                const sb = String(vb).toLowerCase();
                if (sa === sb) return a.i - b.i;
                return sa < sb ? -1 * mult : 1 * mult;
            })
            .map(x => x.row);
    }

    /**
     * Filter the leaderboard to rows whose `branches` array includes the
     * given branch id. Missing branch / empty id → input unchanged.
     */
    function filterLeaderboardByBranch(rows, branchId) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        if (!branchId || branchId === 'all') return list;
        return list.filter(r => Array.isArray(r && r.branches) && r.branches.includes(branchId));
    }

    /**
     * Filter the leaderboard to a single coach by id. Missing coach / empty
     * id / 'all' → input unchanged. Rows without a matching `coach_id` are
     * dropped — the leaderboard is row-per-coach so this is a 1-or-0 result.
     */
    function filterLeaderboardByCoach(rows, coachId) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        if (!coachId || coachId === 'all') return list;
        return list.filter(r => r && r.coach_id === coachId);
    }

    /**
     * Roll a coach leaderboard up into the seven PRD §5 hero numbers for the
     * school overview. Used as a fallback if `school_kpi_summary` is
     * unavailable; the edge function is still the source of truth when it
     * returns data.
     *
     * `participation_pct` is the share of active students who entered at
     * least one tournament. The leaderboard rows carry `tournament_entries`
     * (raw entry count, can exceed student count) and an `active_students_count`
     * denominator, so we approximate participation as min(entries, active)/active.
     * It's not a perfect re-derivation of the server's distinct-participant
     * count, but it keeps the card non-blank when a single coach is selected.
     */
    function aggregateSchoolHero(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const out = {
            active_students_count: 0,
            active_players_count: 0,
            total_tournaments: 0,
            top3_count: 0,
            promotions_count: 0,
            new_razryads_count: 0,
            participation_pct: 0,
        };
        let participantsApprox = 0;
        for (const r of list) {
            if (!r) continue;
            const active = Number(r.active_students_count) || 0;
            const entries = Number(r.tournament_entries) || 0;
            out.active_students_count += active;
            out.active_players_count  += Number(r.active_players_count)  || 0;
            out.total_tournaments     += Number(r.total_tournaments)     || 0;
            out.top3_count            += Number(r.top3_count)            || 0;
            out.promotions_count      += Number(r.promotions_count)      || 0;
            out.new_razryads_count    += Number(r.new_razryads_count)    || 0;
            participantsApprox += Math.min(entries, active);
        }
        out.participation_pct = out.active_students_count > 0
            ? Math.round((participantsApprox / out.active_students_count) * 1000) / 10
            : 0;
        return out;
    }

    /**
     * Default filter state for the dashboard's three controls.
     * PRD §5: window defaults to 90d, league + branch default to 'all'.
     * `roleInfo` is reserved for future per-role defaults (kept transparent
     * today — see `getInitialBranchScope` / `getInitialCoachScope`).
     */
    function defaultFilterState(_roleInfo) {
        return {
            window: DEFAULT_WINDOW,
            league: DEFAULT_LEAGUE,
            branchId: DEFAULT_BRANCH,
            coachId: DEFAULT_COACH,
        };
    }

    /**
     * Clamp an arbitrary filter object back to a known-good state. Used when
     * loading persisted state or merging a partial update so the dashboard
     * never issues a call with `window=garbage` / `league=xss`. Unknown values
     * fall back to defaults; `branchId` is treated as opaque (any non-empty
     * string is accepted — branch ids are server-owned).
     */
    function normalizeFilters(input) {
        const i = (input && typeof input === 'object') ? input : {};
        const win = TIME_WINDOWS.includes(i.window) ? i.window : DEFAULT_WINDOW;
        const lg = LEAGUES.includes(i.league) ? i.league : DEFAULT_LEAGUE;
        const branchId = (typeof i.branchId === 'string' && i.branchId.length > 0)
            ? i.branchId
            : DEFAULT_BRANCH;
        const coachId = (typeof i.coachId === 'string' && i.coachId.length > 0)
            ? i.coachId
            : DEFAULT_COACH;
        return { window: win, league: lg, branchId, coachId };
    }

    /**
     * Build the canonical edge-function query string for the requested view.
     * Combines `roleLock.kpiQueryScope` (auth gate) with the resolved time
     * window and the dashboard's league / branch filters. Returns null when
     * the user is not allowed to issue the call.
     *
     * Filter params:
     *   - window  → preset id resolved to window_start / window_end
     *   - league  → 'A' | 'B' | 'C' (omitted when 'all' / falsy)
     *   - branchId → uuid (omitted when 'all' / falsy). Passes through for
     *                every view so the dashboard's branch picker applies
     *                consistently; the edge function reads it only where
     *                relevant (e.g. coach_leaderboard).
     *
     * @param {object} roleInfo
     * @param {'school'|'branch'|'coach'} view
     * @param {object} params { branchName?, branchId?, coachId?, coaches?, window?, league?, now? }
     */
    function buildKpiQuery(roleInfo, view, params) {
        if (!roleLock) return null;
        const p = params || {};
        const scope = roleLock.kpiQueryScope(roleInfo, view, p);
        if (!scope) return null;
        const win = resolveTimeWindow(p.window, p.now);
        const query = { ...scope, window_start: win.start, window_end: win.end };
        if (p.branchId && p.branchId !== 'all') query.branch_id = p.branchId;
        if (p.league && p.league !== 'all') query.league = p.league;
        return query;
    }

    function encodeQuery(obj) {
        return Object.keys(obj)
            .filter(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`)
            .join('&');
    }

    /**
     * Issue a single edge-function call. `opts.fetch` / `opts.config` are
     * injectable for tests; defaults read from globals.
     * Returns `{ success, data, error }` matching the edge function shape.
     */
    async function callKpiEndpoint(query, opts) {
        const o = opts || {};
        const fetchFn = o.fetch || (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) return { success: false, error: 'fetch unavailable' };
        const config = o.config || (typeof window !== 'undefined' && window.supabaseConfig) || {};
        const url = config.url || '';
        const edgeApiKey = config.apiKey || 'ce-api-2026-k8x9m2p4q7w1';
        const gatewayJwt = config.anonKey || '';
        const endpoint = `${url}/functions/v1/analytics-tournaments?${encodeQuery(query)}`;
        try {
            const resp = await fetchFn(endpoint, {
                method: 'GET',
                headers: { 'x-api-key': edgeApiKey, 'Authorization': `Bearer ${gatewayJwt}`, 'Content-Type': 'application/json' },
            });
            if (!resp || !resp.ok) {
                return { success: false, error: `HTTP ${resp ? resp.status : 'no-response'}` };
            }
            const body = await resp.json();
            return body && typeof body === 'object' ? body : { success: false, error: 'bad body' };
        } catch (e) {
            return { success: false, error: e && e.message ? e.message : String(e) };
        }
    }

    /**
     * Detect when an edge-function result has no data to render — covers the
     * Phase 2 "migrations 036/037/038 not yet applied" case where the call
     * can come back null, 4xx (`success:false`), or a success envelope with
     * empty data. Renderers use this to fall back to `renderEmptyState`.
     */
    function isKpiEmpty(result) {
        if (result === null || result === undefined) return true;
        if (typeof result !== 'object') return true;
        if (result.success === false) return true;
        const data = result.data;
        if (data === null || data === undefined) return true;
        if (Array.isArray(data)) return data.length === 0;
        if (typeof data === 'object') return Object.keys(data).length === 0;
        return false;
    }

    /**
     * Fetch the data backing a single view. Returns null when the user is
     * not allowed, otherwise the parsed edge-function response.
     */
    async function fetchView(roleInfo, view, params, opts) {
        const query = buildKpiQuery(roleInfo, view, params);
        if (!query) return null;
        return callKpiEndpoint(query, opts);
    }

    // -------- DOM rendering (only runs in the browser) ---------------------

    // ---- Re-render-on-language-change cache --------------------------------
    //
    // _el-based renderers paint via DOM text nodes — they carry no data-i18n
    // attributes, so i18n.js's applyTranslations() can not retranslate them
    // when the user flips EN ↔ RU. We compensate by remembering the last
    // (container, args) tuple per renderer and replaying it on the
    // `languageChanged` / `languagechange` event with a fresh `t` adapter.
    const _renderCache = [];

    function _rememberRender(name, container, args) {
        if (!container) return;
        for (let i = _renderCache.length - 1; i >= 0; i--) {
            if (_renderCache[i].container === container) _renderCache.splice(i, 1);
        }
        _renderCache.push({ name, container, args });
    }

    function _makeTAdapter() {
        return (key, fb) => {
            if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
                const v = window.i18n.t(key);
                if (v && v !== key && typeof v === 'string') return v;
            }
            return fb;
        };
    }

    function _rerenderAll() {
        const t = _makeTAdapter();
        const snapshot = _renderCache.slice();
        for (const entry of snapshot) {
            const fn = api[entry.name];
            if (typeof fn !== 'function') continue;
            const next = entry.args.slice();
            const lastIdx = next.length - 1;
            const lastOpts = lastIdx >= 0 ? next[lastIdx] : null;
            if (lastOpts && typeof lastOpts === 'object' && !Array.isArray(lastOpts)) {
                next[lastIdx] = Object.assign({}, lastOpts, { t });
            } else {
                next.push({ t });
            }
            try { fn(entry.container, ...next); } catch (_) { /* one bad renderer must not break the rest */ }
        }
    }

    function subscribeLanguageEvents() {
        if (typeof window === 'undefined') return;
        if (window.__kpiLangSubscribed) return;
        // i18n.js installs window.i18n right at the end of its IIFE, but it
        // dispatches `languagechange` from the very first setLanguage() call.
        // If we attach listeners before window.i18n exists, the _makeTAdapter
        // closure still works (it re-reads window.i18n on every call), but
        // defending against the race is cheap — poll briefly so the production
        // dropdown is wired even when coach-kpi.js loads first.
        if (typeof window.i18n === 'undefined' || !window.i18n) {
            if (window.__kpiLangPending) return;
            window.__kpiLangPending = true;
            let tries = 0;
            const poll = () => {
                if (typeof window === 'undefined') return;
                if (window.i18n) {
                    window.__kpiLangPending = false;
                    subscribeLanguageEvents();
                    return;
                }
                if (++tries >= 50) {
                    // i18n never loaded — wire listeners anyway so manual
                    // events still fire the re-render path; no-op until i18n
                    // arrives.
                    window.__kpiLangPending = false;
                    _attachLanguageListeners();
                    return;
                }
                if (typeof setTimeout === 'function') setTimeout(poll, 100);
            };
            if (typeof setTimeout === 'function') setTimeout(poll, 0);
            else _attachLanguageListeners();
            return;
        }
        _attachLanguageListeners();
    }

    function _attachLanguageListeners() {
        if (typeof window === 'undefined') return;
        if (window.__kpiLangSubscribed) return;
        window.__kpiLangSubscribed = true;
        const handler = () => _rerenderAll();
        if (typeof window.addEventListener === 'function') {
            // Task contract: window.languageChanged. Also wire the legacy
            // document.languagechange the existing i18n.js dispatches so the
            // production dropdown re-renders the dashboard without extra plumbing.
            window.addEventListener('languageChanged', handler);
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('languagechange', handler);
        }
    }

    function _el(tag, props, children) {
        const node = document.createElement(tag);
        if (props) {
            for (const k of Object.keys(props)) {
                if (k === 'className') node.className = props[k];
                else if (k === 'text') node.textContent = props[k];
                else if (k === 'dataset') Object.assign(node.dataset, props[k]);
                else node.setAttribute(k, props[k]);
            }
        }
        if (Array.isArray(children)) {
            for (const c of children) if (c) node.appendChild(c);
        }
        return node;
    }

    /**
     * Render the friendly empty card used when the edge function returns
     * null / 4xx / empty data (Phase 2 migrations not yet applied). Mounts
     * a centered card with a lucide icon, title, and helper paragraph so it
     * reads as a deliberate empty state instead of a broken table.
     *
     * `opts.t(key, fallback)` is an optional i18n lookup; `opts.title` and
     * `opts.helper` override the resolved strings. The legacy `message`
     * positional arg keeps working — when passed a string we use it as the
     * helper text so existing callers (`renderRazryadDoughnut`, etc.) still
     * surface their custom message ("Chart.js not loaded", etc.).
     */
    function renderEmptyState(container, message, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const helperText = (typeof message === 'string' && message.length > 0)
            ? message
            : (typeof o.helper === 'string' && o.helper.length > 0
                ? o.helper
                : label('coachKpiEmptyState', EMPTY_STATE_MESSAGE));
        const titleText = (typeof o.title === 'string' && o.title.length > 0)
            ? o.title
            : label('coachKpiEmptyTitle', 'No data yet');

        container.innerHTML = '';
        const card = _el('div', {
            className: 'stat-card empty-state kpi-empty-state',
            role: 'status',
        }, [
            _el('div', { className: 'kpi-empty-icon' }, [
                _el('i', { 'data-lucide': 'bar-chart-3' }),
            ]),
            _el('div', { className: 'kpi-empty-title stat-card-label', text: titleText }),
            _el('p', { className: 'kpi-empty-helper', text: helperText }),
        ]);
        container.appendChild(card);
        // Cache as renderEmptyState so a directly-mounted empty card retranslates
        // on language change. When called from an outer renderer (renderSchoolHero,
        // renderRazryadDoughnut, …), the outer's _rememberRender call lands AFTER
        // this one and wins — so on re-render the outer renderer fires with fresh
        // i18n and re-resolves any pre-resolved fallback messages (e.g. the
        // localized "Chart.js not loaded" string).
        _rememberRender('renderEmptyState', container, [message, o]);
    }

    /**
     * Build the seven hero stat cards from a school summary. Pure DOM, no
     * data fetching. Returns the container element.
     */
    function renderSchoolHero(container, summary, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        if (!summary || typeof summary !== 'object' || Object.keys(summary).length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderSchoolHero', container, [summary, o]);
            return;
        }
        const s = summary;
        // Order locked by COACH_KPI_PHASE2_SPEC follow-up: active students,
        // active players (distinct students who played ≥1 game), participation,
        // top-3 events, new razryads, promotions (deduped), tournaments.
        // `variant` drives the color accent (left border + .stat-icon gradient)
        // defined in admin-styles.css → palette is hardcoded to existing tokens
        // (teal / blue / amber / gold / purple / green / slate).
        const cards = [
            ['active-students', '👥', label('coachKpiActiveStudentsL2', 'Active Lvl 2+'), formatHeroValue(s.active_students_count)],
            ['active-players',  '♟',  label('coachKpiActivePlayers',  'Active players'),  formatHeroValue(s.active_players_count)],
            ['participation',   '📊', label('coachKpiParticipation',  'Participation'),   formatHeroValue(s.participation_pct, { percent: true })],
            ['top3',            '🏆', label('coachKpiTop3',           'Top-3 finishes'),  formatHeroValue(s.top3_count)],
            ['razryads',        '⭐', label('coachKpiNewRazryads',    'New razryads'),    formatHeroValue(s.new_razryads_count)],
            ['promotions',      '⬆',  label('coachKpiPromotions',     'Promotions'),      formatHeroValue(s.promotions_count)],
            ['tournaments',     '🗓', label('coachKpiTournamentsYtd', 'Tournaments'),     formatHeroValue(s.total_tournaments)],
        ];
        const onCardClick = typeof o.onCardClick === 'function' ? o.onCardClick : null;
        container.innerHTML = '';
        for (const [variant, icon, cardLabel, value] of cards) {
            const metric = DRILLABLE_METRICS[variant] || null;
            const clickable = !!(metric && onCardClick);
            const props = {
                className: `stat-card kpi-hero-card variant-${variant}${clickable ? ' is-clickable' : ''}`,
            };
            if (clickable) {
                props.role = 'button';
                props.tabindex = '0';
                props.dataset = { metric };
                props['aria-label'] = cardLabel;
            }
            const card = _el('div', props, [
                _el('span', { className: 'stat-icon', 'aria-hidden': 'true', text: icon }),
                _el('div', { className: 'stat-card-value', text: value }),
                _el('div', { className: 'stat-card-label', text: cardLabel }),
            ]);
            if (clickable && card.addEventListener) {
                card.addEventListener('click', () => onCardClick(metric));
                card.addEventListener('keydown', (e) => {
                    if (!e) return;
                    const key = e.key;
                    const code = e.keyCode;
                    const isEnter = key === 'Enter' || code === 13;
                    const isSpace = key === ' ' || key === 'Spacebar' || code === 32;
                    if (isEnter || isSpace) {
                        if (typeof e.preventDefault === 'function') e.preventDefault();
                        onCardClick(metric);
                    }
                });
            }
            container.appendChild(card);
        }
        _rememberRender('renderSchoolHero', container, [summary, o]);
    }

    // Sortable column registry for the Coach Performance leaderboard. `defaultDir`
    // is the natural direction used on a column's first click — names asc, metrics
    // desc. The order here defines the table's column order.
    const LEADERBOARD_COLUMNS = Object.freeze([
        { key: 'coach_name',            i18n: 'coachKpiColCoach',          fallback: 'Coach',          defaultDir: 'asc'  },
        { key: 'active_students_count', i18n: 'coachKpiColActiveL2',       fallback: 'Active Lvl 2+', defaultDir: 'desc' },
        { key: 'active_players_count',  i18n: 'coachKpiColActivePlayers',  fallback: 'Active players', defaultDir: 'desc' },
        { key: 'participation_pct',     i18n: 'coachKpiColParticipation',  fallback: 'Participation', defaultDir: 'desc' },
        { key: 'top3_count',            i18n: 'coachKpiColTop3',           fallback: 'Top-3',          defaultDir: 'desc' },
        { key: 'new_razryads_count',    i18n: 'coachKpiColRazryads',       fallback: 'Razryads',       defaultDir: 'desc' },
        { key: 'promotions_count',      i18n: 'coachKpiColPromotions',     fallback: 'Promotions',     defaultDir: 'desc' },
        { key: 'total_tournaments',     i18n: 'coachKpiColTournaments',    fallback: 'Tournaments',    defaultDir: 'desc' },
    ]);

    // Module-scoped sort state so a chosen header survives filter / language
    // re-renders. `opts.sortKey` on a single render call overrides this for
    // that paint only (it does not mutate the module state).
    const _LEADERBOARD_DEFAULT_SORT = Object.freeze({ key: 'total_tournaments', direction: 'desc' });
    let _leaderboardSort = { key: _LEADERBOARD_DEFAULT_SORT.key, direction: _LEADERBOARD_DEFAULT_SORT.direction };

    function _defaultDirFor(sortKey) {
        for (const col of LEADERBOARD_COLUMNS) {
            if (col.key === sortKey) return col.defaultDir;
        }
        return 'desc';
    }

    /**
     * Render the coach leaderboard table. Empty / non-array `rows` falls
     * through to `renderEmptyState` so callers don't need a separate branch.
     */
    function renderLeaderboard(container, rows, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        if (!Array.isArray(rows) || rows.length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderLeaderboard', container, [rows, o]);
            return;
        }

        // Render-time filter: hide coaches with zero active students (frozen
        // or left). Hero stats / charts above the table still see the full
        // aggregation; only the leaderboard hides empty rosters. Filter runs
        // before sort so visible row positions are not affected by hidden rows.
        rows = rows.filter((r) => (Number(r && r.active_students_count) || 0) >= 1);
        if (rows.length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderLeaderboard', container, [rows, o]);
            return;
        }

        // Pre-attach the computed participation_pct so sortLeaderboard can
        // treat it like any other numeric column.
        const enriched = rows.map((row) => {
            const activeStudents = Number(row && row.active_students_count) || 0;
            const activePlayers = Number(row && row.active_players_count) || 0;
            const participationPct = activeStudents > 0
                ? Math.round((activePlayers / activeStudents) * 1000) / 10
                : 0;
            return Object.assign({}, row, { participation_pct: participationPct });
        });

        // opts.sortKey is an explicit per-render override; otherwise the
        // module state drives.
        let sortKey;
        let direction;
        if (o.sortKey) {
            sortKey = o.sortKey;
            direction = (o.direction === 'asc' || o.direction === 'desc')
                ? o.direction
                : _defaultDirFor(o.sortKey);
        } else {
            sortKey = _leaderboardSort.key;
            direction = _leaderboardSort.direction;
        }

        const sorted = sortLeaderboard(enriched, sortKey, direction);
        // Rank-row highlights apply only on the default headline ordering
        // (total_tournaments desc). Any other sort — including the same key
        // but reversed — must drop the medals so the gold tint never paints
        // an unrelated leader.
        const usingDefaultSort = sortKey === _LEADERBOARD_DEFAULT_SORT.key
            && direction === _LEADERBOARD_DEFAULT_SORT.direction;

        container.innerHTML = '';
        const table = _el('table', { className: 'kpi-leaderboard' });
        const headerRow = _el('tr');
        for (const col of LEADERBOARD_COLUMNS) {
            const isActive = sortKey === col.key;
            const ariaSort = isActive
                ? (direction === 'asc' ? 'ascending' : 'descending')
                : 'none';
            const arrowChild = isActive ? _el('span', {
                className: 'sort-arrow is-active',
                'aria-hidden': 'true',
                text: direction === 'asc' ? ' ▲' : ' ▼',
            }) : null;
            const th = _el('th', {
                'data-sort-key': col.key,
                role: 'button',
                tabindex: '0',
                'aria-sort': ariaSort,
                text: label(col.i18n, col.fallback),
            }, arrowChild ? [arrowChild] : []);
            const onActivate = () => {
                const nextDir = (_leaderboardSort.key === col.key)
                    ? (_leaderboardSort.direction === 'asc' ? 'desc' : 'asc')
                    : col.defaultDir;
                _leaderboardSort = { key: col.key, direction: nextDir };
                // Re-render with the original rows; module state now drives
                // the sort. Strip any one-shot sortKey override so it can't
                // re-overrule the user's click.
                const nextOpts = Object.assign({}, o);
                delete nextOpts.sortKey;
                delete nextOpts.direction;
                renderLeaderboard(container, rows, nextOpts);
            };
            if (th.addEventListener) {
                th.addEventListener('click', onActivate);
                th.addEventListener('keydown', (e) => {
                    if (!e) return;
                    const key = e.key;
                    const code = e.keyCode;
                    const isEnter = key === 'Enter' || code === 13;
                    const isSpace = key === ' ' || key === 'Spacebar' || code === 32;
                    if (isEnter || isSpace) {
                        if (typeof e.preventDefault === 'function') e.preventDefault();
                        onActivate();
                    }
                });
            }
            headerRow.appendChild(th);
        }
        const thead = _el('thead', null, [headerRow]);
        const tbody = _el('tbody');
        sorted.forEach((row, i) => {
            const activeStudents = Number(row.active_students_count) || 0;
            const participationPct = row.participation_pct;
            const top3 = Number(row.top3_count) || 0;
            const promotions = Number(row.promotions_count) || 0;
            let rowClass = 'leaderboard-row';
            if (usingDefaultSort && i < 3) rowClass += ` rank-${i + 1}`;
            let pBand = '';
            if (activeStudents > 0) {
                if (participationPct < 30) pBand = ' low';
                else if (participationPct <= 60) pBand = ' mid';
                else pBand = ' high';
            }
            tbody.appendChild(_el('tr', {
                className: rowClass,
                dataset: { coachId: row.coach_id || '' },
            }, [
                _el('td', { text: row.coach_name || '—' }),
                _el('td', { text: formatHeroValue(row.active_students_count) }),
                _el('td', { text: formatHeroValue(row.active_players_count) }),
                _el('td', {
                    className: `participation-cell${pBand}`,
                    text: formatHeroValue(participationPct, { percent: true }),
                }),
                _el('td', {
                    className: `top3-cell${top3 > 0 ? ' has-value' : ''}`,
                    text: formatHeroValue(row.top3_count),
                }),
                _el('td', { text: formatHeroValue(row.new_razryads_count) }),
                _el('td', {
                    className: `promo-cell${promotions > 0 ? ' has-value' : ''}`,
                    text: formatHeroValue(row.promotions_count),
                }),
                _el('td', { text: formatHeroValue(row.total_tournaments) }),
            ]));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        container.appendChild(table);
        _rememberRender('renderLeaderboard', container, [rows, o]);
    }

    /**
     * Bucket students into the canonical razryad slots so the doughnut can be
     * fed from `coach_kpi_summary.data.students` directly. Unknown / null
     * razryads roll into the `None` slot — the doughnut never silently drops
     * a student. Accepts the legacy `'1' / '2' / '3' / '4'` and modern
     * `'1st' / ...` spellings, and is case-insensitive (DB stores lowercase
     * 'kms' / 'none' per migrations/update_razryad_constraint.sql).
     */
    function aggregateRazryadFromStudents(students) {
        const out = { KMS: 0, '1st': 0, '2nd': 0, '3rd': 0, '4th': 0, None: 0 };
        if (!Array.isArray(students)) return out;
        for (const s of students) {
            if (!s || typeof s !== 'object') continue;
            const raw = s.razryad;
            const r = (typeof raw === 'string') ? raw.toLowerCase() : raw;
            if (r === 'kms') out.KMS++;
            else if (r === '1st' || r === '1') out['1st']++;
            else if (r === '2nd' || r === '2') out['2nd']++;
            else if (r === '3rd' || r === '3') out['3rd']++;
            else if (r === '4th' || r === '4') out['4th']++;
            else out.None++;
        }
        return out;
    }

    function _resolveChartCtor() {
        if (typeof window !== 'undefined' && window.Chart) return window.Chart;
        if (typeof globalThis !== 'undefined' && globalThis.Chart) return globalThis.Chart;
        if (typeof Chart !== 'undefined') return Chart;
        return null;
    }

    function _mountCanvas(container) {
        container.innerHTML = '';
        const canvas = _el('canvas', { className: 'kpi-chart-canvas' });
        container.appendChild(canvas);
        return canvas;
    }

    function _allZero(obj) {
        if (!obj || typeof obj !== 'object') return true;
        const vals = Object.values(obj);
        if (vals.length === 0) return true;
        for (const v of vals) {
            const n = Number(v);
            if (Number.isFinite(n) && n !== 0) return false;
        }
        return true;
    }

    /**
     * Razryad doughnut (PRD §5: school view + coach view both render this).
     * `counts` is keyed by `RAZRYAD_ORDER` — pass the output of
     * `aggregateRazryadFromStudents` or any equivalent object. Empty counts
     * fall through to `renderEmptyState`. Returns the Chart instance, or
     * null when Chart.js is unavailable / data is empty.
     */
    function renderRazryadDoughnut(container, counts, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        if (_allZero(counts)) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderRazryadDoughnut', container, [counts, o]);
            return null;
        }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) {
            renderEmptyState(container, label('coachKpiChartUnavailable', 'Chart.js not loaded'), { t });
            _rememberRender('renderRazryadDoughnut', container, [counts, o]);
            return null;
        }
        const canvas = _mountCanvas(container);
        const labels = RAZRYAD_ORDER.map(k => label('coachKpiRazryad' + k, k));
        const data = RAZRYAD_ORDER.map(k => Number(counts && counts[k]) || 0);
        const inst = new ChartCtor(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: RAZRYAD_COLORS.slice(),
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                },
            },
        });
        _rememberRender('renderRazryadDoughnut', container, [counts, o]);
        return inst;
    }

    /**
     * School view — tournaments by league as a stacked bar with one column
     * per branch (PRD §5). `byBranch` is an array of
     * `{ branch_name, league_counts: { A, B, C } }`. The renderer is
     * permissive about key casing so the caller can pass either snake_case
     * (matches edge-function payloads) or camelCase. Empty input → empty state.
     */
    function renderTournamentsByLeagueStackedBar(container, byBranch, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const list = Array.isArray(byBranch) ? byBranch.filter(Boolean) : [];
        if (list.length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderTournamentsByLeagueStackedBar', container, [byBranch, o]);
            return null;
        }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) {
            renderEmptyState(container, label('coachKpiChartUnavailable', 'Chart.js not loaded'), { t });
            _rememberRender('renderTournamentsByLeagueStackedBar', container, [byBranch, o]);
            return null;
        }
        const canvas = _mountCanvas(container);
        const labels = list.map(b => b.branch_name || b.branchName || b.name || '—');
        const datasets = LEAGUE_PLOT_ORDER.map(lg => ({
            label: label('coachKpiLeague' + lg, LEAGUE_PLOT_LABELS[lg]),
            data: list.map(b => {
                const lc = b.league_counts || b.leagueCounts || {};
                return Number(lc[lg]) || 0;
            }),
            backgroundColor: LEAGUE_COLORS[lg],
            borderWidth: 0,
        }));
        const inst = new ChartCtor(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                },
            },
        });
        _rememberRender('renderTournamentsByLeagueStackedBar', container, [byBranch, o]);
        return inst;
    }

    /**
     * Coach view — tournaments by league as a plain (non-stacked) bar
     * (PRD §5). `counts` is `{ A, B, C }`. Empty / all-zero → empty state.
     */
    function renderTournamentsByLeagueBar(container, counts, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        if (_allZero(counts)) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderTournamentsByLeagueBar', container, [counts, o]);
            return null;
        }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) {
            renderEmptyState(container, label('coachKpiChartUnavailable', 'Chart.js not loaded'), { t });
            _rememberRender('renderTournamentsByLeagueBar', container, [counts, o]);
            return null;
        }
        const canvas = _mountCanvas(container);
        const labels = LEAGUE_PLOT_ORDER.map(lg => label('coachKpiLeague' + lg, LEAGUE_PLOT_LABELS[lg]));
        const data = LEAGUE_PLOT_ORDER.map(lg => Number(counts && counts[lg]) || 0);
        const colors = LEAGUE_PLOT_ORDER.map(lg => LEAGUE_COLORS[lg]);
        const inst = new ChartCtor(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: label('coachKpiTournaments', 'Tournaments'),
                    data,
                    backgroundColor: colors,
                    borderRadius: 6,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });
        _rememberRender('renderTournamentsByLeagueBar', container, [counts, o]);
        return inst;
    }

    /**
     * Coach view — avg place trend (line). `points` is an ordered array of
     * `{ month, avg_place }`. Y-axis is reversed because lower place = better,
     * so an upward visual trend reads as improvement. Missing avg_place
     * values render as gaps (Chart.js spanGaps left default false).
     */
    function renderAvgPlaceTrendLine(container, points, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const list = Array.isArray(points) ? points.filter(Boolean) : [];
        if (list.length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderAvgPlaceTrendLine', container, [points, o]);
            return null;
        }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) {
            renderEmptyState(container, label('coachKpiChartUnavailable', 'Chart.js not loaded'), { t });
            _rememberRender('renderAvgPlaceTrendLine', container, [points, o]);
            return null;
        }
        const canvas = _mountCanvas(container);
        const labels = list.map(p => p.month || p.label || '');
        const data = list.map(p => {
            const v = (p.avg_place !== undefined ? p.avg_place : p.avgPlace);
            return Number.isFinite(v) ? v : null;
        });
        const inst = new ChartCtor(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: label('coachKpiAvgPlace', 'Avg place'),
                    data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    fill: true,
                    tension: 0.3,
                    spanGaps: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    // Lower place is better — flip so improvement reads upward.
                    y: { reverse: true, beginAtZero: false },
                },
            },
        });
        _rememberRender('renderAvgPlaceTrendLine', container, [points, o]);
        return inst;
    }

    /**
     * Render the filter bar (time window pill toggles + league select + branch
     * select). `current` should be a normalized filter state; unknown values
     * are clamped. `onChange` is invoked with the next normalized state every
     * time the user picks a different value.
     *
     * `opts.branches` — array of `{ id, name }` or strings. When empty, the
     * branch selector is rendered but only offers "All branches".
     * `opts.coaches` — array of coach roster entries. Each entry should carry
     * `id` plus `first_name`/`last_name` (snake_case from the edge function)
     * or the camelCase `firstName`/`lastName` shape returned by
     * window.supabaseData.getCoaches.
     * `opts.view` — `'school'` | `'branch'` | `'coach'`. The Coach dropdown
     * is only rendered on the school view; the branch and coach views are
     * already scoped to a single coach (or a branch of coaches) so a school-
     * wide coach picker would be misleading there.
     * `opts.t(key, fallback)` — optional i18n lookup. When absent the labels
     * fall back to the hard-coded English strings in WINDOW_LABELS /
     * LEAGUE_LABELS.
     */
    function renderFilters(container, current, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const state = normalizeFilters(current);
        const onChange = typeof o.onChange === 'function' ? o.onChange : null;
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fallback) => (t ? t(key, fallback) : fallback);

        const branchOptions = (Array.isArray(o.branches) ? o.branches : [])
            .map(b => (typeof b === 'string' ? { id: b, name: b } : b))
            .filter(b => b && typeof b.id === 'string' && b.id.length > 0);

        const coachOptions = (Array.isArray(o.coaches) ? o.coaches : [])
            .filter(c => c && typeof c.id === 'string' && c.id.length > 0)
            .map(c => {
                const first = c.first_name || c.firstName || '';
                const last  = c.last_name  || c.lastName  || '';
                const full = `${first} ${last}`.trim() || c.coach_name || c.name || c.id;
                return { id: c.id, name: full };
            });
        const showCoachSelect = o.view === 'school';

        container.innerHTML = '';
        const root = _el('div', { className: 'kpi-filters', role: 'group' });

        const windowGroup = _el('div', {
            className: 'kpi-filter-window',
            role: 'tablist',
            'aria-label': label('coachKpiTimeWindowGroup', 'Time window'),
        });
        const WINDOW_I18N = { '30d': '30d', '90d': '90d', 'ytd': 'Ytd' };
        for (const w of TIME_WINDOWS) {
            const i18nKey = 'coachKpiTimeWindow' + WINDOW_I18N[w];
            const btn = _el('button', {
                type: 'button',
                className: 'kpi-filter-pill' + (state.window === w ? ' is-active' : ''),
                'aria-pressed': state.window === w ? 'true' : 'false',
                dataset: { window: w },
                text: label(i18nKey, WINDOW_LABELS[w]),
            });
            btn.addEventListener && btn.addEventListener('click', () => {
                const next = normalizeFilters({ ...state, window: w });
                if (onChange) onChange(next);
            });
            windowGroup.appendChild(btn);
        }
        const windowField = _el('div', { className: 'filter-group' }, [
            _el('label', {
                className: 'filter-label',
                text: label('coachKpiWindowGroup', 'Time window'),
            }),
            windowGroup,
        ]);
        root.appendChild(windowField);

        const leagueSelect = _el('select', {
            className: 'kpi-filter-league',
            'aria-label': label('coachKpiLeagueGroup', 'League'),
        });
        for (const lg of LEAGUES) {
            const opt = _el('option', {
                value: lg,
                text: label('coachKpiLeague' + (lg === 'all' ? 'All' : lg), LEAGUE_LABELS[lg]),
            });
            if (state.league === lg) opt.setAttribute('selected', 'selected');
            leagueSelect.appendChild(opt);
        }
        leagueSelect.value = state.league;
        leagueSelect.addEventListener && leagueSelect.addEventListener('change', (e) => {
            const value = (e && e.target && e.target.value) || leagueSelect.value;
            const next = normalizeFilters({ ...state, league: value });
            if (onChange) onChange(next);
        });
        const leagueField = _el('div', { className: 'filter-group' }, [
            _el('label', {
                className: 'filter-label',
                text: label('coachKpiLeagueGroup', 'Tournament'),
            }),
            leagueSelect,
        ]);
        root.appendChild(leagueField);

        const branchSelect = _el('select', {
            className: 'kpi-filter-branch',
            'aria-label': label('coachKpiBranchGroup', 'Branch'),
        });
        const allOpt = _el('option', {
            value: 'all',
            text: label('coachKpiBranchAll', 'All branches'),
        });
        if (state.branchId === 'all') allOpt.setAttribute('selected', 'selected');
        branchSelect.appendChild(allOpt);
        for (const b of branchOptions) {
            const opt = _el('option', { value: b.id, text: b.name || b.id });
            if (state.branchId === b.id) opt.setAttribute('selected', 'selected');
            branchSelect.appendChild(opt);
        }
        branchSelect.value = state.branchId;
        branchSelect.addEventListener && branchSelect.addEventListener('change', (e) => {
            const value = (e && e.target && e.target.value) || branchSelect.value;
            // Changing branch invalidates the current coach selection — the
            // coach roster a school admin sees may not include coaches from
            // the newly picked branch. Reset coachId to "all" so the next
            // render's coach dropdown is consistent with the rows we fetch.
            const next = normalizeFilters({ ...state, branchId: value, coachId: 'all' });
            if (onChange) onChange(next);
        });
        const branchField = _el('div', { className: 'filter-group' }, [
            _el('label', {
                className: 'filter-label',
                text: label('coachKpiBranchGroup', 'Branch'),
            }),
            branchSelect,
        ]);
        root.appendChild(branchField);

        if (showCoachSelect) {
            const coachSelect = _el('select', {
                className: 'kpi-filter-coach',
                'aria-label': label('coachKpiCoachGroup', 'Coach'),
            });
            const allCoachOpt = _el('option', {
                value: 'all',
                text: label('coachKpiCoachAll', 'All coaches'),
            });
            if (state.coachId === 'all') allCoachOpt.setAttribute('selected', 'selected');
            coachSelect.appendChild(allCoachOpt);
            for (const c of coachOptions) {
                const opt = _el('option', { value: c.id, text: c.name });
                if (state.coachId === c.id) opt.setAttribute('selected', 'selected');
                coachSelect.appendChild(opt);
            }
            coachSelect.value = state.coachId;
            coachSelect.addEventListener && coachSelect.addEventListener('change', (e) => {
                const value = (e && e.target && e.target.value) || coachSelect.value;
                // Coach change leaves branch alone — the user may have picked
                // a branch first and then narrowed to a single coach in it.
                const next = normalizeFilters({ ...state, coachId: value });
                if (onChange) onChange(next);
            });
            const coachField = _el('div', { className: 'filter-group' }, [
                _el('label', {
                    className: 'filter-label',
                    text: label('coachKpiCoachGroup', 'Coach'),
                }),
                coachSelect,
            ]);
            root.appendChild(coachField);
        }

        container.appendChild(root);
        _rememberRender('renderFilters', container, [current, o]);
        return root;
    }

    /**
     * Entry point — load and render the dashboard for the given role + view.
     * Caller supplies the container set and an optional override `opts`
     * (fetch, config, window preset, branch / coach selection).
     *
     * Returns the resolved data so callers can chain additional rendering.
     */
    async function loadDashboard(roleInfo, view, params, opts) {
        if (!roleLock || !roleLock.canViewCoachKpi(roleInfo)) return null;
        if (!roleLock.canAccessView(roleInfo, view)) return null;
        const result = await fetchView(roleInfo, view, params, opts);
        if (!result || !result.success) return result;
        return result;
    }

    /**
     * Resolve the initial view the dashboard should open on, given the role.
     *   - Admin → 'school'
     *   - Locked coach → 'coach'
     *   - Anyone else → null (caller should not render)
     */
    function _initialView(roleInfo) {
        if (roleLock && typeof roleLock.defaultView === 'function') {
            return roleLock.defaultView(roleInfo);
        }
        if (roleInfo && roleInfo.isAdmin === true) return 'school';
        if (roleInfo && roleInfo.coachId) return 'coach';
        return null;
    }

    /**
     * Fetch the data backing the school overview. Issues two parallel calls:
     *   - `school_kpi_summary` → canonical hero numbers (participation_pct,
     *     total_tournaments, top3, etc.) for the school card row.
     *   - `coach_leaderboard`  → per-coach rows for the leaderboard table.
     *
     * Both calls receive the same window / branch_id / league filters so the
     * card numbers always reflect what the table is showing. Returns:
     *   { success, hero, rows, heroResult, rowsResult }
     * where `hero` is the school_kpi_summary `data` envelope, `rows` is the
     * coach_leaderboard `data` array, and the *Result fields are the full
     * edge-function responses for callers that need extra context.
     */
    async function _fetchSchoolLeaderboard(roleInfo, params, opts) {
        if (!roleLock || !roleLock.canViewCoachKpi(roleInfo)) return null;
        if (!roleLock.canAccessView(roleInfo, 'school')) return null;
        const p = params || {};
        const win = resolveTimeWindow(p.window, p.now);
        const baseQuery = { window_start: win.start, window_end: win.end };
        if (p.branchId && p.branchId !== 'all') baseQuery.branch_id = p.branchId;
        if (p.league && p.league !== 'all') baseQuery.league = p.league;

        const heroQuery = { action: 'school_kpi_summary', ...baseQuery };
        const rowsQuery = { action: 'coach_leaderboard',  ...baseQuery };

        const [heroResult, rowsResult] = await Promise.all([
            callKpiEndpoint(heroQuery, opts),
            callKpiEndpoint(rowsQuery, opts),
        ]);
        const hero = (heroResult && heroResult.success && heroResult.data) ? heroResult.data : null;
        const rows = (rowsResult && rowsResult.success && Array.isArray(rowsResult.data)) ? rowsResult.data : [];
        return {
            success: !!(heroResult && heroResult.success) || !!(rowsResult && rowsResult.success),
            hero,
            rows,
            heroResult,
            rowsResult,
            // Back-compat: legacy callers (tests, the upload-committed
            // subscriber) read `result.data` as the leaderboard rows.
            data: rows,
        };
    }

    /**
     * Issue the drilldown fetch for a clicked hero card. Coach-locked viewers
     * (non-admin coaches) have coach_id forced to self so a coach cannot peek
     * at another coach's students via the URL.
     */
    async function _fetchDrilldown(roleInfo, metric, state, opts) {
        if (!roleLock || !roleLock.canViewCoachKpi(roleInfo)) return null;
        const s = state || {};
        const win = resolveTimeWindow(s.window, s.now);
        const query = {
            action: 'school_student_drilldown',
            metric,
            window_start: win.start,
            window_end: win.end,
        };
        if (s.branchId && s.branchId !== 'all') query.branch_id = s.branchId;
        if (s.league && s.league !== 'all') query.league = s.league;
        if (roleLock.isCoachLocked && roleLock.isCoachLocked(roleInfo)) {
            query.coach_id = roleInfo.coachId;
        } else if (s.coachId && s.coachId !== 'all') {
            query.coach_id = s.coachId;
        }
        return callKpiEndpoint(query, opts);
    }

    /**
     * Render the drilldown table. Columns vary per metric (see edge-function
     * row shapes in supabase/functions/analytics-tournaments/index.ts). The
     * metric-cell-strong column carries the variant-colored emphasis so the
     * eye lands on the number that matches the hero card the user clicked.
     */
    // Normalize a razryad enum value (DB: 'kms' / '1st' / '2nd' / '3rd' / '4th'
     // / 'none' or numeric '1'..'4') to the i18n suffix the locale dictionaries
     // ship: 'KMS' / '1st' / '2nd' / '3rd' / '4th' / 'None'. Unknown values
     // return null so callers keep the raw text.
    function _normalizeRazryadSuffix(value) {
        if (value === null || value === undefined) return 'None';
        const r = String(value).toLowerCase();
        if (r === 'kms') return 'KMS';
        if (r === '1st' || r === '1') return '1st';
        if (r === '2nd' || r === '2') return '2nd';
        if (r === '3rd' || r === '3') return '3rd';
        if (r === '4th' || r === '4') return '4th';
        if (r === 'none' || r === '') return 'None';
        return null;
    }

    /**
     * Format a date for drilldown cells. Numeric DD.MM.YYYY across all locales
     * (universal, no translation surface). Accepts an ISO string, Date, or any
     * value Date(...) can parse. Invalid input → raw input as a string fallback.
     */
    function formatDrilldownDate(value) {
        if (value === null || value === undefined || value === '') return '—';
        // ISO date-only strings ('2026-03-15') — sidestep timezone wobble by
        // splitting directly when the prefix matches.
        if (typeof value === 'string') {
            const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return `${m[3]}.${m[2]}.${m[1]}`;
        }
        const d = (value instanceof Date) ? value : new Date(value);
        if (!d || !Number.isFinite(d.getTime())) return String(value);
        return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    }

    function renderDrilldown(container, metric, students, state, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const rows = Array.isArray(students) ? students : [];
        container.innerHTML = '';
        if (rows.length === 0) {
            renderEmptyState(container, undefined, { t });
            _rememberRender('renderDrilldown', container, [metric, students, state, o]);
            return;
        }
        const variant = METRIC_TO_VARIANT[metric] || 'active-players';
        const strongCls = `metric-cell-strong variant-${variant}`;
        const table = _el('table', { className: 'kpi-leaderboard kpi-drilldown-table' });
        const fullName = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—';
        // Localized enum cells share the filter-bar lookup keys (coachKpiLeague*
        // / coachKpiRazryad*) so a coach reading the dashboard in Russian sees
        // "Лига A" / "КМС" instead of the raw DB enum value.
        const leagueCell = (raw, kind) => {
            if (raw === null || raw === undefined || raw === '') {
                if (kind === 'razryad_3') return label('coachKpiLeagueR3', '3rd razryad');
                if (kind === 'razryad_4') return label('coachKpiLeagueR4', '4th razryad');
                return '—';
            }
            return label('coachKpiLeague' + raw, raw);
        };
        const razryadCell = (raw) => {
            if (raw === null || raw === undefined || raw === '') return '—';
            const suf = _normalizeRazryadSuffix(raw);
            return suf ? label('coachKpiRazryad' + suf, raw) : raw;
        };
        let thead = null;
        let tbody = null;
        if (metric === 'active_players') {
            thead = _el('thead', null, [_el('tr', null, [
                _el('th', { text: label('coachKpiDrillStudent', 'Student') }),
                _el('th', { text: label('coachKpiDrillBranch', 'Branch') }),
                _el('th', { text: label('coachKpiDrillCoach', 'Coach') }),
                _el('th', { text: label('coachKpiDrillLeague', 'League') }),
                _el('th', { text: label('coachKpiDrillRazryad', 'Razryad') }),
                _el('th', { text: label('coachKpiDrillGames', 'Games') }),
                _el('th', { text: label('coachKpiDrillTournamentsPlayed', 'Tournaments') }),
                _el('th', { text: label('coachKpiDrillRatingDelta', 'Rating Δ') }),
            ])]);
            tbody = _el('tbody');
            for (const r of rows) {
                tbody.appendChild(_el('tr', { dataset: { studentId: r.student_id || '' } }, [
                    _el('td', { text: fullName(r) }),
                    _el('td', { text: r.branch_name || '—' }),
                    _el('td', { text: r.coach_name || '—' }),
                    _el('td', { text: leagueCell(r.league, r.tournament_kind) }),
                    _el('td', { text: razryadCell(r.razryad) }),
                    _el('td', { text: formatHeroValue(r.games_played) }),
                    _el('td', { className: strongCls, text: formatHeroValue(r.tournaments_played) }),
                    _el('td', { text: formatRatingDelta(r.rating_delta_total) }),
                ]));
            }
        } else if (metric === 'top3') {
            thead = _el('thead', null, [_el('tr', null, [
                _el('th', { text: label('coachKpiDrillDate', 'Date') }),
                _el('th', { text: label('coachKpiDrillTournament', 'Tournament') }),
                _el('th', { text: label('coachKpiDrillStudent', 'Student') }),
                _el('th', { text: label('coachKpiDrillBranch', 'Branch') }),
                _el('th', { text: label('coachKpiDrillCoach', 'Coach') }),
                _el('th', { text: label('coachKpiDrillPlacement', 'Placement') }),
            ])]);
            tbody = _el('tbody');
            for (const r of rows) {
                tbody.appendChild(_el('tr', { dataset: { tournamentId: r.tournament_id || '' } }, [
                    _el('td', { text: formatDrilldownDate(r.occurred_at) }),
                    _el('td', { text: r.tournament_name || '—' }),
                    _el('td', { text: fullName(r) }),
                    _el('td', { text: r.branch_name || '—' }),
                    _el('td', { text: r.coach_name || '—' }),
                    _el('td', { className: strongCls, text: r.placement != null ? String(r.placement) : '—' }),
                ]));
            }
        } else if (metric === 'new_razryads') {
            thead = _el('thead', null, [_el('tr', null, [
                _el('th', { text: label('coachKpiDrillStudent', 'Student') }),
                _el('th', { text: label('coachKpiDrillBranch', 'Branch') }),
                _el('th', { text: label('coachKpiDrillCoach', 'Coach') }),
                _el('th', { text: label('coachKpiDrillOldRazryad', 'Old razryad') }),
                _el('th', { text: label('coachKpiDrillNewRazryad', 'New razryad') }),
                _el('th', { text: label('coachKpiDrillEarnedAt', 'Earned') }),
                _el('th', { text: label('coachKpiDrillTournament', 'Tournament') }),
            ])]);
            tbody = _el('tbody');
            for (const r of rows) {
                tbody.appendChild(_el('tr', { dataset: { studentId: r.student_id || '' } }, [
                    _el('td', { text: fullName(r) }),
                    _el('td', { text: r.branch_name || '—' }),
                    _el('td', { text: r.coach_name || '—' }),
                    _el('td', { text: razryadCell(r.old_razryad) }),
                    _el('td', { className: strongCls, text: razryadCell(r.new_razryad) }),
                    _el('td', { text: formatDrilldownDate(r.earned_at) }),
                    _el('td', { text: r.tournament_name || '—' }),
                ]));
            }
        } else if (metric === 'promotions') {
            thead = _el('thead', null, [_el('tr', null, [
                _el('th', { text: label('coachKpiDrillStudent', 'Student') }),
                _el('th', { text: label('coachKpiDrillBranch', 'Branch') }),
                _el('th', { text: label('coachKpiDrillCoach', 'Coach') }),
                _el('th', { text: label('coachKpiDrillFrom', 'From') }),
                _el('th', { text: label('coachKpiDrillTo', 'To') }),
                _el('th', { text: label('coachKpiDrillOccurredAt', 'Promoted') }),
            ])]);
            tbody = _el('tbody');
            for (const r of rows) {
                tbody.appendChild(_el('tr', { dataset: { studentId: r.student_id || '' } }, [
                    _el('td', { text: fullName(r) }),
                    _el('td', { text: r.branch_name || '—' }),
                    _el('td', { text: r.coach_name || '—' }),
                    _el('td', { text: leagueCell(r.from_league) }),
                    _el('td', { className: strongCls, text: leagueCell(r.to_league) }),
                    _el('td', { text: formatDrilldownDate(r.occurred_at) }),
                ]));
            }
        }
        if (thead) table.appendChild(thead);
        if (tbody) table.appendChild(tbody);
        container.appendChild(table);
        _rememberRender('renderDrilldown', container, [metric, students, state, o]);
    }

    /**
     * Render the drilldown header (back button + variant-colored title + count
     * badge). Standalone so the orchestrator can wire its own back handler.
     */
    function renderDrilldownHeader(container, metric, count, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const variant = METRIC_TO_VARIANT[metric] || 'active-players';
        const titleText = label('coachKpiDrillTitle_' + metric, METRIC_TITLES[metric] || metric);
        container.innerHTML = '';
        const back = _el('button', {
            type: 'button',
            className: 'kpi-drilldown-back',
            text: label('coachKpiDrillBack', '← Back'),
        });
        if (typeof o.onBack === 'function' && back.addEventListener) {
            back.addEventListener('click', () => o.onBack());
        }
        container.appendChild(back);
        container.appendChild(_el('h3', {
            className: `kpi-drilldown-title variant-${variant}`,
            text: titleText,
        }));
        const n = Number(count) || 0;
        container.appendChild(_el('span', {
            className: 'kpi-drilldown-count',
            text: `${n} ${n === 1 ? label('coachKpiDrillRow', 'row') : label('coachKpiDrillRows', 'rows')}`,
        }));
    }

    /**
     * Render the resolved dashboard payload into the school/coach host
     * containers. Pure DOM — fetching is the caller's job.
     *
     * For the school view, `result.data` is the `coach_leaderboard` rows; the
     * hero is rolled up via `aggregateSchoolHero` and the leaderboard rows
     * are rendered as-is.
     *
     * For the coach view, `result.data` is the `coach_kpi_summary` payload
     * `{ coach, hero, students }`; the hero comes from `result.data.hero`.
     */
    function _renderDashboard(view, result, t, state, extra) {
        if (typeof document === 'undefined') return;
        const onCardClick = (extra && typeof extra.onCardClick === 'function') ? extra.onCardClick : null;
        const opts = onCardClick ? { t, onCardClick } : { t };
        if (view === 'school') {
            const s = state || {};
            // Two payload shapes are accepted:
            //   1. New shape from _fetchSchoolLeaderboard → { hero, rows, ... }
            //      where hero is the school_kpi_summary data envelope.
            //   2. Legacy shape from a direct coach_leaderboard call →
            //      { success, data: [rows] } with no separate hero. We
            //      reconstruct the hero by aggregating the rows.
            const isNewShape = result && (Array.isArray(result.rows) || result.hero != null);
            const heroFromServer = isNewShape ? result.hero : null;
            const rawRows = isNewShape
                ? (Array.isArray(result.rows) ? result.rows : [])
                : ((result && result.success && Array.isArray(result.data)) ? result.data : []);
            const afterBranch = filterLeaderboardByBranch(rawRows, s.branchId);
            const rows = filterLeaderboardByCoach(afterBranch, s.coachId);

            const heroHost = document.getElementById('coach-kpi-school-hero');
            if (heroHost) {
                if (s.coachId && s.coachId !== 'all') {
                    // Coach filter is a hard re-cut of the hero — the server's
                    // school totals lie when the table is narrowed to one
                    // coach. Re-derive from the (now correctly per-coach)
                    // single leaderboard row so the cards match the table.
                    if (rows.length === 0) {
                        renderEmptyState(heroHost, undefined, opts);
                    } else {
                        renderSchoolHero(heroHost, aggregateSchoolHero(rows), opts);
                    }
                } else if (heroFromServer) {
                    // Canonical source — school_kpi_summary already honored
                    // the branch_id + league filters server-side.
                    renderSchoolHero(heroHost, heroFromServer, opts);
                } else if (rows.length > 0) {
                    renderSchoolHero(heroHost, aggregateSchoolHero(rows), opts);
                } else {
                    renderEmptyState(heroHost, undefined, opts);
                }
            }
            const lbHost = document.getElementById('coach-kpi-school-leaderboard');
            if (lbHost) renderLeaderboard(lbHost, rows, opts);
            return;
        }
        if (view === 'coach') {
            const data = (result && result.success && result.data) ? result.data : null;
            const heroHost = document.getElementById('coach-kpi-coach-hero');
            if (heroHost) {
                if (!data || !data.hero) renderEmptyState(heroHost, undefined, opts);
                else renderSchoolHero(heroHost, data.hero, opts);
            }
            const studentsHost = document.getElementById('coach-kpi-coach-students');
            if (studentsHost) {
                const students = (data && Array.isArray(data.students)) ? data.students : [];
                if (students.length === 0) renderEmptyState(studentsHost, undefined, opts);
                else renderLeaderboard(studentsHost, students, opts);
            }
            const razryadHost = document.getElementById('coach-kpi-coach-razryad-chart');
            if (razryadHost) {
                const counts = aggregateRazryadFromStudents(data && data.students);
                renderRazryadDoughnut(razryadHost, counts, opts);
            }
            return;
        }
    }

    /**
     * Issue the right fetch for the given view (`school` uses
     * coach_leaderboard, all others go through `loadDashboard`).
     */
    function _fetchForView(roleInfo, view, state, opts) {
        if (view === 'school') return _fetchSchoolLeaderboard(roleInfo, state, opts);
        return loadDashboard(roleInfo, view, state, opts);
    }

    /**
     * Light debounce helper — coalesces rapid invocations into one trailing
     * call after `ms` of quiet time. Used so the branch picker doesn't fire
     * a fetch per keystroke when the user types a UUID directly.
     */
    function _debounce(fn, ms) {
        let timer = null;
        const set = (typeof setTimeout === 'function') ? setTimeout : null;
        const clr = (typeof clearTimeout === 'function') ? clearTimeout : null;
        if (!set) return fn;
        return function (...args) {
            if (timer && clr) clr(timer);
            timer = set(() => { timer = null; fn.apply(this, args); }, ms);
        };
    }

    /**
     * Thin DOM orchestrator wired from `showCoachPerformance` in admin(-v2).js.
     * Renders the filter bar + initial view payload (hero, leaderboard, charts)
     * into their known host containers, and re-fetches on filter change.
     * Upload UI lives in the Rating Management modal — see admin-v2.html
     * #csvImportModal and admin-v2.js commitTournamentUpload().
     *
     * Gated by `roleLock.canViewCoachKpi(roleInfo)` — anyone the role lock
     * refuses gets a no-op. Renderers are individually safe with a missing
     * container, so a partially-scaffolded DOM does not throw.
     *
     * `_supabaseClient` is accepted to match the call signature in admin-v2.js
     * (`window.initCoachKpi(roleInfo, window.supabaseClient)`); data fetching
     * still goes through coach-kpi.js's own `callKpiEndpoint`.
     */
    function initCoachKpi(roleInfo, _supabaseClient) {
        if (typeof document === 'undefined') return;
        if (!roleLock || !roleLock.canViewCoachKpi(roleInfo)) return;

        const t = (key, fb) => {
            if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
                const v = window.i18n.t(key);
                if (v && v !== key && typeof v === 'string') return v;
            }
            return fb;
        };

        let view = _initialView(roleInfo);
        let state = defaultFilterState(roleInfo);
        // The branch/coach rosters are loaded once below; renderFilters reads
        // them out of these closures so a re-render after a filter change
        // doesn't re-fetch.
        let branches = [];
        let coaches = [];
        // Drilldown bookkeeping — `drilldownMetric` is non-null while the
        // drilldown subview is open; `prevView` remembers which main subview
        // to restore when the user clicks Back. The drilldown carries its own
        // filter state object so toggling a filter inside the drilldown does
        // not retroactively change what the main panels were showing.
        let drilldownMetric = null;
        let prevView = view;
        let drilldownState = null;

        function handleDrilldownFilterChange(next) {
            if (!drilldownMetric) return;
            drilldownState = normalizeFilters(next);
            _renderDrilldownPanel(roleInfo, drilldownMetric, drilldownState, branches, coaches, t, {
                onBack: closeDrilldown,
                onFilterChange: handleDrilldownFilterChange,
            });
        }

        const openDrilldown = (metric) => {
            if (!metric || !METRIC_TITLES[metric]) return;
            prevView = drilldownMetric ? prevView : view;
            drilldownMetric = metric;
            drilldownState = normalizeFilters(state);
            _applyDrilldownPanelState(true);
            _renderDrilldownPanel(roleInfo, metric, drilldownState, branches, coaches, t, {
                onBack: closeDrilldown,
                onFilterChange: handleDrilldownFilterChange,
            });
        };

        const closeDrilldown = () => {
            if (!drilldownMetric) return;
            drilldownMetric = null;
            drilldownState = null;
            _applyDrilldownPanelState(false, prevView);
        };

        const refresh = () => {
            Promise.resolve(_fetchForView(roleInfo, view, state, {}))
                .then((result) => { _renderDashboard(view, result, t, state, { onCardClick: openDrilldown }); })
                .catch((err) => { console.warn('[coach-kpi] refresh failed:', err); });
        };

        // Debounce so the branch picker's keystroke handler in the filter
        // bar does not fire a fetch per keystroke (the <select> change event
        // is normally one shot, but a few callers wire <input> typing).
        const debouncedRefresh = _debounce(refresh, 250);

        const filtersHost = document.getElementById('coach-kpi-filters');
        function handleFilterChange(next) {
            state = normalizeFilters(next);
            if (filtersHost) {
                renderFilters(filtersHost, state, {
                    t, onChange: handleFilterChange,
                    branches, coaches, view,
                });
            }
            debouncedRefresh();
        }
        if (filtersHost) {
            renderFilters(filtersHost, state, {
                t, onChange: handleFilterChange,
                branches, coaches, view,
            });
        }

        // Load the branch + coach rosters in parallel so the filter dropdowns
        // can populate without blocking the initial fetch. The previous
        // implementation never populated branches at all (initCoachKpi never
        // passed opts.branches to renderFilters), so the Branch dropdown only
        // ever showed "All branches" — fixed here by loading via
        // window.supabaseData.getBranches / getCoaches and re-rendering once
        // the rosters arrive.
        _loadRosters().then((rosters) => {
            branches = rosters.branches;
            coaches = rosters.coaches;
            if (filtersHost) {
                renderFilters(filtersHost, state, {
                    t, onChange: handleFilterChange,
                    branches, coaches, view,
                });
            }
        });

        const leaderboardHost = document.getElementById('coach-kpi-school-leaderboard');
        if (leaderboardHost) {
            renderLeaderboard(leaderboardHost, [], { t });
        }

        _applyInitialPanelState(view);

        // Subscribe AFTER first paint so the cache is non-empty by the time
        // the user can flip languages. Idempotent via the __kpiLangSubscribed
        // flag inside subscribeLanguageEvents.
        subscribeLanguageEvents();

        // After a successful upload from the merged Rating Management modal,
        // the leaderboard must refresh. The commit path dispatches a
        // coachKpiUploadCommitted window event — listen once.
        _subscribeUploadCommittedOnce(roleInfo, () => view, () => state);

        // Fire the initial fetch + render after wiring listeners so the
        // hero/leaderboard/charts are populated by first paint.
        if (view) refresh();
    }

    /**
     * Load the branches + coaches roster in parallel. Tolerant of a missing
     * data access layer (server-side tests, partially-initialised pages) and
     * of method-level failures — any failure resolves to an empty array so
     * the dashboard always renders.
     */
    function _loadRosters() {
        const da = (typeof window !== 'undefined' && window.supabaseData) || null;
        const safe = (fn) => {
            if (!da || typeof da[fn] !== 'function') return Promise.resolve([]);
            try {
                return Promise.resolve(da[fn]()).then(
                    (v) => (Array.isArray(v) ? v : []),
                    () => [],
                );
            } catch (_) {
                return Promise.resolve([]);
            }
        };
        return Promise.all([safe('getBranches'), safe('getCoaches')])
            .then(([branches, coaches]) => ({ branches, coaches }))
            .catch(() => ({ branches: [], coaches: [] }));
    }

    // Panel DOM contract — mirrors admin-v2.html #section-coach-kpi:
    //   - three panels #coach-kpi-{school,branch,coach}-view
    //   - one drilldown panel #coach-kpi-drilldown-view (4th, opened by
    //     clicking a hero card)
    // tests/test-coach-kpi-section-container.js pins the panel ids. The
    // view-switcher tabs were retired in favor of the inline filter dropdowns
    // (period / league / branch / coach), so the role-default view is the only
    // panel ever shown — no runtime toggling.
    const _VIEW_PANEL_IDS = Object.freeze({
        school: 'coach-kpi-school-view',
        branch: 'coach-kpi-branch-view',
        coach: 'coach-kpi-coach-view',
    });
    const _DRILLDOWN_PANEL_ID = 'coach-kpi-drilldown-view';

    function _applyInitialPanelState(view) {
        if (typeof document === 'undefined' || !view) return;
        for (const v of Object.keys(_VIEW_PANEL_IDS)) {
            const panel = document.getElementById(_VIEW_PANEL_IDS[v]);
            if (!panel) continue;
            const isActive = v === view;
            if (isActive) {
                panel.removeAttribute('hidden');
                if (panel.classList && typeof panel.classList.add === 'function') {
                    panel.classList.add('is-active');
                } else {
                    const cls = (panel.className || '').split(/\s+/).filter(c => c && c !== 'is-active');
                    cls.push('is-active');
                    panel.className = cls.join(' ');
                }
            } else {
                panel.setAttribute('hidden', '');
                if (panel.classList && typeof panel.classList.remove === 'function') {
                    panel.classList.remove('is-active');
                } else {
                    const cls = (panel.className || '').split(/\s+/).filter(c => c && c !== 'is-active');
                    panel.className = cls.join(' ');
                }
            }
        }
    }

    /**
     * Toggle the drilldown panel on/off. When opening, hide all main subviews
     * and reveal #coach-kpi-drilldown-view. When closing, reverse it and
     * restore `restoreView` (the subview that was active before the drilldown
     * opened — defaults to the role-default view).
     */
    function _applyDrilldownPanelState(open, restoreView) {
        if (typeof document === 'undefined') return;
        const drill = document.getElementById(_DRILLDOWN_PANEL_ID);
        if (open) {
            for (const v of Object.keys(_VIEW_PANEL_IDS)) {
                const panel = document.getElementById(_VIEW_PANEL_IDS[v]);
                if (!panel) continue;
                panel.setAttribute('hidden', '');
                if (panel.classList && typeof panel.classList.remove === 'function') {
                    panel.classList.remove('is-active');
                }
            }
            if (drill) {
                drill.removeAttribute('hidden');
                if (drill.classList && typeof drill.classList.add === 'function') {
                    drill.classList.add('is-active');
                }
            }
        } else {
            if (drill) {
                drill.setAttribute('hidden', '');
                if (drill.classList && typeof drill.classList.remove === 'function') {
                    drill.classList.remove('is-active');
                }
            }
            _applyInitialPanelState(restoreView);
        }
    }

    /**
     * Fetch + render the drilldown subview (header, filter bar, table). Each
     * call replaces the contents in place so a filter change inside the
     * drilldown only re-renders the drilldown's own hosts — the main panels
     * stay intact behind it.
     */
    function _renderDrilldownPanel(roleInfo, metric, state, branches, coaches, t, opts) {
        if (typeof document === 'undefined') return Promise.resolve(null);
        const o = opts || {};
        const headerHost = document.getElementById('coach-kpi-drilldown-header');
        const filtersHost = document.getElementById('coach-kpi-drilldown-filters');
        const tableHost = document.getElementById('coach-kpi-drilldown-table');
        if (filtersHost) {
            renderFilters(filtersHost, state, {
                t,
                onChange: o.onFilterChange,
                branches,
                coaches,
                view: 'school',
            });
        }
        if (headerHost) {
            renderDrilldownHeader(headerHost, metric, 0, { t, onBack: o.onBack });
        }
        if (tableHost) {
            renderEmptyState(tableHost, undefined, { t });
        }
        return Promise.resolve(_fetchDrilldown(roleInfo, metric, state, {}))
            .then((res) => {
                const data = (res && res.success && res.data) ? res.data : null;
                const students = (data && Array.isArray(data.students)) ? data.students : [];
                if (headerHost) {
                    renderDrilldownHeader(headerHost, metric, students.length, { t, onBack: o.onBack });
                }
                if (tableHost) {
                    renderDrilldown(tableHost, metric, students, state, { t });
                }
                return res;
            })
            .catch((err) => {
                console.warn('[coach-kpi] drilldown fetch failed:', err);
                if (tableHost) renderEmptyState(tableHost, undefined, { t });
                return null;
            });
    }

    function _subscribeUploadCommittedOnce(roleInfo, getView, getState) {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        if (window.__kpiUploadCommittedSubscribed) return;
        window.__kpiUploadCommittedSubscribed = true;
        window.addEventListener('coachKpiUploadCommitted', () => {
            // Best-effort refresh of the current view after an upload. Errors
            // are swallowed so a bad fetch can't break the close path.
            try {
                const adapter = (key, fb) => {
                    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
                        const v = window.i18n.t(key);
                        if (v && v !== key && typeof v === 'string') return v;
                    }
                    return fb;
                };
                const state = (typeof getState === 'function') ? getState() : defaultFilterState(roleInfo);
                const view = (typeof getView === 'function') ? getView() : null;
                Promise.resolve(_fetchForView(roleInfo, view, state, {}))
                    .then((result) => { _renderDashboard(view, result, adapter, state); })
                    .catch(() => { /* silent */ });
            } catch (_) { /* silent */ }
        });
    }

    /**
     * Build the canonical current-month window per spec §4 ("default = current
     * calendar month"). `now` is injectable for tests.
     */
    function currentMonthWindow(now) {
        const today = now instanceof Date ? new Date(now.getTime()) : new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth();
        const start = `${year}-${pad2(month + 1)}-01`;
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const end = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;
        return { start, end, preset: 'current_month' };
    }

    const api = {
        TIME_WINDOWS,
        DEFAULT_WINDOW,
        LEAGUES,
        DEFAULT_LEAGUE,
        DEFAULT_BRANCH,
        DEFAULT_COACH,
        WINDOW_LABELS,
        LEAGUE_LABELS,
        LEAGUE_PLOT_LABELS,
        SCORE_THRESHOLDS,
        EMPTY_STATE_MESSAGE,
        RAZRYAD_ORDER,
        RAZRYAD_COLORS,
        LEAGUE_PLOT_ORDER,
        LEAGUE_COLORS,
        resolveTimeWindow,
        scoreColor,
        computeScoreBadgeColor,
        formatScore,
        formatHeroValue,
        formatPercent,
        formatRatingDelta,
        isStudentInactive,
        sortLeaderboard,
        filterLeaderboardByBranch,
        filterLeaderboardByCoach,
        aggregateSchoolHero,
        aggregateRazryadFromStudents,
        defaultFilterState,
        normalizeFilters,
        buildKpiQuery,
        callKpiEndpoint,
        isKpiEmpty,
        fetchView,
        loadDashboard,
        _fetchSchoolLeaderboard,
        _renderDashboard,
        _fetchForView,
        _initialView,
        renderEmptyState,
        renderSchoolHero,
        renderLeaderboard,
        renderFilters,
        renderRazryadDoughnut,
        renderTournamentsByLeagueStackedBar,
        renderTournamentsByLeagueBar,
        renderAvgPlaceTrendLine,
        renderDrilldown,
        renderDrilldownHeader,
        formatDrilldownDate,
        _fetchDrilldown,
        DRILLABLE_METRICS,
        METRIC_TO_VARIANT,
        METRIC_TITLES,
        currentMonthWindow,
        initCoachKpi,
        subscribeLanguageEvents,
    };

    if (typeof window !== 'undefined') {
        window.coachKpi = api;
        window.initCoachKpi = initCoachKpi;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
