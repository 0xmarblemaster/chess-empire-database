/**
 * Tests for the mobile polish on the App Access page card layout.
 *
 * On narrow viewports the card header used to be a single horizontal row
 * (user info on the left, role dropdown + delete button on the right). Long
 * emails pushed the role dropdown off-screen and the delete button collapsed
 * below the 44x44 touch-target threshold.
 *
 * This test asserts the CSS rules added inside @media (max-width: 768px)
 * that stack the header vertically, ellipsify long text, widen the role
 * selector, and restore a proper tap target on the delete button.
 *
 * Run: node tests/test-app-access-mobile.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'admin-styles.css'), 'utf8');

// Extract the @media (max-width: 768px) block that contains the mobile polish.
// We locate the comment marker that anchors the block so we don't pick up an
// unrelated breakpoint elsewhere in the file.
const anchorIdx = CSS.indexOf('Mobile polish for More-menu destinations');
if (anchorIdx === -1) {
    console.error('FAIL: could not find "Mobile polish for More-menu destinations" anchor comment');
    process.exit(1);
}
const mediaStart = CSS.indexOf('@media (max-width: 768px)', anchorIdx);
if (mediaStart === -1) {
    console.error('FAIL: @media (max-width: 768px) block not found after anchor');
    process.exit(1);
}
// Find the matching closing brace of the @media block by counting braces.
const bodyStart = CSS.indexOf('{', mediaStart);
let depth = 0;
let bodyEnd = -1;
for (let i = bodyStart; i < CSS.length; i++) {
    const ch = CSS[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
        depth--;
        if (depth === 0) { bodyEnd = i; break; }
    }
}
if (bodyEnd === -1) {
    console.error('FAIL: could not find closing brace of mobile @media block');
    process.exit(1);
}
const MOBILE_BLOCK = CSS.slice(bodyStart, bodyEnd + 1);

console.log('\n=== App Access card header stacks vertically =========================\n');

const headerRule = /\.app-access-card-header\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(headerRule !== null, 'mobile block: .app-access-card-header rule exists');
const headerBody = headerRule ? headerRule[0] : '';
assert(/flex-direction:\s*column/.test(headerBody),
    '.app-access-card-header { flex-direction: column }');
assert(/align-items:\s*stretch/.test(headerBody),
    '.app-access-card-header { align-items: stretch }');
assert(/gap:\s*0\.75rem/.test(headerBody),
    '.app-access-card-header { gap: 0.75rem }');

console.log('\n=== Header right-side wrapper spans full width =======================\n');

const lastChildRule = /\.app-access-card-header\s*>\s*div:last-child\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(lastChildRule !== null,
    'mobile block: .app-access-card-header > div:last-child rule exists');
const lastChildBody = lastChildRule ? lastChildRule[0] : '';
assert(/width:\s*100%/.test(lastChildBody),
    '.app-access-card-header > div:last-child { width: 100% }');
assert(/justify-content:\s*space-between/.test(lastChildBody),
    '.app-access-card-header > div:last-child { justify-content: space-between }');

console.log('\n=== Role selector takes available row width ==========================\n');

const roleRule = /\.app-access-role-selector\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(roleRule !== null, 'mobile block: .app-access-role-selector rule exists');
const roleBody = roleRule ? roleRule[0] : '';
assert(/flex:\s*1/.test(roleBody),
    '.app-access-role-selector { flex: 1 }');
assert(/min-width:\s*0/.test(roleBody),
    '.app-access-role-selector { min-width: 0 }');
assert(/width:\s*100%/.test(roleBody),
    '.app-access-role-selector { width: 100% }');

console.log('\n=== Delete button hits 44x44 tap target ==============================\n');

const delRule = /\.app-access-delete-btn\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(delRule !== null, 'mobile block: .app-access-delete-btn rule exists');
const delBody = delRule ? delRule[0] : '';
assert(/min-width:\s*44px/.test(delBody),
    '.app-access-delete-btn { min-width: 44px }');
assert(/min-height:\s*44px/.test(delBody),
    '.app-access-delete-btn { min-height: 44px }');
assert(/padding:\s*0\.625rem\s+0\.875rem\s*!important/.test(delBody),
    '.app-access-delete-btn { padding: 0.625rem 0.875rem !important }');

console.log('\n=== Card padding tightened on mobile =================================\n');

const cardRule = /\.app-access-card\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(cardRule !== null, 'mobile block: .app-access-card rule exists');
const cardBody = cardRule ? cardRule[0] : '';
assert(/padding:\s*1rem/.test(cardBody),
    '.app-access-card { padding: 1rem }');

console.log('\n=== User info allows truncation ======================================\n');

const userInfoRule = /\.app-access-user-info\s*\{[^}]*\}/.exec(MOBILE_BLOCK);
assert(userInfoRule !== null, 'mobile block: .app-access-user-info rule exists');
const userInfoBody = userInfoRule ? userInfoRule[0] : '';
assert(/min-width:\s*0/.test(userInfoBody),
    '.app-access-user-info { min-width: 0 }');

console.log('\n=== Long emails/names get an ellipsis instead of overflowing =========\n');

// Combined selector: .app-access-user-details h3, .app-access-user-details p
const detailsRule =
    /\.app-access-user-details\s+h3\s*,\s*\.app-access-user-details\s+p\s*\{[^}]*\}/
    .exec(MOBILE_BLOCK);
assert(detailsRule !== null,
    'mobile block: .app-access-user-details h3, .app-access-user-details p rule exists');
const detailsBody = detailsRule ? detailsRule[0] : '';
assert(/overflow:\s*hidden/.test(detailsBody),
    '.app-access-user-details h3,p { overflow: hidden }');
assert(/text-overflow:\s*ellipsis/.test(detailsBody),
    '.app-access-user-details h3,p { text-overflow: ellipsis }');
assert(/white-space:\s*nowrap/.test(detailsBody),
    '.app-access-user-details h3,p { white-space: nowrap }');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
