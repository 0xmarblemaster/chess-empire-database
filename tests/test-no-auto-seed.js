/**
 * Rule (Alex, 2026-11-02): students enter the attendance grid ONLY manually.
 * No code may place a student into a time slot automatically.
 *
 * The removed initializeStudentTimeSlots() positionally bucketed every Halyk
 * Arena student without a saved assignment row into a slot
 * (Math.floor(index / DEFAULT_TIME_SLOT_ROWS)) whenever the bucket was not in
 * DB mode ("All coaches", or a coach with no time_slots rows), so new
 * AmoCRM-created students showed up in a random slot.
 *
 *   a. Behavioural: mirror of the loadAttendanceData post-processing — a
 *      student with no assignment row keeps an empty timeSlotIndexes on every
 *      branch / coach filter / bucket mode.
 *   b. Static guard: every `.timeSlotIndexes =` / `.time_slot_index =` write in
 *      admin-v2.js and admin.js sits in an explicitly allowed function.
 *   c. No positional bucketing remains.
 *
 * Run: node tests/test-no-auto-seed.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = {
    'admin-v2.js': fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8'),
    'admin.js': fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8'),
};

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.log(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
    assert(JSON.stringify(actual) === JSON.stringify(expected),
        `${msg}${JSON.stringify(actual) === JSON.stringify(expected) ? '' : ` (got ${JSON.stringify(actual)})`}`);
}

function fnBody(src, name) {
    const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
    if (!m) return '';
    let depth = 0;
    for (let i = src.indexOf('{', m.index); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(m.index, i + 1);
    }
    return '';
}

// Name of the top-level function enclosing character offset `pos`.
function enclosingFunction(src, pos) {
    const re = /^(?:async\s+)?function\s+(\w+)\s*\(/gm;
    let name = null, m;
    while ((m = re.exec(src)) && m.index < pos) name = m[1];
    return name;
}

// ============================================================================
// a. Behavioural
// ============================================================================
console.log('\n=== a. students without a saved slot stay unassigned =================\n');

// Mirror of loadAttendanceData (admin-v2.js) from building attendanceCalendarData
// through the point where renderAttendanceCalendar() runs. Nothing after the
// saved-assignment step may touch timeSlotIndexes.
function loadCalendar(students, { assignments = [], hiddenStudentIds = [] }) {
    let data = students.map(s => ({ id: s.id, timeSlotIndexes: [] }));
    const assignmentMap = new Map();
    for (const a of assignments) {
        if (!assignmentMap.has(a.studentId)) assignmentMap.set(a.studentId, new Set());
        assignmentMap.get(a.studentId).add(a.timeSlotIndex);
    }
    data.forEach(student => {
        if (assignmentMap.has(student.id)) {
            student.timeSlotIndexes = Array.from(assignmentMap.get(student.id));
        }
    });
    const hidden = new Set(hiddenStudentIds);
    data = data.filter(s => !hidden.has(s.id));
    return data;
}

const roster = Array.from({ length: 25 }, (_, i) => ({ id: `S${i}` }));
const NEW_ID = 'NEW-AMOCRM';
roster.push({ id: NEW_ID });
const saved = {
    assignments: [
        { studentId: 'S0', timeSlotIndex: 0 },
        { studentId: 'S1', timeSlotIndex: 2 },
        { studentId: 'S1', timeSlotIndex: 3 },
    ],
    hiddenStudentIds: ['S2'],
};

const scenarios = [
    'Halyk Arena / All coaches',
    'Halyk Arena / Andrei Olegovich mon_wed (fallback bucket, no DB time_slots)',
    'Halyk Arena / coach with DB time_slots',
    'Debut / All coaches',
    'Gagarin Park / All coaches',
];
for (const label of scenarios) {
    const data = loadCalendar(roster, saved);
    const byId = Object.fromEntries(data.map(s => [s.id, s]));
    assertEqual(byId[NEW_ID].timeSlotIndexes, [], `${label}: new student with no assignment row is in no slot`);
    assertEqual(data.filter(s => s.timeSlotIndexes.length > 0).map(s => s.id), ['S0', 'S1'],
        `${label}: only students with saved rows are placed`);
    assertEqual(byId.S1.timeSlotIndexes, [2, 3], `${label}: saved multi-slot assignment unchanged`);
    assert(!byId.S2, `${label}: hidden student filtered out`);
}

// The real load path must end with no further slot writes after the saved
// assignments are applied (guards against a replacement auto-seed call).
const loadBody = fnBody(SOURCES['admin-v2.js'], 'loadAttendanceData');
assert(loadBody.length > 0, 'admin-v2.js loadAttendanceData found');
const tail = loadBody.slice(loadBody.indexOf('student.timeSlotIndexes = Array.from(assignmentMap.get(student.id))'));
assertEqual((tail.match(/timeSlotIndexes\s*=[^=]/g) || []).length, 1,
    'loadAttendanceData writes timeSlotIndexes only from saved assignments');

// ============================================================================
// b. Static guard on slot writes
// ============================================================================
console.log('\n=== b. slot writes only at allowed sites =============================\n');

const ALLOWED = {
    'admin-v2.js': {
        // applying saved DB assignments (getTimeSlotAssignments)
        loadAttendanceData: 1,
        // drag/drop move between slots (normalise + write the new set)
        moveStudentToTimeSlot: 2,
        // slot delete/hide cleanup (drop the deleted slot from the set)
        deleteStudentFromCalendar: 1,
        // Excel import of slot assignments (normalise + write the new set)
        applyTimeSlotAssignmentsFromImport: 2,
    },
    'admin.js': {
        // applying saved DB assignments
        loadAttendanceData: 1,
        // drag/drop move (student + filtered copy)
        moveStudentToTimeSlot: 2,
        // Excel import of slot assignments
        applyTimeSlotAssignmentsFromImport: 1,
    },
};
// The Add-Student modal persists via the API and reloads the calendar; it
// never writes the in-memory slot field directly.

for (const [file, src] of Object.entries(SOURCES)) {
    const counts = {};
    const re = /\.(?:timeSlotIndexes|time_slot_index)\s*=(?!=)/g;
    let m;
    while ((m = re.exec(src))) {
        const lineStart = src.lastIndexOf('\n', m.index) + 1;
        if (/^\s*\/\//.test(src.slice(lineStart, m.index))) continue; // comment
        const fn = enclosingFunction(src, m.index);
        counts[fn] = (counts[fn] || 0) + 1;
    }
    assertEqual(counts, ALLOWED[file], `${file}: slot writes match the allowed sites exactly`);
}

// ============================================================================
// c. No positional bucketing
// ============================================================================
console.log('\n=== c. no positional auto-seed remains ===============================\n');
for (const [file, src] of Object.entries(SOURCES)) {
    assert(!/Math\.floor\(\s*index\s*\/\s*DEFAULT_TIME_SLOT_ROWS\s*\)/.test(src),
        `${file}: no Math.floor(index / DEFAULT_TIME_SLOT_ROWS) bucketing`);
    assert(!/initializeStudentTimeSlots/.test(src), `${file}: initializeStudentTimeSlots removed`);
}

console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
