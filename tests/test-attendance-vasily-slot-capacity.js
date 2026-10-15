/**
 * Coach Vasily Mikhaylovich: attendance slots hold up to 16 students on every
 * branch/schedule. Priority: Vasily → 16, else Debut branch → 20, else 15.
 *
 * Static source checks + behavioural checks on helpers extracted verbatim
 * from admin-v2.js (isVasilyCoach, isDebutCurrentBranch, getMaxCapacity).
 *
 * Run: node tests/test-attendance-vasily-slot-capacity.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    assert(actual === expected, `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// Extract a top-level `function name(...) { ... }` declaration by brace matching.
function extractFunction(name) {
    const start = ADMIN_SRC.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`function ${name} not found in admin-v2.js`);
    let depth = 0;
    for (let i = ADMIN_SRC.indexOf('{', start); i < ADMIN_SRC.length; i++) {
        if (ADMIN_SRC[i] === '{') depth++;
        else if (ADMIN_SRC[i] === '}' && --depth === 0) return ADMIN_SRC.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
}

function loadHelpers(branch, coach) {
    return new Function('attendanceCurrentBranch', 'attendanceCurrentCoachName', `
        const MAX_TIME_SLOT_CAPACITY = 15;
        const DEBUT_MAX_TIME_SLOT_CAPACITY = 20;
        const VASILY_MAX_TIME_SLOT_CAPACITY = 16;
        ${extractFunction('isVasilyCoach')}
        ${extractFunction('isDebutCurrentBranch')}
        ${extractFunction('getMaxCapacity')}
        return { isVasilyCoach, getMaxCapacity };
    `)(branch, coach);
}

console.log('\n=== constants ===\n');
assert(/const\s+VASILY_MAX_TIME_SLOT_CAPACITY\s*=\s*16\b/.test(ADMIN_SRC),
    'VASILY_MAX_TIME_SLOT_CAPACITY = 16');
assert(/const\s+MAX_TIME_SLOT_CAPACITY\s*=\s*15\b/.test(ADMIN_SRC),
    'MAX_TIME_SLOT_CAPACITY = 15 unchanged');
assert(/const\s+DEBUT_MAX_TIME_SLOT_CAPACITY\s*=\s*20\b/.test(ADMIN_SRC),
    'DEBUT_MAX_TIME_SLOT_CAPACITY = 20 unchanged');

console.log('\n=== isVasilyCoach ===\n');
const { isVasilyCoach } = loadHelpers(null, null);
for (const name of ['Vasily Mikhaylovich', 'VASILY', 'Василий Михайлович']) {
    assertEqual(isVasilyCoach(name), true, `${JSON.stringify(name)} → Vasily`);
}
for (const name of ['Chingis Nurgalimov', '', null, undefined]) {
    assertEqual(isVasilyCoach(name), false, `${JSON.stringify(name)} → not Vasily`);
}
assert(ADMIN_SRC.includes("normalizedCoach.includes('vasily') || normalizedCoach.includes('василий')"),
    'Gagarin slot routing still matches vasily|василий (same rule as isVasilyCoach)');

console.log('\n=== getMaxCapacity ===\n');
for (const schedule of ['mon_wed', 'tue_thu', 'sat_sun']) {
    // Capacity is coach-keyed, independent of schedule.
    assertEqual(loadHelpers('Gagarin Park', 'Vasily Mikhaylovich').getMaxCapacity(), 16,
        `Vasily @ Gagarin Park (${schedule}) → 16`);
}
assertEqual(loadHelpers('Gagarin Park', 'Chingis Nurgalimov').getMaxCapacity(), 15,
    'other Gagarin coach → 15');
assertEqual(loadHelpers('Debut', 'Azamat Coach').getMaxCapacity(), 20,
    'Debut + non-Vasily coach → 20');
assertEqual(loadHelpers('Debut', 'Василий Михайлович').getMaxCapacity(), 16,
    'Vasily @ Debut → 16 (coach takes priority)');
assertEqual(loadHelpers('Gagarin Park', null).getMaxCapacity(), 15,
    'no coach selected → 15');
assertEqual(loadHelpers('Gagarin Park', 'Chingis').getMaxCapacity('Vasily Mikhaylovich'), 16,
    'explicit coachName argument overrides current coach');

console.log('\n=== capacity gate arithmetic ===\n');
const cap = loadHelpers('Gagarin Park', 'Vasily Mikhaylovich').getMaxCapacity();
assertEqual(15 >= cap, false, '16th student allowed (15 in slot < 16)');
assertEqual(16 >= cap, true, '17th student rejected (16 in slot >= 16)');

console.log('\n=== call sites ===\n');
assert(/time-slot-count">\(\$\{studentCount\}\/\$\{getMaxCapacity\(\)\}\)/.test(ADMIN_SRC),
    'slot header uses getMaxCapacity()');
assert(/rowsToRender\s*=\s*Math\.max\(\s*getDefaultRows\(\)\s*,\s*Math\.min\(\s*actualStudentCount\s*,\s*getMaxCapacity\(\)\s*\)\s*\)/.test(ADMIN_SRC),
    'rowsToRender capped by getMaxCapacity()');
assert(!/\.replace\('10'/.test(ADMIN_SRC), "no .replace('10' left in admin-v2.js");
assert(/\.replace\('\{max\}',\s*maxCapacity\.toString\(\)\)/.test(ADMIN_SRC),
    'drag toast substitutes {max}');
assert(ADMIN_SRC.includes("'Time slot {slot} is full ({max} students max)'"),
    'drag toast English fallback uses {max}');
const coachIdx = ADMIN_SRC.indexOf('coachName = coach ? `${coach.firstName} ${coach.lastName}` : null;');
const capIdx = ADMIN_SRC.indexOf('const selectedBranchMaxCapacity');
assert(coachIdx !== -1 && capIdx !== -1 && coachIdx < capIdx,
    'add-student modal resolves coachName before the capacity check');
assert(/selectedBranchMaxCapacity\s*=\s*isVasilyCoach\(coachName\)\s*\?\s*VASILY_MAX_TIME_SLOT_CAPACITY/.test(ADMIN_SRC),
    'add-student modal cap prefers Vasily → 16');

console.log('\n=== i18n slotFull ===\n');
const slotFull = [...I18N_SRC.matchAll(/"admin\.attendance\.slotFull":\s*"([^"]*)"/g)].map(m => m[1]);
assertEqual(slotFull.length, 3, 'slotFull defined in EN, KZ, RU');
for (const s of slotFull) {
    assert(s.includes('{max}') && !s.includes('15'), `"${s}" uses {max}, no hard-coded 15`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
