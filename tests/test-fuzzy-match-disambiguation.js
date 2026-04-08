/**
 * Tests for fuzzy match disambiguation feature.
 * Run: node tests/test-fuzzy-match-disambiguation.js
 */

// === Extract functions from admin-v2.js for testing ===

// Levenshtein distance (copied from admin-v2.js)
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
            }
        }
    }
    return dp[m][n];
}

// fuzzyMatchStudent (copied from admin-v2.js — updated with disambiguation at all tiers)
function fuzzyMatchStudent(excelName, students) {
    if (!excelName || !students || students.length === 0) {
        return { matched: false, student: null, confidence: 0 };
    }

    const normalizedExcel = excelName.trim().toLowerCase();
    const parts = normalizedExcel.split(/\s+/).filter(p => p.length > 0);

    // Try exact match first (lastName firstName or firstName lastName)
    const exactMatches = [];
    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();
        const fullName1 = `${lastName} ${firstName}`;
        const fullName2 = `${firstName} ${lastName}`;

        if (normalizedExcel === fullName1 || normalizedExcel === fullName2) {
            exactMatches.push(student);
        }
    }

    if (exactMatches.length === 1) {
        return { matched: true, student: exactMatches[0], confidence: 100 };
    }
    if (exactMatches.length > 1) {
        return { matched: true, student: exactMatches[0], confidence: 100, ambiguous: true, candidates: exactMatches };
    }

    // Try partial match with improved validation (80% confidence)
    const MIN_SUBSTRING_LENGTH = 4;
    const MIN_TOKEN_SIMILARITY = 0.75;
    const MIN_WHOLE_NAME_SIMILARITY = 0.80;

    const fuzzyMatches80 = [];
    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();
        const studentParts = [firstName, lastName];
        let matchedTokens = 0;

        for (const part of parts) {
            let tokenMatched = false;
            for (const sp of studentParts) {
                if (!sp || sp.length === 0) continue;
                if (part === sp) { tokenMatched = true; break; }
                if (part.length >= MIN_SUBSTRING_LENGTH && sp.includes(part)) { tokenMatched = true; break; }
                else if (sp.length >= MIN_SUBSTRING_LENGTH && part.includes(sp)) { tokenMatched = true; break; }
                const distance = levenshteinDistance(part, sp);
                const maxLen = Math.max(part.length, sp.length);
                const similarity = (maxLen - distance) / maxLen;
                if (similarity >= MIN_TOKEN_SIMILARITY && maxLen >= MIN_SUBSTRING_LENGTH) { tokenMatched = true; break; }
            }
            if (tokenMatched) matchedTokens++;
        }

        if (matchedTokens === parts.length && parts.length >= 2) {
            const fullName1 = `${firstName} ${lastName}`;
            const fullName2 = `${lastName} ${firstName}`;
            const dist1 = levenshteinDistance(normalizedExcel, fullName1);
            const dist2 = levenshteinDistance(normalizedExcel, fullName2);
            const minDist = Math.min(dist1, dist2);
            const maxLen = Math.max(normalizedExcel.length, fullName1.length);
            const wholeSimilarity = (maxLen - minDist) / maxLen;
            if (wholeSimilarity >= MIN_WHOLE_NAME_SIMILARITY) {
                fuzzyMatches80.push(student);
            }
        }
    }

    if (fuzzyMatches80.length === 1) {
        return { matched: true, student: fuzzyMatches80[0], confidence: 80 };
    }
    if (fuzzyMatches80.length > 1) {
        return { matched: true, student: fuzzyMatches80[0], confidence: 80, ambiguous: true, candidates: fuzzyMatches80 };
    }

    // Try matching with slight variations
    const fuzzyMatches60 = [];
    for (const student of students) {
        const firstName = (student.firstName || '').toLowerCase();
        const lastName = (student.lastName || '').toLowerCase();
        if (parts.some(p => p === firstName) || parts.some(p => p === lastName)) {
            const otherParts = parts.filter(p => p !== firstName && p !== lastName);
            if (otherParts.length === 0 || otherParts.some(p =>
                firstName.includes(p) || lastName.includes(p) || p.includes(firstName) || p.includes(lastName)
            )) {
                fuzzyMatches60.push(student);
            }
        }
    }

    if (fuzzyMatches60.length === 1) {
        return { matched: true, student: fuzzyMatches60[0], confidence: 60 };
    }
    if (fuzzyMatches60.length > 1) {
        return { matched: true, student: fuzzyMatches60[0], confidence: 60, ambiguous: true, candidates: fuzzyMatches60 };
    }

    return { matched: false, student: null, confidence: 0 };
}

