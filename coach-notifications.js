/**
 * Coach notifications — bell inbox for AmoCRM roster events (migration 102).
 *
 * students-api writes one coach_notifications row per recipient coach when a
 * NEW student is created (kind new_student), a frozen / left student is
 * moved back to active (kind reactivated), or a student is frozen (kind
 * frozen); this script shows them to the signed-in coach: a
 * bell with an unread counter in the mobile header and top-right on desktop,
 * and a panel listing the latest notifications.
 *
 *   - Opening the panel never marks anything read; clicking an item or one of
 *     its buttons marks that item read; «Прочитать все» marks all (RPC
 *     mark_coach_notifications_read — the only client write path).
 *   - Admins get a read-only view of every coach's notifications, one card per
 *     event (dedupeEvents); their read state lives only in localStorage and
 *     never touches the RPC (an admin login may share a coach's email).
 *   - The panel opens by itself when unread notifications newer than the last
 *     auto-open arrive (shouldAutoOpen, marker in localStorage).
 *   - Polls every 60s and when the tab becomes visible again.
 *   - All text is escaped (escapeHtml) before it reaches innerHTML.
 *
 * Pure render helpers are exported for Node tests via module.exports; the
 * browser controller lives on window.coachNotifications.
 */

(function () {
    'use strict';

    const LIMIT = 100;
    const ADMIN_LIMIT = 500;
    // The bell only lists unread notifications from the last 7 days; read ones
    // drop out at once and older unread ones expire from the list and badge.
    const WINDOW_DAYS = 7;
    const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const POLL_MS = 60000;
    // Rollout gate: the bell only shows for coaches of these branches (null =
    // every branch). Server side: COACH_NOTIFY_BRANCH_IDS in students-api.
    const ENABLED_BRANCH_IDS = null;
    // Admin read state: { [status_history_id]: isoTime }, pruned after 8 days.
    const ADMIN_SEEN_KEY = 'cn-admin-seen-v1';
    const SEEN_KEEP_MS = 8 * 24 * 60 * 60 * 1000;
    const AUTOPEN_KEY = 'cn-autopen-v1:';

    function tr(key, params) {
        const fn = typeof t === 'function' ? t : (typeof window !== 'undefined' && window.t);
        return typeof fn === 'function' ? fn(key, params) : key;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function initials(name) {
        return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
            .map((w) => w[0].toUpperCase()).join('') || '?';
    }

    function unreadCount(list) {
        return (list || []).filter((n) => !n.read_at).length;
    }

    function windowStart(now) {
        return new Date((now ? new Date(now) : new Date()).getTime() - WINDOW_MS);
    }

    function visibleNotifications(list, now) {
        const since = windowStart(now).getTime();
        return (list || []).filter((n) => !n.read_at && new Date(n.created_at).getTime() >= since);
    }

    // One event fans out to several coaches (rows share status_history_id):
    // keep the first (newest) row per event.
    function dedupeEvents(list) {
        const seen = new Set();
        return (list || []).filter((n) => {
            if (!n.status_history_id) return true;
            if (seen.has(n.status_history_id)) return false;
            seen.add(n.status_history_id);
            return true;
        });
    }

    const eventKey = (n) => n.status_history_id || n.id;

    // Admin unread = deduped events of the last 7 days not in seenMap.
    function adminUnseen(list, seenMap, now) {
        const since = windowStart(now).getTime();
        return dedupeEvents(list).filter((n) => new Date(n.created_at).getTime() >= since
            && !(seenMap && seenMap[eventKey(n)]));
    }

    function pruneSeen(seenMap, now) {
        const since = (now ? new Date(now) : new Date()).getTime() - SEEN_KEEP_MS;
        const out = {};
        for (const [k, v] of Object.entries(seenMap || {})) {
            if (new Date(v).getTime() >= since) out[k] = v;
        }
        return out;
    }

    // Open when the newest unread item is newer than the last auto-open.
    function shouldAutoOpen(visibleUnread, markerIso) {
        const times = (visibleUnread || []).map((n) => new Date(n.created_at).getTime()).filter((x) => !isNaN(x));
        if (!times.length) return { open: false, marker: markerIso || null };
        const newest = Math.max(...times);
        const marker = markerIso ? new Date(markerIso).getTime() : NaN;
        if (!isNaN(marker) && newest <= marker) return { open: false, marker: markerIso };
        return { open: true, marker: new Date(newest).toISOString() };
    }

    // True when any of the coach's branches is enabled (null → all).
    function bellEnabledFor(coachBranchIds, enabled) {
        if (enabled === null) return true;
        return (coachBranchIds || []).some((id) => enabled.includes(id));
    }

    function badgeText(count) {
        if (!count || count < 1) return '';
        return count > 99 ? '99+' : String(count);
    }

    // «Вы — Асхат Сериков» when the viewer is the assigned coach.
    function coachLabel(n, viewerCoachId) {
        if (!n.assigned_coach_name) return tr('notifications.noCoach');
        if (viewerCoachId && n.assigned_coach_id === viewerCoachId) {
            return tr('notifications.you', { name: n.assigned_coach_name });
        }
        return n.assigned_coach_name;
    }

    // Card title per kind; unknown kinds read as a new student.
    function titleKey(n) {
        if (n.kind === 'reactivated') {
            if (n.previous_status === 'frozen') return 'notifications.backFromFreeze';
            if (n.previous_status === 'left') return 'notifications.formerReturned';
        }
        if (n.kind === 'frozen') return 'notifications.studentFrozen';
        return 'notifications.newStudentFromAmo';
    }

    // Kinds with their own accent (cn-item--<kind>).
    const KIND_MODIFIERS = ['reactivated', 'frozen'];

    const pad = (x) => String(x).padStart(2, '0');
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    // «Сегодня» / «Вчера» / 12.10 (12.10.2025 in another year), local time.
    function formatDay(iso, now) {
        const d = new Date(iso);
        const today = now ? new Date(now) : new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (dayKey(d) === dayKey(today)) return tr('notifications.today');
        if (dayKey(d) === dayKey(yesterday)) return tr('notifications.yesterday');
        const base = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
        return d.getFullYear() === today.getFullYear() ? base : `${base}.${d.getFullYear()}`;
    }

    function formatWhen(iso, now) {
        const d = new Date(iso);
        return `${formatDay(iso, now)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function renderItem(n, viewerCoachId, now) {
        const id = escapeHtml(n.id);
        const name = escapeHtml(n.student_name || '—');
        const title = escapeHtml(tr(titleKey(n)));
        const mod = KIND_MODIFIERS.includes(n.kind) ? ` cn-item--${n.kind}` : '';
        const ava = `<div class="cn-ava">${escapeHtml(initials(n.student_name))}</div>`;
        if (n.read_at) {
            const meta = [formatDay(n.created_at, now), n.branch_name].filter(Boolean).map(escapeHtml).join(' · ');
            return `<div class="cn-item read${mod}" data-id="${id}" data-action="open">${ava}<div class="cn-body">`
                + `<div class="cn-t1">${title}</div>`
                + `<div class="cn-name">${name}</div>`
                + `<div class="cn-meta cn-meta-read">${meta}</div>`
                + '</div></div>';
        }
        const meta = [formatWhen(n.created_at, now), n.student_code].filter(Boolean).map(escapeHtml).join(' · ');
        return `<div class="cn-item unread${mod}" data-id="${id}" data-action="read">${ava}<div class="cn-body">`
            + `<div class="cn-t1">● ${title}</div>`
            + `<div class="cn-name">${name}</div>`
            + '<div class="cn-rows">'
            + `<div class="cn-r"><span>${escapeHtml(tr('notifications.coach'))}</span><span>${escapeHtml(coachLabel(n, viewerCoachId))}</span></div>`
            + `<div class="cn-r"><span>${escapeHtml(tr('notifications.branch'))}</span><span>${escapeHtml(n.branch_name || '—')}</span></div>`
            + '</div>'
            + `<div class="cn-meta">${meta}</div>`
            + '<div class="cn-acts">'
            // Frozen students are not to be scheduled — no «В расписание».
            + (n.kind === 'frozen' ? ''
                : `<button type="button" class="cn-btn cn-btn-primary" data-action="schedule">${escapeHtml(tr('notifications.toSchedule'))}</button>`)
            + `<button type="button" class="cn-btn cn-btn-ghost" data-action="card">${escapeHtml(tr('notifications.card'))}</button>`
            + '</div></div></div>';
    }

    function renderPanel(list, viewerCoachId, now) {
        const shown = visibleNotifications(list, now);
        const items = shown.length
            ? shown.map((n) => renderItem(n, viewerCoachId, now)).join('')
            : `<div class="cn-empty">${escapeHtml(tr('notifications.empty'))}</div>`;
        const markAll = shown.length
            ? `<button type="button" class="cn-mark-all" data-action="read-all">${escapeHtml(tr('notifications.markAllRead'))}</button>`
            : '';
        return `<div class="cn-ph"><h3>${escapeHtml(tr('notifications.title'))}</h3>${markAll}</div>`
            + `<div class="cn-list">${items}</div>`;
    }

    // ─── Browser controller ──────────────────────────────────────────────

    const BELL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

    const state = {
        coachId: null, admin: false, raw: [], seen: {}, list: [], unread: 0,
        open: false, bells: [], panel: null, backdrop: null, timer: null,
    };

    function sb() { return window.supabaseClient; }

    // localStorage may throw (private mode): failure = nothing stored.
    function storeGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function storeSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    function loadSeen() {
        try {
            const v = JSON.parse(storeGet(ADMIN_SEEN_KEY) || '{}');
            return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
        } catch (e) {
            return {};
        }
    }

    function saveSeen() { storeSet(ADMIN_SEEN_KEY, JSON.stringify(state.seen)); }

    function autoOpenKey() { return AUTOPEN_KEY + (state.coachId || 'admin'); }

    function makeBell(className) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.setAttribute('aria-label', tr('notifications.title'));
        btn.innerHTML = `${BELL_SVG}<span class="cn-badge" hidden></span>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        return btn;
    }

    function mount() {
        const mobileActions = document.querySelector('.mobile-header-actions');
        if (mobileActions) {
            const b = makeBell('mobile-icon-btn cn-bell');
            mobileActions.insertBefore(b, mobileActions.firstChild);
            state.bells.push(b);
        }
        const desktop = makeBell('cn-bell cn-bell-desktop');
        document.body.appendChild(desktop);
        state.bells.push(desktop);
        document.body.classList.add('has-coach-bell');

        state.backdrop = document.createElement('div');
        state.backdrop.className = 'cn-backdrop';
        state.backdrop.hidden = true;
        state.backdrop.addEventListener('click', close);
        state.panel = document.createElement('div');
        state.panel.className = 'cn-panel';
        state.panel.hidden = true;
        state.panel.addEventListener('click', onPanelClick);
        document.body.appendChild(state.backdrop);
        document.body.appendChild(state.panel);

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
        document.addEventListener('languagechange', render);
    }

    function render() {
        const text = badgeText(state.unread);
        for (const b of state.bells) {
            const badge = b.querySelector('.cn-badge');
            badge.textContent = text;
            badge.hidden = !text;
            b.setAttribute('aria-label', tr('notifications.title'));
        }
        if (state.open) state.panel.innerHTML = renderPanel(state.list, state.coachId);
    }

    // Admin: the panel rows are the unseen events, shown as unread cards.
    function applyAdminSeen() {
        state.list = adminUnseen(state.raw, state.seen).map((n) => ({ ...n, read_at: null }));
        state.unread = state.list.length;
    }

    function maybeAutoOpen() {
        const { open, marker } = shouldAutoOpen(visibleNotifications(state.list), storeGet(autoOpenKey()));
        if (!open) return;
        storeSet(autoOpenKey(), marker);
        if (!state.open) openPanel();
    }

    async function refresh() {
        if (!state.coachId && !state.admin) return;
        try {
            const since = windowStart().toISOString();
            if (state.admin) {
                const res = await sb().from('coach_notifications').select('*')
                    .gte('created_at', since)
                    .order('created_at', { ascending: false }).limit(ADMIN_LIMIT);
                if (res.error) throw res.error;
                state.raw = res.data || [];
                applyAdminSeen();
                render();
                maybeAutoOpen();
                return;
            }
            const [list, count] = await Promise.all([
                sb().from('coach_notifications').select('*')
                    .eq('recipient_coach_id', state.coachId)
                    .is('read_at', null).gte('created_at', since)
                    .order('created_at', { ascending: false }).limit(LIMIT),
                sb().from('coach_notifications').select('id', { count: 'exact', head: true })
                    .eq('recipient_coach_id', state.coachId)
                    .is('read_at', null).gte('created_at', since),
            ]);
            if (list.error) throw list.error;
            if (count.error) throw count.error;
            state.list = list.data || [];
            state.unread = count.count || 0;
            render();
            maybeAutoOpen();
        } catch (e) {
            console.error('coach notifications: load failed', e);
        }
    }

    // Admin read state is device-local: never the RPC (it would mark the
    // notifications of a coach who shares the admin's email).
    function markSeen(ids) {
        const now = new Date().toISOString();
        state.list.filter((n) => !ids || ids.includes(n.id)).forEach((n) => { state.seen[eventKey(n)] = now; });
        saveSeen();
        applyAdminSeen();
        render();
    }

    async function markRead(ids) {
        if (state.admin) return markSeen(ids);
        const now = new Date().toISOString();
        const targets = state.list.filter((n) => !n.read_at && (!ids || ids.includes(n.id)));
        if (!targets.length && ids) return;
        targets.forEach((n) => { n.read_at = now; });
        state.unread = ids ? Math.max(0, state.unread - targets.length) : 0;
        render();
        const { error } = await sb().rpc('mark_coach_notifications_read', { ids: ids || null });
        if (error) {
            console.error('coach notifications: mark read failed', error);
            refresh();
        }
    }

    function toggle() { state.open ? close() : openPanel(); }

    function openPanel() {
        state.open = true;
        state.panel.hidden = false;
        state.backdrop.hidden = false;
        render();
        refresh();
    }

    function close() {
        state.open = false;
        if (state.panel) state.panel.hidden = true;
        if (state.backdrop) state.backdrop.hidden = true;
    }

    // «В расписание»: open attendance on the student. API-created students may
    // be newer than the page's student cache, so fetch and add them first.
    async function openSchedule(studentId) {
        if (typeof showAttendanceManagement === 'function') await showAttendanceManagement();
        const known = (window.students || []).some((s) => String(s.id) === String(studentId));
        if (!known && window.supabaseData && window.supabaseData.getStudentById) {
            const s = await window.supabaseData.getStudentById(studentId);
            if (s && Array.isArray(window.students)) window.students.push(s);
        }
        if (typeof navigateToAttendanceStudent === 'function') await navigateToAttendanceStudent(studentId);
    }

    async function onPanelClick(e) {
        e.stopPropagation();
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        if (action === 'read-all') return markRead(null);
        const item = actionEl.closest('.cn-item');
        const n = item && state.list.find((x) => x.id === item.getAttribute('data-id'));
        if (!n) return;
        if (!n.read_at) await markRead([n.id]);
        if (action === 'schedule') {
            close();
            await openSchedule(n.student_id);
        } else if (action === 'card' || action === 'open') {
            if (typeof viewStudent === 'function') viewStudent(n.student_id);
        }
    }

    async function init() {
        if (!sb() || !window.authHelpers) return;
        let info;
        try {
            info = await window.authHelpers.getRoleInfo(sb());
        } catch (e) {
            console.error('coach notifications: role lookup failed', e);
            return;
        }
        if (!info) return;
        if (info.coachId) {
            if (ENABLED_BRANCH_IDS !== null) {
                const { data: coach, error } = await sb().from('coaches')
                    .select('branch_id, coach_branches(branch_id)').eq('id', info.coachId).maybeSingle();
                if (error) {
                    console.error('coach notifications: branch lookup failed', error);
                    return;
                }
                const branchIds = [coach && coach.branch_id, ...((coach && coach.coach_branches) || []).map((b) => b.branch_id)]
                    .filter(Boolean);
                if (!bellEnabledFor(branchIds, ENABLED_BRANCH_IDS)) return;
            }
            state.coachId = info.coachId;
        } else if (info.isAdmin) {
            state.admin = true;
            state.seen = pruneSeen(loadSeen());
            saveSeen();
        } else {
            return;
        }
        mount();
        await refresh();
        state.timer = setInterval(refresh, POLL_MS);
    }

    const api = {
        escapeHtml, initials, unreadCount, badgeText, coachLabel, titleKey,
        formatDay, formatWhen, renderItem, renderPanel, visibleNotifications, WINDOW_DAYS,
        bellEnabledFor, ENABLED_BRANCH_IDS, dedupeEvents, adminUnseen, pruneSeen, shouldAutoOpen,
    };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.coachNotifications = Object.assign({ init, refresh }, api);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
