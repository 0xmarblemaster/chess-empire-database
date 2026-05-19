/**
 * Tests for the Coach KPI upload modal visual polish.
 *
 * The modal rendered by coach-kpi-upload.js renderUploadModal() previously
 * showed unstyled browser <select> + a blue <button class="btn-primary">.
 * After the design pass, admin-styles.css carries a scoped block under
 * `#section-coach-kpi` that:
 *   - mounts the modal as a white card (1px #e2e8f0, 1rem radius)
 *   - stacks each .kpi-upload-row as a vertical flex column
 *   - forces the commit button to the amber gradient with !important so
 *     no cascading .btn-primary rule paints it blue
 *
 * Asserts (CSS-only — no DOM mount required):
 *   1. .kpi-upload-modal carries the white-card tokens
 *   2. .kpi-upload-row is a vertical flex column
 *   3. .kpi-upload-buttons is right-aligned with a top divider
 *   4. .kpi-upload-buttons .btn-primary forces the amber gradient
 *   5. stats spans carry green / amber / red tokens
 *   6. mobile (max-width: 768px) stacks the buttons full-width
 *
 * Run: node tests/test-coach-kpi-upload-modal-ui.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const cssPath = path.join(__dirname, '..', 'admin-styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

// Pull a CSS rule's body (everything between the first `{` and matching `}`)
// for a given selector. We match against the first opening brace after the
// selector so nested @media queries don't confuse us.
function ruleBody(source, selector) {
    const idx = source.indexOf(selector);
    if (idx === -1) return null;
    const braceStart = source.indexOf('{', idx);
    if (braceStart === -1) return null;
    let depth = 1;
    let i = braceStart + 1;
    while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
    }
    return source.slice(braceStart + 1, i - 1);
}

console.log('\n=== admin-styles.css carries the upload modal block ==================\n');
(function testModalCard() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-modal');
    assert(body !== null, '#section-coach-kpi .kpi-upload-modal rule exists');
    assert(body && /background:\s*#ffffff/i.test(body),
        '.kpi-upload-modal background is white (#ffffff)');
    assert(body && /border:\s*1px\s+solid\s+#e2e8f0/i.test(body),
        '.kpi-upload-modal carries the 1px #e2e8f0 border token');
    assert(body && /border-radius:\s*1rem/i.test(body),
        '.kpi-upload-modal uses the 1rem corner-radius token');
})();

console.log('\n=== .kpi-upload-row stacks vertically (flex column) ==================\n');
(function testRowStack() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-row');
    assert(body !== null, '#section-coach-kpi .kpi-upload-row rule exists');
    assert(body && /display:\s*flex/i.test(body),
        '.kpi-upload-row uses display: flex');
    assert(body && /flex-direction:\s*column/i.test(body),
        '.kpi-upload-row uses flex-direction: column (so label sits above control)');
})();

console.log('\n=== .kpi-upload-row > label uses filter-label uppercase token ========\n');
(function testRowLabel() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-row > label');
    assert(body !== null, '#section-coach-kpi .kpi-upload-row > label rule exists');
    assert(body && /text-transform:\s*uppercase/i.test(body),
        'row label text is uppercase');
    assert(body && /font-size:\s*0\.6875rem/i.test(body),
        'row label font-size is 0.6875rem');
    assert(body && /color:\s*#64748b/i.test(body),
        'row label colour is #64748b');
})();

console.log('\n=== .kpi-upload-kind / .kpi-upload-date use filter-select tokens =====\n');
(function testSelectChevronTreatment() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-kind,');
    assert(body !== null,
        '#section-coach-kpi .kpi-upload-kind / .kpi-upload-date rule exists');
    assert(body && /border:\s*1px\s+solid\s+#e2e8f0/i.test(body),
        'select + date input carry the same border token as .filter-select');
    assert(body && /border-radius:\s*0\.5rem/i.test(body),
        'select + date input carry the 0.5rem radius token');

    const focusBody = ruleBody(css, '#section-coach-kpi .kpi-upload-kind:focus,');
    assert(focusBody !== null,
        'focus rule for .kpi-upload-kind / .kpi-upload-date exists');
    assert(focusBody && /border-color:\s*#d97706/i.test(focusBody),
        'focus border is amber (#d97706)');
})();

console.log('\n=== .kpi-upload-buttons is right-aligned with a top divider ==========\n');
(function testButtonsRow() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-buttons');
    assert(body !== null, '#section-coach-kpi .kpi-upload-buttons rule exists');
    assert(body && /display:\s*flex/i.test(body),
        '.kpi-upload-buttons uses display: flex');
    assert(body && /justify-content:\s*flex-end/i.test(body),
        '.kpi-upload-buttons right-aligns its children');
    assert(body && /border-top:\s*1px\s+solid\s+#e2e8f0/i.test(body),
        '.kpi-upload-buttons carries a top divider');
})();

console.log('\n=== .kpi-upload-buttons .btn-primary forces the amber gradient =======\n');
(function testCommitButtonAmber() {
    const body = ruleBody(css, '#section-coach-kpi .kpi-upload-buttons .btn-primary');
    assert(body !== null,
        '#section-coach-kpi .kpi-upload-buttons .btn-primary rule exists');
    assert(body && /background:\s*linear-gradient\(135deg,\s*#d97706\s*0%,\s*#f59e0b\s*100%\)/i.test(body),
        'commit button background is the amber gradient #d97706 → #f59e0b');
    assert(body && /background:[^;]*!important/i.test(body),
        'commit button background carries !important to defeat the blue cascade');
    assert(body && /color:[^;]*#ffffff[^;]*!important/i.test(body),
        'commit button text colour is white !important');
})();

console.log('\n=== Stats badges use green / amber / red tokens =======================\n');
(function testStats() {
    const matched = ruleBody(css, '#section-coach-kpi .kpi-upload-stats .stat-matched');
    const ambiguous = ruleBody(css, '#section-coach-kpi .kpi-upload-stats .stat-ambiguous');
    const unmatched = ruleBody(css, '#section-coach-kpi .kpi-upload-stats .stat-unmatched');
    assert(matched && /color:\s*#16a34a/i.test(matched),
        '.stat-matched colour is green #16a34a');
    assert(ambiguous && /color:\s*#d97706/i.test(ambiguous),
        '.stat-ambiguous colour is amber #d97706');
    assert(unmatched && /color:\s*#dc2626/i.test(unmatched),
        '.stat-unmatched colour is red #dc2626');
})();

console.log('\n=== Mobile breakpoint stacks buttons full-width =======================\n');
(function testMobileBreakpoint() {
    const mediaMatch = css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}\s*\n/);
    assert(mediaMatch !== null, '@media (max-width: 768px) block exists');

    // Confirm the mobile block contains our upload-modal mobile rules. We
    // scan the entire stylesheet because multiple @media blocks exist.
    assert(/@media\s*\(max-width:\s*768px\)[\s\S]*?#section-coach-kpi\s+\.kpi-upload-buttons\s*\{[\s\S]*?flex-direction:\s*column-reverse/i.test(css),
        'mobile breakpoint sets .kpi-upload-buttons to flex-direction: column-reverse');
    assert(/@media\s*\(max-width:\s*768px\)[\s\S]*?#section-coach-kpi\s+\.kpi-upload-buttons\s+\.btn-primary[\s\S]*?width:\s*100%/i.test(css),
        'mobile breakpoint sets .kpi-upload-buttons .btn-primary width to 100%');
    assert(/@media\s*\(max-width:\s*768px\)[\s\S]*?#section-coach-kpi\s+\.kpi-upload-row\s*\{[\s\S]*?width:\s*100%/i.test(css),
        'mobile breakpoint sets .kpi-upload-row width to 100%');
})();

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
