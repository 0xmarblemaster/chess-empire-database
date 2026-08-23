/**
 * Regression tests for coach_branches junction sync on coach create/update.
 *
 * Root cause (2026-08-23): "Manage Coaches" wrote only the legacy
 * coaches.branch_id column. The attendance calendar dropdown resolves branch
 * assignments exclusively from the coach_branches junction table (built into
 * coach.branchIds by getCoaches), so newly added coaches (e.g. Emir
 * Maksatovich, Almaty-1) never appeared in the coach filter.
 *
 * Fix under test:
 *   - supabaseData.addCoach inserts a coach_branches row after creating the coach
 *   - supabaseData.updateCoach replaces the coach's junction rows with the new branch
 *   - crud-handlers saveCoach resolves branchId from the branch-name select
 *
 * Run: node tests/test-coach-branch-junction-sync.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SUPABASE_DATA_SRC = fs.readFileSync(path.join(ROOT, 'supabase-data.js'), 'utf8');
const CRUD_HANDLERS_SRC = fs.readFileSync(path.join(ROOT, 'crud-handlers.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else      { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// ---------------------------------------------------------------------------
// Mock supabase client — records every operation per table, returns canned rows
// ---------------------------------------------------------------------------

function makeMockClient(cannedRow) {
    const ops = [];

    function makeBuilder(table) {
        const op = { table, type: null, payload: null, filters: [] };
        const builder = {
            insert(rows) { op.type = 'insert'; op.payload = rows; ops.push(op); return builder; },
            update(data) { op.type = 'update'; op.payload = data; ops.push(op); return builder; },
            delete()     { op.type = 'delete'; ops.push(op); return builder; },
            select()     { return builder; },
            eq(col, val) { op.filters.push([col, val]); return builder; },
            single()     { return Promise.resolve({ data: cannedRow, error: null }); },
            then(resolve) { resolve({ data: [cannedRow], error: null }); },
        };
        return builder;
    }

    return { ops, client: { from: (table) => makeBuilder(table) } };
}

function loadSupabaseData(mockClient) {
    const windowObj = { supabaseClient: mockClient };
    const context = {
        window: windowObj,
        console: { log() {}, error() {}, warn() {} },
    };
    vm.createContext(context);
    vm.runInContext(SUPABASE_DATA_SRC, context);
    return windowObj.supabaseData;
}

// ---------------------------------------------------------------------------
// addCoach syncs the junction table
// ---------------------------------------------------------------------------

console.log('\n=== addCoach → coach_branches sync ==============================');

(async () => {
    {
        const canned = { id: 'coach-1', first_name: 'Emir', last_name: 'Maksatovich', branch_id: 'branch-almaty1' };
        const { ops, client } = makeMockClient(canned);
        const supabaseData = loadSupabaseData(client);

        const result = await supabaseData.addCoach({
            firstName: 'Emir', lastName: 'Maksatovich', phone: '', email: 'e@x.kz', branchId: 'branch-almaty1',
        });

        const coachInsert = ops.find(o => o.table === 'coaches' && o.type === 'insert');
        assert(!!coachInsert, 'addCoach inserts into coaches');

        const junctionInsert = ops.find(o => o.table === 'coach_branches' && o.type === 'insert');
        assert(!!junctionInsert, 'addCoach ALSO inserts into coach_branches');
        assert(junctionInsert && junctionInsert.payload[0].coach_id === 'coach-1',
            'junction row uses the new coach id');
        assert(junctionInsert && junctionInsert.payload[0].branch_id === 'branch-almaty1',
            'junction row uses the selected branch id');
        assert(result && result.id === 'coach-1', 'addCoach still returns the transformed coach');
    }

    // No branch selected → no junction insert attempted
    {
        const canned = { id: 'coach-2', first_name: 'A', last_name: 'B', branch_id: null };
        const { ops, client } = makeMockClient(canned);
        const supabaseData = loadSupabaseData(client);

        await supabaseData.addCoach({ firstName: 'A', lastName: 'B', phone: '', email: '' });
        const junctionInsert = ops.find(o => o.table === 'coach_branches' && o.type === 'insert');
        assert(!junctionInsert, 'addCoach with null branch_id skips coach_branches insert');
    }

    // -----------------------------------------------------------------------
    // updateCoach replaces junction rows with the new branch
    // -----------------------------------------------------------------------

    console.log('\n=== updateCoach → coach_branches sync ===========================');

    {
        const canned = { id: 'coach-1', first_name: 'Emir', last_name: 'Maksatovich', branch_id: 'branch-new' };
        const { ops, client } = makeMockClient(canned);
        const supabaseData = loadSupabaseData(client);

        await supabaseData.updateCoach('coach-1', {
            firstName: 'Emir', lastName: 'Maksatovich', phone: '', email: 'e@x.kz', branchId: 'branch-new',
        });

        const junctionDelete = ops.find(o => o.table === 'coach_branches' && o.type === 'delete');
        assert(!!junctionDelete, 'updateCoach clears existing coach_branches rows');
        assert(junctionDelete && junctionDelete.filters.some(([c, v]) => c === 'coach_id' && v === 'coach-1'),
            'junction delete is scoped to the updated coach');

        const junctionInsert = ops.find(o => o.table === 'coach_branches' && o.type === 'insert');
        assert(!!junctionInsert, 'updateCoach inserts the new coach_branches row');
        assert(junctionInsert && junctionInsert.payload[0].branch_id === 'branch-new',
            'junction row carries the new branch id');

        const deleteIdx = ops.indexOf(junctionDelete);
        const insertIdx = ops.indexOf(junctionInsert);
        assert(deleteIdx < insertIdx, 'delete happens before insert (replace semantics)');
    }

    // -----------------------------------------------------------------------
    // crud-handlers saveCoach resolves branchId from the name-valued select
    // -----------------------------------------------------------------------

    console.log('\n=== saveCoach resolves branchId =================================');

    {
        const fnStart = CRUD_HANDLERS_SRC.indexOf('async function saveCoach(');
        const fnEnd = CRUD_HANDLERS_SRC.indexOf('\n}', fnStart);
        const body = CRUD_HANDLERS_SRC.slice(fnStart, fnEnd);
        assert(fnStart >= 0, 'saveCoach exists in crud-handlers.js');
        assert(/branchId:/.test(body), 'saveCoach coachData includes a branchId field');
        assert(/\.find\(\s*b\s*=>\s*b\.name\s*===/.test(body),
            'saveCoach resolves the branch id by matching the selected branch name');
    }

    console.log(`\n--- ${passed} passed, ${failed} failed ---`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
    console.error('UNCAUGHT:', err);
    process.exit(1);
});
