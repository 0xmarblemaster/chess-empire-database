/**
 * Edge-function unit test for the `active_players_count` per-coach metric and
 * the deduped `promotions_count` introduced for the Coach KPI data refresh.
 *
 * The TS handler can't be required directly (Deno-only imports), so we mirror
 * the per-coach rollup in JS, exercise it against mocked datasets, and pin
 * the equivalent source-contract greps against the live `index.ts`.
 *
 * Run: node tests/test-coach-kpi-active-players-edge.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; console.log(`  ✓ ${msg}`); }
    else {
        failed++;
        console.error(`  ✗ FAIL: ${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    }
}

// ── Local re-implementation that mirrors the edge function block ─────────
//
// Builds the per-coach row exactly the way analytics-tournaments/index.ts
// does after the data-refresh: counts a student in `active_players_count`
// only when they have >=1 rated game in window, and dedupes promotions by
// student_id.
function rollupCoach({ studentIds, results, promotionEvents, razryadUploadIds }) {
    const myStudentSet = new Set(studentIds);
    const myResults = results.filter(r => myStudentSet.has(r.student_id));
    const myProms = promotionEvents.filter(p => myStudentSet.has(p.student_id));

    const activePlayersSet = new Set();
    const playedEntries = [];
    const razryadParticipants = new Set();
    const razryadEarners = new Set();
    const participatedUploads = new Set();
    let top3Count = 0;

    for (const r of myResults) {
        if (r.games_played >= 1) {
            activePlayersSet.add(r.student_id);
            playedEntries.push(r);
            participatedUploads.add(r.upload_id);
            if (Number.isFinite(r.rank) && r.rank <= 3) top3Count++;
        }
        if (razryadUploadIds.has(r.upload_id) && r.games_played >= 1) {
            razryadParticipants.add(r.student_id);
            if (r.earned_razryad) razryadEarners.add(r.student_id);
        }
    }

    const promotedStudents = new Set(myProms.map(p => p.student_id));

    return {
        active_students_count: myStudentSet.size,
        active_players_count: activePlayersSet.size,
        total_tournaments: participatedUploads.size,
        tournament_entries: playedEntries.length,
        top3_count: top3Count,
        promotions_count: promotedStudents.size,
        new_razryads_count: razryadEarners.size,
        razryad_participants: razryadParticipants.size,
    };
}

console.log('\n=== active_players_count counts distinct students with >=1 rated game =\n');
{
    // Three students. S1 plays in 4 uploads, S2 plays in 1, S3 was rostered
    // but registered with 0 games (games_played=0) — must NOT count.
    const out = rollupCoach({
        studentIds: ['S1', 'S2', 'S3'],
        results: [
            { student_id: 'S1', upload_id: 'U1', games_played: 6, rank: 1, earned_razryad: false },
            { student_id: 'S1', upload_id: 'U2', games_played: 6, rank: 5, earned_razryad: false },
            { student_id: 'S1', upload_id: 'U3', games_played: 6, rank: 2, earned_razryad: false },
            { student_id: 'S1', upload_id: 'U4', games_played: 6, rank: 4, earned_razryad: false },
            { student_id: 'S2', upload_id: 'U1', games_played: 6, rank: 3, earned_razryad: false },
            // S3: rostered but 0 games — excluded from active_players_count.
            { student_id: 'S3', upload_id: 'U1', games_played: 0, rank: null, earned_razryad: false },
        ],
        promotionEvents: [],
        razryadUploadIds: new Set(),
    });
    assertEqual(out.active_students_count, 3,
        'active_students_count = 3 (full roster)');
    assertEqual(out.active_players_count, 2,
        'active_players_count = 2 (S1 + S2 played, S3 had 0 games)');
    assertEqual(out.tournament_entries, 5,
        'tournament_entries = 5 (raw count, S1 contributes 4 + S2 contributes 1)');
    assertEqual(out.total_tournaments, 4,
        'total_tournaments = 4 distinct uploads');
    assertEqual(out.top3_count, 3,
        'top3_count = 3 (S1 placed 1st, 2nd; S2 placed 3rd)');
}

console.log('\n=== active_players_count is a SET — repeated students count once ======\n');
{
    // Single student with 5 results — must contribute 1 to active_players_count.
    const out = rollupCoach({
        studentIds: ['S1'],
        results: [
            { student_id: 'S1', upload_id: 'U1', games_played: 6, rank: 4 },
            { student_id: 'S1', upload_id: 'U2', games_played: 6, rank: 5 },
            { student_id: 'S1', upload_id: 'U3', games_played: 6, rank: 6 },
            { student_id: 'S1', upload_id: 'U4', games_played: 6, rank: 7 },
            { student_id: 'S1', upload_id: 'U5', games_played: 6, rank: 8 },
        ],
        promotionEvents: [],
        razryadUploadIds: new Set(),
    });
    assertEqual(out.active_players_count, 1,
        'one student × five tournaments → active_players_count = 1');
    assertEqual(out.tournament_entries, 5,
        'tournament_entries still counts each entry (5)');
}

console.log('\n=== promotions_count is deduped by student_id =========================\n');
{
    // One student promoted twice in window (C→B then B→A), another promoted
    // once. The deduped count is 2 (distinct students), NOT 3 (raw events).
    const out = rollupCoach({
        studentIds: ['S1', 'S2', 'S3'],
        results: [],
        promotionEvents: [
            { student_id: 'S1', from_league: 'C', to_league: 'B' },
            { student_id: 'S1', from_league: 'B', to_league: 'A' },
            { student_id: 'S2', from_league: 'C', to_league: 'B' },
        ],
        razryadUploadIds: new Set(),
    });
    assertEqual(out.promotions_count, 2,
        'promotions_count = 2 distinct students (S1 promoted twice still counts once)');
}

console.log('\n=== promotions_count off-coach leakage stays excluded ==================\n');
{
    // A promotion event for a student NOT in this coach's roster must not
    // affect the deduped count.
    const out = rollupCoach({
        studentIds: ['S1'],
        results: [],
        promotionEvents: [
            { student_id: 'S1', from_league: 'C', to_league: 'B' },
            { student_id: 'STRANGER', from_league: 'C', to_league: 'B' },
        ],
        razryadUploadIds: new Set(),
    });
    assertEqual(out.promotions_count, 1,
        'promotions_count = 1 (STRANGER promotion excluded)');
}

console.log('\n=== empty roster → zero active_players_count + zero promotions =======\n');
{
    const out = rollupCoach({
        studentIds: [],
        results: [],
        promotionEvents: [],
        razryadUploadIds: new Set(),
    });
    assertEqual(out.active_players_count, 0,
        'no students → active_players_count = 0');
    assertEqual(out.promotions_count, 0,
        'no students → promotions_count = 0');
}

// ── Source-contract greps on analytics-tournaments/index.ts ─────────────────
console.log('\n=== source contract: active_players_count + deduped promotions =======\n');
{
    const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
    const SRC = fs.readFileSync(SRC_PATH, 'utf8');

    function extractAction(name) {
        const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
        const m = re.exec(SRC);
        return m ? m[1] : '';
    }

    const leaderboardBlock = extractAction('coach_leaderboard');
    const schoolBlock = extractAction('school_kpi_summary');
    const coachBlock = extractAction('coach_kpi_summary');

    // active_players_count surfaces on the coach_leaderboard row only — it's
    // the per-coach distinct-player count the school hero rolls up via
    // aggregateSchoolHero on the client.
    assert(/active_players_count:\s*r\.activePlayersCount/.test(leaderboardBlock),
        'coach_leaderboard row carries active_players_count from a per-coach Set');
    assert(/activePlayersCount:\s*activePlayersSet\.size/.test(leaderboardBlock),
        'activePlayersCount is sourced from a Set (Set.size) — distinct students only');

    // Promotion dedupe in all three handlers.
    for (const [label, block] of [
        ['coach_leaderboard', leaderboardBlock],
        ['school_kpi_summary', schoolBlock],
        ['coach_kpi_summary', coachBlock],
    ]) {
        assert(/new Set<string>\(\s*\w+\.map\(\(p: any\) => p\.student_id\)\s*\)/.test(block),
            `${label}: builds a Set<string> of student_ids from promotion rows`);
        assert(!/promotions_count:\s*proms\.length/.test(block),
            `${label}: no longer emits promotions_count = proms.length (raw count)`);
        assert(!/promotionsCount:\s*myProms\.length/.test(block),
            `${label}: no longer emits promotionsCount = myProms.length (raw count)`);
    }
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
