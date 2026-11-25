// Pure, runtime-agnostic helpers for the analytics-tournaments edge function.
//
// Imported by index.ts (Deno) AND unit-tested under Node
// (tests/test-analytics-tournaments-roster.js) — no re-implementation / drift.
// No imports: keep this file dependency-free so Node tests need no install.

// League thresholds — mirror migration 038 calc_league_from_rating().
export function calcLeagueFromRating(rating) {
  if (rating == null || !Number.isFinite(rating)) return null;
  if (rating > 800) return 'A';
  if (rating >= 450) return 'B';
  return 'C';
}

const present = (v) => v !== undefined && v !== null && v !== '';
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const personName = (first, last) => `${first || ''} ${last || ''}`.trim() || null;

// PostgREST caps a response at 1000 rows; .in() id lists stay ≤ 200 so the
// request URL stays well under the gateway limit.
export const PAGE_SIZE = 1000;
export const IN_CHUNK = 200;

export function chunk(arr, size = IN_CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Page through a PostgREST query until a short page. `page(from, to)` must
// return the { data, error } of the query with .range(from, to) applied.
/**
 * @param {(from: number, to: number) => PromiseLike<{ data: any[] | null, error: any }>} page
 * @returns {Promise<any[]>}
 */
export async function fetchAll(page) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// ─── Result uploads (tournament_results ⋈ tournaments_uploads) ──────────────

// ?league= value ↔ tournaments_uploads.kind.
export const LEAGUE_KINDS = { B: 'league_b', C: 'league_c', R3: 'razryad_3', R4: 'razryad_4' };
const KIND_LEAGUES = Object.fromEntries(Object.entries(LEAGUE_KINDS).map(([l, k]) => [k, l]));

export const KIND_LABELS = {
  league_b: 'League B',
  league_c: 'League C',
  razryad_3: '3rd Razryad Qualifier',
  razryad_4: '4th Razryad Qualifier',
};

// Display label for an upload, e.g. "League B (2026-11-22)".
export function tournamentName(upload) {
  if (!upload) return null;
  return `${KIND_LABELS[upload.kind] || upload.kind} (${upload.tournament_date})`;
}

// student_history row from a tournament_results row + its upload.
export function historyRow(r, upload) {
  const before = r.rating_before;
  const delta = r.rating_delta;
  return {
    id: r.id,
    place: r.rank,
    rating_before: before,
    rating_after: before != null && delta != null ? Number(before) + Number(delta) : null,
    rating_delta: delta,
    tournament_id: r.upload_id,
    tournament_name: tournamentName(upload),
    league: KIND_LEAGUES[upload.kind] || null,
    kind: upload.kind,
    tournament_date: upload.tournament_date,
    score: r.score,
    games_played: r.games_played,
    earned_razryad: r.earned_razryad ?? null,
  };
}

// Newest-first history rows + aggregates. `results` carry an embedded
// `upload` (tournaments_uploads); rows without one are dropped.
export function studentHistory(results, year) {
  const rows = (results || [])
    .filter((r) => r.upload)
    .map((r) => historyRow(r, r.upload))
    .sort((a, b) => String(b.tournament_date || '').localeCompare(String(a.tournament_date || '')));
  const places = rows.map((r) => r.place).filter(Number.isFinite);
  const deltas = rows.map((r) => r.rating_delta).filter(Number.isFinite);
  return {
    tournaments: rows,
    aggregates: {
      total: rows.length,
      ytd: rows.filter((r) => String(r.tournament_date || '').startsWith(`${year}-`)).length,
      best_place: places.length ? Math.min(...places) : null,
      avg_place: places.length ? Math.round(places.reduce((a, b) => a + b, 0) / places.length) : null,
      total_rating_gained: deltas.reduce((a, b) => a + b, 0),
      last_date: rows[0]?.tournament_date || null,
    },
  };
}

// Per-student leaderboard over results (rated entries only: games_played ≥ 1)
// for the given students map { id: students row }. Sorted by avg_place asc.
export function branchLeaderboard(results, studentsById) {
  const byStudent = new Map();
  for (const r of results || []) {
    const s = studentsById[r.student_id];
    if (!s || !((Number(r.games_played) || 0) >= 1) || !Number.isFinite(r.rank)) continue;
    const slot = byStudent.get(s.id) || { s, places: [], deltas: [] };
    slot.places.push(r.rank);
    if (Number.isFinite(r.rating_delta)) slot.deltas.push(r.rating_delta);
    byStudent.set(s.id, slot);
  }
  return [...byStudent.values()]
    .map(({ s, places, deltas }) => ({
      student_id: s.id,
      student_code: s.student_code,
      first_name: s.first_name,
      last_name: s.last_name,
      tournaments_played: places.length,
      avg_place: Math.round((places.reduce((a, b) => a + b, 0) / places.length) * 100) / 100,
      best_place: Math.min(...places),
      total_rating_gained: deltas.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.avg_place - b.avg_place);
}

// tournament_registrations row (+ embedded student) → detail registration.
// external_contact is never selected nor returned.
export function registrationRow(r) {
  const s = r.student;
  return {
    id: r.id,
    student_id: r.student_id ?? null,
    student_code: s?.student_code ?? null,
    name: (s && personName(s.first_name, s.last_name)) || r.display_name || r.player_name || null,
    branch_id: s?.branch_id ?? null,
    registered_at: r.registered_at,
    source: r.source ?? null,
  };
}

// ─── student_roster ─────────────────────────────────────────────────────────

export const ROSTER_STATUSES = ['active', 'frozen', 'left', 'all'];
export const ROSTER_DEFAULT_LIMIT = 100;
export const ROSTER_MAX_LIMIT = 200;
export const ADMISSION_LEVEL = 2;
export const STEP2_AUDIT_SINCE = '2026-02-05';
export const LAST_30D_DAYS = 30;

export const ROSTER_RULES = {
  admitted: 'current_level >= 2',
  league_a: 'rating > 800',
  league_b: 'rating >= 450 and <= 800',
  league_c: 'rating < 450',
  step2_date_available_since: STEP2_AUDIT_SINCE,
  last_30d_window: 'tournament_date >= as_of date - 30 days (UTC)',
};

// GET ?action=student_roster params → { value } or { field }. after_id
// (keyset) wins over offset when both are given.
export function parseStudentRosterParams(params) {
  const p = params || {};
  const status = present(p.status) ? p.status : 'active';
  if (!ROSTER_STATUSES.includes(status)) return { field: 'status' };
  const limit = present(p.limit) ? Number(p.limit) : ROSTER_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ROSTER_MAX_LIMIT) return { field: 'limit' };
  const offset = present(p.offset) ? Number(p.offset) : 0;
  if (!Number.isInteger(offset) || offset < 0) return { field: 'offset' };
  const afterId = present(p.after_id) ? p.after_id : null;
  if (afterId !== null && !isUuid(afterId)) return { field: 'after_id' };
  return { value: { status, limit, offset: afterId ? 0 : offset, after_id: afterId } };
}

// Keyset cursor for the next page: the last id of a full page, else null.
export function nextAfterId(rows, limit) {
  return rows.length === limit && rows.length > 0 ? rows[rows.length - 1].id : null;
}

// First UTC date inside the 30-day window ending at as_of.
export function last30dCutoff(asOf) {
  const d = new Date(`${String(asOf).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - LAST_30D_DAYS);
  return d.toISOString().slice(0, 10);
}

// audit_log current_level UPDATE rows → { student_id: 'YYYY-MM-DD' } of the
// earliest crossing into step ≥ 2 (old < 2, new ≥ 2; jumps like 1→3 count).
export function step2Dates(auditRows) {
  const out = {};
  for (const a of auditRows || []) {
    const oldLevel = parseInt(a.old_value, 10);
    const newLevel = parseInt(a.new_value, 10);
    if (!(oldLevel < ADMISSION_LEVEL && newLevel >= ADMISSION_LEVEL) || !a.changed_at) continue;
    const ts = new Date(a.changed_at).toISOString();
    if (!out[a.entity_id] || ts < out[a.entity_id]) out[a.entity_id] = ts;
  }
  for (const id of Object.keys(out)) out[id] = out[id].slice(0, 10);
  return out;
}

// tournament_results rows (student_id, upload_id) + { upload_id: date } →
// { student_id: { total, last_30d, last_date } } over DISTINCT uploads.
export function tournamentStats(results, uploadDates, asOf) {
  const cutoff = last30dCutoff(asOf);
  const uploadsByStudent = new Map();
  for (const r of results || []) {
    const set = uploadsByStudent.get(r.student_id) || new Set();
    set.add(r.upload_id);
    uploadsByStudent.set(r.student_id, set);
  }
  const out = {};
  for (const [studentId, uploads] of uploadsByStudent) {
    const dates = [...uploads].map((u) => uploadDates[u]).filter(Boolean);
    out[studentId] = {
      total: uploads.size,
      last_30d: dates.filter((d) => d >= cutoff).length,
      last_date: dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null,
    };
  }
  return out;
}

// students row + lookups → student_roster row. No phone / email fields.
export function studentRosterRow(s, { branchNames = {}, coachNames = {}, ratings = {}, step2 = {}, stats = {} } = {}) {
  const level = s.current_level ?? null;
  const admitted = Number.isInteger(level) && level >= ADMISSION_LEVEL;
  const step2Date = step2[s.id] || null;
  const rating = ratings[s.id];
  const ratingValue = rating && rating.rating != null && Number.isFinite(Number(rating.rating))
    ? Math.round(Number(rating.rating))
    : null;
  const st = stats[s.id];
  return {
    student_id: s.id,
    student_code: s.student_code ?? null,
    full_name: personName(s.first_name, s.last_name),
    branch_id: s.branch_id ?? null,
    branch_name: (s.branch_id && branchNames[s.branch_id]) || null,
    trainer_id: s.coach_id ?? null,
    trainer_name: (s.coach_id && coachNames[s.coach_id]) || null,
    status: s.status,
    current_level: level,
    admitted_to_tournaments: admitted,
    step2_date: step2Date,
    step2_date_known: step2Date !== null || !admitted,
    current_rating: ratingValue,
    current_rating_date: ratingValue !== null ? rating.rating_date ?? null : null,
    current_league: calcLeagueFromRating(ratingValue),
    razryad: s.razryad ?? null,
    amocrm_customer_id: s.amocrm_customer_id != null ? String(s.amocrm_customer_id) : null,
    student_created_at: s.created_at ?? null,
    tournaments_total: st ? st.total : 0,
    tournaments_last_30d: st ? st.last_30d : 0,
    last_tournament_date: st ? st.last_date : null,
  };
}

// { id: "First Last" } from rows with id / first_name / last_name.
export function nameMap(rows) {
  const out = {};
  for (const r of rows || []) out[r.id] = personName(r.first_name, r.last_name);
  return out;
}