// findBestFuzzyMatch (copied from admin-v2.js — updated with duplicate detection)
function findBestFuzzyMatch(transliteratedName, students) {
    const nameLower = transliteratedName.toLowerCase().trim();

    const nameParts = nameLower.split(/\s+/);
    const nameReversed = nameParts.length >= 2
        ? nameParts.slice(1).join(' ') + ' ' + nameParts[0]
        : nameLower;

    const scored = [];
    for (const student of students) {
        const fullNameNormal = `${student.firstName} ${student.lastName}`.toLowerCase();
        const fullNameReversed = `${student.lastName} ${student.firstName}`.toLowerCase();

        const distanceNormal = levenshteinDistance(nameLower, fullNameNormal);
        const maxLenNormal = Math.max(nameLower.length, fullNameNormal.length);
        const similarityNormal = ((maxLenNormal - distanceNormal) / maxLenNormal) * 100;

        const distanceReversed = levenshteinDistance(nameReversed, fullNameNormal);
        const maxLenReversed = Math.max(nameReversed.length, fullNameNormal.length);
        const similarityReversed = ((maxLenReversed - distanceReversed) / maxLenReversed) * 100;

        const distanceDbReversed = levenshteinDistance(nameLower, fullNameReversed);
        const maxLenDbReversed = Math.max(nameLower.length, fullNameReversed.length);
        const similarityDbReversed = ((maxLenDbReversed - distanceDbReversed) / maxLenDbReversed) * 100;

        const bestSimilarity = Math.max(similarityNormal, similarityReversed, similarityDbReversed);
        scored.push({ student, confidence: bestSimilarity });
    }

    if (scored.length === 0) return null;

    const bestConfidence = Math.max(...scored.map(s => s.confidence));
    if (bestConfidence < 60) return null;

    const topMatches = scored.filter(s => s.confidence >= bestConfidence - 2 && s.confidence >= 60);

    if (topMatches.length === 1) {
        return { student: topMatches[0].student, confidence: Math.round(bestConfidence) };
    }

    return {
        student: topMatches[0].student,
        confidence: Math.round(bestConfidence),
        ambiguous: true,
        candidates: topMatches.map(m => m.student)
    };
}

// Minimal i18n stub
function t(key) {
    const translations = {
        'admin.ratings.unmatched': 'Not found',
        'admin.ratings.ambiguousMatch': 'Multiple matches',
        'admin.ratings.selectCorrectStudent': 'Select the correct student...',
        'admin.ratings.ambiguous': 'ambiguous',
        'admin.ratings.matched': 'Matched',
        'admin.ratings.invalidRating': 'Invalid rating',
        'admin.ratings.disambiguateAge': 'Age',
        'admin.ratings.disambiguateDob': 'DOB',
        'admin.ratings.disambiguateLevel': 'Level',
        'admin.ratings.disambiguateBranch': 'Branch',
        'admin.ratings.disambiguateCoach': 'Coach',
    };
    return translations[key] || key;
}

// Stub for i18n.translateBranchName
const i18n = { translateBranchName: (name) => name };

// getStudentDisambiguationLabel (copied from admin-v2.js)
function getStudentDisambiguationLabel(student) {
    const name = `${student.firstName} ${student.lastName}`;
    const parts = [name];
    if (student.age) parts.push(`${t('admin.ratings.disambiguateAge')}: ${student.age}`);
    if (student.dateOfBirth) parts.push(`${t('admin.ratings.disambiguateDob')}: ${student.dateOfBirth}`);
    if (student.currentLevel) parts.push(`${t('admin.ratings.disambiguateLevel')}: ${student.currentLevel}`);
    if (student.branch) {
        const branchName = typeof i18n !== 'undefined' && i18n.translateBranchName
            ? i18n.translateBranchName(student.branch)
            : student.branch;
        parts.push(`${t('admin.ratings.disambiguateBranch')}: ${branchName}`);
    }
    if (student.coach) parts.push(`${t('admin.ratings.disambiguateCoach')}: ${student.coach}`);
    return parts.join(' | ');
}

