/**
 * Tests for the `school_student_drilldown` action on analytics-tournaments.
 * The TS handler can't be required in Node (Deno-only imports), so we mirror
 * the per-metric rollup in JS, exercise it against mocked datasets, and
 * source-grep the live `index.ts` for the contract.
 *
 * For each metric, `students.length` must match the corresponding existing
 * summary count where applicable:
 *   - active_players → active_players_count
 *   - top3           → top3_count (event-count, not student-count)
 *   - new_razryads   → new_razryads_count (one event per earner in the mock
 *                      data, so the per-event list equals the deduped count)
 *   - promotions     → promotions_count (deduped per student, latest event)
 *
 * Run: node tests/test-school-student-drilldown.js
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

// ── Local re-implementation of the per-metric rollup ─────────────────────
// Mirrors the edge function: rate counts only come from rows with games_played
// >= 1, top3 is per-event, promotions are deduped (latest per student),
// razryads are per earned event.
function rollup({ students, results, promotionEvents, uploads, razryadHist, metric }) {
    const uploadById = new Map(uploads.map(u => [u.id, u]));
    const razryadUploadIds = new Set(uploads.filter(u => u.kind === 'razryad_3' || u.kind === 'razryad_4').map(u => u.id));
    const studentSet = new Set(students.map(s => s.id));
    const myResults = results.filter(r => studentSet.has(r.student_id));

    if (metric === 'active_players') {
        const byStudent = new Map();
        for (const r of myResults) {
            if (r.games_played < 1) continue;
            const slot = byStudent.get(r.student_id) || {
                student_id: r.student_id,
                games_played: 0,
                tournaments: new Set(),
                rating_delta_total: 0,
            };
            slot.games_played += r.games_played;
            slot.tournaments.add(r.upload_id);
            slot.rating_delta_total += r.rating_delta || 0;
            byStudent.set(r.student_id, slot);
        }
        return [...byStudent.values()].map(s => ({
            student_id: s.student_id,
            games_played: s.games_played,
            tournaments_played: s.tournaments.size,
            rating_delta_total: s.rating_delta_total,
        }));
    }
    if (metric === 'top3') {
        const rows = [];
        for (const r of myResults) {
            if (r.games_played < 1) continue;
            if (!Number.isFinite(r.rank) || r.rank > 3) continue;
            const u = uploadById.get(r.upload_id);
            rows.push({
                tournament_id: r.upload_id,
                tournament_name: u ? `${u.kind} (${u.tournament_date})` : null,
                occurred_at: u ? u.tournament_date : null,
                placement: r.rank,
                student_id: r.student_id,
            });
        }
        return rows;
    }
    if (metric === 'new_razryads') {
        const rows = [];
        for (const r of myResults) {
            if (r.games_played < 1) continue;
            if (!r.earned_razryad) continue;
            if (!razryadUploadIds.has(r.upload_id)) continue;
            const u = uploadById.get(r.upload_id);
            const hist = (razryadHist || []).find(h => h.student_id === r.student_id) || null;
            rows.push({
                student_id: r.student_id,
                old_razryad: hist ? hist.old_razryad : null,
                new_razryad: hist ? hist.new_razryad : r.earned_razryad,
                earned_at: u ? u.tournament_date : null,
                tournament_name: u ? `${u.kind} (${u.tournament_date})` : null,
            });
        }
        return rows;
    }
    if (metric === 'promotions') {
        const latest = new Map();
        for (const e of (promotionEvents || []).filter(e => studentSet.has(e.student_id))) {
            const prev = latest.get(e.student_id);
            if (!prev || String(e.occurred_at) > String(prev.occurred_at)) latest.set(e.student_id, e);
        }
        return [...latest.values()].map(e => ({
            student_id: e.student_id,
            from_league: e.from_league,
            to_league: e.to_league,
            occurred_at: e.occurred_at,
        }));
    }
    return [];
}

// ── Existing summary aggregator (mirrors school_kpi_summary) ─────────────
function summary({ students, results, promotionEvents, uploads }) {
    const uploadById = new Map(uploads.map(u => [u.id, u]));
    const razryadUploadIds = new Set(uploads.filter(u => u.kind === 'razryad_3' || u.kind === 'razryad_4').map(u => u.id));
    const studentSet = new Set(students.map(s => s.id));
    const myResults = results.filter(r => studentSet.has(r.student_id));
    const activePlayers = new Set();
    const razryadEarners = new Set();
    let top3 = 0;
    for (const r of myResults) {
        if (r.games_played < 1) continue;
        activePlayers.add(r.student_id);
        if (Number.isFinite(r.rank) && r.rank <= 3) top3++;
        if (razryadUploadIds.has(r.upload_id) && r.earned_razryad) razryadEarners.add(r.student_id);
    }
    const proms = (promotionEvents || []).filter(e => studentSet.has(e.student_id));
    const promoted = new Set(proms.map(p => p.student_id));
    return {
        active_players_count: activePlayers.size,
        top3_count: top3,
        new_razryads_count: razryadEarners.size,
        promotions_count: promoted.size,
    };
}

// ── Fixture: 3 students, mixed game history, one student promoted twice ──
const fixture = {
    students: [
        { id: 'S1', first_name: 'Daulet', last_name: 'A', branch_id: 'B1', coach_id: 'C1', razryad: '4th' },
        { id: 'S2', first_name: 'Aigerim', last_name: 'B', branch_id: 'B1', coach_id: 'C1', razryad: 'none' },
        { id: 'S3', first_name: 'Bolat', last_name: 'C', branch_id: 'B1', coach_id: 'C1', razryad: 'none' },
    ],
    uploads: [
        { id: 'U1', kind: 'league_c', tournament_date: '2026-04-01' },
        { id: 'U2', kind: 'league_c', tournament_date: '2026-04-08' },
        { id: 'U3', kind: 'league_c', tournament_date: '2026-04-15' },
        { id: 'U4', kind: 'league_c', tournament_date: '2026-04-22' },
        { id: 'U5', kind: 'league_c', tournament_date: '2026-04-29' },
        { id: 'U6', kind: 'razryad_4', tournament_date: '2026-05-02' },
    ],
    // Daulet (S1) has 5 top-3 finishes (Q1 case b: appears 5x in drilldown).
    results: [
        { student_id: 'S1', upload_id: 'U1', games_played: 6, rank: 1, rating_delta: 20, rating_before: 200 },
        { student_id: 'S1', upload_id: 'U2', games_played: 6, rank: 2, rating_delta: 15, rating_before: 220 },
        { student_id: 'S1', upload_id: 'U3', games_played: 6, rank: 3, rating_delta: 10, rating_before: 235 },
        { student_id: 'S1', upload_id: 'U4', games_played: 6, rank: 2, rating_delta: 12, rating_before: 245 },
        { student_id: 'S1', upload_id: 'U5', games_played: 6, rank: 3, rating_delta: 8,  rating_before: 257 },
        { student_id: 'S1', upload_id: 'U6', games_played: 10, rank: 5, rating_delta: 0, rating_before: 265, earned_razryad: '4' },
        { student_id: 'S2', upload_id: 'U1', games_played: 6, rank: 4, rating_delta: -5, rating_before: 180 },
        // S3 rostered but never played a rated game.
        { student_id: 'S3', upload_id: 'U1', games_played: 0, rank: null, rating_delta: 0, rating_before: 150 },
    ],
    promotionEvents: [
        // S1 promoted twice in window (C→B then B→A); dedupe to 1.
        { student_id: 'S1', from_league: 'C', to_league: 'B', occurred_at: '2026-04-10T00:00:00Z' },
        { student_id: 'S1', from_league: 'B', to_league: 'A', occurred_at: '2026-04-25T00:00:00Z' },
        { student_id: 'S2', from_league: 'C', to_league: 'B', occurred_at: '2026-04-12T00:00:00Z' },
    ],
    razryadHist: [
        { student_id: 'S1', old_razryad: 'none', new_razryad: '4', changed_at: '2026-05-02T12:00:00Z' },
    ],
};

const summaryCounts = summary(fixture);

console.log('\n=== metric=active_players: list length === active_players_count ======\n');
{
    const drill = rollup({ ...fixture, metric: 'active_players' });
    assertEqual(drill.length, summaryCounts.active_players_count,
        'students.length matches school_kpi_summary.active_players_count');
    assertEqual(drill.length, 2, 'S1 + S2 played (S3 had 0 games)');
    const s1 = drill.find(d => d.student_id === 'S1');
    assert(s1 && s1.tournaments_played === 6,
        'S1 tournaments_played counts all 6 distinct uploads they appeared in');
    assert(s1 && s1.rating_delta_total === 65,
        `S1 rating_delta_total sums to 65 (got ${s1 && s1.rating_delta_total})`);
}

console.log('\n=== metric=top3: list length === top3_count (event-count, not student) =\n');
{
    const drill = rollup({ ...fixture, metric: 'top3' });
    assertEqual(drill.length, summaryCounts.top3_count,
        'students.length matches school_kpi_summary.top3_count (per-event)');
    assertEqual(drill.length, 5,
        'Daulet appears 5x — one row per top-3 EVENT (Q1: b)');
    const daulet = drill.filter(d => d.student_id === 'S1');
    assertEqual(daulet.length, 5,
        'all 5 top-3 events for S1 land in the list');
    assert(daulet.every(d => d.tournament_id && d.placement && d.occurred_at),
        'every top3 row carries tournament_id + placement + occurred_at');
}

console.log('\n=== metric=promotions: list length === promotions_count (deduped) =====\n');
{
    const drill = rollup({ ...fixture, metric: 'promotions' });
    assertEqual(drill.length, summaryCounts.promotions_count,
        'students.length matches school_kpi_summary.promotions_count (deduped)');
    assertEqual(drill.length, 2, 'S1 + S2 (S1 promoted twice still counts once — Q2: a)');
    const s1Row = drill.find(d => d.student_id === 'S1');
    assert(s1Row && s1Row.to_league === 'A',
        'S1 row shows LATEST promotion (B→A), not the earlier C→B');
}

console.log('\n=== metric=new_razryads: list length === new_razryads_count ==========\n');
{
    const drill = rollup({ ...fixture, metric: 'new_razryads' });
    assertEqual(drill.length, summaryCounts.new_razryads_count,
        'one-event-per-student case: drilldown length matches deduped earner count');
    assertEqual(drill.length, 1, 'S1 earned 4th razryad on U6');
    const row = drill[0];
    assert(row.student_id === 'S1', 'row is for S1');
    assert(row.old_razryad === 'none', 'old_razryad from razryad_history join');
    assert(row.new_razryad === '4', 'new_razryad from razryad_history join');
    assert(/razryad_4/.test(row.tournament_name || ''), 'tournament_name carries razryad upload kind');
}

console.log('\n=== empty branch / coach scope returns empty drilldown ================\n');
{
    const empty = rollup({ students: [], results: [], promotionEvents: [], uploads: [], razryadHist: [], metric: 'active_players' });
    assertEqual(empty.length, 0, 'no students → empty drilldown list');
    const emptyTop3 = rollup({ students: [], results: [], promotionEvents: [], uploads: [], razryadHist: [], metric: 'top3' });
    assertEqual(emptyTop3.length, 0, 'no students → empty top3 drilldown list');
}

// ── Source-contract greps on the live handler ────────────────────────────
console.log('\n=== source contract: school_student_drilldown action exists ===========\n');
{
    const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
    const SRC = fs.readFileSync(SRC_PATH, 'utf8');
    function extractAction(name) {
        const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
        const m = re.exec(SRC);
        return m ? m[1] : '';
    }
    const block = extractAction('school_student_drilldown');
    assert(block.length > 0, 'school_student_drilldown handler block extracted');
    assert(/metric/.test(block), 'block reads the metric param');
    for (const m of ['active_players', 'top3', 'new_razryads', 'promotions']) {
        assert(block.includes(`'${m}'`), `block whitelists metric=${m}`);
    }
    assert(/validateWindow/.test(block),
        'window validation gates the drilldown');
    assert(/branch_id/.test(block), 'block reads the branch_id param');
    assert(/coach_id/.test(block), 'block reads the coach_id param');
    assert(/from\('students'\)/.test(block), 'reads students table');
    assert(/from\('tournaments_uploads'\)/.test(block),
        'reads tournaments_uploads (Phase 2 source)');
    assert(/from\('tournament_results'\)/.test(block),
        'reads tournament_results (Phase 2 source)');
    assert(/from\('student_league_events'\)/.test(block),
        'reads student_league_events for promotions');
    assert(/from\('razryad_history'\)/.test(block),
        'reads razryad_history for old_razryad/new_razryad rows');
    assert(/from\('branches'\)/.test(block),
        'looks up branch names for display');
    assert(/from\('coaches'\)/.test(block),
        'looks up coach names for display');
    assert(/data:\s*\{\s*[\s\S]*?students:/.test(block),
        'response envelope carries data.students');
    // The Invalid-action sentinel at the bottom of the handler must mention
    // the new action so the next maintainer sees it in the error path too.
    assert(/school_student_drilldown/.test(SRC.split('Invalid action').slice(-1)[0] || ''),
        'invalid-action error message advertises school_student_drilldown');
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
