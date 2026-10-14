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

// ─── amoCRM link ────────────────────────────────────────────────────────────

// Parse a positive integer amoCRM customer id from a JSON number or a numeric
// string. Returns null for 0, negatives, floats, unsafe integers and junk.
export function parseAmocrmId(raw) {
  let n = null;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^[0-9]+$/.test(raw.trim())) n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Validate a link_amocrm body. Returns { value } or { field } naming the first
// invalid field.
export function validateLinkAmocrm(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!isUuid(b.student_id)) return { field: 'student_id' };
  const amo = parseAmocrmId(b.amocrm_customer_id);
  if (amo === null) return { field: 'amocrm_customer_id' };
  return { value: { student_id: b.student_id, amocrm_customer_id: amo } };
}

// What linking `requested` onto a student whose current value is `current`
// means: 'link' (empty → write), 'same' (idempotent no-op) or 'conflict'
// (a different id is already set — never overwritten).
export function classifyLink(current, requested) {
  if (current === null || current === undefined) return 'link';
  return Number(current) === requested ? 'same' : 'conflict';
}

// Link flow for POST ?action=link_amocrm, over an injected db adapter so the
// exact orchestration is unit-testable:
//   db.getStudent(id)       → { id, amocrm_customer_id } | null
//   db.findOwnerId(amo)     → id of the student holding amo | null
//   db.setIfNull(id, amo)   → { row } (row null when 0 rows matched) | { uniqueViolation: true }
// setIfNull is the single conditional UPDATE … WHERE amocrm_customer_id IS NULL,
// so the write is atomic; the earlier reads only pick a precise error. Only
// students.amocrm_customer_id is ever written. Returns { status, body }.
export async function linkAmocrm(db, { student_id, amocrm_customer_id: amo }) {
  const done = (changed, id) => ({ status: 200, body: { ok: true, changed, student: { id, amocrm_customer_id: amo } } });
  const conflict = (ownerId) => ({
    status: 409,
    body: { ok: false, reason: 'amocrm_customer_id_conflict', ...(ownerId ? { conflict_student_id: ownerId } : {}) },
  });
  const settle = (row) => {
    if (!row) return { status: 404, body: { ok: false, reason: 'not_found' } };
    const c = classifyLink(row.amocrm_customer_id, amo);
    if (c === 'same') return done(false, row.id);
    if (c === 'conflict') return conflict(null);
    return null;
  };

  const current = await db.getStudent(student_id);
  const pre = settle(current);
  if (pre) return pre;

  const ownerId = await db.findOwnerId(amo);
  if (ownerId && ownerId !== student_id) return conflict(ownerId);

  const r = await db.setIfNull(student_id, amo);
  if (r.uniqueViolation) return conflict(await db.findOwnerId(amo));
  if (r.row) return done(true, r.row.id);

  // 0 rows: a concurrent request set the column first — re-read and classify.
  const post = settle(await db.getStudent(student_id));
  if (post) return post;
  throw new Error('link_amocrm: conditional update matched 0 rows but column is still empty');
}

// ─── Contact update (overwrite) ─────────────────────────────────────────────

// Validate an update_contact body. A field is "provided" when its key is not
// undefined; null is NOT a clear request — it fails validation like any junk.
// Returns { value } (only provided fields, normalized) or { field }.
export function validateUpdateContact(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!isUuid(b.student_id)) return { field: 'student_id' };
  if (b.phone === undefined && b.amocrm_customer_id === undefined) return { field: 'body' };
  const value = { student_id: b.student_id };
  if (b.phone !== undefined) {
    const phone = normalizePhone(b.phone);
    if (!phone) return { field: 'phone' };
    value.phone = phone;
  }
  if (b.amocrm_customer_id !== undefined) {
    const amo = parseAmocrmId(b.amocrm_customer_id);
    if (amo === null) return { field: 'amocrm_customer_id' };
    value.amocrm_customer_id = amo;
  }
  return { value };
}

// Update flow for POST ?action=update_contact (explicit overwrite path —
// link_amocrm never overwrites), over an injected db adapter:
//   db.getStudent(id)        → shaped student ({ id, phone, amocrm_customer_id, … }) | null
//   db.findOwnerId(amo)      → id of the student holding amo | null
//   db.update(id, patch)     → { row } (shaped, null when 0 rows) | { uniqueViolation: true }
// The patch only ever contains parent_phone and/or amocrm_customer_id, and only
// the provided values that differ from the current ones. Phone is not unique
// (siblings share a parent's phone), so only the amoCRM id is conflict-checked.
// Returns { status, body }.
export async function updateContact(db, { student_id, phone = undefined, amocrm_customer_id: amo = undefined }) {
  const notFound = { status: 404, body: { ok: false, reason: 'not_found' } };
  const conflict = (ownerId) => ({
    status: 409,
    body: { ok: false, reason: 'amocrm_customer_id_conflict', ...(ownerId ? { conflict_student_id: ownerId } : {}) },
  });

  const current = await db.getStudent(student_id);
  if (!current) return notFound;

  const patch = {};
  if (phone !== undefined && current.phone !== phone) patch.parent_phone = phone;
  if (amo !== undefined && classifyLink(current.amocrm_customer_id, amo) !== 'same') patch.amocrm_customer_id = amo;
  // Reported with the API's field names (parent_phone is exposed as `phone`).
  const updated_fields = Object.keys(patch).map((k) => (k === 'parent_phone' ? 'phone' : k));
  if (updated_fields.length === 0) return { status: 200, body: { ok: true, changed: false, student: current } };

  if (patch.amocrm_customer_id !== undefined) {
    const ownerId = await db.findOwnerId(amo);
    if (ownerId && ownerId !== student_id) return conflict(ownerId);
  }

  const r = await db.update(student_id, patch);
  if (r.uniqueViolation) return conflict(await db.findOwnerId(amo));
  if (!r.row) return notFound;
  return {
    status: 200,
    body: {
      ok: true,
      changed: true,
      updated_fields,
      previous: { phone: current.phone ?? null, amocrm_customer_id: current.amocrm_customer_id ?? null },
      student: r.row,
    },
  };
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
