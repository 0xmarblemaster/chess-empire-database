/**
 * Tournament Data Layer — Phase 2a
 *
 * Swiss-Manager CSV parser, participant matcher, importer, and per-student
 * tournament queries. Pure data layer — no DOM, no UI. Loaded after
 * supabase-data.js. Exposes window.tournamentsData (and module.exports for
 * Node-side tests).
 *
 * See PRD_TOURNAMENTS.md sections 3, 4, 5.3, 5.4, 6.
 */

(function () {
    'use strict';

    // ----- helpers ---------------------------------------------------------

    function levenshteinDistance(a, b) {
        const m = a.length;
        const n = b.length;
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

    // Normalize Unicode (compose) and lowercase. ½ left alone — caller decides.
    function nfc(str) {
        return (str || '').normalize('NFC');
    }

    // Mirror of admin-v2.js:fuzzyMatchStudent (lines 3093-3222). Extracted here
    // so the importer is decoupled from the admin module — Phase 2b can swap
    // both call sites onto this helper.
    function fuzzyMatchStudent(rawName, students) {
        if (!rawName || !students || students.length === 0) {
            return { matched: false, student: null, confidence: 0 };
        }

        const normalized = nfc(rawName).trim().toLowerCase();
        const parts = normalized.split(/\s+/).filter(p => p.length > 0);

        const exact = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName || '').toLowerCase();
            if (normalized === `${ln} ${fn}` || normalized === `${fn} ${ln}`) {
                exact.push(s);
            }
        }
        if (exact.length === 1) return { matched: true, student: exact[0], confidence: 100 };
        if (exact.length > 1) return { matched: true, student: exact[0], confidence: 100, ambiguous: true, candidates: exact };

        const MIN_SUBSTRING_LENGTH = 4;
        const MIN_TOKEN_SIMILARITY = 0.75;
        const MIN_WHOLE_NAME_SIMILARITY = 0.80;

        const fuzzy80 = [];
        for (const s of students) {
            const fn = nfc(s.firstName || '').toLowerCase();
            const ln = nfc(s.lastName || '').toLowerCase();
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
                const d1 = levenshteinDistance(normalized, full1);
                const d2 = levenshteinDistance(normalized, full2);
                const minDist = Math.min(d1, d2);
                const maxLen = Math.max(normalized.length, full1.length);
                if ((maxLen - minDist) / maxLen >= MIN_WHOLE_NAME_SIMILARITY) {
                    fuzzy80.push(s);
                }
            }
        }
        if (fuzzy80.length === 1) return { matched: true, student: fuzzy80[0], confidence: 80 };
        if (fuzzy80.length > 1) return { matched: true, student: fuzzy80[0], confidence: 80, ambiguous: true, candidates: fuzzy80 };

        return { matched: false, student: null, confidence: 0 };
    }

    // Parse DD.MM.YYYY strictly — no JS Date coercion.
    function parseDDMMYYYY(str) {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (!m) return null;
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const yyyy = parseInt(m[3], 10);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        // Reject 31 Feb etc.
        const daysInMonth = new Date(yyyy, mm, 0).getDate();
        if (dd > daysInMonth) return null;
        return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }

    // Convert "5½" / "4½" / "5" / "" to a number; PRD says we don't store score,
    // but the parser must skip the value cleanly without throwing.
    function _parseScore(str) {
        if (str === undefined || str === null) return null;
        const cleaned = String(str).trim().replace('½', '.5');
        if (cleaned === '') return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
    }

    // Parse signed rating delta ("+125", "-12", "", "0").
    function parseDelta(str) {
        if (str === undefined || str === null) return 0;
        const cleaned = String(str).trim();
        if (cleaned === '' || cleaned === '0') return 0;
        const n = parseInt(cleaned, 10);
        return Number.isFinite(n) ? n : 0;
    }

    // Split a table row into columns. Swiss-Manager exports as TSV; fall back to
    // 2+ spaces for visually-aligned exports.
    function splitRow(line) {
        if (line.indexOf('\t') !== -1) return line.split('\t').map(s => s.trim());
        return line.trim().split(/\s{2,}/).map(s => s.trim());
    }

    // ----- file extraction ------------------------------------------------

    // Read a tournament file (.csv / .txt / .xlsx / .xls) into the plain-text
    // form parseSwissManagerCSV expects. For .xlsx/.xls we convert via SheetJS
    // to a tab-separated string so splitRow() takes its tab branch and the
    // header lines (Дата, Организатор, Лига, …) stay on their own rows.
    //
    // The `file` param only needs `.name` and `.arrayBuffer()` (Node tests can
    // pass a plain object). `xlsxLib` is injectable for tests; in the browser
    // we fall back to the global `XLSX` loaded by SheetJS's CDN script.
    async function extractTextFromTournamentFile(file, xlsxLib) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            const XLSXRef = xlsxLib || (typeof XLSX !== 'undefined' ? XLSX : null);
            if (!XLSXRef) {
                throw new Error('SheetJS (XLSX) not loaded — cannot read Excel file');
            }
            const buf = await file.arrayBuffer();
            const wb = XLSXRef.read(buf, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            // FS:'\t' so splitRow() takes the tab branch in parseSwissManagerCSV.
            // blankrows:false drops empty rows that would prematurely terminate the participant loop.
            return XLSXRef.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        }
        return await file.text();
    }

    // ----- parser ---------------------------------------------------------

    function parseSwissManagerCSV(fileText, filename) {
        const warnings = [];
        const tournament = {
            name: null,
            league: null,
            date: null,
            director: null,
            organizer: null,
            avg_rating: null,
            source_file: filename || null,
        };
        const participants = [];

        if (!fileText || typeof fileText !== 'string') {
            warnings.push('Empty or invalid file content');
            return { tournament, participants, warnings };
        }

        const text = nfc(fileText).replace(/\r\n?/g, '\n');
        const lines = text.split('\n');

        // Header scan — first 30 non-empty lines.
        const headerScan = lines.slice(0, 30);
        for (const raw of headerScan) {
            const line = raw.trim();
            if (!line) continue;

            // "Дата : 03.05.2026"
            const dateMatch = line.match(/Дата\s*:\s*(\d{2}\.\d{2}\.\d{4})/);
            if (dateMatch && !tournament.date) {
                tournament.date = parseDDMMYYYY(dateMatch[1]);
                if (!tournament.date) warnings.push(`Could not parse date "${dateMatch[1]}"`);
                continue;
            }

            // "Организатор(ы) : Chess Empire"
            const orgMatch = line.match(/Организатор[^:]*:\s*(.+)$/);
            if (orgMatch && !tournament.organizer) {
                tournament.organizer = orgMatch[1].trim();
                continue;
            }

            // "Турнирный директор : Name"
            const dirMatch = line.match(/Турнирный\s+директор\s*:\s*(.+)$/);
            if (dirMatch && !tournament.director) {
                tournament.director = dirMatch[1].trim();
                continue;
            }

            // "Рейтинг-Ø : 579"
            const avgMatch = line.match(/Рейтинг[^:]*:\s*(\d+)/);
            if (avgMatch && tournament.avg_rating === null) {
                tournament.avg_rating = parseInt(avgMatch[1], 10);
                continue;
            }

            // Title line: "<org> | Лига B | <name>"
            const titleMatch = line.match(/\|\s*Лига\s+([ABC])\s*\|\s*(.+)$/);
            if (titleMatch) {
                if (!tournament.league) tournament.league = titleMatch[1];
                if (!tournament.name) tournament.name = titleMatch[2].trim();
                continue;
            }
        }

        // Validation per PRD 5.4 — warn, don't throw.
        if (!tournament.date) warnings.push('Header missing date — admin must enter manually');
        if (!tournament.league) warnings.push('Header missing league — admin must pick from dropdown');
        if (!tournament.name) warnings.push('Header missing tournament name — admin must enter manually');

        // Locate the participant table header row. It contains "Ном." and "Имя".
        let headerIdx = -1;
        let cols = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.indexOf('Ном.') !== -1 && line.indexOf('Имя') !== -1) {
                headerIdx = i;
                cols = splitRow(line);
                break;
            }
        }

        if (headerIdx === -1 || !cols) {
            warnings.push('Could not locate participant table — missing Ном./Имя header row');
            return { tournament, participants, warnings };
        }

        // Map column name → index. Tolerate trailing punctuation differences.
        const colIdx = {};
        cols.forEach((c, i) => {
            const key = c.replace(/[.\s]+$/, '').toLowerCase();
            if (key === 'ном' || key === 'no' || key === '№') colIdx.place = i;
            else if (key === 'имя' || key === 'name') colIdx.name = i;
            else if (key === 'рейт' || key === 'rating') colIdx.rating = i;
            else if (key.startsWith('рейт+') || key === 'rtg+/-') colIdx.delta = i;
        });

        if (colIdx.name === undefined || colIdx.rating === undefined) {
            warnings.push('Participant table missing required Имя or Рейт. column');
            return { tournament, participants, warnings };
        }

        // Parse each row after header until a blank line.
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const raw = lines[i];
            if (!raw || !raw.trim()) continue;
            const cells = splitRow(raw);
            if (cells.length < 2) continue;

            const rawName = cells[colIdx.name];
            if (!rawName) continue;

            // Place: prefer Ном. value; fall back to running row index.
            let place = null;
            if (colIdx.place !== undefined) {
                const p = parseInt(cells[colIdx.place], 10);
                if (Number.isFinite(p)) place = p;
            }
            if (place === null) place = participants.length + 1;

            const ratingBefore = parseInt(cells[colIdx.rating], 10);
            const delta = colIdx.delta !== undefined ? parseDelta(cells[colIdx.delta]) : 0;
            const ratingAfter = Number.isFinite(ratingBefore) ? ratingBefore + delta : null;

            // Touch the score column so "5½" is read & discarded without errors.
            // (PRD: we don't store score, but parser must not choke.)
            // No column index for score is required — we explicitly ignore.

            participants.push({
                place,
                raw_name: nfc(rawName).trim(),
                rating_before: Number.isFinite(ratingBefore) ? ratingBefore : null,
                rating_delta: delta,
                rating_after: ratingAfter,
            });
        }

        if (participants.length === 0) {
            warnings.push('No participant rows found');
        }

        return { tournament, participants, warnings };
    }

    // ----- participant matcher --------------------------------------------

    async function matchParticipants(participants, students, opts) {
        opts = opts || {};
        const client = opts.client || (typeof window !== 'undefined' ? window.supabaseClient : null);

        // Step 1 — auto-resolve via persisted raw_name mappings.
        // tournament_participants.raw_name from previous imports is the map.
        const rawNames = participants.map(p => p.raw_name).filter(Boolean);
        const autoResolved = new Map(); // raw_name -> student_id

        if (client && rawNames.length > 0) {
            try {
                const { data, error } = await client
                    .from('tournament_participants')
                    .select('raw_name, student_id')
                    .in('raw_name', rawNames);
                if (!error && Array.isArray(data)) {
                    for (const row of data) {
                        if (!autoResolved.has(row.raw_name)) {
                            autoResolved.set(row.raw_name, row.student_id);
                        }
                    }
                }
            } catch (_e) {
                // Network failure is non-fatal; we still fall back to fuzzy.
            }
        }

        const matched = [];
        const ambiguous = [];
        const unmatched = [];

        const studentsById = new Map();
        for (const s of students || []) studentsById.set(s.id, s);

        for (const p of participants) {
            const auto = autoResolved.get(p.raw_name);
            if (auto && studentsById.has(auto)) {
                matched.push({ participant: p, student: studentsById.get(auto), confidence: 100, source: 'auto' });
                continue;
            }
            const result = fuzzyMatchStudent(p.raw_name, students);
            if (!result.matched) {
                unmatched.push({ participant: p });
            } else if (result.ambiguous) {
                ambiguous.push({ participant: p, candidates: result.candidates, confidence: result.confidence });
            } else {
                matched.push({ participant: p, student: result.student, confidence: result.confidence, source: 'fuzzy' });
            }
        }

        return { matched, ambiguous, unmatched };
    }

    // ----- importer -------------------------------------------------------

    async function importTournament(parsed, resolvedParticipants, opts) {
        opts = opts || {};
        const client = opts.client || (typeof window !== 'undefined' ? window.supabaseClient : null);
        if (!client) throw new Error('Supabase client not available');

        const t = parsed.tournament;
        if (!t || !t.name || !t.league || !t.date) {
            throw new Error('Tournament metadata incomplete (name, league, date required)');
        }

        // Step 1 — upsert tournament on UNIQUE(name, tournament_date, league).
        const upsertPayload = {
            name: t.name,
            league: t.league,
            tournament_date: t.date,
            director_name: t.director || null,
            organizer: t.organizer || null,
            avg_rating: t.avg_rating !== null ? t.avg_rating : null,
            source_file: t.source_file || null,
        };
        const { data: tRow, error: tErr } = await client
            .from('tournaments')
            .upsert(upsertPayload, { onConflict: 'name,tournament_date,league' })
            .select()
            .single();
        if (tErr) throw tErr;
        const tournamentId = tRow.id;

        // Step 2 — for each resolved participant, insert tournament_participants
        // and a paired student_ratings row. Idempotent: skip on existing
        // (tournament_id, student_id).
        let inserted = 0;
        let skipped = 0;

        // Pre-fetch existing participant rows to detect skips.
        const existingByStudent = new Set();
        const { data: existing, error: exErr } = await client
            .from('tournament_participants')
            .select('student_id')
            .eq('tournament_id', tournamentId);
        if (exErr) throw exErr;
        for (const row of existing || []) existingByStudent.add(row.student_id);

        for (const r of resolvedParticipants) {
            if (!r.student || !r.student.id) continue;
            if (existingByStudent.has(r.student.id)) {
                skipped++;
                continue;
            }

            const p = r.participant;
            const { error: pErr } = await client.from('tournament_participants').insert({
                tournament_id: tournamentId,
                student_id: r.student.id,
                place: p.place,
                rating_before: p.rating_before,
                rating_after: p.rating_after,
                rating_delta: p.rating_delta,
                raw_name: p.raw_name,
            });
            if (pErr) {
                // Unique-violation = concurrent insert; treat as skip rather than fail batch.
                if (pErr.code === '23505') { skipped++; continue; }
                throw pErr;
            }

            if (p.rating_after !== null && p.rating_after !== undefined) {
                const { error: rErr } = await client.from('student_ratings').insert({
                    student_id: r.student.id,
                    rating: p.rating_after,
                    rating_date: t.date,
                    source: 'tournament',
                    tournament_id: tournamentId,
                });
                if (rErr && rErr.code !== '23505') throw rErr;
            }

            inserted++;
        }

        return { tournamentId, inserted, skipped };
    }

    // ----- per-student queries -------------------------------------------

    async function getStudentTournaments(studentId, limit) {
        limit = limit || 5;
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        if (!client) return [];
        const { data, error } = await client
            .from('tournament_participants')
            .select(`
                id, place, rating_before, rating_after, rating_delta,
                tournament:tournaments(id, name, league, tournament_date)
            `)
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) {
            console.error('getStudentTournaments error', error);
            return [];
        }
        return (data || []).map(row => ({
            id: row.id,
            place: row.place,
            ratingBefore: row.rating_before,
            ratingAfter: row.rating_after,
            ratingDelta: row.rating_delta,
            tournamentId: row.tournament?.id,
            tournamentName: row.tournament?.name,
            league: row.tournament?.league,
            date: row.tournament?.tournament_date,
        }));
    }

    function _cadenceFromDate(lastDateStr, today) {
        if (!lastDateStr) return 'inactive';
        const last = new Date(lastDateStr);
        const now = today || new Date();
        const weeks = (now - last) / (1000 * 60 * 60 * 24 * 7);
        if (weeks <= 4) return 'active';
        if (weeks <= 8) return 'occasional';
        return 'inactive';
    }

    // League thresholds per Phase 3 spec: <450=C, 450-800=B, >800=A.
    function _leagueFromRating(rating) {
        if (rating === null || rating === undefined || !Number.isFinite(Number(rating))) return null;
        const r = Number(rating);
        if (r > 800) return 'A';
        if (r >= 450) return 'B';
        return 'C';
    }

    // Pure aggregate calculator — accepts an array of {place, delta, date} rows
    // (date as 'YYYY-MM-DD'). Net rating gained = sum of all deltas.
    function _aggregateFromRows(rows, today) {
        const empty = { total: 0, ytd: 0, bestPlace: null, avgPlace: null, totalRatingGained: 0, lastDate: null, cadence: 'inactive' };
        if (!Array.isArray(rows) || rows.length === 0) return empty;
        const filtered = rows.filter(r => r && r.date);
        if (filtered.length === 0) return empty;

        const year = (today || new Date()).getFullYear();
        const ytd = filtered.filter(r => String(r.date).startsWith(`${year}-`)).length;
        const places = filtered.map(r => r.place).filter(p => Number.isFinite(p));
        const bestPlace = places.length ? Math.min(...places) : null;
        const avgPlace = places.length ? Math.round(places.reduce((a, b) => a + b, 0) / places.length) : null;
        const totalRatingGained = filtered.reduce((a, r) => a + (Number.isFinite(r.delta) ? r.delta : 0), 0);
        const lastDate = filtered.map(r => r.date).sort().slice(-1)[0];

        return {
            total: filtered.length,
            ytd,
            bestPlace,
            avgPlace,
            totalRatingGained,
            lastDate,
            cadence: _cadenceFromDate(lastDate, today),
        };
    }

    // Phase 5 — streak: N tournaments where each is within `maxGapDays` (default 14)
    // of the previous one. Returns {current, longest}. `current` = streak ending at
    // the most recent tournament; `longest` = max streak across the whole history.
    // Accepts rows shaped as {date} | {tournament_date} | {tournament:{tournament_date}}.
    function _extractDate(row) {
        if (!row) return null;
        if (row.date) return row.date;
        if (row.tournament_date) return row.tournament_date;
        if (row.tournament && row.tournament.tournament_date) return row.tournament.tournament_date;
        return null;
    }

    function computeStreak(tournaments, opts) {
        const maxGapDays = (opts && Number.isFinite(opts.maxGapDays)) ? opts.maxGapDays : 14;
        if (!Array.isArray(tournaments) || tournaments.length === 0) {
            return { current: 0, longest: 0 };
        }
        const dates = tournaments.map(_extractDate).filter(Boolean).sort();
        if (dates.length === 0) return { current: 0, longest: 0 };

        let current = 1;
        let longest = 1;
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
            const curr = new Date(`${dates[i]}T00:00:00Z`);
            const diffDays = (curr - prev) / 86400000;
            if (diffDays <= maxGapDays) {
                current++;
                if (current > longest) longest = current;
            } else {
                current = 1;
            }
        }
        return { current, longest };
    }

    // Phase 5 — season summary: last `daysWindow` days (default 90) roll-up.
    // Returns {tournamentsPlayed, bestPlace, totalRatingDelta, daysWindow}.
    function computeSeasonSummary(tournaments, daysWindow, today) {
        daysWindow = (Number.isFinite(daysWindow) ? daysWindow : 90);
        const now = today || new Date();
        const empty = { tournamentsPlayed: 0, bestPlace: null, totalRatingDelta: 0, daysWindow };
        if (!Array.isArray(tournaments) || tournaments.length === 0) return empty;

        const cutoff = new Date(now);
        cutoff.setUTCDate(cutoff.getUTCDate() - daysWindow);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const inWindow = tournaments.filter(t => {
            const d = _extractDate(t);
            return d && d >= cutoffStr;
        });
        if (inWindow.length === 0) return empty;

        const places = inWindow.map(t => t.place).filter(p => Number.isFinite(p));
        const totalRatingDelta = inWindow.reduce((sum, t) => {
            const d = (t.ratingDelta !== undefined) ? t.ratingDelta : t.rating_delta;
            return sum + (Number.isFinite(d) ? d : 0);
        }, 0);

        return {
            tournamentsPlayed: inWindow.length,
            bestPlace: places.length ? Math.min(...places) : null,
            totalRatingDelta,
            daysWindow,
        };
    }

    // Phase 5 — branch leaderboard aggregation. Pure function: merges leaderboard
    // rows from one or more leagues by student_id, sorts by tournaments_played
    // desc with total_rating_gained as tie-break, returns the top 10 ranked.
    function _aggregateLeaderboard(rows, limit) {
        limit = Number.isFinite(limit) ? limit : 10;
        const byStudent = new Map();
        for (const r of (rows || [])) {
            if (!r || !r.student_id) continue;
            const slot = byStudent.get(r.student_id) || {
                student_id: r.student_id,
                first_name: r.first_name || '',
                last_name: r.last_name || '',
                tournaments_played: 0,
                total_rating_gained: 0,
                best_place: null,
            };
            slot.tournaments_played += Number.isFinite(r.tournaments_played) ? r.tournaments_played : 0;
            slot.total_rating_gained += Number.isFinite(r.total_rating_gained) ? r.total_rating_gained : 0;
            if (Number.isFinite(r.best_place)) {
                if (slot.best_place === null || r.best_place < slot.best_place) {
                    slot.best_place = r.best_place;
                }
            }
            byStudent.set(r.student_id, slot);
        }

        const sorted = [...byStudent.values()].sort((a, b) => {
            if (b.tournaments_played !== a.tournaments_played) {
                return b.tournaments_played - a.tournaments_played;
            }
            return (b.total_rating_gained || 0) - (a.total_rating_gained || 0);
        });

        return sorted.slice(0, limit).map((s, i) => ({ ...s, rank: i + 1 }));
    }

    // Pure crossing detector — accepts an ordered array of {rating, rating_date}
    // and returns the most recent league change within `days`, or null.
    // Reports both promotions and demotions; direction is 'promoted' | 'demoted'.
    function _detectCrossingFromRatings(ratings, days, today) {
        if (!Array.isArray(ratings) || ratings.length < 2) return null;
        days = days || 90;
        const now = today || new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const inRange = ratings
            .filter(r => r && r.rating_date && r.rating_date >= cutoffStr)
            .sort((a, b) => a.rating_date.localeCompare(b.rating_date));
        if (inRange.length < 2) return null;

        const rank = { A: 3, B: 2, C: 1 };
        let result = null;
        for (let i = 1; i < inRange.length; i++) {
            const prev = _leagueFromRating(inRange[i - 1].rating);
            const curr = _leagueFromRating(inRange[i].rating);
            if (!prev || !curr || prev === curr) continue;
            const direction = rank[curr] > rank[prev] ? 'promoted' : 'demoted';
            result = { from: prev, to: curr, date: inRange[i].rating_date, direction };
        }
        return result;
    }

    async function getStudentTournamentAggregates(studentId) {
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        const empty = { total: 0, ytd: 0, bestPlace: null, avgPlace: null, totalRatingGained: 0, lastDate: null, cadence: 'inactive' };
        if (!client) return empty;
        const { data, error } = await client
            .from('tournament_participants')
            .select('place, rating_delta, tournament:tournaments(tournament_date)')
            .eq('student_id', studentId);
        if (error || !data || data.length === 0) return empty;

        const rows = data.map(r => ({
            place: r.place,
            delta: r.rating_delta || 0,
            date: r.tournament?.tournament_date || null,
        }));
        return _aggregateFromRows(rows);
    }

    async function detectLeaguePromotion(studentId, days) {
        days = days || 90;
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        if (!client) return null;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const { data, error } = await client
            .from('student_ratings')
            .select('rating, rating_date')
            .eq('student_id', studentId)
            .gte('rating_date', cutoffStr)
            .order('rating_date', { ascending: true });
        if (error || !data || data.length < 2) return null;

        return _detectCrossingFromRatings(data, days);
    }

    async function listTournaments(filters) {
        filters = filters || {};
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        if (!client) return { tournaments: [], total: 0 };

        const page = filters.page || 1;
        const pageSize = filters.pageSize || 20;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let q = client.from('tournaments').select('*', { count: 'exact' });
        if (filters.league) q = q.eq('league', filters.league);
        if (filters.dateFrom) q = q.gte('tournament_date', filters.dateFrom);
        if (filters.dateTo) q = q.lte('tournament_date', filters.dateTo);
        q = q.order('tournament_date', { ascending: false }).range(from, to);

        const { data, error, count } = await q;
        if (error) {
            console.error('listTournaments error', error);
            return { tournaments: [], total: 0 };
        }
        return { tournaments: data || [], total: count || 0, page, pageSize };
    }

    // Phase 5 — fetch every tournament participation for a student, oldest first.
    // Used by streak / season-summary widgets that need the full history.
    async function getStudentTournamentsAll(studentId) {
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        if (!client) return [];
        const { data, error } = await client
            .from('tournament_participants')
            .select(`
                id, place, rating_before, rating_after, rating_delta,
                tournament:tournaments(id, name, league, tournament_date)
            `)
            .eq('student_id', studentId);
        if (error || !data) {
            if (error) console.error('getStudentTournamentsAll error', error);
            return [];
        }
        return data
            .map(row => ({
                id: row.id,
                place: row.place,
                ratingBefore: row.rating_before,
                ratingAfter: row.rating_after,
                ratingDelta: row.rating_delta,
                tournamentId: row.tournament?.id,
                tournamentName: row.tournament?.name,
                league: row.tournament?.league,
                date: row.tournament?.tournament_date || null,
            }))
            .filter(r => r.date)
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    // Phase 5 — branch leaderboard. Calls the analytics-tournaments edge function
    // (action=branch_leaderboard) once per league. Pass league='All' (or no
    // league) to merge A / B / C into one top-10 ranking.
    //
    // `opts.fetch` is injectable for tests; defaults to global fetch.
    // `opts.config` overrides Supabase URL / API key (test seam).
    async function getBranchLeaderboard(branchId, league, opts) {
        if (!branchId) return [];
        opts = opts || {};
        const fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) return [];

        const config = opts.config || (typeof window !== 'undefined' && window.supabaseConfig) || {};
        const url = config.url || '';
        const apiKey = config.apiKey || 'ce-api-2026-k8x9m2p4q7w1';
        const days = Number.isFinite(opts.days) ? opts.days : 90;

        const leagues = (!league || league === 'All') ? ['A', 'B', 'C'] : [league];
        const allRows = [];

        for (const lg of leagues) {
            const endpoint = `${url}/functions/v1/analytics-tournaments`
                + `?action=branch_leaderboard`
                + `&branch_id=${encodeURIComponent(branchId)}`
                + `&league=${encodeURIComponent(lg)}`
                + `&days=${days}`;
            try {
                const resp = await fetchFn(endpoint, {
                    method: 'GET',
                    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
                });
                if (!resp || !resp.ok) continue;
                const body = await resp.json();
                if (body && body.success && Array.isArray(body.data)) {
                    for (const row of body.data) {
                        allRows.push({ ...row, league: lg });
                    }
                }
            } catch (e) {
                console.error(`getBranchLeaderboard fetch error (league ${lg})`, e);
            }
        }

        return _aggregateLeaderboard(allRows);
    }

    async function getTournamentDetail(tournamentId) {
        const client = (typeof window !== 'undefined' && window.supabaseClient) || null;
        if (!client) return null;
        const { data: t, error: tErr } = await client
            .from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single();
        if (tErr || !t) return null;

        const { data: parts, error: pErr } = await client
            .from('tournament_participants')
            .select(`
                id, place, rating_before, rating_after, rating_delta, raw_name,
                student:students(id, first_name, last_name)
            `)
            .eq('tournament_id', tournamentId)
            .order('place', { ascending: true });

        return {
            tournament: t,
            participants: pErr ? [] : (parts || []).map(p => ({
                id: p.id,
                place: p.place,
                ratingBefore: p.rating_before,
                ratingAfter: p.rating_after,
                ratingDelta: p.rating_delta,
                rawName: p.raw_name,
                studentId: p.student?.id,
                studentName: p.student ? `${p.student.first_name} ${p.student.last_name}` : p.raw_name,
            })),
        };
    }

    // ----- export ---------------------------------------------------------

    const tournamentsData = {
        extractTextFromTournamentFile,
        parseSwissManagerCSV,
        matchParticipants,
        importTournament,
        getStudentTournaments,
        getStudentTournamentsAll,
        getStudentTournamentAggregates,
        detectLeaguePromotion,
        listTournaments,
        getTournamentDetail,
        computeStreak,
        computeSeasonSummary,
        getBranchLeaderboard,
        // internal helpers exposed for tests
        _internal: {
            levenshteinDistance,
            fuzzyMatchStudent,
            parseDDMMYYYY,
            parseDelta,
            nfc,
            _cadenceFromDate,
            _leagueFromRating,
            _aggregateFromRows,
            _detectCrossingFromRatings,
            _aggregateLeaderboard,
            _extractDate,
        },
    };

    if (typeof window !== 'undefined') {
        window.tournamentsData = tournamentsData;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = tournamentsData;
    }
})();
