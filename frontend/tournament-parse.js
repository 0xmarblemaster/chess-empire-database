/**
 * Swiss-Manager export parser — pure functions only.
 *
 * Lifted out of coach-kpi-upload.js so the tournament-import path is
 * usable from the merged Rating Management upload modal in admin(-v2).js.
 * No DOM, no Supabase — caller wires the result into its preview/commit code.
 *
 * Loaded as a <script> in browser (exports onto window.tournamentParse) and
 * as a CommonJS module from Node tests.
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.tournamentParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TOURNAMENT_KINDS = Object.freeze(['league_c', 'league_b', 'razryad_4', 'razryad_3', 'rated']);
    // ROUNDS_BY_KIND lists fixed-rounds kinds only. 'rated' is intentionally
    // omitted: rounds are derived from max(games_played) by the parser, and
    // the validator accepts any value in [RATED_MIN_ROUNDS, RATED_MAX_ROUNDS].
    const ROUNDS_BY_KIND = Object.freeze({
        league_c:  6,
        league_b:  6,
        razryad_4: 10,
        razryad_3: 9,
    });
    const RATED_MIN_ROUNDS = 1;
    const RATED_MAX_ROUNDS = 20;

    // Russian month → 1-indexed month number.
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

    function pad2(n) { return String(n).padStart(2, '0'); }
    function nfc(s) { return (s || '').normalize('NFC'); }

    function parseDateFromFilename(filename, defaultYear) {
        if (!filename || typeof filename !== 'string') return null;
        const name = nfc(filename).trim();
        const fallbackYear = Number.isInteger(defaultYear) ? defaultYear : new Date().getFullYear();

        const iso = name.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            const y = parseInt(iso[1], 10);
            const m = parseInt(iso[2], 10);
            const d = parseInt(iso[3], 10);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
        }

        const dmy = name.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dmy) {
            const d = parseInt(dmy[1], 10);
            const m = parseInt(dmy[2], 10);
            const y = parseInt(dmy[3], 10);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(m)}-${pad2(d)}`;
        }

        const lower = name.toLowerCase();
        const monthRe = /(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/i;
        const mm = lower.match(monthRe);
        if (mm) {
            const day = parseInt(mm[1], 10);
            const monthRaw = mm[2];
            const year = mm[3] ? parseInt(mm[3], 10) : fallbackYear;
            let monthNum = null;
            for (const key of Object.keys(RU_MONTHS)) {
                if (monthRaw.startsWith(key)) { monthNum = RU_MONTHS[key]; break; }
            }
            if (monthNum && day >= 1 && day <= 31) {
                return `${year}-${pad2(monthNum)}-${pad2(day)}`;
            }
        }
        return null;
    }

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

    function splitRow(line) {
        if (line.indexOf('\t') !== -1) return line.split('\t').map(s => s.trim());
        return line.trim().split(/\s{2,}/).map(s => s.trim());
    }

    function extractRowsFromHtml(html) {
        if (!html || typeof html !== 'string') return '';
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

    /**
     * Convert a file upload (.xlsx / .xls / .html / .txt / .csv) to the
     * tab-separated text that parseTournamentExport reads. Recognises
     * Swiss-Manager's HTML-as-.xls by content sniffing.
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
            const text = await file.text();
            const lower = text.slice(0, 200).toLowerCase();
            if (lower.includes('<html') || lower.includes('<table')) {
                return extractRowsFromHtml(text);
            }
            const XLSXRef = xlsxLib || (typeof XLSX !== 'undefined' ? XLSX : null);
            if (!XLSXRef) throw new Error('SheetJS (XLSX) not loaded — cannot read legacy .xls file');
            const buf = await file.arrayBuffer();
            const wb = XLSXRef.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            return XLSXRef.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        }
        return await file.text();
    }

    function parseTournamentExport(text, opts) {
        opts = opts || {};
        const kind = opts.kind || null;
        const filename = opts.filename || null;
        const defaultYear = opts.defaultYear || new Date().getFullYear();
        const warnings = [];

        const tournament_date = parseDateFromFilename(filename, defaultYear);
        if (!tournament_date) warnings.push('Could not parse tournament date from filename');

        const out = {
            kind,
            // Fixed-rounds kinds get their canonical rounds upfront. 'rated'
            // is derived from max(games_played) after the row loop below.
            rounds: kind ? (ROUNDS_BY_KIND[kind] || null) : null,
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

        if (out.results.length === 0) warnings.push('No result rows found');

        // For 'rated' tournaments, derive rounds from the max games_played
        // across the participant table. In a Swiss tournament only top
        // finishers play every round, so max(games_played) == total rounds.
        // Admin can override in the modal if the export has quirks.
        if (kind === 'rated') {
            const maxGames = out.results.reduce(
                (m, r) => Math.max(m, r.games_played || 0), 0
            );
            out.rounds = maxGames > 0 ? maxGames : null;
            if (!out.rounds) {
                warnings.push('Could not derive rounds from games_played — admin must enter manually');
            }
        }

        return out;
    }

    /**
     * Validate a parsed upload against the per-kind invariants.
     *   - kind in TOURNAMENT_KINDS
     *   - rounds matches ROUNDS_BY_KIND[kind]
     *   - tournament_date present (otherwise caller must collect it manually)
     *   - rows with games_played < 1 are excluded (registered + 0 games)
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
        if (parsed.kind === 'rated') {
            const r = parsed.rounds;
            if (!Number.isInteger(r) || r < RATED_MIN_ROUNDS || r > RATED_MAX_ROUNDS) {
                errors.push(`Rounds (${r}) must be an integer between ${RATED_MIN_ROUNDS} and ${RATED_MAX_ROUNDS} for rated tournaments`);
            }
        } else if (parsed.kind && TOURNAMENT_KINDS.includes(parsed.kind)) {
            const expectedRounds = ROUNDS_BY_KIND[parsed.kind];
            if (parsed.rounds !== expectedRounds) {
                errors.push(`Rounds (${parsed.rounds}) does not match kind ${parsed.kind} (expected ${expectedRounds})`);
            }
        }
        if (!parsed.tournament_date) {
            errors.push('Tournament date is required (admin must enter manually if not in filename)');
        }

        for (const r of (parsed.results || [])) {
            if ((r.games_played || 0) < 1) excludedRows.push({ row: r, reason: 'registered_zero_games' });
            else eligibleRows.push(r);
        }

        return { errors, warnings, excludedRows, eligibleRows };
    }

    return {
        TOURNAMENT_KINDS,
        ROUNDS_BY_KIND,
        RATED_MIN_ROUNDS,
        RATED_MAX_ROUNDS,
        parseDateFromFilename,
        parseTournamentExport,
        extractText,
        extractRowsFromHtml,
        validateParsedUpload,
    };
});
