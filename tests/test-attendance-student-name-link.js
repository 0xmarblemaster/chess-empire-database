/**
 * Tests for the clickable student names in the attendance calendar
 * (admin-v2.js). The names render as real anchors to student.html?id=<uuid>
 * WITHOUT breaking the row's move-student drag-and-drop.
 *
 * These are plain source-assertion tests (like the other attendance tests):
 * they read admin-v2.js as text and assert on the rendered markup and the
 * drag/click-guard logic.
 *
 * Run: node tests/test-attendance-student-name-link.js
 *
 * Covers:
 *   - The attendance row template renders <a href="student.html?id=${student.id}">
 *   - The anchor is draggable="false" (so native anchor drag can't hijack move)
 *   - handleStudentDragEnd sets the drag-just-ended flag
 *   - The click guard references that flag and preventDefault()s only then
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
const SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

console.log('\n=== student name renders as an anchor to the student card ============\n');

// The full anchor open tag, template-literal form, as rendered in the row.
const anchorIdx = SRC.indexOf('<a href="student.html?id=${student.id}"');
assert(anchorIdx > 0,
    'row template contains <a href="student.html?id=${student.id}">');

// Grab the anchor open tag to assert its attributes together.
const anchorTag = SRC.slice(anchorIdx, SRC.indexOf('>', anchorIdx) + 1);
assert(/draggable="false"/.test(anchorTag),
    'anchor is draggable="false" (native anchor drag disabled so move-student wins)');
assert(/class="[^"]*student-name-link[^"]*"/.test(anchorTag),
    'anchor carries the student-name-link class (hover affordance)');
assert(/onclick="return handleStudentNameClick\(event\)"/.test(anchorTag),
    'anchor click routes through handleStudentNameClick guard');

// The old inert span must be gone — the name is now a link, not a plain span.
assert(SRC.indexOf('<span class="student-name-text" style="flex: 1;">') === -1,
    'old inert <span class="student-name-text"> name markup is replaced by the anchor');

console.log('\n=== drag-end sets the click guard flag ==============================\n');

const dragEndIdx = SRC.indexOf('function handleStudentDragEnd');
assert(dragEndIdx > 0, 'handleStudentDragEnd exists');
const dragEndBody = SRC.slice(dragEndIdx, SRC.indexOf('function handleStudentNameClick'));
assert(/window\.__attendanceDragJustEnded\s*=\s*true/.test(dragEndBody),
    'handleStudentDragEnd sets window.__attendanceDragJustEnded = true');
assert(/setTimeout\([\s\S]*?window\.__attendanceDragJustEnded\s*=\s*false/.test(dragEndBody),
    'flag is cleared via setTimeout (so a later deliberate click still navigates)');

console.log('\n=== click guard references the flag ================================\n');

const clickIdx = SRC.indexOf('function handleStudentNameClick');
assert(clickIdx > 0, 'handleStudentNameClick exists');
const clickBody = SRC.slice(clickIdx, SRC.indexOf('\n}', clickIdx) + 2);
assert(/window\.__attendanceDragJustEnded/.test(clickBody),
    'click guard reads window.__attendanceDragJustEnded');
assert(/event\.preventDefault\(\)/.test(clickBody),
    'click guard calls event.preventDefault() when the flag is set');
// The preventDefault must be gated by the flag, not unconditional — otherwise
// normal / Ctrl+click / middle-click navigation would break.
assert(/if\s*\(\s*window\.__attendanceDragJustEnded\s*\)\s*\{[^}]*preventDefault/.test(clickBody),
    'preventDefault is guarded by the flag (normal + modified clicks still navigate)');

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
