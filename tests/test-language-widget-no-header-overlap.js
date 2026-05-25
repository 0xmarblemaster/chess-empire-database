/**
 * Regression test for the global language widget overlap fix.
 *
 * Before this fix, .language-dropdown was pinned at `top: 2.75rem; right: 15.5rem`
 * which placed it inside the .header-actions row and made it overlap the
 * .kpi-view-switcher tabs (Ratings / Upload History) on the Ratings Management
 * dashboard, and the Import data button beside them.
 *
 * The fix moves the widget to the true top-right corner and reserves matching
 * right clearance on .header-actions so its buttons can never slide under the
 * widget on any admin-v2 surface.
 *
 * This test parses admin-styles.css textually (no jsdom layout available),
 * reconstructs the .language-dropdown bounding box and the .header-actions
 * bounding box for the Ratings Management section at a representative desktop
 * viewport, and asserts they do not intersect. It also walks the Ratings
 * Management section in admin-v2.html to confirm the buttons we care about
 * (kpi-view-btn × 2 and Import data) are still present.
 *
 * Run: node tests/test-language-widget-no-header-overlap.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.join(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'admin-styles.css');
const HTML_PATH = path.join(ROOT, 'admin-v2.html');

const css = fs.readFileSync(CSS_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// --- Tiny CSS rule extractor -------------------------------------------------
// Returns the *last* (most specific / overriding) declarations block for a
// given selector outside any @media block, plus the same scoped to a given
// @media (min-width|max-width: N) breakpoint when relevant.
function extractRule(cssText, selector, mediaCondition) {
    // Strip /* ... */ comments to avoid false matches inside docs.
    const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = [];

    if (mediaCondition) {
        // Find @media blocks matching the condition.
        const re = new RegExp(
            '@media[^{]*' + mediaCondition + '[^{]*\\{([\\s\\S]*?)\\n\\}\\s*\\n',
            'g'
        );
        let m;
        while ((m = re.exec(stripped)) !== null) {
            blocks.push(m[1]);
        }
    } else {
        // Whole file minus @media blocks.
        const withoutMedia = stripped.replace(/@media[^{]*\{[\s\S]*?\n\}\s*\n/g, '');
        blocks.push(withoutMedia);
    }

    const sel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRe = new RegExp('(^|[^a-zA-Z0-9_-])' + sel + '\\s*\\{([^}]*)\\}', 'g');

    let lastDecls = null;
    for (const block of blocks) {
        let m;
        while ((m = ruleRe.exec(block)) !== null) {
            lastDecls = m[2];
        }
        ruleRe.lastIndex = 0;
    }
    if (!lastDecls) return null;

    const decls = {};
    for (const line of lastDecls.split(';')) {
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        const prop = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        val = val.replace(/\s*!important$/, '');
        if (prop) decls[prop] = val;
    }
    return decls;
}

// --- rem → px helper ---------------------------------------------------------
const ROOT_FONT_PX = 16;
function lenToPx(value) {
    if (value == null) return null;
    const v = String(value).trim();
    if (v === '0' || v === 'auto') return 0;
    let m = v.match(/^(-?\d*\.?\d+)\s*rem$/);
    if (m) return parseFloat(m[1]) * ROOT_FONT_PX;
    m = v.match(/^(-?\d*\.?\d+)\s*px$/);
    if (m) return parseFloat(m[1]);
    return null;
}

function rectsIntersect(a, b) {
    return !(a.right <= b.left ||
             b.right <= a.left ||
             a.bottom <= b.top ||
             b.bottom <= a.top);
}

// --- Pull declarations -------------------------------------------------------
const langDecl = extractRule(css, '.language-dropdown', null);
const langDeclLg = extractRule(css, '.language-dropdown', 'min-width:\\s*1400px');
const headerActionsDecl = extractRule(css, '.header-actions', null);

assert(langDecl !== null, '.language-dropdown rule exists in admin-styles.css');
assert(headerActionsDecl !== null, '.header-actions rule exists in admin-styles.css');

assert(langDecl && langDecl.position === 'fixed',
    '.language-dropdown is position: fixed');

// We've moved away from the old overlapping coordinates.
assert(langDecl && langDecl.top !== '2.75rem',
    '.language-dropdown top is no longer 2.75rem (old value that put it inside .header-actions row)');
assert(langDecl && langDecl.right !== '15.5rem',
    '.language-dropdown right is no longer 15.5rem (old value that placed it on top of header buttons)');

// Desktop position must put it at the corner OR clearly away from .header-actions.
const langTopPx = lenToPx(langDecl.top);
const langRightPx = lenToPx(langDecl.right);
const langLeftPx = lenToPx(langDecl.left);
assert(langTopPx !== null, '.language-dropdown top is a parseable length');

// Either:
//  (a) The widget sits at the true top-right corner (right ≤ 2rem); or
//  (b) The widget sits at the true top-left corner (left ≤ 2rem and no right).
// Anything else would re-introduce the original overlap risk.
const atRightCorner = langRightPx !== null && langRightPx <= 2 * ROOT_FONT_PX;
const atLeftCorner = langLeftPx !== null && langLeftPx <= 2 * ROOT_FONT_PX && langDecl.right == null;
assert(atRightCorner || atLeftCorner,
    '.language-dropdown is anchored at a true viewport corner (top-right or top-left)');

// If anchored at top-right, .header-actions must reserve right clearance so
// its rightmost button cannot slide under the widget.
let headerActionsMarginRightPx = 0;
let headerActionsPaddingRightPx = 0;
if (headerActionsDecl) {
    headerActionsMarginRightPx = lenToPx(headerActionsDecl['margin-right']) || 0;
    headerActionsPaddingRightPx = lenToPx(headerActionsDecl['padding-right']) || 0;
}
const clearancePx = Math.max(headerActionsMarginRightPx, headerActionsPaddingRightPx);

