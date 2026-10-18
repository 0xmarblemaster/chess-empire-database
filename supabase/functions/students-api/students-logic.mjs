// Pure, runtime-agnostic helpers for the students-api edge function.
//
// Imported by the Deno edge functions (students-api, analytics-*,
// tournaments-api) AND unit-tested under Node (tests/test-students-api-logic.mjs)
// — no re-implementation / drift. The only dependency is the bare specifier
// 'libphonenumber-js/max': Node resolves it from node_modules (devDependency),
// Deno through the deno.json import map of every function importing this file.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// Coaches must win over automation: an API freeze/activate is refused when the
// most recent *manual* (dashboard) status change is younger than this window.
export const MANUAL_GUARD_DAYS = 3;

// Allowed actor types recorded on student_status_history.changed_by_type.
export const CHANGED_BY_TYPES = ['api', 'manual', 'system'];

// Normalize a phone number to E.164 (+<country code><national number>), checked
// against the libphonenumber "max" metadata. International input (leading +
// or 00) keeps its country code; legacy KZ/RU input without a prefix is
// promoted to +7 (8XXXXXXXXXX / 7XXXXXXXXXX / bare 10 digits). Spaces, dashes,
// parens and dots are ignored. Returns null for anything invalid or impossible
// — the country code is never guessed, truncated or rewritten.
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\+?[0-9\s().-]+$/.test(s)) return null;
  const digits = s.replace(/[^0-9]/g, '');
  let intl = null;
  if (s[0] === '+') intl = '+' + digits;
  else if (digits.startsWith('00')) intl = '+' + digits.slice(2);
  else if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) intl = '+7' + digits.slice(1);
  else if (digits.length === 10) intl = '+7' + digits;
  if (!intl) return null;
  const parsed = parsePhoneNumberFromString(intl);
  return parsed && parsed.isValid() ? parsed.number : null;
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

// ─── Student code (CE-00001) ────────────────────────────────────────────────

// Values of students.status (CHECK constraint in supabase-schema.sql).
export const STUDENT_STATUSES = ['active', 'frozen', 'left'];

// Normalize a human-readable Student ID: trim + uppercase, then require the
// exact DB format (CE- and at least 5 digits — 'ce-452' is NOT padded for you).
// Returns the canonical code or null.
export function parseStudentCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^CE-[0-9]{5,}$/.test(code) ? code : null;
}

const present = (v) => v !== undefined && v !== null && v !== '';

// Pick the student selector from a body / query: student_id (UUID) and/or
// student_code. Returns { value: { student_id?, student_code? } } or { field }
// naming the first invalid one; with neither given, { field: 'student_id' }
// (unless required is false → { value: {} }).
export function parseStudentRef(src, { required = true } = {}) {
  const b = src && typeof src === 'object' ? src : {};
  const value = {};
  if (present(b.student_id)) {
    if (!isUuid(b.student_id)) return { field: 'student_id' };
    value.student_id = b.student_id;
  }
  if (present(b.student_code)) {
    const code = parseStudentCode(b.student_code);
    if (!code) return { field: 'student_code' };
    value.student_code = code;
  }
  if (required && !value.student_id && !value.student_code) return { field: 'student_id' };
  return { value };
}

// Resolve a parsed ref to a student UUID over an injected adapter:
//   db.findIdByCode(code) → id | null
// Without a code the id is returned as-is (no read — callers keep their own
// not-found handling). Returns { id } or { error: { status, body } }: 404 for
// an unknown code, 400 student_id_code_mismatch when both are given and name
// different students.
export async function resolveStudentRef(db, ref) {
  if (!ref.student_code) return { id: ref.student_id };
  const id = await db.findIdByCode(ref.student_code);
  if (!id) return { error: { status: 404, body: { ok: false, reason: 'not_found' } } };
  if (ref.student_id && ref.student_id.toLowerCase() !== String(id).toLowerCase()) {
    return { error: { status: 400, body: { ok: false, reason: 'student_id_code_mismatch' } } };
  }
  return { id };
}

// resolveStudentRef adapter over a supabase-js client (students-api, the
// analytics-* functions and tournaments-api share it).
export function studentCodeLookup(supabase) {
  return {
    async findIdByCode(code) {
      const { data, error } = await supabase
        .from('students').select('id').eq('student_code', code).maybeSingle();
      if (error) throw error;
      return data ? data.id : null;
    },
  };
}

