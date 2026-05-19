/**
 * Coach KPI Upload — Phase 2 tournament upload pipeline.
 *
 * Drives the admin's "upload a Swiss-Manager export" flow on
 * /admin#coach-kpi. Pure data layer plus a thin UI orchestrator. Parses both
 * .xlsx and HTML-table-as-.xls exports, parses the tournament date from the
 * filename (`17 мая` → 2026-05-17), then hands the participant rows over to
 * the existing `supabase-data-tournaments.js` fuzzy-match logic (which itself
 * mirrors admin-v2.js:3276). On commit, inserts a tournaments_uploads row
 * and one tournament_results row per matched student, which triggers
 * razryad detection + the existing 036/038 razryad/league logs.
 *
 * Dual-export: pure helpers and the commit pipeline are usable from Node
 * tests; DOM rendering is guarded behind a `document` check.
 */

(function () {
    'use strict';

    // ----- constants ----------------------------------------------------------

    const TOURNAMENT_KINDS = Object.freeze(['league_c', 'league_b', 'razryad_4', 'razryad_3']);
    const ROUNDS_BY_KIND = Object.freeze({
        league_c:  6,
        league_b:  6,
        razryad_4: 10,
        razryad_3: 9,
    });

    // Russian month → 1-indexed month number. The Swiss-Manager export
    // includes a date in DD.MM.YYYY in the file body, but the spec mandates
    // parsing from the filename token (e.g. "17 мая").
    const RU_MONTHS = Object.freeze({
        'январ':  1,
        'феврал': 2,
        'март':   3,
        'апрел':  4,
        'мая':    5,
        'май':    5,
        'июн':    6,
        'июл':    7,
        'август': 8,
        'сентябр':9,
        'октябр': 10,
        'ноябр':  11,
        'декабр': 12,
    });

    // ----- helpers ------------------------------------------------------------

    function pad2(n) { return String(n).padStart(2, '0'); }
    function nfc(s) { return (s || '').normalize('NFC'); }

    function levenshteinDistance(a, b) {
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
                else dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
            }
        }
        return dp[m][n];
    }

    // Mirror of admin-v2.js:3127 / supabase-data-tournaments.js:42 — kept here so
    // the upload pipeline is self-contained. Returns the same shape as the admin
    // helper: { matched, student, confidence, ambiguous?, candidates? }.
    function fuzzyMatchStudent(rawName, students) {
        if (!rawName || !students || students.length === 0) {
            return { matched: false, student: null, confidence: 0 };
        }
        const normalized = nfc(rawName).trim().toLowerCase();
        const parts = normalized.split(/\s+/).filter(p => p.length > 0);

        const exact = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName  || '').toLowerCase();
            if (normalized === `${ln} ${fn}` || normalized === `${fn} ${ln}`) exact.push(s);
        }
        if (exact.length === 1) return { matched: true, student: exact[0], confidence: 100 };
        if (exact.length > 1)  return { matched: true, student: exact[0], confidence: 100, ambiguous: true, candidates: exact };

        const MIN_SUBSTRING_LENGTH = 4;
        const MIN_TOKEN_SIMILARITY = 0.75;
        const MIN_WHOLE_NAME_SIMILARITY = 0.80;
        const fuzzy80 = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName  || '').toLowerCase();
            const studentParts = [fn, ln];
            let matchedTokens = 0;
            for (const part of parts) {
                let hit = false;
                for (const sp of studentParts) {
                    if (!sp) continue;
                    if (part === sp) { hit = true; break; }
                    if (part.length >= MIN_SUBSTRING_LENGTH && sp.includes(part)) { hit = true; break; }
                    if (sp.length >= MIN_SUBSTRING_LENGTH && part.includes(sp)) { hit = true; break; }
                    const dist = levenshteinDistance(part, sp);
                    const maxLen = Math.max(part.length, sp.length);
                    const sim = (maxLen - dist) / maxLen;
                    if (sim >= MIN_TOKEN_SIMILARITY && maxLen >= MIN_SUBSTRING_LENGTH) { hit = true; break; }
                }
                if (hit) matchedTokens++;
            }
            if (matchedTokens === parts.length && parts.length >= 2) {
                const full1 = `${fn} ${ln}`;
                const full2 = `${ln} ${fn}`;
                const minDist = Math.min(levenshteinDistance(normalized, full1), levenshteinDistance(normalized, full2));
                const maxLen = Math.max(normalized.length, full1.length);
                if ((maxLen - minDist) / maxLen >= MIN_WHOLE_NAME_SIMILARITY) fuzzy80.push(s);
            }
        }
        if (fuzzy80.length === 1) return { matched: true, student: fuzzy80[0], confidence: 80 };
        if (fuzzy80.length > 1)  return { matched: true, student: fuzzy80[0], confidence: 80, ambiguous: true, candidates: fuzzy80 };

        return { matched: false, student: null, confidence: 0 };
    }

    // ----- filename date parser ----------------------------------------------

    /**
     * Pull a tournament date out of a filename. Recognises:
     *   "17 мая"             → 2026-05-17 (uses `defaultYear`)
     *   "17 мая 2026"        → 2026-05-17
     *   "17.05.2026"         → 2026-05-17
     *   "2026-05-17"         → 2026-05-17
     * Returns null when nothing matches — caller falls back to the manual
     * date picker per spec §3 step 4.
     */
    function parseDateFromFilename(filename, defaultYear) {
        if (!filename || typeof filename !== 'string') return null;
        const name = nfc(filename).trim();
        const fallbackYear = Number.isInteger(defaultYear)
            ? defaultYear
            : new Date().getFullYear();

        // ISO YYYY-MM-DD
        const iso = name.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            const m = parseInt(iso[2], 10);
            const d = parseInt(iso[3], 10);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
        }

        // DD.MM.YYYY
        const dmy = name.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dmy) {
            const d = parseInt(dmy[1], 10);
            const m = parseInt(dmy[2], 10);
            const y = parseInt(dmy[3], 10);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
        }

        // "17 мая [2026]" — Russian month name with optional year.
        const lower = name.toLowerCase();
        const monthRe = /(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/i;
        const mm = lower.match(monthRe);
        if (mm) {
            const day = parseInt(mm[1], 10);
            const monthRaw = mm[2];
            const year = mm[3] ? parseInt(mm[3], 10) : fallbackYear;
            let monthNum = null;
            for (const key of Object.keys(RU_MONTHS)) {
                if (monthRaw.startsWith(key)) {
                    monthNum = RU_MONTHS[key];
                    break;
                }
            }
            if (monthNum && day >= 1 && day <= 31) {
                return `${year}-${pad2(monthNum)}-${pad2(day)}`;
            }
        }

        return null;
    }

    // ----- score / number helpers --------------------------------------------

    // Swiss-Manager exports scores as "5½", "5.5", "5,5", or plain "5".
    function parseScore(raw) {
        if (raw === undefined || raw === null) return null;
        const s = String(raw).trim().replace(',', '.').replace('½', '.5');
        if (s === '') return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    function parseInteger(raw) {
        if (raw === undefined || raw === null) return null;
        const s = String(raw).trim();
        if (s === '') return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
    }
    function parseSignedInteger(raw) {
        if (raw === undefined || raw === null) return 0;
        const s = String(raw).trim();
        if (s === '' || s === '0') return 0;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : 0;
    }

    // ----- row splitter -------------------------------------------------------

    function splitRow(line) {
        if (line.indexOf('\t') !== -1) return line.split('\t').map(s => s.trim());
        return line.trim().split(/\s{2,}/).map(s => s.trim());
    }

    // ----- file extraction ----------------------------------------------------

    /**
     * Convert an upload (.xlsx / .xls / .html / .txt / .csv) to the
     * tab-separated text the row parser expects. Mirrors
     * supabase-data-tournaments.extractTextFromTournamentFile but also
     * recognises HTML-as-.xls by content sniffing — Swiss-Manager exports
     * a tabular HTML document with an .xls extension by default.
     */
    async function extractText(file, xlsxLib) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'xlsx') {
            const XLSXRef = xlsxLib || (typeof XLSX !== 'undefined' ? XLSX : null);
            if (!XLSXRef) throw new Error('SheetJS (XLSX) not loaded — cannot read Excel file');
            const buf = await file.arrayBuffer();
            const wb = XLSXRef.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            return XLSXRef.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        }
        if (ext === 'html' || ext === 'htm') {
            const text = await file.text();
            return extractRowsFromHtml(text);
        }
        if (ext === 'xls') {
            // Swiss-Manager exports HTML-as-.xls. Sniff the leading bytes.
            const text = await file.text();
            const lower = text.slice(0, 200).toLowerCase();
            if (lower.includes('<html') || lower.includes('<table')) {
                return extractRowsFromHtml(text);
            }
            // Fall back to SheetJS if it's a real binary xls (rare path here).
            const XLSXRef = xlsxLib || (typeof XLSX !== 'undefined' ? XLSX : null);
            if (!XLSXRef) throw new Error('SheetJS (XLSX) not loaded — cannot read legacy .xls file');
            const buf = await file.arrayBuffer();
            const wb = XLSXRef.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            return XLSXRef.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        }
        return await file.text();
    }

    // Pull <table><tr><td> rows out of an HTML-table export. Whitespace and
    // entity-decoded cells are joined with tabs so the downstream parser
    // takes its tab branch.
    function extractRowsFromHtml(html) {
        if (!html || typeof html !== 'string') return '';
        // Decode common HTML entities used in Swiss-Manager exports.
        const decode = (s) => s
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
            .replace(/<br\s*\/?\s*>/gi, ' ');
        const stripped = decode(html);

        const rows = [];
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let m;
        while ((m = trRe.exec(stripped))) {
            const inner = m[1];
            const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
            const cells = [];
            let c;
            while ((c = cellRe.exec(inner))) {
                cells.push(c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
            }
            if (cells.length > 0) rows.push(cells.join('\t'));
        }
        return rows.join('\n');
    }

    // ----- core parser --------------------------------------------------------

    /**
     * Parse a Swiss-Manager tabular export into a list of result rows.
     * `kind` is one of TOURNAMENT_KINDS. `filename` provides the date fallback.
     * Result rows shape:
     *   { rank, raw_name, rating_before, score, games_played, avg_opp_rating, rating_delta }
     * plus a top-level `tournament_date`, `kind`, `rounds`, and `warnings`.
     *
     * Skip rules per spec §2 participation_rate ("registered + 0 games = excluded"):
     * we still keep `games_played` in the returned row so the caller can decide
     * whether to commit it. The KPI math reads `games_played >= 1`.
     */
    function parseTournamentExport(text, opts) {
        opts = opts || {};
        const kind = opts.kind || null;
        const filename = opts.filename || null;
        const defaultYear = opts.defaultYear || new Date().getFullYear();
        const warnings = [];

        const tournament_date = parseDateFromFilename(filename, defaultYear);
        if (!tournament_date) {
            warnings.push('Could not parse tournament date from filename');
        }

        const out = {
            kind,
            rounds: kind ? ROUNDS_BY_KIND[kind] : null,
            tournament_date,
            source_filename: filename,
            results: [],
            warnings,
        };

        if (!kind || !TOURNAMENT_KINDS.includes(kind)) {
            warnings.push(`Unknown tournament kind: ${kind}`);
            return out;
        }
        if (!text || typeof text !== 'string') {
            warnings.push('Empty file content');
            return out;
        }

        const normalized = nfc(text).replace(/\r\n?/g, '\n');
        const lines = normalized.split('\n');

        // Locate header row (`Ном.` + `Имя`).
        let headerIdx = -1;
        let cols = null;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('Ном.') !== -1 && lines[i].indexOf('Имя') !== -1) {
                headerIdx = i;
                cols = splitRow(lines[i]);
                break;
            }
        }
        if (headerIdx === -1 || !cols) {
            warnings.push('Participant table header (Ном./Имя) not found');
            return out;
        }

        const colIdx = {};
        cols.forEach((c, i) => {
            const key = c.replace(/[.\s]+$/, '').toLowerCase();
            if (key === 'ном' || key === '№' || key === 'no') colIdx.rank = i;
            else if (key === 'имя' || key === 'name')        colIdx.name = i;
            else if (key === 'рейт' || key === 'rating')     colIdx.rating = i;
            else if (key.startsWith('оцен.очки') || key.startsWith('оцен очки') || key === 'очки' || key.startsWith('очки')) colIdx.score = i;
            else if (key.startsWith('оцен.парти') || key.startsWith('оцен парти') || key.startsWith('оцен.партии')) colIdx.games = i;
            else if (key.startsWith('нрейт') || key === 'avg opp') colIdx.avgOpp = i;
            else if (key.startsWith('рейт+') || key === 'rtg+/-') colIdx.delta = i;
        });
        if (colIdx.name === undefined || colIdx.rating === undefined) {
            warnings.push('Header missing required Имя or Рейт. column');
            return out;
        }

        // Walk rows; stop at blank line beyond header.
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const raw = lines[i];
            if (!raw || !raw.trim()) continue;
            const cells = splitRow(raw);
            if (cells.length < 2) continue;
            const rawName = cells[colIdx.name];
            if (!rawName) continue;

            const rankRaw = colIdx.rank !== undefined ? parseInteger(cells[colIdx.rank]) : null;
            const rank = Number.isFinite(rankRaw) ? rankRaw : (out.results.length + 1);
            const rating_before = parseInteger(cells[colIdx.rating]);
            if (rating_before === null) continue;
            const score = colIdx.score !== undefined ? parseScore(cells[colIdx.score]) : null;
            const games_played = colIdx.games !== undefined ? parseInteger(cells[colIdx.games]) : null;
            const avg_opp_rating = colIdx.avgOpp !== undefined ? parseInteger(cells[colIdx.avgOpp]) : null;
            const rating_delta = colIdx.delta !== undefined ? parseSignedInteger(cells[colIdx.delta]) : 0;

            out.results.push({
                rank,
                raw_name: nfc(rawName).trim(),
                rating_before,
                score: score === null ? 0 : score,
                games_played: games_played === null ? 0 : games_played,
                avg_opp_rating,
                rating_delta,
            });
        }

        if (out.results.length === 0) {
            warnings.push('No result rows found');
        }

        return out;
    }

    // ----- validation ---------------------------------------------------------

    /**
     * Apply the upload-time validation rules from spec §3 and §9.
     *   - kind must be one of TOURNAMENT_KINDS
     *   - rounds must equal ROUNDS_BY_KIND[kind]
     *   - tournament_date required (otherwise admin must enter manually)
     *   - registered + 0 games rows are flagged for exclusion
     *   - returns { errors, warnings, excludedRows, eligibleRows }
     */
    function validateParsedUpload(parsed) {
        const errors = [];
        const warnings = parsed && Array.isArray(parsed.warnings) ? parsed.warnings.slice() : [];
        const excludedRows = [];
        const eligibleRows = [];

        if (!parsed || typeof parsed !== 'object') {
            errors.push('No parsed upload provided');
            return { errors, warnings, excludedRows, eligibleRows };
        }
        if (!parsed.kind || !TOURNAMENT_KINDS.includes(parsed.kind)) {
            errors.push(`Invalid tournament kind: ${parsed.kind}`);
        }
        const expectedRounds = parsed.kind ? ROUNDS_BY_KIND[parsed.kind] : null;
        if (parsed.kind && parsed.rounds !== expectedRounds) {
            errors.push(`Rounds (${parsed.rounds}) does not match kind ${parsed.kind} (expected ${expectedRounds})`);
        }
        if (!parsed.tournament_date) {
            errors.push('Tournament date is required (admin must enter manually if not in filename)');
        }

        for (const r of (parsed.results || [])) {
            if ((r.games_played || 0) < 1) {
                excludedRows.push({ row: r, reason: 'registered_zero_games' });
            } else {
                eligibleRows.push(r);
            }
        }

        return { errors, warnings, excludedRows, eligibleRows };
    }

    // ----- match preview state ------------------------------------------------

    /**
     * Run every eligible row through fuzzyMatchStudent and bucket into
     * matched / ambiguous / unmatched. The preview screen disables Commit
     * until both ambiguous and unmatched are zero — per spec §3 step 6.
     */
    function buildMatchPreview(eligibleRows, students) {
        const matched = [];
        const ambiguous = [];
        const unmatched = [];
        for (const row of eligibleRows || []) {
            const r = fuzzyMatchStudent(row.raw_name, students || []);
            if (!r.matched) {
                unmatched.push({ row });
            } else if (r.ambiguous) {
                ambiguous.push({ row, candidates: r.candidates, confidence: r.confidence });
            } else {
                matched.push({ row, student: r.student, confidence: r.confidence });
            }
        }
        return {
            matched,
            ambiguous,
            unmatched,
            commitEnabled: ambiguous.length === 0 && unmatched.length === 0 && matched.length > 0,
            counts: {
                matched: matched.length,
                ambiguous: ambiguous.length,
                unmatched: unmatched.length,
            },
        };
    }

    // ----- commit -------------------------------------------------------------

    /**
     * Insert the upload + per-student result rows. Triggers in migration 039
     * detect razryad earnings + update students.razryad, then 036/038 logs
     * the transitions. Returns { upload_id, inserted }.
     *
     * `resolved` is a list of `{ row, student }` — comes from the preview
     * once the admin has resolved every ambiguous/unmatched row.
     */
    async function commitTournamentUpload(parsed, resolved, opts) {
        opts = opts || {};
        const client = opts.client || (typeof window !== 'undefined' ? window.supabaseClient : null);
        if (!client) throw new Error('Supabase client not available');
        if (!parsed || !parsed.kind || !parsed.tournament_date) {
            throw new Error('Parsed upload missing kind or tournament_date');
        }

        const uploadPayload = {
            kind: parsed.kind,
            tournament_date: parsed.tournament_date,
            rounds: parsed.rounds || ROUNDS_BY_KIND[parsed.kind],
            source_filename: parsed.source_filename || null,
            uploaded_by: opts.uploadedBy || null,
        };
        const { data: uploadRow, error: uploadErr } = await client
            .from('tournaments_uploads')
            .insert(uploadPayload)
            .select()
            .single();
        if (uploadErr) throw uploadErr;
        const upload_id = uploadRow.id;

        let inserted = 0;
        for (const r of resolved || []) {
            if (!r || !r.student || !r.student.id) continue;
            const row = r.row;
            const { error: resErr } = await client.from('tournament_results').insert({
                upload_id,
                student_id: r.student.id,
                rank: row.rank,
                score: row.score,
                games_played: row.games_played,
                avg_opp_rating: row.avg_opp_rating,
                rating_before: row.rating_before,
                rating_delta: row.rating_delta,
            });
            if (resErr) {
                if (resErr.code === '23505') continue; // unique violation = idempotent
                throw resErr;
            }

            // Mirror tournament_results into student_ratings so league transitions
            // detected via 038 fire forward-only.
            const rating_after = row.rating_before + (row.rating_delta || 0);
            await client.from('student_ratings').insert({
                student_id: r.student.id,
                rating: rating_after,
                rating_date: parsed.tournament_date,
                source: 'tournament',
            });

            inserted++;
        }

        return { upload_id, inserted };
    }

    // ----- DOM rendering (browser only) ---------------------------------------

    // ---- Re-render-on-language-change cache --------------------------------
    //
    // renderUploadModal paints via DOM text nodes (no data-i18n attributes) so
    // i18n.js's applyTranslations() can not retranslate it. We remember the
    // last (container, opts) pair the modal mounted into and replay the render
    // on the `languageChanged` / `languagechange` event with a fresh adapter.
    let _uploadRenderEntry = null;

    function _rememberUploadRender(container, opts) {
        if (!container) return;
        _uploadRenderEntry = { container, opts: opts || {} };
    }

    function _rerenderUploadModal() {
        const entry = _uploadRenderEntry;
        if (!entry || !entry.container) return;
        try { renderUploadModal(entry.container, entry.opts); }
        catch (_) { /* a bad re-render must not break the rest of the page */ }
    }

    function subscribeUploadLanguageEvents() {
        if (typeof window === 'undefined') return;
        if (window.__kpiUploadLangSubscribed) return;
        // Defer until window.i18n is ready so the very first re-render sees the
        // production translator (matches the race-fix in coach-kpi.js). The
        // _uploadRenderEntry is set independently of subscription, so a modal
        // that mounts before the listener fires is still covered once it does.
        if (typeof window.i18n === 'undefined' || !window.i18n) {
            if (window.__kpiUploadLangPending) return;
            window.__kpiUploadLangPending = true;
            let tries = 0;
            const poll = () => {
                if (typeof window === 'undefined') return;
                if (window.i18n) {
                    window.__kpiUploadLangPending = false;
                    subscribeUploadLanguageEvents();
                    return;
                }
                if (++tries >= 50) {
                    window.__kpiUploadLangPending = false;
                    _attachUploadLanguageListeners();
                    return;
                }
                if (typeof setTimeout === 'function') setTimeout(poll, 100);
            };
            if (typeof setTimeout === 'function') setTimeout(poll, 0);
            else _attachUploadLanguageListeners();
            return;
        }
        _attachUploadLanguageListeners();
    }

    function _attachUploadLanguageListeners() {
        if (typeof window === 'undefined') return;
        if (window.__kpiUploadLangSubscribed) return;
        window.__kpiUploadLangSubscribed = true;
        const handler = () => _rerenderUploadModal();
        if (typeof window.addEventListener === 'function') {
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
        if (Array.isArray(children)) for (const c of children) if (c) node.appendChild(c);
        return node;
    }

    /**
     * Render the kind picker + file input modal. Returns the modal element.
     * `opts.onCommit(parsed, resolved)` fires when the admin clicks Commit
     * with a fully-resolved preview.
     */
    function renderUploadModal(container, opts) {
        if (typeof document === 'undefined' || !container) return null;
        const o = opts || {};
        const defaultT = (key, fb) => {
            if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
                const v = window.i18n.t(key);
                if (v && v !== key && typeof v === 'string') return v;
            }
            return fb;
        };
        const t = typeof o.t === 'function' ? o.t : defaultT;
        const label = (key, fb) => t(key, fb);
        const students = Array.isArray(o.students) ? o.students : [];

        container.innerHTML = '';
        const modal = _el('div', { className: 'kpi-upload-modal' });
        modal.appendChild(_el('h2', {
            className: 'kpi-upload-title',
            text: label('admin.coachKpi.uploadTitle', 'Upload tournament'),
        }));

        // Step 1: kind picker.
        const kindRow = _el('div', { className: 'kpi-upload-row' });
        kindRow.appendChild(_el('label', { text: label('admin.coachKpi.uploadKind', 'Tournament type') }));
        const kindSelect = _el('select', { className: 'kpi-upload-kind' });
        for (const k of TOURNAMENT_KINDS) {
            kindSelect.appendChild(_el('option', {
                value: k,
                text: label('admin.coachKpi.kind.' + k, k),
            }));
        }
        kindRow.appendChild(kindSelect);
        modal.appendChild(kindRow);

        // Step 2: file input.
        const fileRow = _el('div', { className: 'kpi-upload-row' });
        fileRow.appendChild(_el('label', { text: label('admin.coachKpi.uploadFile', 'Swiss-Manager export') }));
        const fileInput = _el('input', {
            type: 'file',
            accept: '.xlsx,.xls,.html,.htm,.txt,.csv',
            className: 'kpi-upload-file',
        });
        fileRow.appendChild(fileInput);
        modal.appendChild(fileRow);

        // Step 3: manual date fallback (hidden until file is loaded without a date).
        const dateRow = _el('div', { className: 'kpi-upload-row kpi-upload-date-row', hidden: 'hidden' });
        dateRow.appendChild(_el('label', { text: label('admin.coachKpi.uploadDate', 'Tournament date') }));
        const dateInput = _el('input', { type: 'date', className: 'kpi-upload-date' });
        dateRow.appendChild(dateInput);
        modal.appendChild(dateRow);

        // Preview host + commit button.
        const preview = _el('div', { className: 'kpi-upload-preview' });
        modal.appendChild(preview);

        const buttons = _el('div', { className: 'kpi-upload-buttons' });
        const cancelBtn = _el('button', {
            type: 'button',
            className: 'btn btn-secondary',
            text: label('common.cancel', 'Cancel'),
        });
        const commitBtn = _el('button', {
            type: 'button',
            className: 'btn btn-primary',
            text: label('admin.coachKpi.uploadCommit', 'Commit upload'),
            disabled: 'disabled',
        });
        buttons.appendChild(cancelBtn);
        buttons.appendChild(commitBtn);
        modal.appendChild(buttons);

        let parsed = null;
        let previewState = null;

        function refreshPreview() {
            preview.innerHTML = '';
            if (!parsed) return;
            const validation = validateParsedUpload(parsed);
            if (validation.errors.length > 0) {
                for (const e of validation.errors) {
                    preview.appendChild(_el('div', { className: 'kpi-upload-error', text: e }));
                }
                if (validation.errors.some(e => /date is required/i.test(e))) {
                    dateRow.removeAttribute('hidden');
                }
                commitBtn.setAttribute('disabled', 'disabled');
                return;
            }
            previewState = buildMatchPreview(validation.eligibleRows, students);
            const stats = _el('div', { className: 'kpi-upload-stats' });
            stats.appendChild(_el('span', {
                className: 'stat-matched',
                text: `${label('admin.coachKpi.previewMatched', 'Matched')}: ${previewState.counts.matched}`,
            }));
            stats.appendChild(_el('span', {
                className: 'stat-ambiguous',
                text: `${label('admin.coachKpi.previewAmbiguous', 'Ambiguous')}: ${previewState.counts.ambiguous}`,
            }));
            stats.appendChild(_el('span', {
                className: 'stat-unmatched',
                text: `${label('admin.coachKpi.previewUnmatched', 'Unmatched')}: ${previewState.counts.unmatched}`,
            }));
            preview.appendChild(stats);

            if (previewState.commitEnabled) commitBtn.removeAttribute('disabled');
            else commitBtn.setAttribute('disabled', 'disabled');
        }

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                const text = await extractText(file, o.xlsxLib);
                parsed = parseTournamentExport(text, {
                    kind: kindSelect.value,
                    filename: file.name,
                });
                if (!parsed.tournament_date && dateInput.value) {
                    parsed.tournament_date = dateInput.value;
                }
                if (!parsed.tournament_date) dateRow.removeAttribute('hidden');
                refreshPreview();
            } catch (err) {
                preview.innerHTML = '';
                preview.appendChild(_el('div', {
                    className: 'kpi-upload-error',
                    text: (err && err.message) || String(err),
                }));
            }
        });
        kindSelect.addEventListener('change', () => {
            if (parsed) {
                parsed.kind = kindSelect.value;
                parsed.rounds = ROUNDS_BY_KIND[parsed.kind];
                refreshPreview();
            }
        });
        dateInput.addEventListener('change', () => {
            if (parsed && dateInput.value) {
                parsed.tournament_date = dateInput.value;
                refreshPreview();
            }
        });
        cancelBtn.addEventListener('click', () => {
            if (typeof o.onCancel === 'function') o.onCancel();
        });
        commitBtn.addEventListener('click', async () => {
            if (!parsed || !previewState || !previewState.commitEnabled) return;
            const resolved = previewState.matched.map(m => ({ row: m.row, student: m.student }));
            if (typeof o.onCommit === 'function') await o.onCommit(parsed, resolved);
        });

        container.appendChild(modal);
        _rememberUploadRender(container, o);
        subscribeUploadLanguageEvents();
        return modal;
    }

    // ----- API surface --------------------------------------------------------

    const api = {
        TOURNAMENT_KINDS,
        ROUNDS_BY_KIND,
        parseDateFromFilename,
        parseTournamentExport,
        extractText,
        extractRowsFromHtml,
        validateParsedUpload,
        buildMatchPreview,
        commitTournamentUpload,
        fuzzyMatchStudent,
        renderUploadModal,
        subscribeLanguageEvents: subscribeUploadLanguageEvents,
    };

    if (typeof window !== 'undefined') {
        window.coachKpiUpload = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
