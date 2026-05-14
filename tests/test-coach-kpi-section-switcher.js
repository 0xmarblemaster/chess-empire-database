/**
 * Tests for the Coach KPI section switcher wiring in admin-v2.js + admin.js
 * (PRD_COACH_KPI.md Phase 2). The "Coach Performance" nav item is wired via
 * onclick="showCoachPerformance()". When invoked, that handler must:
 *
 *   1. Toggle the .content-section.hidden contract on #section-coach-kpi
 *      (remove 'hidden', add 'active') so the section becomes visible.
 *   2. Hand off rendering to window.initCoachKpi(roleInfo, supabaseClient)
 *      so coach-kpi.js owns data fetching + DOM population.
 *
 * Mirrored for admin.html / admin.js so legacy and v2 dashboards stay aligned.
 *
 * Run: node tests/test-coach-kpi-section-switcher.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const ADMIN_V2_JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const ADMIN_JS = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');

// ── Source-level regex checks (cheap parity guard) ──────────────────────────
for (const [label, src] of [['admin-v2.js', ADMIN_V2_JS], ['admin.js', ADMIN_JS]]) {
    console.log(`\n=== ${label}: showCoachPerformance is defined =========================\n`);

    assert(/function\s+showCoachPerformance\s*\(/.test(src),
        `${label}: showCoachPerformance() declared`);

    // Match just the body of showCoachPerformance so the regex checks below
    // are scoped (won't accidentally match unrelated code).
    const fnMatch = src.match(/function\s+showCoachPerformance\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    assert(fnMatch !== null, `${label}: showCoachPerformance body extracted`);
    const body = fnMatch ? fnMatch[1] : '';

    console.log(`\n=== ${label}: toggles .content-section.hidden on #section-coach-kpi ====\n`);

    assert(/getElementById\(\s*['"]section-coach-kpi['"]\s*\)/.test(body),
        `${label}: looks up #section-coach-kpi by id`);
    assert(/classList\.remove\(\s*['"]hidden['"]\s*\)/.test(body),
        `${label}: removes the 'hidden' class from the section`);
    assert(/classList\.add\(\s*['"]active['"]\s*\)/.test(body),
        `${label}: adds the 'active' class so .content-section.active CSS applies`);
    assert(/querySelectorAll\(\s*['"]\.content-section['"]\s*\)/.test(body),
        `${label}: hides sibling .content-section elements before showing target`);

    console.log(`\n=== ${label}: calls window.initCoachKpi(roleInfo, supabaseClient) =====\n`);

    assert(/window\.initCoachKpi\s*\(/.test(body),
        `${label}: invokes window.initCoachKpi(...)`);
    // Be lenient about the variable name passed in, but require two args.
    assert(/window\.initCoachKpi\s*\(\s*[\w.$]+\s*,\s*[\w.$]+\s*\)/.test(body),
        `${label}: window.initCoachKpi called with two arguments (roleInfo, supabaseClient)`);
    // The role info object must be derived from getCurrentUserRole + carry the
    // canViewCoachKpi shape (isAdmin / isCoach / coachId).
    assert(/getCurrentUserRole\s*\(\s*\)/.test(body),
        `${label}: derives roleInfo from supabaseAuth.getCurrentUserRole()`);
    assert(/isAdmin\s*:[\s\S]*role\s*===\s*['"]admin['"]/.test(body),
        `${label}: roleInfo.isAdmin = userRole.role === 'admin'`);
    assert(/isCoach\s*:[\s\S]*role\s*===\s*['"]coach['"]/.test(body),
        `${label}: roleInfo.isCoach = userRole.role === 'coach'`);
    assert(/window\.supabaseClient/.test(body),
        `${label}: supabaseClient argument sourced from window.supabaseClient`);
}

// ── DOM-level behavioural test (admin-v2.js executed in a stub harness) ─────
console.log('\n=== admin-v2.js: behavioural test in a DOM stub =======================\n');

function makeDom() {
    const sectionA = makeEl('div', { id: 'studentsSection', className: 'content-section active' });
    const sectionB = makeEl('section', { id: 'section-coach-kpi', className: 'content-section hidden' });
    const navItem = makeEl('div', { id: 'menuCoachPerformance', className: 'nav-item' });
    const otherNav = makeEl('div', { id: 'menuStudents', className: 'nav-item active' });
    const elements = [sectionA, sectionB, navItem, otherNav];

    return {
        getElementById(id) { return elements.find(e => e.id === id) || null; },
        querySelectorAll(sel) {
            if (sel === '.content-section') return [sectionA, sectionB];
            if (sel === '.nav-item') return [navItem, otherNav];
            return [];
        },
        sections: { sectionA, sectionB },
        nav: { navItem, otherNav },
    };
}

function makeEl(tag, props) {
    const classes = new Set((props.className || '').split(/\s+/).filter(Boolean));
    return {
        id: props.id || '',
        tagName: tag.toUpperCase(),
        classList: {
            add: (...cs) => cs.forEach(c => classes.add(c)),
            remove: (...cs) => cs.forEach(c => classes.delete(c)),
            contains: (c) => classes.has(c),
            toArray: () => [...classes],
        },
        get className() { return [...classes].join(' '); },
    };
}

// Pluck just showCoachPerformance from admin-v2.js — running the whole file in
// a stub is overkill (and would need every dependency mocked).
const fnSrc = ADMIN_V2_JS.match(
    /function\s+showCoachPerformance\s*\([^)]*\)\s*\{[\s\S]*?\n\}/
);
assert(fnSrc !== null, 'extracted showCoachPerformance source from admin-v2.js');

const dom = makeDom();
let initCalls = [];
const sandbox = {
    document: dom,
    window: {
        supabaseAuth: {
            getCurrentUserRole: () => ({ role: 'coach', coachId: 'C-42' }),
        },
        supabaseClient: { __stub: 'sb' },
        initCoachKpi: (roleInfo, client) => { initCalls.push({ roleInfo, client }); },
    },
    history: { pushState: () => {} },
};
sandbox.window.document = dom;

vm.createContext(sandbox);
vm.runInContext(fnSrc[0] + '\nshowCoachPerformance();', sandbox);

assert(!dom.sections.sectionB.classList.contains('hidden'),
    '#section-coach-kpi: hidden class removed');
assert(dom.sections.sectionB.classList.contains('active'),
    '#section-coach-kpi: active class added');
assert(!dom.sections.sectionA.classList.contains('active'),
    'sibling section: active class removed');
assert(dom.nav.navItem.classList.contains('active'),
    'menuCoachPerformance: active class added');
assert(!dom.nav.otherNav.classList.contains('active'),
    'sibling nav item: active class removed');

assert(initCalls.length === 1,
    'window.initCoachKpi invoked exactly once');
assert(initCalls[0] && initCalls[0].roleInfo
    && initCalls[0].roleInfo.isCoach === true
    && initCalls[0].roleInfo.isAdmin === false
    && initCalls[0].roleInfo.coachId === 'C-42',
    'roleInfo passed in carries { isAdmin:false, isCoach:true, coachId:"C-42" } for a coach user');
assert(initCalls[0] && initCalls[0].client === sandbox.window.supabaseClient,
    'second arg to initCoachKpi is window.supabaseClient');

// Admin shape sanity check.
const dom2 = makeDom();
const sandbox2 = {
    document: dom2,
    window: {
        supabaseAuth: { getCurrentUserRole: () => ({ role: 'admin' }) },
        supabaseClient: { __stub: 'sb' },
        initCoachKpi: (roleInfo) => { initCalls.push({ roleInfo }); },
    },
    history: { pushState: () => {} },
};
sandbox2.window.document = dom2;
initCalls = [];
vm.createContext(sandbox2);
vm.runInContext(fnSrc[0] + '\nshowCoachPerformance();', sandbox2);
assert(initCalls.length === 1 && initCalls[0].roleInfo.isAdmin === true && initCalls[0].roleInfo.isCoach === false,
    'roleInfo for admin user: { isAdmin:true, isCoach:false }');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