// Read-only analytics filters: map ?student_id / ?student_code to a UUID.
// Returns { id } (null when neither is given) or { status, error } in the
// analytics `{success:false, error}` message style.
export async function resolveStudentParam(db, params) {
  const ref = parseStudentRef(params, { required: false });
  if (!ref.value) return { status: 400, error: `Invalid parameter: ${ref.field}` };
  if (!ref.value.student_id && !ref.value.student_code) return { id: null };
  const r = await resolveStudentRef(db, ref.value);
  if (r.error) return { status: r.error.status, error: r.error.status === 404 ? 'Student not found' : r.error.body.reason };
  return { id: r.id };
}

export const LIST_DEFAULT_LIMIT = 100;
export const LIST_MAX_LIMIT = 500;

// Parse GET ?action=list params (strings or null). Returns { value } or { field }.
export function parseListParams(params) {
  const p = params || {};
  const int = (raw, dflt) => (present(raw) ? Number(raw) : dflt);
  const limit = int(p.limit, LIST_DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) return { field: 'limit' };
  const offset = int(p.offset, 0);
  if (!Number.isInteger(offset) || offset < 0) return { field: 'offset' };
  const branchId = present(p.branch_id) ? p.branch_id : null;
  if (branchId !== null && !isUuid(branchId)) return { field: 'branch_id' };
  const status = present(p.status) ? p.status : null;
  if (status !== null && !STUDENT_STATUSES.includes(status)) return { field: 'status' };
  return { value: { limit, offset, branch_id: branchId, status } };
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
  const ref = parseStudentRef(b);
  if (!ref.value) return ref;
  const amo = parseAmocrmId(b.amocrm_customer_id);
  if (amo === null) return { field: 'amocrm_customer_id' };
  return { value: { ...ref.value, amocrm_customer_id: amo } };
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
  const ref = parseStudentRef(b);
  if (!ref.value) return ref;
  if (b.phone === undefined && b.amocrm_customer_id === undefined) return { field: 'body' };
  const value = { ...ref.value };
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

// ─── Create (Buyer-ID first, then phone + name) ─────────────────────────────

// Name key for the secondary phone match: NFC, trimmed, whitespace collapsed,
// lower-cased, ё → е.
export function normalizeName(raw) {
  return String(raw == null ? '' : raw)
    .normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
}

// Validate a create body. phone is optional when amocrm_customer_id is given
// (the Buyer ID is then the identity); absent = undefined / null / blank, and is
// stored as null. A phone that is present but invalid is always rejected.
// Returns { value } or { field } naming the first invalid field.
export function validateCreate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const name = splitFullName(typeof b.full_name === 'string' ? b.full_name : '');
  if (!name) return { field: 'full_name' };
  const phoneGiven = b.phone !== undefined && b.phone !== null && !(typeof b.phone === 'string' && b.phone.trim() === '');
  const phone = phoneGiven ? normalizePhone(b.phone) : null;
  if (phoneGiven && !phone) return { field: 'phone' };
  if (!phoneGiven && !present(b.amocrm_customer_id)) return { field: 'phone' };
  if (!isUuid(b.branch_id)) return { field: 'branch_id' };
  let amo = null;
  if (present(b.amocrm_customer_id)) {
    amo = parseAmocrmId(b.amocrm_customer_id);
    if (amo === null) return { field: 'amocrm_customer_id' };
  }
  return { value: { ...name, full_name: b.full_name, phone, branch_id: b.branch_id, amocrm_customer_id: amo } };
}