// processMatchedRows (copied from admin-v2.js — needs globalStudents stub)
function processMatchedRows(rows) {
    const parsedData = [];
    const unmatched = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let ambiguousCount = 0;

    const previewRows = [];
    const today = new Date().toISOString().split('T')[0];
    let rowIndex = 0;

    for (const row of rows) {
        if (!row.name) continue;

        const matchResult = fuzzyMatchStudent(row.name, globalStudents);

        let statusText = '';
        let statusColor = '#10b981';
        let statusIcon = '✓';
        let extraHtml = '';

        if (!matchResult.matched) {
            statusText = t('admin.ratings.unmatched');
            statusColor = '#ef4444';
            statusIcon = '✗';
            errorCount++;
            unmatched.push({ rowNum: row.rowNum, name: row.name, rating: row.rating });
        } else if (matchResult.ambiguous) {
            statusText = t('admin.ratings.ambiguousMatch');
            statusColor = '#f97316';
            statusIcon = '⚠';
            ambiguousCount++;
            extraHtml = '<tr>disambiguation row</tr>';
        } else if (isNaN(row.rating) || row.rating < 0 || row.rating > 3000) {
            statusText = t('admin.ratings.invalidRating');
            statusColor = '#f59e0b';
            statusIcon = '⚠';
            warningCount++;
        } else {
            statusText = t('admin.ratings.matched');
            if (matchResult.confidence < 100) {
                statusText += ` (${matchResult.confidence}%)`;
                statusColor = '#22c55e';
            }
            validCount++;
            parsedData.push({
                studentId: matchResult.student.id,
                studentName: row.name,
                matchedName: `${matchResult.student.firstName} ${matchResult.student.lastName}`,
                rating: row.rating,
                date: today
            });
        }

        previewRows.push(`<tr>${row.name}</tr>`);
        if (extraHtml) previewRows.push(extraHtml);
        rowIndex++;
    }

    return { csvParsedData: parsedData, unmatchedStudentsData: unmatched, previewRows, validCount, warningCount, errorCount, ambiguousCount };
}

