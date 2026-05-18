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

    const TIME_WINDOWS = Object.freeze(['30d', '90d', 'ytd', 'all']);
    const DEFAULT_WINDOW = '90d';
    const LEAGUES = Object.freeze(['all', 'A', 'B', 'C']);
    const DEFAULT_LEAGUE = 'all';
    const DEFAULT_BRANCH = 'all';
    const SCORE_THRESHOLDS = Object.freeze({ red: 40, amber: 70 });
    const ALL_TIME_START = '2000-01-01';
    const EMPTY_STATE_MESSAGE =
        'Coach KPI data not yet available — apply migrations 036/037/038 on Supabase to enable.';

    const WINDOW_LABELS = Object.freeze({
        '30d': '30 days',
        '90d': '90 days',
        'ytd': 'YTD',
        'all': 'All time',
    });
    const LEAGUE_LABELS = Object.freeze({
        all: 'All leagues',
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
     *   - all        → 2000-01-01 through today
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
        if (chosen === 'all') {
            return { start: ALL_TIME_START, end, days: null, preset: chosen };
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
     * Unknown keys fall back to `composite_score` desc — the headline metric.
     */
    function sortLeaderboard(rows, sortKey, direction) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        const ascDefault = sortKey === 'coach_name' || sortKey === 'branches';
        const dir = (direction === 'asc' || direction === 'desc')
            ? direction
            : (ascDefault ? 'asc' : 'desc');
        const mult = dir === 'asc' ? 1 : -1;
        const key = (sortKey && (sortKey in (list[0] || {}))) ? sortKey : 'composite_score';

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
     * Roll a coach leaderboard up into the six PRD §5 hero numbers for the
     * school overview. Used as a fallback if `school_kpi_summary` is
     * unavailable; the edge function is still the source of truth when it
     * returns data.
     */
    function aggregateSchoolHero(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const out = {
            active_students_count: 0,
            total_tournaments: 0,
            top3_count: 0,
            promotions_count: 0,
            new_razryads_count: 0,
            total_rating_gained: 0,
        };
        for (const r of list) {
            if (!r) continue;
            out.active_students_count += Number(r.active_students_count) || 0;
            out.total_tournaments     += Number(r.total_tournaments)     || 0;
            out.top3_count            += Number(r.top3_count)            || 0;
            out.promotions_count      += Number(r.promotions_count)      || 0;
            out.new_razryads_count    += Number(r.new_razryads_count)    || 0;
            out.total_rating_gained   += Number(r.total_rating_gained)   || 0;
        }
        return out;
    }

    /**
     * Default filter state for the dashboard's three controls.
     * PRD §5: window defaults to 90d, league + branch default to 'all'.
     * `roleInfo` is reserved for future per-role defaults (kept transparent
     * today — see `getInitialBranchScope` / `getInitialCoachScope`).
     */
    function defaultFilterState(_roleInfo) {
        return { window: DEFAULT_WINDOW, league: DEFAULT_LEAGUE, branchId: DEFAULT_BRANCH };
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
        return { window: win, league: lg, branchId };
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
        const apiKey = config.apiKey || '';
        const endpoint = `${url}/functions/v1/analytics-tournaments?${encodeQuery(query)}`;
        try {
            const resp = await fetchFn(endpoint, {
                method: 'GET',
                headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
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
     * null / 4xx / empty data (Phase 2 migrations not yet applied). Reuses
     * the `.stat-card` styling already in the dashboard and adds an
     * `.empty-state` modifier for callers that want to target it in CSS.
     */
    function renderEmptyState(container, message) {
        if (typeof document === 'undefined' || !container) return;
        const text = (typeof message === 'string' && message.length > 0)
            ? message
            : EMPTY_STATE_MESSAGE;
        container.innerHTML = '';
        container.appendChild(_el('div', {
            className: 'stat-card empty-state kpi-empty-state',
            role: 'status',
        }, [
            _el('div', { className: 'stat-card-label', text: text }),
        ]));
    }

    /**
     * Build the six hero stat cards from a school summary. Pure DOM, no
     * data fetching. Returns the container element.
     */
    function renderSchoolHero(container, summary) {
        if (typeof document === 'undefined' || !container) return;
        if (!summary || typeof summary !== 'object' || Object.keys(summary).length === 0) {
            renderEmptyState(container);
            return;
        }
        const s = summary;
        const cards = [
            ['Active students',  formatHeroValue(s.active_students_count)],
            ['Tournaments',      formatHeroValue(s.total_tournaments)],
            ['Top-3 finishes',   formatHeroValue(s.top3_count)],
            ['Promotions',       formatHeroValue(s.promotions_count)],
            ['New razryads',     formatHeroValue(s.new_razryads_count)],
            ['Participation',    formatHeroValue(s.participation_pct, { percent: true })],
        ];
        container.innerHTML = '';
        for (const [label, value] of cards) {
            container.appendChild(_el('div', { className: 'stat-card' }, [
                _el('div', { className: 'stat-card-value', text: value }),
                _el('div', { className: 'stat-card-label', text: label }),
            ]));
        }
    }

    /**
     * Render the coach leaderboard table. Sorts and color-codes the
     * composite score column. Empty / non-array `rows` falls through to
     * `renderEmptyState` so callers don't need a separate branch.
     */
    function renderLeaderboard(container, rows, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        if (!Array.isArray(rows) || rows.length === 0) {
            renderEmptyState(container);
            return;
        }
        const sorted = sortLeaderboard(rows, o.sortKey, o.direction);
        container.innerHTML = '';
        const table = _el('table', { className: 'kpi-leaderboard' });
        const thead = _el('thead', null, [
            _el('tr', null, [
                _el('th', { text: 'Coach' }),
                _el('th', { text: 'Active' }),
                _el('th', { text: 'Tournaments' }),
                _el('th', { text: 'Top-3' }),
                _el('th', { text: 'Rating gained' }),
                _el('th', { text: 'Promotions' }),
                _el('th', { text: 'Razryads' }),
                _el('th', { text: 'Score' }),
            ]),
        ]);
        const tbody = _el('tbody');
        for (const row of sorted) {
            const color = scoreColor(row.composite_score);
            tbody.appendChild(_el('tr', { dataset: { coachId: row.coach_id || '' } }, [
                _el('td', { text: row.coach_name || '—' }),
                _el('td', { text: formatHeroValue(row.active_students_count) }),
                _el('td', { text: formatHeroValue(row.total_tournaments) }),
                _el('td', { text: formatHeroValue(row.top3_count) }),
                _el('td', { text: formatHeroValue(row.total_rating_gained, { signed: true }) }),
                _el('td', { text: formatHeroValue(row.promotions_count) }),
                _el('td', { text: formatHeroValue(row.new_razryads_count) }),
                _el('td', { className: `kpi-score kpi-score-${color}`, text: formatScore(row.composite_score) }),
            ]));
        }
        table.appendChild(thead);
        table.appendChild(tbody);
        container.appendChild(table);
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
        if (_allZero(counts)) { renderEmptyState(container); return null; }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) { renderEmptyState(container, 'Chart.js not loaded'); return null; }
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const canvas = _mountCanvas(container);
        const labels = RAZRYAD_ORDER.map(k => label('coachKpiRazryad' + k, k));
        const data = RAZRYAD_ORDER.map(k => Number(counts && counts[k]) || 0);
        return new ChartCtor(canvas, {
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
        const list = Array.isArray(byBranch) ? byBranch.filter(Boolean) : [];
        if (list.length === 0) { renderEmptyState(container); return null; }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) { renderEmptyState(container, 'Chart.js not loaded'); return null; }
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const canvas = _mountCanvas(container);
        const labels = list.map(b => b.branch_name || b.branchName || b.name || '—');
        const datasets = LEAGUE_PLOT_ORDER.map(lg => ({
            label: label('coachKpiLeague' + lg, LEAGUE_LABELS[lg]),
            data: list.map(b => {
                const lc = b.league_counts || b.leagueCounts || {};
                return Number(lc[lg]) || 0;
            }),
            backgroundColor: LEAGUE_COLORS[lg],
            borderWidth: 0,
        }));
        return new ChartCtor(canvas, {
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
    }

    /**
     * Coach view — tournaments by league as a plain (non-stacked) bar
     * (PRD §5). `counts` is `{ A, B, C }`. Empty / all-zero → empty state.
     */
    function renderTournamentsByLeagueBar(container, counts, opts) {
        if (typeof document === 'undefined' || !container) return null;
        if (_allZero(counts)) { renderEmptyState(container); return null; }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) { renderEmptyState(container, 'Chart.js not loaded'); return null; }
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const canvas = _mountCanvas(container);
        const labels = LEAGUE_PLOT_ORDER.map(lg => label('coachKpiLeague' + lg, LEAGUE_LABELS[lg]));
        const data = LEAGUE_PLOT_ORDER.map(lg => Number(counts && counts[lg]) || 0);
        const colors = LEAGUE_PLOT_ORDER.map(lg => LEAGUE_COLORS[lg]);
        return new ChartCtor(canvas, {
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
    }

    /**
     * Coach view — avg place trend (line). `points` is an ordered array of
     * `{ month, avg_place }`. Y-axis is reversed because lower place = better,
     * so an upward visual trend reads as improvement. Missing avg_place
     * values render as gaps (Chart.js spanGaps left default false).
     */
    function renderAvgPlaceTrendLine(container, points, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const list = Array.isArray(points) ? points.filter(Boolean) : [];
        if (list.length === 0) { renderEmptyState(container); return null; }
        const ChartCtor = _resolveChartCtor();
        if (!ChartCtor) { renderEmptyState(container, 'Chart.js not loaded'); return null; }
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);
        const canvas = _mountCanvas(container);
        const labels = list.map(p => p.month || p.label || '');
        const data = list.map(p => {
            const v = (p.avg_place !== undefined ? p.avg_place : p.avgPlace);
            return Number.isFinite(v) ? v : null;
        });
        return new ChartCtor(canvas, {
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
    }

    /**
     * Render the filter bar (time window pill toggles + league select + branch
     * select). `current` should be a normalized filter state; unknown values
     * are clamped. `onChange` is invoked with the next normalized state every
     * time the user picks a different value.
     *
     * `opts.branches` — array of `{ id, name }` or strings. When empty, the
     * branch selector is rendered but only offers "All branches".
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

        container.innerHTML = '';
        const root = _el('div', { className: 'kpi-filters', role: 'group' });

        const windowGroup = _el('div', {
            className: 'kpi-filter-window',
            role: 'tablist',
            'aria-label': label('coachKpiTimeWindowGroup', 'Time window'),
        });
        const WINDOW_I18N = { '30d': '30d', '90d': '90d', 'ytd': 'Ytd', 'all': 'All' };
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
        root.appendChild(windowGroup);

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
        root.appendChild(leagueSelect);

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
            const next = normalizeFilters({ ...state, branchId: value });
            if (onChange) onChange(next);
        });
        root.appendChild(branchSelect);

        container.appendChild(root);
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
     *   avg rating delta, top-3 finishes, promotions, razryads earned,
     *   composite score.
     *
     * Sorted by composite_score desc with tie-break on participation_rate
     * desc (spec §1 / §4). Equal-score ties render at the same rank with the
     * next rank skipped — "D-style behavior".
     */
    function renderPhase2Leaderboard(container, rows, opts) {
        if (typeof document === 'undefined' || !container) return;
        const o = opts || {};
        if (!Array.isArray(rows) || rows.length === 0) {
            renderEmptyState(container, o.emptyMessage || 'No data yet for this window.');
            return;
        }
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);

        // Composite-score-desc primary, participation_rate-desc tie-break.
        const sorted = rows.slice().sort((a, b) => {
            const ac = Number(a.composite_score) || 0;
            const bc = Number(b.composite_score) || 0;
            if (bc !== ac) return bc - ac;
            const ap = Number(a.participation_rate) || 0;
            const bp = Number(b.participation_rate) || 0;
            return bp - ap;
        });

        // D-style rank assignment: same composite + same participation_rate → same rank.
        const ranks = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0) {
                const prev = sorted[i - 1];
                const cur = sorted[i];
                if (Number(prev.composite_score) === Number(cur.composite_score)
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
                _el('th', { text: label('admin.coachKpi.colScore', 'Score') }),
            ]),
        ]);
        const tbody = _el('tbody');
        sorted.forEach((row, i) => {
            const color = scoreColor(row.composite_score);
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
                _el('td', { className: `kpi-score kpi-score-${color}`, text: formatScore(row.composite_score) }),
            ]));
        });
        table.appendChild(thead);
        table.appendChild(tbody);
        container.appendChild(table);
    }

    /**
     * Render the "Upload tournament" launcher button. Clicking it opens
     * the coach-kpi-upload modal in a host container.
     */
    function renderUploadLauncher(container, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const t = typeof o.t === 'function' ? o.t : null;
        const label = (key, fb) => (t ? t(key, fb) : fb);

        container.innerHTML = '';
        const btn = _el('button', {
            type: 'button',
            className: 'btn btn-primary kpi-upload-launcher',
            text: label('admin.coachKpi.uploadButton', 'Upload tournament'),
        });
        btn.addEventListener('click', () => {
            if (typeof o.onOpen === 'function') o.onOpen();
        });
        container.appendChild(btn);
        return btn;
    }

    /**
     * Thin DOM orchestrator wired from `showCoachPerformance` in admin(-v2).js.
     * Renders the filter bar, leaderboard, and (when coach-kpi-upload.js is
     * present) the upload launcher button into their known host containers.
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

        const filtersHost = document.getElementById('coach-kpi-filters');
        if (filtersHost) {
            renderFilters(filtersHost, defaultFilterState(roleInfo), {});
        }

        const leaderboardHost = document.getElementById('coach-kpi-school-leaderboard');
        if (leaderboardHost) {
            renderLeaderboard(leaderboardHost, []);
        }

        if (typeof window !== 'undefined' && window.coachKpiUpload) {
            const uploadHost = document.getElementById('coach-kpi-upload-host');
            if (uploadHost) {
                renderUploadLauncher(uploadHost, {
                    onOpen: () => {
                        if (window.coachKpiUpload
                            && typeof window.coachKpiUpload.renderUploadModal === 'function') {
                            window.coachKpiUpload.renderUploadModal(uploadHost, {});
                        }
                    },
                });
            }
        }
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
        WINDOW_LABELS,
        LEAGUE_LABELS,
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
        aggregateSchoolHero,
        aggregateRazryadFromStudents,
        defaultFilterState,
        normalizeFilters,
        buildKpiQuery,
        callKpiEndpoint,
        isKpiEmpty,
        fetchView,
        loadDashboard,
        renderEmptyState,
        renderSchoolHero,
        renderLeaderboard,
        renderFilters,
        renderRazryadDoughnut,
        renderTournamentsByLeagueStackedBar,
        renderTournamentsByLeagueBar,
        renderAvgPlaceTrendLine,
        renderPhase2Leaderboard,
        renderUploadLauncher,
        currentMonthWindow,
        initCoachKpi,
    };

    if (typeof window !== 'undefined') {
        window.coachKpi = api;
        window.initCoachKpi = initCoachKpi;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
