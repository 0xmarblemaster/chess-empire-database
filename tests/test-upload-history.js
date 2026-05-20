/**
 * Tests for the Upload History tab (Ratings Management).
 *
 * Covers:
 *  - migrations/041_upload_history.sql defines rating_uploads, the upload_id
 *    column on student_ratings, and the unified_uploads view (with the columns
 *    the UI selects).
 *  - admin-v2.html exposes a #ratingsViewMain / #ratingsViewUploads pair
 *    plus the switcher pills wired through switchRatingsView().
 *  - admin-v2.js defines switchRatingsView, loadUploadHistory, renderUploadHistory,
 *    and openUploadDetail.
 *  - supabase-data.js exposes importStudentRatings (with sourceFilename arg)
 *    and addTournamentUpload stamps uploaded_by from auth.getUser().
 *  - i18n.js carries every admin.ratings.* upload-history key in en, ru, kk.
 *
 * Run: node tests/test-upload-history.js
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

// ---------------------------------------------------------------
// (a) migration
// ---------------------------------------------------------------
console.log('\n=== (a) migration 041_upload_history.sql\n');
const MIG = fs.readFileSync(path.join(ROOT, 'migrations', '041_upload_history.sql'), 'utf8');

assert(/CREATE TABLE IF NOT EXISTS rating_uploads/i.test(MIG),
    'creates rating_uploads table');
assert(/source_filename\s+TEXT/i.test(MIG),
    'rating_uploads has source_filename');
assert(/rating_date\s+DATE/i.test(MIG),
    'rating_uploads has rating_date');
assert(/row_count\s+INTEGER/i.test(MIG),
    'rating_uploads has row_count');
assert(/uploaded_by\s+UUID REFERENCES auth\.users\(id\) ON DELETE SET NULL/i.test(MIG),
    'rating_uploads.uploaded_by references auth.users');
assert(/uploaded_at\s+TIMESTAMPTZ/i.test(MIG),
    'rating_uploads has uploaded_at');

assert(/ALTER TABLE student_ratings[\s\S]*ADD COLUMN IF NOT EXISTS upload_id UUID[\s\S]*REFERENCES rating_uploads\(id\) ON DELETE SET NULL/i.test(MIG),
    'student_ratings gets upload_id FK -> rating_uploads');

assert(/ALTER TABLE rating_uploads ENABLE ROW LEVEL SECURITY/i.test(MIG),
    'RLS enabled on rating_uploads');
assert(/CREATE POLICY "Admins manage rating_uploads"/i.test(MIG),
    'admin policy created');
assert(/CREATE POLICY "Coaches read rating_uploads"/i.test(MIG),
    'coach read policy created');

assert(/CREATE OR REPLACE VIEW unified_uploads AS/i.test(MIG),
    'unified_uploads view defined');
assert(/FROM tournaments_uploads[\s\S]*UNION ALL[\s\S]*FROM rating_uploads/i.test(MIG),
    'unified_uploads is UNION ALL of tournaments_uploads + rating_uploads');
assert(/GRANT SELECT ON unified_uploads TO authenticated/i.test(MIG),
    'authenticated role gets SELECT on unified_uploads');

// ---------------------------------------------------------------
// (b) admin-v2.html DOM
// ---------------------------------------------------------------
console.log('\n=== (b) admin-v2.html — pill switcher + upload-history view\n');
const HTML = fs.readFileSync(path.join(ROOT, 'admin-v2.html'), 'utf8');

assert(/data-ratings-view="main"/.test(HTML),
    'main view pill present');
assert(/data-ratings-view="uploads"/.test(HTML),
    'uploads view pill present');
assert(/onclick="switchRatingsView\('main'\)"/.test(HTML),
    'main pill wired to switchRatingsView');
assert(/onclick="switchRatingsView\('uploads'\)"/.test(HTML),
    'uploads pill wired to switchRatingsView');
assert(/id="ratingsViewMain"/.test(HTML),
    'ratingsViewMain container present');
assert(/id="ratingsViewUploads"/.test(HTML),
    'ratingsViewUploads container present');
assert(/id="uploadHistoryFilter"/.test(HTML),
    'filter dropdown #uploadHistoryFilter present');
assert(/value="tournament"/.test(HTML) && /value="rating"/.test(HTML),
    'filter has tournament/rating options');
assert(/id="uploadHistoryTableBody"/.test(HTML),
    'upload history tbody present');
assert(/id="uploadDetailModal"/.test(HTML),
    'upload-detail modal present');

// re-uses Coach KPI pill styling (kpi-view-switcher / kpi-view-btn)
assert(/kpi-view-switcher/.test(HTML),
    'pill switcher uses kpi-view-switcher class');
assert(/class="kpi-view-btn is-active" data-ratings-view="main"/.test(HTML),
    'main pill has is-active by default + kpi-view-btn class');

// ---------------------------------------------------------------
// (c) admin-v2.js — switcher + loader + detail
// ---------------------------------------------------------------
console.log('\n=== (c) admin-v2.js — switchRatingsView / loadUploadHistory / openUploadDetail\n');
const JS = fs.readFileSync(path.join(ROOT, 'admin-v2.js'), 'utf8');

assert(/function switchRatingsView\(view\)/.test(JS),
    'switchRatingsView defined');
assert(/function loadUploadHistory\(/.test(JS),
    'loadUploadHistory defined');
assert(/function renderUploadHistory\(/.test(JS),
    'renderUploadHistory defined');
assert(/function openUploadDetail\(/.test(JS),
    'openUploadDetail defined');
assert(/\.from\('unified_uploads'\)/.test(JS),
    'loadUploadHistory queries unified_uploads view');
assert(/order\('uploaded_at',\s*\{\s*ascending:\s*false\s*\}\)[\s\S]{0,40}\.limit\(200\)/.test(JS),
    'loadUploadHistory orders desc + limits to 200');
assert(/UPLOAD_HISTORY_CACHE_TTL_MS\s*=\s*60\s*\*\s*1000/.test(JS),
    '60-second cache constant present');
assert(/\.from\('users'\)[\s\S]{0,200}\.in\('id', uploaderIds\)/.test(JS),
    'uploader emails are batch-fetched via users(id,email).in(id, uploaderIds)');
assert(/window\.csvImportFile/.test(JS),
    'window.csvImportFile referenced (commitRatingUpload reads filename)');
assert(/importStudentRatings\(ratingsToImport,\s*sourceFilename\)/.test(JS),
    'commitRatingUpload passes filename into importStudentRatings');

// ---------------------------------------------------------------
// (d) supabase-data.js — new writers
// ---------------------------------------------------------------
console.log('\n=== (d) supabase-data.js — importStudentRatings + addTournamentUpload uploaded_by\n');
const DATA = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');

assert(/async importStudentRatings\(ratingsArray,\s*sourceFilename\)/.test(DATA),
    'importStudentRatings(ratingsArray, sourceFilename) defined');
assert(/from\('rating_uploads'\)\s*\.insert\(headerPayload\)/.test(DATA),
    'importStudentRatings inserts a rating_uploads header row');
assert(/row\.upload_id\s*=\s*upload_id/.test(DATA),
    'importStudentRatings stamps upload_id on each insert row');
assert(/auth\.getUser\(\)/.test(DATA),
    'auth.getUser() used for uploaded_by');

// addTournamentUpload should now include uploaded_by from auth.getUser()
const tuStart = DATA.indexOf('async addTournamentUpload');
assert(tuStart >= 0, 'addTournamentUpload still defined');
const tuBlock = DATA.slice(tuStart, tuStart + 2000);
assert(/auth\.getUser\(\)/.test(tuBlock),
    'addTournamentUpload reads auth.getUser()');
assert(/uploaded_by:\s*uploadedBy/.test(tuBlock),
    'addTournamentUpload payload includes uploaded_by');

// ---------------------------------------------------------------
// (e) i18n keys present in en/ru/kk
// ---------------------------------------------------------------
console.log('\n=== (e) i18n.js — admin.ratings.* upload-history keys per locale\n');
const I18N = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

function sliceLocale(src, locale) {
    const re = new RegExp(`\\n\\s+${locale}:\\s*\\{`, 'g');
    let combined = '';
    let m;
    while ((m = re.exec(src)) !== null) {
        let depth = 0;
        let i = src.indexOf('{', m.index);
        const begin = i;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') {
                depth--;
                if (depth === 0) { combined += src.slice(begin, i + 1); break; }
            }
        }
    }
    return combined;
}

const NEW_KEYS = [
    'admin.ratings.viewMain',
    'admin.ratings.viewUploads',
    'admin.ratings.historyTitle',
    'admin.ratings.colDocument',
    'admin.ratings.colType',
    'admin.ratings.colEffectiveDate',
    'admin.ratings.colUploadedBy',
    'admin.ratings.colUploadedAt',
    'admin.ratings.colRows',
    'admin.ratings.colActions',
    'admin.ratings.filterAll',
    'admin.ratings.filterTournament',
    'admin.ratings.filterRating',
    'admin.ratings.openBatch',
    'admin.ratings.unknownUser',
];

for (const locale of ['en', 'ru', 'kk']) {
    const block = sliceLocale(I18N, locale);
    for (const key of NEW_KEYS) {
        const re = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*["'][^"']+["']`);
        assert(re.test(block), `${key} present in ${locale}`);
    }
}

// ---------------------------------------------------------------
console.log(`\n--- ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
