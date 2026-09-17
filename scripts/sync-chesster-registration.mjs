#!/usr/bin/env node
/**
 * SYNC: Chesster app registration status onto Chess Empire students
 * =================================================================
 *
 * Chesster (chess-empire.chesster.io) is a separate Supabase project
 * (qtzujwiqzbgyhdgulvcd). When a student registers for the Chesster app via a
 * branch registration link, a row is created in Chesster's `organization_members`
 * table:
 *
 *   external_student_id  UUID   — equals students.id in THIS (Chess Empire) project
 *   external_source      TEXT   — 'chess_empire' or 'online'
 *   link_status          TEXT   — 'pending' | 'verified' | 'frozen' | 'revoked'
 *   link_verified_at     TIMESTAMPTZ
 *   role                 TEXT
 *
 * A student counts as REGISTERED iff a row exists with a matching
 * external_student_id, external_source IN ('chess_empire','online') and
 * link_status = 'verified'.
 *
 * NOTE ON `role`: the brief asked to filter on the student role too, but the
 * concrete role values in Chesster were not confirmed for this project. To avoid
 * silently dropping legitimate registrations we do NOT filter on role — we select
 * it and log the distinct values seen so an operator can tighten the filter later
 * (set CHESSTER_STUDENT_ROLE=<role> to restrict to a single role value).
 *
 * This script reads the verified memberships, then PATCHes
 * students.chesster_registered_at and students.chesster_email on THIS project:
 *   - registered & (NULL or different)  -> set to link_verified_at (fallbacks below)
 *                                          and the winning membership's email
 *   - not registered & non-NULL         -> set both back to NULL (revoked / removed)
 * Only rows that actually change (timestamp OR email) are written.
 *
 * Env (fail fast if a required key is missing — NEVER hardcode keys):
 *   CE_SUPABASE_URL        default https://papgcizhfkngubwofjuo.supabase.co
 *   CE_SERVICE_ROLE_KEY    (required — Chess Empire service role key)
 *   CHESSTER_SUPABASE_URL  default https://qtzujwiqzbgyhdgulvcd.supabase.co
 *   CHESSTER_SERVICE_ROLE_KEY (required — Chesster service role key)
 *   CHESSTER_STUDENT_ROLE  optional — restrict to a single role value
 *   CLERK_SECRET_KEY       optional — when set, memberships that carry a Clerk
 *                          user_id but no email have their email resolved from
 *                          the Clerk Backend API. Unset -> fallback is skipped.
 *
 * Usage:
 *   node scripts/sync-chesster-registration.mjs            # write
 *   node scripts/sync-chesster-registration.mjs --dry-run  # print only, no writes
 */

const DRY_RUN = process.argv.includes('--dry-run');

const CE_URL = normalizeUrl(process.env.CE_SUPABASE_URL || 'https://papgcizhfkngubwofjuo.supabase.co');
const CE_KEY = process.env.CE_SERVICE_ROLE_KEY;
const CHESSTER_URL = normalizeUrl(process.env.CHESSTER_SUPABASE_URL || 'https://qtzujwiqzbgyhdgulvcd.supabase.co');
const CHESSTER_KEY = process.env.CHESSTER_SERVICE_ROLE_KEY;
const STUDENT_ROLE = process.env.CHESSTER_STUDENT_ROLE || null;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || null;

const REGISTERED_SOURCES = ['chess_empire', 'online'];

function normalizeUrl(u) {
    return String(u).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1';
}