// === Test helpers ===
let testsPassed = 0;
let testsFailed = 0;
let globalStudents = [];

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        console.log(`  ✓ ${message}`);
    } else {
        testsFailed++;
        console.error(`  ✗ FAIL: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        testsPassed++;
        console.log(`  ✓ ${message}`);
    } else {
        testsFailed++;
        console.error(`  ✗ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

// === Test data ===
const studentAmirAge12 = { id: '1', firstName: 'Amir', lastName: 'Iskakov', age: 12, dateOfBirth: '2014-03-15', currentLevel: 5, branch: 'Almaty Central', coach: 'Ivan Petrov' };
const studentAmirAge4 = { id: '2', firstName: 'Amir', lastName: 'Iskakov', age: 4, dateOfBirth: '2022-01-20', currentLevel: 1, branch: 'Almaty South', coach: 'Anna Kozlova' };
const studentUnique = { id: '3', firstName: 'Marat', lastName: 'Suleimanov', age: 10, dateOfBirth: '2016-05-10', currentLevel: 3, branch: 'Almaty Central', coach: 'Ivan Petrov' };
const studentSimilar = { id: '4', firstName: 'Amira', lastName: 'Iskakova', age: 9, dateOfBirth: '2017-07-01', currentLevel: 2, branch: 'Astana', coach: 'Pavel Sidorov' };

// === Tests ===

console.log('\n=== fuzzyMatchStudent tests ===\n');

console.log('Test group: Single unique match');
{
    const students = [studentAmirAge12, studentUnique, studentSimilar];
    const result = fuzzyMatchStudent('Iskakov Amir', students);
    assert(result.matched === true, 'Single exact match returns matched=true');
    assertEqual(result.confidence, 100, 'Single exact match has 100% confidence');
    assertEqual(result.student.id, '1', 'Single exact match returns correct student');
    assert(!result.ambiguous, 'Single exact match is NOT ambiguous');
}

console.log('\nTest group: Duplicate name - ambiguous exact match');
{
    const students = [studentAmirAge12, studentAmirAge4, studentUnique, studentSimilar];
    const result = fuzzyMatchStudent('Iskakov Amir', students);
    assert(result.matched === true, 'Ambiguous match returns matched=true');
    assertEqual(result.confidence, 100, 'Ambiguous match has 100% confidence');
    assert(result.ambiguous === true, 'Ambiguous match has ambiguous=true');
    assertEqual(result.candidates.length, 2, 'Ambiguous match returns 2 candidates');
    assert(result.candidates.some(c => c.id === '1'), 'Candidates include Amir age 12');
    assert(result.candidates.some(c => c.id === '2'), 'Candidates include Amir age 4');
}

console.log('\nTest group: Duplicate name - reversed name order');
{
    const students = [studentAmirAge12, studentAmirAge4, studentUnique];
    const result = fuzzyMatchStudent('Amir Iskakov', students);
    assert(result.matched === true, 'Reversed name order returns matched=true');
    assert(result.ambiguous === true, 'Reversed name order is ambiguous');
    assertEqual(result.candidates.length, 2, 'Reversed name order returns 2 candidates');
}

console.log('\nTest group: No match');
{
    const students = [studentAmirAge12, studentUnique];
    const result = fuzzyMatchStudent('NonExistent Person', students);
    assert(result.matched === false, 'Non-existent name returns matched=false');
    assertEqual(result.confidence, 0, 'Non-existent name has 0 confidence');
}

console.log('\nTest group: Empty/null inputs');
{
    const result1 = fuzzyMatchStudent('', [studentUnique]);
    assert(result1.matched === false, 'Empty name returns matched=false');

    const result2 = fuzzyMatchStudent('Marat Suleimanov', []);
    assert(result2.matched === false, 'Empty students array returns matched=false');

    const result3 = fuzzyMatchStudent(null, [studentUnique]);
    assert(result3.matched === false, 'Null name returns matched=false');
}

console.log('\nTest group: Similar but not identical names should NOT be ambiguous');
{
    // Amira Iskakova should not match "Iskakov Amir"
    const students = [studentAmirAge12, studentSimilar];
    const result = fuzzyMatchStudent('Iskakov Amir', students);
    assert(result.matched === true, 'Similar name matched');
    assert(!result.ambiguous, 'Similar but not identical names are NOT ambiguous');
    assertEqual(result.student.id, '1', 'Returns exact match, not similar name');
}

console.log('\nTest group: Fuzzy 80% tier - duplicate names with slight spelling variation');
{
    // Two students with similar names that both match at 80% tier
    const studentA = { id: '10', firstName: 'Arman', lastName: 'Kulov', age: 10 };
    const studentB = { id: '11', firstName: 'Arman', lastName: 'Kulov', age: 7 };
    // These two have identical names so they'd match at 100% exact tier
    // Instead, let's test with a slightly different input that triggers 80% tier
    // Use names that are NOT exact but match via fuzzy at 80%
    const studentC = { id: '12', firstName: 'Daniil', lastName: 'Petrov', age: 10 };
    const studentD = { id: '13', firstName: 'Daniil', lastName: 'Petrov', age: 7 };
    const students = [studentC, studentD, studentUnique];
    // Exact match with duplicates
    const result = fuzzyMatchStudent('Daniil Petrov', students);
    assert(result.matched === true, 'Duplicate exact names matched');
    assert(result.ambiguous === true, 'Duplicate exact names are ambiguous');
    assertEqual(result.candidates.length, 2, 'Returns both candidates');
}

console.log('\nTest group: Fuzzy 80% tier - single fuzzy match is not ambiguous');
{
    // Only one student matches at 80% with a slight spelling variation
    // "Danill" vs "Daniil" has 83% token similarity (above 75% threshold)
    const studentE = { id: '14', firstName: 'Danill', lastName: 'Petrov', age: 10 };
    const students = [studentE, studentUnique];
    const result = fuzzyMatchStudent('Daniil Petrov', students);
    assert(result.matched === true, 'Single fuzzy 80% match found');
    assertEqual(result.confidence, 80, 'Match has 80% confidence');
    assert(!result.ambiguous, 'Single fuzzy 80% match is NOT ambiguous');
}

console.log('\nTest group: Fuzzy 80% tier - two students with same spelling match as ambiguous');
{
    // Two students with identical names that both trigger 80% fuzzy match
    // "Danill" vs "Daniil" = 83% token similarity (above 75% threshold)
    const studentF = { id: '15', firstName: 'Danill', lastName: 'Petrov', age: 10, branch: 'A' };
    const studentG = { id: '16', firstName: 'Danill', lastName: 'Petrov', age: 7, branch: 'B' };
    const students = [studentF, studentG, studentUnique];
    const result = fuzzyMatchStudent('Daniil Petrov', students);
    assert(result.matched === true, 'Fuzzy match found');
    assert(result.ambiguous === true, 'Duplicate fuzzy 80% matches are ambiguous');
    assertEqual(result.candidates.length, 2, 'Returns both candidates');
    assertEqual(result.confidence, 80, 'Fuzzy match has 80% confidence');
}

console.log('\n=== findBestFuzzyMatch tests ===\n');

console.log('Test group: Single best match');
{
    const students = [studentAmirAge12, studentUnique];
    const result = findBestFuzzyMatch('Amir Iskakov', students);
    assert(result !== null, 'Found a match');
    assertEqual(result.student.id, '1', 'Correct student matched');
    assert(!result.ambiguous, 'Single best match is not ambiguous');
    assert(result.confidence >= 90, 'High confidence for exact transliteration');
}

console.log('\nTest group: Duplicate names trigger ambiguous');
{
    const students = [studentAmirAge12, studentAmirAge4, studentUnique];
    const result = findBestFuzzyMatch('Amir Iskakov', students);
    assert(result !== null, 'Found a match');
    assert(result.ambiguous === true, 'Duplicate names are flagged as ambiguous');
    assertEqual(result.candidates.length, 2, 'Returns 2 tied candidates');
    assert(result.candidates.some(c => c.id === '1'), 'Includes Amir age 12');
    assert(result.candidates.some(c => c.id === '2'), 'Includes Amir age 4');
}

console.log('\nTest group: No match below threshold');
{
    const students = [studentUnique];
    const result = findBestFuzzyMatch('Completely Different Name', students);
    assert(result === null, 'No match when name is completely different');
}

console.log('\nTest group: Reversed name order still matches');
{
    const students = [studentAmirAge12, studentUnique];
    const result = findBestFuzzyMatch('Iskakov Amir', students);
    assert(result !== null, 'Found a match with reversed name');
    assertEqual(result.student.id, '1', 'Correct student matched with reversed name');
}

console.log('\nTest group: Three students with same name');
{
    const studentAmir3 = { id: '5', firstName: 'Amir', lastName: 'Iskakov', age: 8 };
    const students = [studentAmirAge12, studentAmirAge4, studentAmir3, studentUnique];
    const result = findBestFuzzyMatch('Amir Iskakov', students);
    assert(result !== null, 'Found a match');
    assert(result.ambiguous === true, 'Three same-name students are ambiguous');
    assertEqual(result.candidates.length, 3, 'Returns all 3 candidates');
}

console.log('\n=== getStudentDisambiguationLabel tests ===\n');

{
    const label = getStudentDisambiguationLabel(studentAmirAge12);
    assert(label.includes('Amir Iskakov'), 'Label includes student name');
    assert(label.includes('Age: 12'), 'Label includes age');
    assert(label.includes('DOB: 2014-03-15'), 'Label includes date of birth');
    assert(label.includes('Level: 5'), 'Label includes level');
    assert(label.includes('Branch: Almaty Central'), 'Label includes branch');
    assert(label.includes('Coach: Ivan Petrov'), 'Label includes coach');
}

{
    const label = getStudentDisambiguationLabel(studentAmirAge4);
    assert(label.includes('Age: 4'), 'Label for younger student includes age 4');
    assert(label.includes('Branch: Almaty South'), 'Label includes correct branch');
}

{
    const minStudent = { id: '99', firstName: 'Test', lastName: 'Student' };
    const label = getStudentDisambiguationLabel(minStudent);
    assertEqual(label, 'Test Student', 'Minimal student shows only name');
}

console.log('\n=== processMatchedRows tests ===\n');

console.log('Test group: Mixed rows with ambiguity');
{
    globalStudents = [studentAmirAge12, studentAmirAge4, studentUnique];

    const rows = [
        { name: 'Iskakov Amir', rating: 1500, rowNum: 1 },
        { name: 'Suleimanov Marat', rating: 1200, rowNum: 2 },
        { name: 'Unknown Person', rating: 800, rowNum: 3 },
    ];

    const result = processMatchedRows(rows);

    assertEqual(result.ambiguousCount, 1, 'One ambiguous row detected');
    assertEqual(result.validCount, 1, 'One valid (unique match) row');
    assertEqual(result.errorCount, 1, 'One error (unmatched) row');
    assertEqual(result.csvParsedData.length, 1, 'Only unique match added to parsed data');
    assertEqual(result.csvParsedData[0].studentId, '3', 'Parsed data contains Marat');
    assertEqual(result.unmatchedStudentsData.length, 1, 'One unmatched student');
    assertEqual(result.unmatchedStudentsData[0].name, 'Unknown Person', 'Unmatched student name correct');
}

console.log('\nTest group: All unique matches');
{
    globalStudents = [studentAmirAge12, studentUnique];

    const rows = [
        { name: 'Iskakov Amir', rating: 1500, rowNum: 1 },
        { name: 'Suleimanov Marat', rating: 1200, rowNum: 2 },
    ];

    const result = processMatchedRows(rows);

    assertEqual(result.ambiguousCount, 0, 'No ambiguous rows');
    assertEqual(result.validCount, 2, 'Two valid rows');
    assertEqual(result.errorCount, 0, 'No errors');
    assertEqual(result.csvParsedData.length, 2, 'Both rows in parsed data');
}

console.log('\nTest group: Invalid rating on ambiguous name');
{
    globalStudents = [studentAmirAge12, studentAmirAge4, studentUnique];

    const rows = [
        { name: 'Iskakov Amir', rating: -5, rowNum: 1 },
    ];

    const result = processMatchedRows(rows);
    // Ambiguous check happens before rating validation
    assertEqual(result.ambiguousCount, 1, 'Ambiguous detected even with invalid rating');
}

console.log('\nTest group: Import button blocking logic');
{
    globalStudents = [studentAmirAge12, studentAmirAge4, studentUnique];

    const rows = [
        { name: 'Iskakov Amir', rating: 1500, rowNum: 1 },
        { name: 'Suleimanov Marat', rating: 1200, rowNum: 2 },
    ];

    const result = processMatchedRows(rows);

    // Import should be blocked because ambiguousCount > 0
    const shouldBlock = result.validCount === 0 || result.ambiguousCount > 0;
    assert(shouldBlock === true, 'Import button should be disabled when ambiguous rows exist');

    // After resolving all ambiguous rows (simulated)
    const resolvedAmbiguousCount = 0;
    const shouldBlockAfterResolve = result.validCount === 0 || resolvedAmbiguousCount > 0;
    assert(shouldBlockAfterResolve === false, 'Import button should be enabled after resolving all ambiguous rows');
}

console.log('\nTest group: Three students with same name');
{
    const studentAmir3 = { id: '5', firstName: 'Amir', lastName: 'Iskakov', age: 8, dateOfBirth: '2018-06-01', currentLevel: 3, branch: 'Astana', coach: 'Pavel Sidorov' };
    globalStudents = [studentAmirAge12, studentAmirAge4, studentAmir3, studentUnique];

    const result = fuzzyMatchStudent('Iskakov Amir', globalStudents);
    assert(result.ambiguous === true, 'Three same-name students are ambiguous');
    assertEqual(result.candidates.length, 3, 'Returns all 3 candidates');
}

// === Summary ===
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed, ${testsPassed + testsFailed} total`);
console.log(`${'='.repeat(40)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