// Create flow for POST ?action=create, over an injected db adapter:
//   db.branchExists(id)        → boolean
//   db.findByAmocrmId(amo)     → shaped students[]
//   db.findByPhone(e164)       → shaped students[] (exact E.164 match)
//   db.linkIfNull(id, amo)     → { row } (shaped, null when 0 rows) | { uniqueViolation: true }
//   db.insert(row)             → { row, status_history_id } | { uniqueViolation: true }
//   db.activate(student)       → applyStatusChange() result
// Order: (1) the Buyer ID owns a student → that student; (2) otherwise all
// students sharing the phone, matched by normalized full name: one match → that
// student (linking the Buyer ID when it has none; a different id → 409), several
// → 409 ambiguous with candidates, none → (3) a NEW student with the same phone.
// Nothing is written on any 4xx. A frozen match is reactivated (3-day guard
// applies inside db.activate). Returns { status, body }.
export async function createStudent(db, input) {
  const { first_name, last_name, full_name, phone, branch_id, amocrm_customer_id: amo } = input;
  const conflict = (ownerId) => ({
    status: 409,
    body: { ok: false, reason: 'amocrm_customer_id_conflict', ...(ownerId ? { conflict_student_id: ownerId } : {}) },
  });
  const existing = async (student, extra) => {
    if (student.status !== 'frozen') return { status: 200, body: { ok: true, existing: true, ...extra, student } };
    const r = await db.activate(student);
    if (r.refused) return { status: 200, body: { ok: true, existing: true, ...extra, reactivated: false, reason: r.reason, student } };
    return {
      status: 200,
      body: {
        ok: true, existing: true, ...extra, reactivated: true, student: r.student,
        status_history_id: r.status_history_id, chesster_poke: r.chesster_poke,
      },
    };
  };

  if (!(await db.branchExists(branch_id))) return { status: 400, body: { ok: false, reason: 'invalid_branch' } };

  if (amo !== null) {
    const owners = await db.findByAmocrmId(amo);
    if (owners.length > 1) return { status: 409, body: { ok: false, reason: 'ambiguous', candidates: owners } };
    if (owners.length === 1) return existing(owners[0], { matched_by: 'amocrm_customer_id' });
  }

  if (phone) {
    const key = normalizeName(full_name);
    const matches = (await db.findByPhone(phone))
      .filter((s) => normalizeName(`${s.first_name || ''} ${s.last_name || ''}`) === key);
    if (matches.length > 1) return { status: 409, body: { ok: false, reason: 'ambiguous', candidates: matches } };
    if (matches.length === 1) {
      const match = matches[0];
      const c = amo === null ? 'same' : classifyLink(match.amocrm_customer_id, amo);
      if (c === 'conflict') return conflict(match.id);
      if (c === 'same') return existing(match, { matched_by: 'phone_name' });
      const r = await db.linkIfNull(match.id, amo);
      if (r.uniqueViolation) return conflict((await db.findByAmocrmId(amo))[0]?.id);
      if (r.row) return existing(r.row, { matched_by: 'phone_name', linked: true });
      // 0 rows: a concurrent request set the column first — idempotent only if it is ours.
      const owner = (await db.findByAmocrmId(amo))[0];
      if (owner && owner.id === match.id) return existing(owner, { matched_by: 'phone_name' });
      return conflict(match.id);
    }
  }

  // New student. Defaults mirror the dashboard's addStudent() so NOT NULL
  // columns are satisfied; parent_phone stays null when no phone was given.
  const r = await db.insert({
    first_name, last_name, branch_id,
    parent_phone: phone,
    amocrm_customer_id: amo,
    status: 'active',
    razryad: 'none',
    current_level: 1,
    current_lesson: 1,
    total_lessons: 120,
  });
  if (r.uniqueViolation) return conflict(amo === null ? null : (await db.findByAmocrmId(amo))[0]?.id);
  return { status: 201, body: { ok: true, existing: false, student: r.row, status_history_id: r.status_history_id } };
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
  const ref = parseStudentRef(b);
  if (!ref.value) return ref;
  if (!isValidSurvivalScore(b.score)) return { field: 'score' };
  const extRef = typeof b.external_ref === 'string' ? b.external_ref.trim() : '';
  if (!extRef || extRef.length > 200) return { field: 'external_ref' };
  let achievedAt = null;
  if (b.achieved_at !== undefined && b.achieved_at !== null) {
    const ts = typeof b.achieved_at === 'string' ? Date.parse(b.achieved_at) : NaN;
    if (!Number.isFinite(ts)) return { field: 'achieved_at' };
    achievedAt = new Date(ts).toISOString();
  }
  return { value: { ...ref.value, score: b.score, external_ref: extRef, achieved_at: achievedAt } };
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
  const ref = parseStudentRef(p, { required: false });
  if (!ref.value) return ref;
  let limit = defaultLimit;
  if (p.limit !== undefined && p.limit !== null && p.limit !== '') {
    limit = Number(p.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LEADERBOARD_MAX_LIMIT) return { field: 'limit' };
  }
  return {
    value: {
      scope, period,
      branch_id: scope === 'branch' ? branchId : null,
      student_id: ref.value.student_id || null, limit,
      ...(ref.value.student_code ? { student_code: ref.value.student_code } : {}),
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
