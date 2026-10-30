// Pure, runtime-agnostic helpers for the analytics-coaches edge function
// (PRD_COACH_REPORTS.md). Imported by index.ts (Deno) and unit-tested under
// Node (tests/test-coach-reports-logic.mjs). No dependencies.

// Asia/Almaty has been UTC+5 all year since 2024-03-01 (no DST). A fixed
// offset keeps period windows independent of the runtime's tzdata.
export const ALMATY_OFFSET = '+05:00';
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

export const PERIODS = ['week', 'month', 'quarter', 'half', 'year'];

// Composite score weights (sum = 100). Every sub-score is a 0..1 rate.
export const REPORT_WEIGHTS = {
  retention: 30,
  net_growth: 20,
  razryad_promotions: 20,
  tournament_participation: 15,
  podiums: 15,
};

export const SMALL_SAMPLE_MIN_ACTIVE = 10;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// Strict YYYY-MM-DD → Date at UTC midnight of that calendar day, else null.
function parseDate(s) {
  const m = typeof s === 'string' ? DATE_RE.exec(s) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

const fmt = (d) => d.toISOString().slice(0, 10);

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

// Calendar date in Almaty for an instant (ms since epoch).
export function almatyDate(nowMs) {
  return fmt(new Date(nowMs + ALMATY_OFFSET_MS));
}

// Default report date: yesterday in Almaty, so a run on the first day of a
// period (Monday / 1st) reports the period that just ended.
export function defaultReportDate(nowMs) {
  return addDays(almatyDate(nowMs), -1);
}

// Period containing `dateStr`: week = Mon–Sun, month, quarter = calendar Q,
// half = Jan–Jun / Jul–Dec, year. start/end are Almaty-midnight instants,
// end exclusive; end_date is the last day (inclusive).
export function resolvePeriod(period, dateStr) {
  const d = parseDate(dateStr);
  if (!d || !PERIODS.includes(period)) return null;
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  let start;
  let end;
  if (period === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    start = new Date(Date.UTC(y, mo, d.getUTCDate() - dow));
    end = new Date(Date.UTC(y, mo, d.getUTCDate() - dow + 7));
  } else {
    const months = { month: 1, quarter: 3, half: 6, year: 12 }[period];
    const first = Math.floor(mo / months) * months;
    start = new Date(Date.UTC(y, first, 1));
    end = new Date(Date.UTC(y, first + months, 1));
  }
  const endDate = new Date(end);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return {
    period,
    start_date: fmt(start),
    end_date: fmt(endDate),
    start: `${fmt(start)}T00:00:00${ALMATY_OFFSET}`,
    end: `${fmt(end)}T00:00:00${ALMATY_OFFSET}`,
  };
}

export function previousPeriod(win) {
  return resolvePeriod(win.period, addDays(win.start_date, -1));
}

// ?action=report params → { value: { period, date } } | { error }.
export function parseReportParams(params, nowMs) {
  const period = params.period;
  if (!PERIODS.includes(period)) return { error: `period must be one of: ${PERIODS.join(', ')}` };
  const date = params.date == null || params.date === '' ? defaultReportDate(nowMs) : params.date;
  if (!parseDate(date)) return { error: 'date must be a valid YYYY-MM-DD' };
  return { value: { period, date } };
}

// ?action=cohort_matrix params → { value: { coach_id } } | { error }.
// coach_id = 'all' → school + every coach in one call.
export function parseCohortParams(params) {
  const id = params.coach_id == null || params.coach_id === '' ? null : params.coach_id;
  if (id !== null && id !== 'all' && !isUuid(id)) return { error: "coach_id must be a UUID or 'all'" };
  return { value: { coach_id: id } };
}

// Kaplan–Meier S(t) for [{ months, event }] — same conventions as
// coach_report() in migration 101: product over distinct event times ≤ t of
// (1 − d/n), n = subjects with duration ≥ that time; null when follow-up ends
// before t with survival still > 0 (or no subjects).
export function kaplanMeier(samples, t) {
  if (!samples.length) return null;
  const times = [...new Set(samples.filter((s) => s.event && s.months <= t).map((s) => s.months))].sort((a, b) => a - b);
  let surv = 1;
  for (const time of times) {
    const d = samples.filter((s) => s.event && s.months === time).length;
    const n = samples.filter((s) => s.months >= time).length;
    surv *= 1 - d / n;
  }
  const maxMonths = Math.max(...samples.map((s) => s.months));
  return surv > 0 && maxMonths < t ? null : surv;
}

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Coach KPI top-3 finish rate, exactly as analytics-tournaments
// coach_leaderboard: podium finishes / played entries (games_played ≥ 1), 0
// without entries.
export function top3FinishRate(top3Count, entries) {
  return entries > 0 ? top3Count / entries : 0;
}

// The Coach KPI rate has no minimum-sample handling, so one podium from one
// entry would score 1. Shrink it toward the school rate with a prior worth
// PODIUM_PRIOR_ENTRIES entries; large samples converge to the KPI rate.
export const PODIUM_PRIOR_ENTRIES = 10;

export function podiumScore(finishes, entries, priorRate = 0) {
  if (!(entries > 0)) return top3FinishRate(finishes, entries);
  return clamp01((finishes + PODIUM_PRIOR_ENTRIES * clamp01(priorRate)) / (entries + PODIUM_PRIOR_ENTRIES));
}

// Sub-scores 0..1 for one coach_report row.
//   retention:  KM 6-month survival (3-month if 6 is unknown; 0.5 if neither)
//   net_growth: 0.5 ± (new − left) / active × 5 (±10 % of roster → 1 / 0)
//   razryad_promotions: promotions / active × 4 (25 % of roster → 1)
//   tournament_participation: share of active students with ≥ 1 tournament
//   podiums: podiumScore (Coach KPI top-3 rate, shrunk toward podiumPrior)
export function subScores(row, podiumPrior = 0) {
  const active = row.active_students || 0;
  const r = row.retention || {};
  const km = r.km_survival_6m ?? r.km_survival_3m;
  const zeroBucket = row.participation?.period?.['0']?.count ?? active;
  const pod = row.podiums || {};
  return {
    retention: km == null ? 0.5 : clamp01(Number(km)),
    net_growth: active > 0 ? clamp01(0.5 + (row.net_growth / active) * 5) : 0.5,
    razryad_promotions: active > 0 ? clamp01(((row.razryad_changes?.promotions || 0) / active) * 4) : 0,
    tournament_participation: active > 0 ? clamp01((active - zeroBucket) / active) : 0,
    podiums: podiumScore(pod.finishes || 0, pod.entries || 0, podiumPrior),
  };
}

export function compositeScore(sub, weights = REPORT_WEIGHTS) {
  const total = Object.keys(weights).reduce((acc, k) => acc + weights[k] * (sub[k] || 0), 0);
  return Math.round(total * 10) / 10;
}

// Competition ranking ("1224"): equal values share a rank. Higher is better.
export function competitionRanks(items, valueOf) {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map();
  sorted.forEach((it, i) => {
    const prev = sorted[i - 1];
    ranks.set(it, i > 0 && valueOf(prev) === valueOf(it) ? ranks.get(prev) : i + 1);
  });
  return ranks;
}

// A real coach with something to rank (roster or movement in the window).
export function isRanked(row) {
  return row.coach_id != null
    && (row.active_students > 0 || row.new_students > 0 || row.left > 0 || row.frozen_30d > 0);
}

// coach_report() rows → ranked rows (score, sub_scores, overall rank, per-metric
// ranks); unranked coaches keep rank null and go last. `school` (the school
// row) gives the podium prior.
export function rankCoaches(rows, weights = REPORT_WEIGHTS, school = null) {
  const prior = top3FinishRate(school?.podiums?.finishes || 0, school?.podiums?.entries || 0);
  const scored = rows.filter((r) => r.coach_id != null).map((r) => {
    const sub = subScores(r, prior);
    return { ...r, sub_scores: sub, score: compositeScore(sub, weights), rank: null, ranks: {} };
  });
  const ranked = scored.filter(isRanked);
  const overall = competitionRanks(ranked, (r) => r.score);
  for (const r of ranked) r.rank = overall.get(r);
  for (const metric of Object.keys(weights)) {
    const ranks = competitionRanks(ranked, (r) => r.sub_scores[metric]);
    for (const r of ranked) r.ranks[metric] = ranks.get(r);
  }
  return scored.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.coach_name.localeCompare(b.coach_name));
}

