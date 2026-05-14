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
        resolveTimeWindow,
        scoreColor,
        formatScore,
        formatHeroValue,
        sortLeaderboard,
        filterLeaderboardByBranch,
        aggregateSchoolHero,
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
    };

    if (typeof window !== 'undefined') {
        window.coachKpi = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
