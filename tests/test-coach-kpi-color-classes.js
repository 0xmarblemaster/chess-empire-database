/**
 * Test: Coach KPI hero card variant CSS exists and uses the canonical
 * palette tokens.
 *
 * Each of the 7 hero cards (active students, active players, participation,
 * top-3, razryads, promotions, tournaments) gets a .kpi-hero-card.variant-*
 * modifier. This test parses admin-styles.css and asserts that every variant
 * rule exists and contains the gradient hex pair from the spec — so an
 * accidental palette refactor (e.g. replacing teal #14b8a6 with a new
 * unsanctioned blue) breaks loudly here.
 *
 * Also asserts the leaderboard rank rules and the cell-color helpers exist.
 *
 * Run: node tests/test-coach-kpi-color-classes.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const css = fs.readFileSync(
    path.join(__dirname, '..', 'admin-styles.css'),
    'utf8'
);

// Match the block opened by `.kpi-hero-card.variant-X .stat-icon` up to the
// closing brace. The block body must contain both gradient stops.
function variantBlock(variant) {
    const re = new RegExp(
        `\\.kpi-hero-card\\.variant-${variant}\\s+\\.stat-icon\\s*\\{[\\s\\S]*?\\}`,
        'm'
    );
    const m = css.match(re);
    return m ? m[0] : null;
}

function borderBlock(variant) {
    const re = new RegExp(
        `\\.kpi-hero-card\\.variant-${variant}\\s*\\{[\\s\\S]*?\\}`,
        'm'
    );
    const m = css.match(re);
    return m ? m[0] : null;
}

const VARIANTS = [
    { name: 'active-students', border: '#14b8a6', from: '#14b8a6', to: '#0d9488' },
    { name: 'active-players',  border: '#3b82f6', from: '#3b82f6', to: '#60a5fa' },
    { name: 'participation',   border: '#d97706', from: '#d97706', to: '#f59e0b' },
    { name: 'top3',            border: '#fbbf24', from: '#fbbf24', to: '#f59e0b' },
    { name: 'razryads',        border: '#667eea', from: '#667eea', to: '#764ba2' },
    { name: 'promotions',      border: '#10b981', from: '#10b981', to: '#34d399' },
    { name: 'tournaments',     border: '#1e293b', from: '#1e293b', to: '#475569' },
];

console.log('\n=== Hero card variants exist with canonical palette ============\n');
for (const v of VARIANTS) {
    const iconRule = variantBlock(v.name);
    assert(iconRule !== null,
        `.kpi-hero-card.variant-${v.name} .stat-icon rule exists`);
    if (iconRule) {
        assert(iconRule.toLowerCase().includes(v.from.toLowerCase()),
            `  uses gradient start ${v.from}`);
        assert(iconRule.toLowerCase().includes(v.to.toLowerCase()),
            `  uses gradient end ${v.to}`);
    }
    const borderRule = borderBlock(v.name);
    assert(borderRule !== null && borderRule.toLowerCase().includes(v.border.toLowerCase()),
        `.kpi-hero-card.variant-${v.name} border-left-color uses ${v.border}`);
}

console.log('\n=== Leaderboard rank highlights ================================\n');
assert(/\.kpi-leaderboard[^{]*\.rank-1\b[\s\S]*?\{[\s\S]*?#fef3c7/i.test(css),
    '.rank-1 row uses gold tint background #fef3c7');
assert(/\.kpi-leaderboard[^{]*\.rank-1\b[\s\S]*?\{[\s\S]*?#fbbf24/i.test(css),
    '.rank-1 row uses gold border #fbbf24');
assert(/\.kpi-leaderboard[^{]*\.rank-2\b[\s\S]*?\{[\s\S]*?#d97706/i.test(css),
    '.rank-2 row uses amber border #d97706');
assert(/\.kpi-leaderboard[^{]*\.rank-3\b[\s\S]*?\{[\s\S]*?#d97706/i.test(css),
    '.rank-3 row uses amber border #d97706');

console.log('\n=== Cell color helpers ==========================================\n');
assert(/\.top3-cell\.has-value[\s\S]*?\{[\s\S]*?#92400e/i.test(css),
    '.top3-cell.has-value text color is razryad gold #92400e');
assert(/\.promo-cell\.has-value[\s\S]*?\{[\s\S]*?#047857/i.test(css),
    '.promo-cell.has-value text color reuses .delta-up green #047857');
assert(/\.participation-cell\.low[\s\S]*?\{[\s\S]*?#b91c1c/i.test(css),
    '.participation-cell.low text color is red #b91c1c');
assert(/\.participation-cell\.mid[\s\S]*?\{[\s\S]*?#d97706/i.test(css),
    '.participation-cell.mid text color is amber #d97706');
assert(/\.participation-cell\.high[\s\S]*?\{[\s\S]*?#047857/i.test(css),
    '.participation-cell.high text color is green #047857');

console.log('\n=== Mobile breakpoint shrinks the icon ==========================\n');
assert(/@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*?\.kpi-hero-card\s+\.stat-icon[\s\S]*?width:\s*36px/i.test(css),
    'icon width shrinks to 36px below 768px (no vertical stacking change)');

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
