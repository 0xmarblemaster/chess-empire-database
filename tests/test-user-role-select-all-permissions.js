// Regression guard: SELECTs that populate sessionStorage.userRole must select all
// columns from user_roles. Otherwise new permission flags (e.g. can_manage_tournaments)
// silently disappear from the client-side userRole object and gated UI never shows.
//
// History: non-admin coaches with can_manage_tournaments=true could not see the
// Tournament management dashboard menu in admin-v2.js because the SELECTs in
// supabase-client.js and login.html were enumerating columns and omitted the flag.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
    console.log('PASS:', msg);
}

// Match a chained .from('user_roles')...select(...) call so we capture the
// projection regardless of intervening whitespace / line breaks.
const FROM_USER_ROLES_SELECT = /\.from\(['"]user_roles['"]\)\s*\.select\(\s*(['"])([^'"]+)\1\s*\)/g;

function projectionsFor(rel) {
    const src = read(rel);
    const out = [];
    let m;
    FROM_USER_ROLES_SELECT.lastIndex = 0;
    while ((m = FROM_USER_ROLES_SELECT.exec(src)) !== null) {
        out.push(m[2]);
    }
    return out;
}

// supabase-client.js: single SELECT, restores userRole into sessionStorage on page load.
const clientProjections = projectionsFor('supabase-client.js');
assert(clientProjections.length === 1, 'supabase-client.js has exactly one user_roles SELECT');
assert(clientProjections[0] === '*', 'supabase-client.js user_roles SELECT uses "*"');

// login.html: two SELECTs (pre-redirect session check + fresh login submit). Both
// feed sessionStorage.userRole, so both must be '*'.
const loginProjections = projectionsFor('login.html');
assert(loginProjections.length === 2, 'login.html has exactly two user_roles SELECTs');
loginProjections.forEach((proj, i) => {
    assert(proj === '*', `login.html user_roles SELECT #${i + 1} uses "*"`);
});

console.log('\nAll user_roles SELECT projections look correct.');
