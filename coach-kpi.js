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
    const LEAGUES = Object.freeze(['all', 'B', 'C']);
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
        all: 'All leagues',
        B: 'League B',
        C: 'League C',
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
     * Build the six hero stat cards from a school summary. Pure DOM, no
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
        const cards = [
            [label('coachKpiActiveStudents',  'Active students'),  formatHeroValue(s.active_students_count)],
            [label('coachKpiTournamentsYtd',  'Tournaments'),      formatHeroValue(s.total_tournaments)],
            [label('coachKpiTop3',            'Top-3 finishes'),   formatHeroValue(s.top3_count)],
            [label('coachKpiPromotions',      'Promotions'),       formatHeroValue(s.promotions_count)],
            [label('coachKpiNewRazryads',     'New razryads'),     formatHeroValue(s.new_razryads_count)],
            [label('coachKpiParticipation',   'Participation'),    formatHeroValue(s.participation_pct, { percent: true })],
        ];
        container.innerHTML = '';
        for (const [label, value] of cards) {
            container.appendChild(_el('div', { className: 'stat-card' }, [
                _el('div', { className: 'stat-card-value', text: value }),
                _el('div', { className: 'stat-card-label', text: label }),
            ]));
        }
        _rememberRender('renderSchoolHero', container, [summary, o]);
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
        const sorted = sortLeaderboard(rows, o.sortKey, o.direction);
        container.innerHTML = '';
        const table = _el('table', { className: 'kpi-leaderboard' });
        const thead = _el('thead', null, [
            _el('tr', null, [
                _el('th', { text: label('coachKpiColCoach', 'Coach') }),
                _el('th', { text: label('coachKpiColActive', 'Active') }),
                _el('th', { text: label('coachKpiColTournaments', 'Tournaments') }),
                _el('th', { text: label('coachKpiColTop3', 'Top-3') }),
                _el('th', { text: label('coachKpiColPromotions', 'Promotions') }),
                _el('th', { text: label('coachKpiColRazryads', 'Razryads') }),
            ]),
        ]);
        const tbody = _el('tbody');
        for (const row of sorted) {
            tbody.appendChild(_el('tr', { dataset: { coachId: row.coach_id || '' } }, [
                _el('td', { text: row.coach_name || '—' }),
                _el('td', { text: formatHeroValue(row.active_students_count) }),
                _el('td', { text: formatHeroValue(row.total_tournaments) }),
                _el('td', { text: formatHeroValue(row.top3_count) }),
                _el('td', { text: formatHeroValue(row.promotions_count) }),
                _el('td', { text: formatHeroValue(row.new_razryads_count) }),
            ]));
        }
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
                text: label('coachKpiLeagueGroup', 'League'),
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
     * Phase 2 leaderboard table — columns per COACH_KPI_PHASE2_SPEC.md §4:
     *   rank, coach name, branch, active students, tournament entries,
     *   avg rating delta, top-3 finishes, promotions, razryads earned.
     *
     * Sorted by tournament_entries desc with tie-break on participation_rate
     * desc — replaces the retired composite_score sort. Equal pairs render at
     * the same rank with the next rank skipped — "D-style behavior".
     */
    function renderPhase2Leaderboard(container, rows, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        if (!Array.isArray(rows) || rows.length === 0) {
            const msg = o.emptyMessage || label('coachKpiNoDataYet', 'No data yet for this window.');
            renderEmptyState(container, msg, { t });
            _rememberRender('renderPhase2Leaderboard', container, [rows, o]);
            return;
        }

        // tournament_entries-desc primary, participation_rate-desc tie-break.
        const sorted = rows.slice().sort((a, b) => {
            const ae = Number(a.tournament_entries) || 0;
            const be = Number(b.tournament_entries) || 0;
            if (be !== ae) return be - ae;
            const ap = Number(a.participation_rate) || 0;
            const bp = Number(b.participation_rate) || 0;
            return bp - ap;
        });

        // D-style rank assignment: same entries + same participation_rate → same rank.
        const ranks = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0) {
                const prev = sorted[i - 1];
                const cur = sorted[i];
                if (Number(prev.tournament_entries) === Number(cur.tournament_entries)
                    && Number(prev.participation_rate) === Number(cur.participation_rate)) {
                    ranks.push(ranks[i - 1]);
                    continue;
                }
            }
            ranks.push(i + 1);
        }

        container.innerHTML = '';
        const table = _el('table', { className: 'kpi-leaderboard kpi-leaderboard-v2' });
        const thead = _el('thead', null, [
            _el('tr', null, [
                _el('th', { text: label('admin.coachKpi.rank', '#') }),
                _el('th', { text: label('admin.coachKpi.colCoach', 'Coach') }),
                _el('th', { text: label('admin.coachKpi.colBranch', 'Branch') }),
                _el('th', { text: label('admin.coachKpi.colActive', 'Active students') }),
                _el('th', { text: label('admin.coachKpi.colEntries', 'Tournament entries') }),
                _el('th', { text: label('admin.coachKpi.colAvgDelta', 'Avg rating delta') }),
                _el('th', { text: label('admin.coachKpi.colTop3', 'Top-3 finishes') }),
                _el('th', { text: label('admin.coachKpi.colPromotions', 'Promotions') }),
                _el('th', { text: label('admin.coachKpi.colRazryads', 'Razryads earned') }),
            ]),
        ]);
        const tbody = _el('tbody');
        sorted.forEach((row, i) => {
            const branches = Array.isArray(row.branches) ? row.branches.join(', ') : (row.branch || '—');
            tbody.appendChild(_el('tr', { dataset: { coachId: row.coach_id || '' } }, [
                _el('td', { text: String(ranks[i]) }),
                _el('td', { text: row.coach_name || '—' }),
                _el('td', { text: branches || '—' }),
                _el('td', { text: formatHeroValue(row.active_students_count) }),
                _el('td', { text: formatHeroValue(row.tournament_entries) }),
                _el('td', { text: formatRatingDelta(row.avg_rating_delta) }),
                _el('td', { text: formatHeroValue(row.top3_count) }),
                _el('td', { text: formatHeroValue(row.promotions_count) }),
                _el('td', { text: formatHeroValue(row.new_razryads_count) }),
            ]));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        container.appendChild(table);
        _rememberRender('renderPhase2Leaderboard', container, [rows, o]);
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
    function _renderDashboard(view, result, t, state) {
        if (typeof document === 'undefined') return;
        const opts = { t };
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

        const refresh = () => {
            Promise.resolve(_fetchForView(roleInfo, view, state, {}))
                .then((result) => { _renderDashboard(view, result, t, state); })
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

        _wireViewTabs(roleInfo, () => view, (next) => {
            view = next;
            // Re-render the filter bar so the Coach dropdown appears /
            // disappears as the user switches views.
            if (filtersHost) {
                renderFilters(filtersHost, state, {
                    t, onChange: handleFilterChange,
                    branches, coaches, view,
                });
            }
        }, debouncedRefresh);

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

    // View-tab DOM contract — mirrors admin-v2.html #section-coach-kpi:
    //   - three buttons .kpi-view-btn[data-kpi-view=school|branch|coach]
    //   - three panels  #coach-kpi-{school,branch,coach}-view
    // tests/test-coach-kpi-section-container.js pins the panel ids.
    const _VIEW_PANEL_IDS = Object.freeze({
        school: 'coach-kpi-school-view',
        branch: 'coach-kpi-branch-view',
        coach: 'coach-kpi-coach-view',
    });

    function _wireViewTabs(roleInfo, getView, setView, debouncedRefresh) {
        if (typeof document === 'undefined') return;
        const section = document.getElementById('section-coach-kpi');
        let buttons = null;
        if (section && typeof section.querySelectorAll === 'function') {
            buttons = section.querySelectorAll('.kpi-view-btn[data-kpi-view]');
        } else if (typeof document.querySelectorAll === 'function') {
            buttons = document.querySelectorAll('#section-coach-kpi .kpi-view-btn[data-kpi-view]');
        }
        if (!buttons || buttons.length === 0) return;

        // If the role lock refuses every non-current view, do not wire — locked
        // coaches see a single allowed view and switching is intentionally off.
        const reachable = [];
        buttons.forEach((btn) => {
            const target = btn.dataset && btn.dataset.kpiView;
            if (target && roleLock && roleLock.canAccessView(roleInfo, target)) {
                reachable.push(target);
            }
        });
        if (reachable.length <= 1) return;

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.dataset && btn.dataset.kpiView;
                if (!target) return;
                if (roleLock && !roleLock.canAccessView(roleInfo, target)) return;
                if (target === getView()) return;
                setView(target);
                _applyViewTabState(target, buttons);
                debouncedRefresh();
            });
        });
    }

    function _applyViewTabState(view, buttons) {
        if (typeof document === 'undefined') return;
        if (buttons && buttons.forEach) {
            buttons.forEach((btn) => {
                const target = btn.dataset && btn.dataset.kpiView;
                const isActive = target === view;
                if (btn.classList && typeof btn.classList.toggle === 'function') {
                    btn.classList.toggle('is-active', isActive);
                } else {
                    const cls = (btn.className || '').split(/\s+/).filter(c => c && c !== 'is-active');
                    if (isActive) cls.push('is-active');
                    btn.className = cls.join(' ');
                }
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }
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
        renderPhase2Leaderboard,
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