// Biggest score changes vs the previous period among coaches ranked in both.
export function movers(current, previous, limit = 3) {
  const prevById = new Map(previous.filter((r) => r.rank != null).map((r) => [r.coach_id, r]));
  const deltas = current.filter((r) => r.rank != null && prevById.has(r.coach_id)).map((r) => {
    const p = prevById.get(r.coach_id);
    return {
      coach_id: r.coach_id,
      coach_name: r.coach_name,
      score: r.score,
      previous_score: p.score,
      score_delta: Math.round((r.score - p.score) * 10) / 10,
      rank: r.rank,
      previous_rank: p.rank,
      rank_delta: p.rank - r.rank,
    };
  });
  return {
    up: deltas.filter((d) => d.score_delta > 0).sort((a, b) => b.score_delta - a.score_delta).slice(0, limit),
    down: deltas.filter((d) => d.score_delta < 0).sort((a, b) => a.score_delta - b.score_delta).slice(0, limit),
  };
}

// Final ?action=report payload from two coach_report() results.
export function buildReport({ window, previousWindow, current, previous, weights = REPORT_WEIGHTS }) {
  const coaches = rankCoaches(current.coaches || [], weights, current.school);
  const prevCoaches = rankCoaches(previous.coaches || [], weights, previous.school);
  return {
    period: window,
    previous_period: previousWindow,
    generated_at: current.generated_at ?? null,
    weights,
    coaches,
    unattributed: (current.coaches || []).find((r) => r.coach_id == null) ?? null,
    school: current.school ?? null,
    data_notes: current.data_notes ?? null,
    previous: {
      coaches: prevCoaches.map((r) => ({ coach_id: r.coach_id, coach_name: r.coach_name, score: r.score, rank: r.rank })),
      school: previous.school ?? null,
    },
    movers: movers(coaches, prevCoaches),
  };
}
