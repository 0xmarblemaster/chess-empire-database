/**
 * Tests for migration 047_tournament_auto_close.sql.
 *
 * Strategy mirrors test-tournaments-api.js:
 *   1. Source-contract regex checks on the SQL file — catches drift in the
 *      function signature, grants, cron scheduling, and idempotency guards.
 *   2. A JS port of close_expired_tournaments() exercised against an
 *      in-memory store. Asserts the three-condition gate, the cancelled
 *      bypass, the future-tournament bypass, and idempotency.
 *
 * Run: node tests/test-tournament-auto-close.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    const eq = JSON.stringify(actual) === JSON.stringify(expected);
    if (eq) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ============================================================================
// 1. Migration 047 — source contract
// ============================================================================
console.log('\n=== migration 047_tournament_auto_close.sql ==========================\n');

const MIG_PATH = path.join(ROOT, 'migrations/047_tournament_auto_close.sql');
assert(fs.existsSync(MIG_PATH),
    'migrations/047_tournament_auto_close.sql exists');
const MIG = fs.readFileSync(MIG_PATH, 'utf8');

// --- function signature + grants -------------------------------------------
assert(/CREATE OR REPLACE FUNCTION close_expired_tournaments\(\)/.test(MIG),
    'declares close_expired_tournaments() (no args)');
assert(/RETURNS\s+INTEGER/i.test(MIG),
    'function returns INTEGER (the rows-affected count)');
assert(/SECURITY DEFINER/.test(MIG),
    'function is SECURITY DEFINER');
assert(/GRANT EXECUTE ON FUNCTION close_expired_tournaments\(\)\s+TO anon, authenticated, service_role/.test(MIG),
    'EXECUTE granted to anon, authenticated, service_role');

// --- the three close conditions --------------------------------------------
assert(/status\s*=\s*'open'/.test(MIG),
    "only `status = 'open'` rows are considered (cancelled rows preserved)");
assert(/status\s*=\s*'closed'/.test(MIG),
    "transitions matched rows to `status = 'closed'`");
assert(/tournament_date\s*<\s*\(NOW\(\) AT TIME ZONE 'Asia\/Almaty'\)::DATE/.test(MIG),
    'condition 1: tournament_date < today(Asia/Almaty)');
assert(/registration_deadline IS NOT NULL[\s\S]{0,40}NOW\(\)\s*>\s*registration_deadline/.test(MIG),
    'condition 2: registration_deadline IS NOT NULL AND NOW() > registration_deadline');
assert(/start_time IS NOT NULL[\s\S]{0,200}\(tournament_date \+ start_time\) AT TIME ZONE 'Asia\/Almaty'\)\s*<=\s*NOW\(\)/.test(MIG),
    'condition 3: start_time IS NOT NULL AND (date+start_time) Almaty <= NOW()');

// --- pg_cron guard + idempotent re-schedule --------------------------------
assert(/SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'/.test(MIG),
    'pg_cron presence is guarded with pg_extension lookup');
assert(/cron\.unschedule\(/.test(MIG),
    'existing job is unscheduled before re-creating (idempotent)');
assert(/'tournament_auto_close_5min'/.test(MIG),
    "job name is 'tournament_auto_close_5min'");
assert(/cron\.schedule\([\s\S]{0,200}'\*\/5 \* \* \* \*'/.test(MIG),
    'cron expression is every 5 minutes');
assert(/RAISE NOTICE[\s\S]{0,400}pg_cron extension not installed/i.test(MIG),
    'fallback RAISE NOTICE when pg_cron is missing');

// --- initial backfill -------------------------------------------------------
const backfillMatches = MIG.match(/SELECT close_expired_tournaments\(\)/g) || [];
assert(backfillMatches.length >= 2,
    'function is invoked at least twice (once via cron body, once for initial backfill)');
assert(/SELECT close_expired_tournaments\(\);\s*$/.test(MIG.trim()),
    'last statement is the initial-backfill SELECT close_expired_tournaments();');

// --- register_for_tournament extension --------------------------------------
assert(/CREATE OR REPLACE FUNCTION register_for_tournament/.test(MIG),
    'extends register_for_tournament in the same migration');
assert(/p_tournament_id\s+UUID[\s\S]{0,500}p_external_contact\s+TEXT DEFAULT NULL/.test(MIG),
    'register_for_tournament keeps the migration-045 signature');
assert(/'reason', 'invalid_input'/.test(MIG)
    && /'reason', 'not_found'/.test(MIG)
    && /'reason', 'closed'/.test(MIG)
    && /'reason', 'deadline_passed'/.test(MIG)
    && /'reason', 'full'/.test(MIG)
    && /'reason', 'duplicate'/.test(MIG),
    'all existing reasons preserved (invalid_input, not_found, closed, deadline_passed, full, duplicate)');
assert(/FOR UPDATE/.test(MIG),
    'register_for_tournament still locks the row with FOR UPDATE');
assert(/GRANT EXECUTE ON FUNCTION[\s\S]{0,200}register_for_tournament\(UUID, UUID, TEXT, TEXT, TEXT\)[\s\S]{0,80}TO anon, authenticated, service_role/.test(MIG),
    'register_for_tournament granted to anon, authenticated, service_role');

// --- idempotency invariants -------------------------------------------------
// Re-running the migration must be safe. Key markers:
//   - CREATE OR REPLACE on every function (no plain CREATE)
//   - cron job is unscheduled before re-scheduling
//   - no DROP TABLE / TRUNCATE / DELETE of user data
assert(!/CREATE FUNCTION\s+close_expired_tournaments/.test(MIG),
    'no plain CREATE FUNCTION (uses CREATE OR REPLACE)');
assert(!/CREATE FUNCTION\s+register_for_tournament/.test(MIG),
    'no plain CREATE FUNCTION for register_for_tournament');
assert(!/DROP TABLE/.test(MIG),
    'no destructive DROP TABLE statements');
assert(!/TRUNCATE/.test(MIG),
    'no destructive TRUNCATE statements');
assert(!/DELETE\s+FROM\s+tournaments/i.test(MIG),
    'no DELETE FROM tournaments (data preserved on re-run)');

// ============================================================================
// 2. JS port of close_expired_tournaments() — behavior
// ============================================================================
console.log('\n=== close_expired_tournaments() behavior (in-memory port) ============\n');

// Build a fixed "now" so the test is deterministic regardless of clock drift.
// Asia/Almaty is UTC+5 with no DST. 2026-06-18 12:00 Almaty == 07:00 UTC.
const NOW_UTC = new Date('2026-06-18T07:00:00.000Z'); // 12:00 Almaty
const TODAY_ALMATY = '2026-06-18';

function dateAlmaty(d /* Date */) {
    // Shift to Almaty (UTC+5) and slice YYYY-MM-DD.
    return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// (tournament_date + start_time) interpreted in Asia/Almaty, returning a UTC Date.
function startTsAlmaty(tournament_date /* 'YYYY-MM-DD' */, start_time /* 'HH:MM' or null */) {
    if (!start_time) return null;
    // 'YYYY-MM-DDTHH:MM:00+05:00' parses to the correct UTC instant.
    return new Date(`${tournament_date}T${start_time.length === 5 ? start_time + ':00' : start_time}+05:00`);
}

// Mirrors the SQL body of close_expired_tournaments() exactly.
function closeExpired(rows, now = NOW_UTC) {
    const today_almaty = dateAlmaty(now);
    let count = 0;
    for (const t of rows) {
        if (t.status !== 'open') continue;

        const datePassed = t.tournament_date < today_almaty;
        const deadlinePassed = t.registration_deadline != null
            && now > new Date(t.registration_deadline);
        const ts = startTsAlmaty(t.tournament_date, t.start_time);
        const startPassed = t.start_time != null && ts != null && ts <= now;

        if (datePassed || deadlinePassed || startPassed) {
            t.status = 'closed';
            count++;
        }
    }
    return count;
}

function freshFixture() {
    return [
        // 0. past date, open — closes (cond 1)
        { id: 't-past', status: 'open',
          tournament_date: '2026-06-13', start_time: '14:00',
          registration_deadline: null },

        // 1. past date, cancelled — NEVER touched
        { id: 't-past-cancelled', status: 'cancelled',
          tournament_date: '2026-06-13', start_time: '14:00',
          registration_deadline: null },

        // 2. deadline passed (open) — closes (cond 2)
        { id: 't-deadline', status: 'open',
          tournament_date: '2026-06-20', start_time: '14:00',
          registration_deadline: '2026-06-17T23:59:00.000Z' },

        // 3. today, start_time passed (12:00 Almaty < 14:00 ?) — see below
        // NOW is 12:00 Almaty. start_time 11:00 is in the past, so this closes.
        { id: 't-started', status: 'open',
          tournament_date: TODAY_ALMATY, start_time: '11:00',
          registration_deadline: null },

        // 4. today, start_time in future (14:00 Almaty > 12:00 NOW) — STAYS open
        { id: 't-today-future', status: 'open',
          tournament_date: TODAY_ALMATY, start_time: '14:00',
          registration_deadline: null },

        // 5. future date with future deadline — STAYS open
        { id: 't-future', status: 'open',
          tournament_date: '2026-07-01', start_time: '14:00',
          registration_deadline: '2026-06-30T23:59:00.000Z' },

        // 6. future date, NO start_time, NO deadline — STAYS open
        { id: 't-future-no-time', status: 'open',
          tournament_date: '2026-07-01', start_time: null,
          registration_deadline: null },

        // 7. already-closed past row — STAYS closed (no-op)
        { id: 't-already-closed', status: 'closed',
          tournament_date: '2026-06-13', start_time: '14:00',
          registration_deadline: null },
    ];
}

// --- closes rows past tournament_date ---------------------------------------
{
    const rows = freshFixture();
    const n = closeExpired(rows);
    const past = rows.find(r => r.id === 't-past');
    assertEqual(past.status, 'closed',
        'past tournament_date → status flips to closed');
    assert(n >= 1, 'closeExpired returns a positive count when rows are affected');
}

// --- closes rows past registration_deadline --------------------------------
{
    const rows = freshFixture();
    closeExpired(rows);
    const dl = rows.find(r => r.id === 't-deadline');
    assertEqual(dl.status, 'closed',
        'past registration_deadline → status flips to closed');
}

// --- closes rows whose start_time elapsed today -----------------------------
{
    const rows = freshFixture();
    closeExpired(rows);
    const started = rows.find(r => r.id === 't-started');
    assertEqual(started.status, 'closed',
        'today + start_time elapsed → status flips to closed');
}

// --- never touches `cancelled` ---------------------------------------------
{
    const rows = freshFixture();
    closeExpired(rows);
    const cancelled = rows.find(r => r.id === 't-past-cancelled');
    assertEqual(cancelled.status, 'cancelled',
        'cancelled rows are NEVER overwritten — even when date is in the past');
}

// --- does NOT touch future tournaments -------------------------------------
{
    const rows = freshFixture();
    closeExpired(rows);
    const future = rows.find(r => r.id === 't-future');
    assertEqual(future.status, 'open',
        'future tournament with future deadline stays open');
    const futureNoTime = rows.find(r => r.id === 't-future-no-time');
    assertEqual(futureNoTime.status, 'open',
        'future tournament with NULL start_time + NULL deadline stays open');
    const todayFuture = rows.find(r => r.id === 't-today-future');
    assertEqual(todayFuture.status, 'open',
        "today's tournament whose start_time is still in the future stays open");
}

// --- idempotent: re-running returns 0 and changes nothing ------------------
{
    const rows = freshFixture();
    const n1 = closeExpired(rows);
    const snapshot = JSON.stringify(rows);
    const n2 = closeExpired(rows);
    assertEqual(n2, 0, 'second invocation reports 0 rows affected');
    assertEqual(JSON.stringify(rows), snapshot,
        'second invocation leaves the table byte-identical');
    assert(n1 > 0, 'first invocation reported a positive count (sanity check)');
}

// --- NULL deadline never triggers (no false positive) ----------------------
{
    const rows = [
        { id: 't-future-null-dl', status: 'open',
          tournament_date: '2026-07-01', start_time: '14:00',
          registration_deadline: null }
    ];
    closeExpired(rows);
    assertEqual(rows[0].status, 'open',
        'NULL registration_deadline never trips condition 2');
}

// --- NULL start_time never triggers condition 3 alone ----------------------
{
    const rows = [
        { id: 't-today-no-start', status: 'open',
          tournament_date: TODAY_ALMATY, start_time: null,
          registration_deadline: null }
    ];
    closeExpired(rows);
    assertEqual(rows[0].status, 'open',
        "today's row with NULL start_time stays open (cond 3 requires start_time)");
}

// ============================================================================
// 3. register_for_tournament — auto-close gate behavior (JS port)
// ============================================================================
console.log('\n=== register_for_tournament gate (in-memory port) ====================\n');

function register(tournament, regs, opts, now = NOW_UTC) {
    const { p_student_id = null, p_player_name = null, p_source = 'web' } = opts || {};

    if (!p_student_id && (!p_player_name || !p_player_name.trim())) {
        return { ok: false, reason: 'invalid_input' };
    }
    let source = p_source || 'web';
    if (!['web','telegram','whatsapp','online','admin'].includes(source)) source = 'web';

    if (!tournament) return { ok: false, reason: 'not_found' };
    if (tournament.status !== 'open') return { ok: false, reason: 'closed' };

    // Time-based gate (matches the migration).
    const today_almaty = dateAlmaty(now);
    const datePassed = tournament.tournament_date < today_almaty;
    const ts = startTsAlmaty(tournament.tournament_date, tournament.start_time);
    const startPassed = tournament.start_time != null && ts != null && ts <= now;
    if (datePassed || startPassed) {
        tournament.status = 'closed';
        return { ok: false, reason: 'closed' };
    }

    // Deadline gate (preserved from 045).
    if (tournament.registration_deadline != null
        && now > new Date(tournament.registration_deadline)) {
        tournament.status = 'closed';
        return { ok: false, reason: 'deadline_passed' };
    }

    const count = regs.filter(r => r.tournament_id === tournament.id).length;
    if (count >= tournament.capacity) {
        tournament.status = 'closed';
        return { ok: false, reason: 'full' };
    }
    if (p_student_id && regs.some(r => r.tournament_id === tournament.id && r.student_id === p_student_id)) {
        return { ok: false, reason: 'duplicate' };
    }
    regs.push({ id: `reg-${regs.length + 1}`, tournament_id: tournament.id, student_id: p_student_id, player_name: p_player_name, source });
    if (count + 1 >= tournament.capacity) tournament.status = 'closed';
    return { ok: true };
}

// --- registration rejected after tournament_date has passed -----------------
{
    const t = { id: 't1', status: 'open', tournament_date: '2026-06-13', start_time: '14:00', registration_deadline: null, capacity: 24 };
    const out = register(t, [], { p_student_id: '11111111-1111-1111-1111-111111111111' });
    assertEqual(out.reason, 'closed',
        'register after past tournament_date returns reason=closed');
    assertEqual(t.status, 'closed',
        'register lazy-closes the row whose date has passed');
}

// --- registration rejected after start_time today --------------------------
{
    const t = { id: 't2', status: 'open', tournament_date: TODAY_ALMATY, start_time: '10:00', registration_deadline: null, capacity: 24 };
    const out = register(t, [], { p_student_id: '11111111-1111-1111-1111-111111111111' });
    assertEqual(out.reason, 'closed',
        'register after start_time elapsed today returns reason=closed');
    assertEqual(t.status, 'closed',
        'register lazy-closes the row whose start_time has elapsed');
}

// --- registration allowed when still in the future -------------------------
{
    const t = { id: 't3', status: 'open', tournament_date: TODAY_ALMATY, start_time: '15:00', registration_deadline: null, capacity: 24 };
    const out = register(t, [], { p_student_id: '11111111-1111-1111-1111-111111111111' });
    assertEqual(out.ok, true,
        'register before start_time succeeds');
    assertEqual(t.status, 'open',
        "row stays open when start_time is in the future");
}

// --- existing reasons preserved --------------------------------------------
{
    // not_found
    assertEqual(register(undefined, [], { p_student_id: '11111111-1111-1111-1111-111111111111' }).reason, 'not_found',
        'missing tournament → reason=not_found');
    // invalid_input
    assertEqual(register({ id: 'tX', status: 'open', tournament_date: '2026-07-01', start_time: '14:00', registration_deadline: null, capacity: 24 }, [], {}).reason, 'invalid_input',
        'no identity → reason=invalid_input');
    // deadline_passed (separate from date-passed)
    const dl = { id: 'tD', status: 'open', tournament_date: '2026-07-01', start_time: '14:00', registration_deadline: '2026-06-17T23:59:00.000Z', capacity: 24 };
    assertEqual(register(dl, [], { p_student_id: '11111111-1111-1111-1111-111111111111' }).reason, 'deadline_passed',
        'past registration_deadline (future tournament) → reason=deadline_passed');
}

console.log(`\n=== Summary ===\n  passed: ${passed}\n  failed: ${failed}\n`);
if (failed > 0) process.exit(1);