// ---------------------------------------------------------------------------
// Pure diff computation — exported for tests. No I/O.
// ---------------------------------------------------------------------------
// members:  Chesster organization_members rows already filtered to
//           external_source IN (chess_empire, online) AND link_status=verified.
// students: THIS project's students rows: { id, chesster_registered_at,
//           chesster_email }.
// now:      ISO string used as the last-resort timestamp fallback.
// Returns { toSet:[{id,value,email}], toClear:[id], registered, newlyMarked,
//           cleared, unchanged, emailChanged, total, roles:[...] }.
export function computeChessterRegistrationDiff({ members = [], students = [], now }) {
    const nowIso = now || new Date().toISOString();

    // id -> { at, email } for the winning membership (latest verified_at). The
    // email follows the same row whose verified_at wins, so duplicates resolve
    // consistently for both columns.
    const registered = new Map();
    const roles = new Set();
    for (const m of members) {
        const id = m.external_student_id;
        if (!id) continue;
        if (m.role) roles.add(m.role);
        const prev = registered.get(id);
        const cur = m.link_verified_at || null;
        const email = m.email || null;
        // Prefer a non-null, later verified_at.
        if (!registered.has(id) || (cur && (!prev.at || cur > prev.at))) {
            registered.set(id, { at: cur, email });
        }
    }

    const toSet = [];
    const toClear = [];
    let unchanged = 0;
    let emailChanged = 0;

    for (const s of students) {
        const current = s.chesster_registered_at || null;
        const currentEmail = s.chesster_email || null;
        if (registered.has(s.id)) {
            const win = registered.get(s.id);
            // Registered — value is link_verified_at, falling back to the
            // existing stored value, then to now(). Email follows the winning row.
            const value = win.at || current || nowIso;
            const email = win.email;
            const tsSame = sameInstant(current, value);
            const emailSame = (currentEmail || null) === (email || null);
            if (tsSame && emailSame) {
                unchanged++;
            } else {
                if (!emailSame) emailChanged++;
                toSet.push({ id: s.id, value, email });
            }
        } else if (current || currentEmail) {
            // No longer registered but a stamp/email lingers — clear both.
            toClear.push(s.id);
        } else {
            unchanged++;
        }
    }

    return {
        toSet,
        toClear,
        registered: registered.size,
        newlyMarked: toSet.length,
        cleared: toClear.length,
        unchanged,
        emailChanged,
        total: students.length,
        roles: [...roles].sort()
    };
}

// Two timestamp strings represent the same instant (tolerant of formatting
// differences). Null/undefined only equal each other.
export function sameInstant(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
    return ta === tb;
}

// ---------------------------------------------------------------------------
// Clerk email fallback — resolve membership emails that Chesster left null.
// ---------------------------------------------------------------------------
// Only ~1/4 of verified memberships carry an `email`; the rest only have a
// Clerk `user_id`. This fills the gap BEFORE the diff runs so both the email
// column and the summary reflect the resolved values. Pure & offline-testable:
// the Clerk network call is injected as `resolveEmail(user_id) -> email|null`.
//
// members:      verified organization_members rows (may lack `email`).
// resolveEmail: async (user_id) => email|null. Omit to skip the fallback.
// Returns { members:[...email-filled], missingEmail, emailFromClerk,
//           emailLookupFailed }.
export async function resolveMemberEmails({ members = [], resolveEmail } = {}) {
    const cache = new Map(); // user_id -> email|null (duplicates exist; look up once)
    let missingEmail = 0;
    let emailFromClerk = 0;
    let emailLookupFailed = 0;
    const out = [];

    for (const m of members) {
        const hasEmail = !!(m.email && String(m.email).trim());
        if (hasEmail) { out.push(m); continue; }
        missingEmail++;
        // Can only recover an email when there is a user_id AND a resolver.
        if (!m.user_id || typeof resolveEmail !== 'function') { out.push(m); continue; }

        let email;
        if (cache.has(m.user_id)) {
            email = cache.get(m.user_id);
        } else {
            email = (await resolveEmail(m.user_id)) || null;
            cache.set(m.user_id, email);
        }

        if (email) { emailFromClerk++; out.push({ ...m, email }); }
        else       { emailLookupFailed++; out.push(m); }
    }

    return { members: out, missingEmail, emailFromClerk, emailLookupFailed };
}

// Pick the primary email from a Clerk user payload (the entry whose id matches
// primary_email_address_id), falling back to the first address.
export function pickClerkEmail(user) {
    const list = Array.isArray(user && user.email_addresses) ? user.email_addresses : [];
    if (!list.length) return null;
    const primary = list.find((e) => e && e.id === user.primary_email_address_id);
    return (primary && primary.email_address) || (list[0] && list[0].email_address) || null;
}

