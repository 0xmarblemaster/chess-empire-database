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
 * students.chesster_registered_at on THIS project:
 *   - registered & (NULL or different)  -> set to link_verified_at (fallbacks below)
 *   - not registered & non-NULL         -> set back to NULL (revoked / removed link)
 * Only rows that actually change are written.
 *
 * Env (fail fast if a required key is missing — NEVER hardcode keys):
 *   CE_SUPABASE_URL        default https://papgcizhfkngubwofjuo.supabase.co
 *   CE_SERVICE_ROLE_KEY    (required — Chess Empire service role key)
 *   CHESSTER_SUPABASE_URL  default https://qtzujwiqzbgyhdgulvcd.supabase.co
 *   CHESSTER_SERVICE_ROLE_KEY (required — Chesster service role key)
 *   CHESSTER_STUDENT_ROLE  optional — restrict to a single role value
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

const REGISTERED_SOURCES = ['chess_empire', 'online'];

function normalizeUrl(u) {
    return String(u).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1';
}

// ---------------------------------------------------------------------------
// Pure diff computation — exported for tests. No I/O.
// ---------------------------------------------------------------------------
// members:  Chesster organization_members rows already filtered to
//           external_source IN (chess_empire, online) AND link_status=verified.
// students: THIS project's students rows: { id, chesster_registered_at }.
// now:      ISO string used as the last-resort timestamp fallback.
// Returns { toSet:[{id,value}], toClear:[id], registered, newlyMarked,
//           cleared, unchanged, total, roles:[...] }.
export function computeChessterRegistrationDiff({ members = [], students = [], now }) {
    const nowIso = now || new Date().toISOString();

    // id -> link_verified_at (keep the latest verified_at when duplicates exist)
    const registeredAt = new Map();
    const roles = new Set();
    for (const m of members) {
        const id = m.external_student_id;
        if (!id) continue;
        if (m.role) roles.add(m.role);
        const prev = registeredAt.get(id);
        const cur = m.link_verified_at || null;
        // Prefer a non-null, later verified_at.
        if (!registeredAt.has(id) || (cur && (!prev || cur > prev))) {
            registeredAt.set(id, cur);
        }
    }

    const toSet = [];
    const toClear = [];
    let unchanged = 0;

    for (const s of students) {
        const current = s.chesster_registered_at || null;
        if (registeredAt.has(s.id)) {
            // Registered — value is link_verified_at, falling back to the
            // existing stored value, then to now().
            const value = registeredAt.get(s.id) || current || nowIso;
            if (sameInstant(current, value)) {
                unchanged++;
            } else {
                toSet.push({ id: s.id, value });
            }
        } else if (current) {
            // No longer registered but a stamp lingers — clear it.
            toClear.push(s.id);
        } else {
            unchanged++;
        }
    }

    return {
        toSet,
        toClear,
        registered: registeredAt.size,
        newlyMarked: toSet.length,
        cleared: toClear.length,
        unchanged,
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
        'select=external_student_id,link_status,external_source,link_verified_at,role' +
        `&${sourceFilter}&link_status=eq.verified${roleFilter}`;

    let members, students;
    try {
        [members, students] = await Promise.all([
            fetchAll(CHESSTER_URL, CHESSTER_KEY, 'organization_members', membersQuery),
            fetchAll(CE_URL, CE_KEY, 'students', 'select=id,chesster_registered_at')
        ]);
    } catch (e) {
        console.error(`❌ Fetch failed: ${e.message}`);
        process.exit(1);
        return;
    }

    const diff = computeChessterRegistrationDiff({ members, students });

    if (diff.roles.length) {
        console.log(`ℹ️  Chesster roles seen among verified links: ${diff.roles.join(', ')}` +
            (STUDENT_ROLE ? ` (filtered to role=${STUDENT_ROLE})` : ' (not filtered on role)'));
    }

    if (DRY_RUN) {
        console.log('--- DRY RUN (no writes) ---');
        for (const { id, value } of diff.toSet) {
            console.log(`  SET   ${id} chesster_registered_at=${value}`);
        }
        for (const id of diff.toClear) {
            console.log(`  CLEAR ${id} chesster_registered_at=NULL`);
        }
    } else {
        try {
            for (const { id, value } of diff.toSet) {
                await patchStudent(id, { chesster_registered_at: value });
            }
            for (const id of diff.toClear) {
                await patchStudent(id, { chesster_registered_at: null });
            }
        } catch (e) {
            console.error(`❌ Write failed: ${e.message}`);
            process.exit(1);
            return;
        }
    }

    console.log(
        `registered=${diff.registered} newly_marked=${diff.newlyMarked} ` +
        `cleared=${diff.cleared} unchanged=${diff.unchanged} total_students=${diff.total}`
    );
    process.exit(0);
}

// Run only when executed directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    main();
}