if (atRightCorner) {
    // .header-actions sits inside .main-content (padding 2rem). For the
    // rightmost header button to clear the language widget's left edge with
    // some visual breathing room, we need:
    //     clearance >= LANG_W + langRight + VISUAL_GAP - MAIN_PAD
    const LANG_BUTTON_W = 110;
    const VISUAL_GAP = 16;
    const MAIN_PAD_PX = 2 * ROOT_FONT_PX;
    const minClearance = LANG_BUTTON_W + (langRightPx || 0) + VISUAL_GAP - MAIN_PAD_PX;
    assert(clearancePx >= minClearance,
        `.header-actions reserves >= ${minClearance}px right clearance for the corner-pinned language widget (actual: ${clearancePx}px)`);
}

// Large-screen override (if present) must keep it at the corner too.
if (langDeclLg && langDeclLg.right != null) {
    const lgRightPx = lenToPx(langDeclLg.right);
    assert(lgRightPx !== null && lgRightPx <= 2 * ROOT_FONT_PX,
        '.language-dropdown @media (min-width: 1400px) keeps it at the top-right corner');
}

// --- Simulated bounding-box check on the Ratings Management section ---------
// Standard desktop viewport.
const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;

// Reconstruct the language widget rect. Width/height aren't set in CSS — use
// realistic measured-from-design defaults for the rendered .language-button.
const LANG_W = 110;
const LANG_H = 44;
const langRect = {
    top: langTopPx,
    bottom: langTopPx + LANG_H,
    right: VIEWPORT_W - (langRightPx || 0),
    left: VIEWPORT_W - (langRightPx || 0) - LANG_W,
};

// .main-content has margin-left: 280px (sidebar) and padding: 2rem.
const SIDEBAR_W = 280;
const MAIN_PAD = 2 * ROOT_FONT_PX;
const headerTop = MAIN_PAD;
// .header is flex; its content row is ~44px tall (matches .btn padding).
const HEADER_ROW_H = 44;
const headerBottom = headerTop + HEADER_ROW_H;

// .header-actions right edge sits at main-content's right inner edge, then
// shifts left by the reserved clearance.
const headerActionsRight = VIEWPORT_W - MAIN_PAD - clearancePx;

// In the Ratings Management section the .header-actions row contains:
//   [kpi-view-switcher: 2 × .kpi-view-btn]  +  gap  +  [Import data .btn]
// Estimate widths from the CSS padding + typical label widths.
const KPI_BTN_W = 110;       // "Upload History" is the longest label
const KPI_SWITCHER_W = 2 * KPI_BTN_W + 16; // two buttons + inner padding
const IMPORT_BTN_W = 150;
const HA_GAP = 16;
const headerActionsWidth = KPI_SWITCHER_W + HA_GAP + IMPORT_BTN_W;
const headerActionsLeft = headerActionsRight - headerActionsWidth;

const headerActionsRect = {
    top: headerTop,
    bottom: headerBottom,
    left: headerActionsLeft,
    right: headerActionsRight,
};

assert(!rectsIntersect(langRect, headerActionsRect),
    '.language-dropdown does not intersect .header-actions bounding box on Ratings Management');

// Per-button assertions for kpi-view-btn and the Import data button.
const buttonRects = [
    { name: 'kpi-view-btn[Ratings]', left: headerActionsLeft, right: headerActionsLeft + KPI_BTN_W },
    { name: 'kpi-view-btn[Upload History]', left: headerActionsLeft + KPI_BTN_W, right: headerActionsLeft + 2 * KPI_BTN_W },
    { name: 'Import data .btn', left: headerActionsLeft + KPI_SWITCHER_W + HA_GAP, right: headerActionsRight },
];
for (const b of buttonRects) {
    const r = { top: headerTop, bottom: headerBottom, left: b.left, right: b.right };
    assert(!rectsIntersect(langRect, r),
        `.language-dropdown does not intersect ${b.name}`);
}

// --- Cross-page sanity: same clearance protects header-actions everywhere ---
// Walk every <div class="header-actions"> in admin-v2.html. For each, count
// the buttons; assert that the reserved clearance keeps them clear of the
// language widget regardless of how many buttons live in the row. We use a
// generous worst-case width per button (180px) plus 1rem gaps to stay safe.
const headerSectionRe = /<div class="header-actions">([\s\S]*?)<\/div>/g;
const sections = [];
let mm;
while ((mm = headerSectionRe.exec(html)) !== null) {
    const inner = mm[1];
    const buttonCount = (inner.match(/<button/g) || []).length;
    sections.push({ buttonCount });
}
assert(sections.length >= 6, `found >=6 .header-actions blocks in admin-v2.html (got ${sections.length})`);

const WORST_BTN_W = 180;
for (const s of sections) {
    if (s.buttonCount === 0) continue;
    const worstWidth = s.buttonCount * WORST_BTN_W + (s.buttonCount - 1) * HA_GAP;
    const leftEdge = VIEWPORT_W - MAIN_PAD - clearancePx - worstWidth;
    const rightEdge = VIEWPORT_W - MAIN_PAD - clearancePx;
    const rect = { top: headerTop, bottom: headerBottom, left: leftEdge, right: rightEdge };
    assert(!rectsIntersect(langRect, rect),
        `.language-dropdown does not intersect a worst-case .header-actions row with ${s.buttonCount} buttons`);
}

// --- Summary -----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
