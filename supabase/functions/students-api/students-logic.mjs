// Pure, runtime-agnostic helpers for the students-api edge function.
//
// Kept in a dependency-free .mjs module (no Deno URL imports) so the exact same
// code can be imported by the Deno edge function (index.ts) AND unit-tested
// under Node (tests/test-students-api-logic.mjs) — no re-implementation / drift.

// Coaches must win over automation: an API freeze/activate is refused when the
// most recent *manual* (dashboard) status change is younger than this window.
export const MANUAL_GUARD_DAYS = 3;

// Allowed actor types recorded on student_status_history.changed_by_type.
export const CHANGED_BY_TYPES = ['api', 'manual', 'system'];

// Normalize a KZ/RU phone number to canonical +7XXXXXXXXXX form.
// Strips spaces/dashes/parens/dots/plus, maps a leading domestic 8 → 7, and
// promotes a bare 10-digit local number to +7…. Returns null when the input
// cannot be coerced into a valid 11-digit +7 number.
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits[0] === '8') {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10) {
    digits = '7' + digits;
  }
  if (digits.length !== 11 || digits[0] !== '7') return null;
  return '+' + digits;
}

// The last-10-digit core of a normalized phone — the key used for dedup lookups
// (matches regardless of how the stored parent_phone happens to be formatted).
export function phoneDigits(normalized) {
  if (typeof normalized !== 'string') return '';
  return normalized.replace(/[^0-9]/g, '').slice(-10);
}

// Split a free-text full name into first/last. First whitespace-delimited token
// is the first name; the remainder (possibly empty) is the last name.
export function splitFullName(fullName) {
  const parts = String(fullName == null ? '' : fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

// Hard product rule guard: true when the latest *typed* status-history row is a
// recent manual (coach/dashboard) change, so an automated status write must be
// refused. `latestTypedRow` is the most recent row whose changed_by_type is set
// (NULL-typed trigger rows are ignored by the caller's query).
export function isManualChangeRecent(latestTypedRow, nowMs, windowDays = MANUAL_GUARD_DAYS) {
  if (!latestTypedRow || latestTypedRow.changed_by_type !== 'manual') return false;
  const ts = Date.parse(latestTypedRow.created_at);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < windowDays * 24 * 60 * 60 * 1000;
}

export function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ─── Puzzle Rush (survival) ─────────────────────────────────────────────────

// Upper bound for a pushed Puzzle Rush Survival score — anything above is
// treated as bogus input rather than a real run.
export const SURVIVAL_SCORE_MAX = 200;
export const LEADERBOARD_SCOPES = ['school', 'branch'];
export const LEADERBOARD_PERIODS = ['week', 'month', 'all'];
export const LEADERBOARD_MAX_LIMIT = 500;
// Ranking windows are local to the school (Asia/Almaty), never UTC.
export const LEADERBOARD_TZ = 'Asia/Almaty';

export function isValidSurvivalScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= SURVIVAL_SCORE_MAX;
}

// Validate a survival-score push body. Returns { value } with the normalized
// insert fields, or { field } naming the first invalid field.
export function validateSurvivalPush(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!isUuid(b.student_id)) return { field: 'student_id' };
  if (!isValidSurvivalScore(b.score)) return { field: 'score' };
  const ref = typeof b.external_ref === 'string' ? b.external_ref.trim() : '';
  if (!ref || ref.length > 200) return { field: 'external_ref' };
  let achievedAt = null;
  if (b.achieved_at !== undefined && b.achieved_at !== null) {
    const ts = typeof b.achieved_at === 'string' ? Date.parse(b.achieved_at) : NaN;
    if (!Number.isFinite(ts)) return { field: 'achieved_at' };
    achievedAt = new Date(ts).toISOString();
  }
  return { value: { student_id: b.student_id, score: b.score, external_ref: ref, achieved_at: achievedAt } };
}

// Parse leaderboard query params (strings or null). A branch_id without an
// explicit scope implies scope 'branch'. Returns { value } or { field }.
export function parseLeaderboardParams(params, defaultLimit = 50) {
  const p = params || {};
  const branchId = p.branch_id || null;
  const scope = p.scope || (branchId ? 'branch' : 'school');
  if (!LEADERBOARD_SCOPES.includes(scope)) return { field: 'scope' };
  if (branchId !== null && !isUuid(branchId)) return { field: 'branch_id' };
  if (scope === 'branch' && !branchId) return { field: 'branch_id' };
  const period = p.period || 'all';
  if (!LEADERBOARD_PERIODS.includes(period)) return { field: 'period' };
  const studentId = p.student_id || null;
  if (studentId !== null && !isUuid(studentId)) return { field: 'student_id' };
  let limit = defaultLimit;
  if (p.limit !== undefined && p.limit !== null && p.limit !== '') {
    limit = Number(p.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LEADERBOARD_MAX_LIMIT) return { field: 'limit' };
  }
  return {
    value: {
      scope, period,
      branch_id: scope === 'branch' ? branchId : null,
      student_id: studentId, limit,
    },
  };
}

// (local wall-clock − UTC) in ms for `tz` at instant `ms`.
function tzOffsetMs(ms, tz) {
  const parts = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))) parts[type] = value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Start of the ranking window containing `nowMs`, mirroring the SQL
// puzzle_rush_window_start(): week = Monday 00:00 Almaty, month = 1st 00:00
// Almaty, 'all' = null. Returns a Date (UTC instant) or null.
export function almatyWindowStart(period, nowMs) {
  if (period !== 'week' && period !== 'month') return null;
  const local = new Date(nowMs + tzOffsetMs(nowMs, LEADERBOARD_TZ));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const startLocal = period === 'week'
    ? Date.UTC(y, m, local.getUTCDate() - ((local.getUTCDay() + 6) % 7))
    : Date.UTC(y, m, 1);
  const guess = startLocal - tzOffsetMs(nowMs, LEADERBOARD_TZ);
  return new Date(startLocal - tzOffsetMs(guess, LEADERBOARD_TZ));
}
