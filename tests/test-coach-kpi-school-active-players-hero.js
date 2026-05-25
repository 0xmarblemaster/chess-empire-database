/**
 * Regression guard for the Coach Effectiveness "Active players" hero card.
 *
 * The frontend (coach-kpi.js) reads `active_players_count` off the
 * `school_kpi_summary` and `coach_kpi_summary` hero responses. Earlier, the
 * edge function emitted the same number under the name `participants_count`,
 * which left the hero card blank. This suite pins the field name in both
 * action handlers so the card never silently goes empty again.
 *
 * The TS handler can't be required from Node (Deno-only imports), so we
 * source-grep — the same pattern test-school-kpi-summary-phase2.js uses.
 *
 * Run: node tests/test-coach-kpi-school-active-players-hero.js
 */

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'analytics-tournaments', 'index.ts');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Pull just the named action handler block so assertions can't be satisfied
// by an unrelated section of the file.
function extractAction(name) {
    const re = new RegExp(`if \\(action === '${name}'\\)([\\s\\S]*?)(?=\\n\\s*if \\(action === '|return json\\(\\{ success: false, error: 'Invalid action)`);
    const m = re.exec(SRC);
    return m ? m[1] : '';
}

// Extract the `hero: { ... }` object literal inside a coach_kpi_summary block.
// The coach handler also passes `participants_count` to calcCompositeScore as
// an INTERNAL CompositeInput field — that's fine and must stay — so we narrow
// to the hero literal before asserting on the API output shape.
function extractHeroLiteral(block) {
    const idx = block.indexOf('hero:');
    if (idx < 0) return '';
    const open = block.indexOf('{', idx);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < block.length; i++) {
        const ch = block[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return block.slice(open, i + 1);
        }
    }
    return '';
}

console.log('\n=== school_kpi_summary hero emits active_players_count ================\n');
const SCHOOL = extractAction('school_kpi_summary');
assert(SCHOOL.length > 0, 'school_kpi_summary handler block extracted');
assert(/active_players_count/.test(SCHOOL),
    'school_kpi_summary emits active_players_count (frontend hero key)');
// The school handler has no internal CompositeInput call — any lingering
// `participants_count` here would be a stale response field that breaks the
// hero card. Lock it out.
assert(!/participants_count/.test(SCHOOL),
    'school_kpi_summary no longer emits the legacy participants_count field');

console.log('\n=== coach_kpi_summary hero emits active_players_count =================\n');
const COACH = extractAction('coach_kpi_summary');
assert(COACH.length > 0, 'coach_kpi_summary handler block extracted');
const HERO = extractHeroLiteral(COACH);
assert(HERO.length > 0, 'coach_kpi_summary `hero: { ... }` literal extracted');
assert(/active_players_count/.test(HERO),
    'coach_kpi_summary hero literal emits active_players_count (frontend hero key)');
assert(!/participants_count/.test(HERO),
    'coach_kpi_summary hero literal no longer emits the legacy participants_count');
// CompositeInput stays internal — calcCompositeScore still takes a
// `participants_count` field on its input object. That's by design; only the
// hero RESPONSE was renamed. Lock the internal contract too.
assert(/calcCompositeScore\(\{[\s\S]*?participants_count:/.test(COACH),
    'coach_kpi_summary still passes participants_count to calcCompositeScore (internal CompositeInput contract)');

// Also pin that the value behind active_players_count is the size of the
// distinct-participant set — i.e. a number, not a string/array. The handler
// assigns `participantStudentIds.size` (a Set's `.size` returns a number).
console.log('\n=== active_players_count is a numeric count ===========================\n');
assert(/active_players_count:\s*participantStudentIds\.size/.test(SCHOOL),
    'school_kpi_summary: active_players_count = participantStudentIds.size (number)');
assert(/active_players_count:\s*participantStudentIds\.size/.test(HERO),
    'coach_kpi_summary hero: active_players_count = participantStudentIds.size (number)');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
