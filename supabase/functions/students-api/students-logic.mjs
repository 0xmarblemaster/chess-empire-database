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