// Build the live Clerk resolver, or null when the secret key is unset.
// Retries once on HTTP 429 (respecting Retry-After, default 1s); any other
// failure resolves to null so the sync leaves that email untouched.
function makeClerkEmailResolver(secretKey) {
    if (!secretKey) return null;
    return async function resolveClerkEmail(userId) {
        for (let attempt = 0; attempt < 2; attempt++) {
            let res;
            try {
                res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
                    headers: { Authorization: `Bearer ${secretKey}` }
                });
            } catch {
                return null;
            }
            if (res.status === 429 && attempt === 0) {
                const retryAfter = Number(res.headers.get('retry-after'));
                const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
            }
            if (!res.ok) return null;
            try {
                return pickClerkEmail(await res.json());
            } catch {
                return null;
            }
        }
        return null;
    };
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------
async function fetchAll(baseUrl, key, table, query) {
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
        const url = `${baseUrl}/${table}?${query}`;
        const res = await fetch(url, {
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                Range: `${from}-${from + pageSize - 1}`
            }
        });
        if (!res.ok) {
            throw new Error(`GET ${table} -> ${res.status} ${res.statusText}: ${await res.text()}`);
        }
        const batch = await res.json();
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function patchStudent(id, body) {
    const url = `${CE_URL}/students?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            apikey: CE_KEY,
            Authorization: `Bearer ${CE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(`PATCH students ${id} -> ${res.status} ${res.statusText}: ${await res.text()}`);
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
    const missing = [];
    if (!CE_KEY) missing.push('CE_SERVICE_ROLE_KEY');
    if (!CHESSTER_KEY) missing.push('CHESSTER_SERVICE_ROLE_KEY');
    if (missing.length) {
        console.error(`❌ Missing required env: ${missing.join(', ')}`);
        console.error('   Set the service role keys and re-run. Keys are never hardcoded.');
        process.exit(1);
    }

    const sourceFilter = `external_source=in.(${REGISTERED_SOURCES.join(',')})`;
    const roleFilter = STUDENT_ROLE ? `&role=eq.${encodeURIComponent(STUDENT_ROLE)}` : '';
    const membersQuery =
        'select=external_student_id,link_status,external_source,link_verified_at,role,email,user_id' +
        `&${sourceFilter}&link_status=eq.verified${roleFilter}`;

    let members, students;
    try {
        [members, students] = await Promise.all([
            fetchAll(CHESSTER_URL, CHESSTER_KEY, 'organization_members', membersQuery),
            fetchAll(CE_URL, CE_KEY, 'students', 'select=id,chesster_registered_at,chesster_email')
        ]);
    } catch (e) {
        console.error(`❌ Fetch failed: ${e.message}`);
        process.exit(1);
        return;
    }

    // Fill in emails Chesster left null via the Clerk Backend API (best-effort).
    const resolveEmail = makeClerkEmailResolver(CLERK_SECRET_KEY);
    const emailRes = await resolveMemberEmails({ members, resolveEmail });
    members = emailRes.members;
    if (!resolveEmail && emailRes.missingEmail) {
        console.warn(
            `⚠️  ${emailRes.missingEmail} verified membership(s) have no email and CLERK_SECRET_KEY is unset — ` +
            'skipping the Clerk email fallback.'
        );
    }

    const diff = computeChessterRegistrationDiff({ members, students });

    if (diff.roles.length) {
        console.log(`ℹ️  Chesster roles seen among verified links: ${diff.roles.join(', ')}` +
            (STUDENT_ROLE ? ` (filtered to role=${STUDENT_ROLE})` : ' (not filtered on role)'));
    }

    if (DRY_RUN) {
        console.log('--- DRY RUN (no writes) ---');
        for (const { id, value, email } of diff.toSet) {
            console.log(`  SET   ${id} chesster_registered_at=${value} chesster_email=${email || 'NULL'}`);
        }
        for (const id of diff.toClear) {
            console.log(`  CLEAR ${id} chesster_registered_at=NULL chesster_email=NULL`);
        }
    } else {
        try {
            for (const { id, value, email } of diff.toSet) {
                await patchStudent(id, { chesster_registered_at: value, chesster_email: email || null });
            }
            for (const id of diff.toClear) {
                await patchStudent(id, { chesster_registered_at: null, chesster_email: null });
            }
        } catch (e) {
            console.error(`❌ Write failed: ${e.message}`);
            process.exit(1);
            return;
        }
    }

    console.log(
        `registered=${diff.registered} newly_marked=${diff.newlyMarked} ` +
        `cleared=${diff.cleared} email_changed=${diff.emailChanged} ` +
        `email_from_clerk=${emailRes.emailFromClerk} email_lookup_failed=${emailRes.emailLookupFailed} ` +
        `unchanged=${diff.unchanged} total_students=${diff.total}`
    );
    process.exit(0);
}

// Run only when executed directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    main();
}
