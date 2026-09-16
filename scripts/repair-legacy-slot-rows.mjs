#!/usr/bin/env node
/**
 * REPAIR: legacy NULL-logical student_time_slot_assignments rows
 * ==============================================================
 *
 * School-wide sweep for the attendance resurrection bug (see the
 * attendance-delete fix task + migrations 085/086). Legacy rows carry
 * logical_slot_id = NULL and are keyed by the positional time_slot_index at
 * read time (`idx:N`). When a modern row (with a logical_slot_id) renders the
 * same student in the same slot, or a delete was issued against the slot's
 * logical id, the legacy idx:N row is never shadowed and the student resurrects.
 *
 * This script:
 *   1. Resolves each legacy row's logical_slot_id from the time_slots chain
 *      (student's coach + schedule + slot_index) and BACKFILLS it where
 *      resolvable, so the row becomes renumber-safe.
 *   2. HIDES a legacy row (and backfills its logical id so the hide shadows
 *      correctly) when it is a duplicate — a modern row for the same
 *      student+slot exists, OR a later delete (a hidden row keyed to the same
 *      slot's logical id) was clearly intended.
 *   3. Reports unresolved orphans (no matching slot) — left untouched.
 *
 * SAFETY:
 *   --dry-run (DEFAULT) performs NO writes. It prints a full report of what
 *   WOULD change and also writes it to tasks/repair-dry-run-report.txt.
 *   --apply performs the PATCH writes (versioned-safe: only sets
 *   logical_slot_id / hidden on existing rows, never deletes history).
 *
 * Requires env SUPABASE_URL + SUPABASE_KEY (service key for --apply; an anon
 * key with read access is enough for --dry-run).
 *
 * Usage:
 *   node scripts/repair-legacy-slot-rows.mjs            # dry-run (default)
 *   node scripts/repair-legacy-slot-rows.mjs --apply    # write
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'tasks', 'repair-dry-run-report.txt');

const APPLY = process.argv.includes('--apply');
const RAW_URL = process.env.SUPABASE_URL || 'https://papgcizhfkngubwofjuo.supabase.co';
const BASE = RAW_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1';
const KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const lines = [];
function out(s = '') { lines.push(s); console.log(s); }

async function rest(method, pathAndQuery, body, prefer) {
    const headers = {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json'
    };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${BASE}/${pathAndQuery}`, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        throw new Error(`${method} ${pathAndQuery} -> ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function fetchAll(table, select) {
    // Page through in case of large tables (PostgREST default cap).
    const pageSize = 1000;
    let from = 0;
    const all = [];
    for (;;) {
        const res = await fetch(`${BASE}/${table}?select=${encodeURIComponent(select)}`, {
            headers: {
                apikey: KEY,
                Authorization: `Bearer ${KEY}`,
                Range: `${from}-${from + pageSize - 1}`
            }
        });
        if (!res.ok) throw new Error(`GET ${table} -> ${res.status}: ${await res.text()}`);
        const batch = await res.json();
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function main() {
    out('='.repeat(72));
    out(`Legacy-slot repair sweep — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
    out('='.repeat(72));

    if (!KEY) {
        out('❌ No SUPABASE_KEY / SUPABASE_ANON_KEY in env — cannot connect.');
        out('   Set SUPABASE_URL and SUPABASE_KEY and re-run.');
        writeReport();
        process.exit(APPLY ? 1 : 0);
        return;
    }

    let assignments, slots, students, branches;
    try {
        [assignments, slots, students, branches] = await Promise.all([
            fetchAll('student_time_slot_assignments', 'id,student_id,branch_id,schedule_type,time_slot_index,effective_from,hidden,logical_slot_id'),
            fetchAll('time_slots', 'branch_id,coach_id,schedule_type,slot_index,logical_slot_id'),
            fetchAll('students', 'id,coach_id,first_name,last_name'),
            fetchAll('branches', 'id,name')
        ]);
    } catch (e) {
        out(`❌ Fetch failed: ${e.message}`);
        writeReport();
        process.exit(APPLY ? 1 : 0);
        return;
    }

    const branchName = new Map(branches.map(b => [b.id, b.name]));
    const studentById = new Map(students.map(s => [s.id, s]));

    // If time_slots came back empty while assignments clearly carry logical ids,
    // the key almost certainly cannot READ time_slots (RLS blocks the anon
    // publishable key). Every legacy row would then resolve to no chain and be
    // reported as an orphan — misleading. Warn loudly and refuse to --apply.
    if (slots.length === 0 && assignments.some(a => a.logical_slot_id)) {
        out('⚠️  time_slots returned 0 rows but assignments carry logical ids —');
        out('   the provided key cannot read time_slots (RLS). Chain resolution is');
        out('   impossible; every row below is reported as an orphan. Re-run with a');
        out('   key that can read time_slots (authenticated/service) for a real sweep.');
        if (APPLY) { out('   Refusing to --apply with unreadable time_slots.'); writeReport(); process.exit(1); return; }
        out('');
    }

    // Index time_slots chains: (branch|coach|schedule|slot_index) -> logical id.
    const chainLogical = new Map();
    for (const ts of slots) {
        if (!ts.logical_slot_id) continue;
        const k = `${ts.branch_id}|${ts.coach_id}|${ts.schedule_type}|${ts.slot_index}`;
        if (!chainLogical.has(k)) chainLogical.set(k, ts.logical_slot_id);
    }

    // Index modern rows by (student|branch|schedule|logical_slot_id) and the set
    // of hidden logical chains per (student|branch|schedule).
    const modernByLogical = new Set();      // has a row (any hidden state) with this logical id
    const modernVisibleByLogical = new Set();
    const hiddenLogicalChains = new Set();  // a hidden row keyed to this logical id exists
    for (const a of assignments) {
        if (!a.logical_slot_id) continue;
        const base = `${a.student_id}|${a.branch_id}|${a.schedule_type}|${a.logical_slot_id}`;
        modernByLogical.add(base);
        if (a.hidden === true) hiddenLogicalChains.add(base);
        else modernVisibleByLogical.add(base);
    }

    const legacy = assignments.filter(a => a.logical_slot_id == null && a.time_slot_index >= 0);

    out(`\nScanned ${assignments.length} assignment rows; ${legacy.length} legacy NULL-logical rows (idx >= 0).\n`);

    const actions = { hide: [], backfill: [], orphan: [] };

    for (const a of legacy) {
        const student = studentById.get(a.student_id);
        const coachId = student?.coach_id || null;
        const chainKey = coachId
            ? `${a.branch_id}|${coachId}|${a.schedule_type}|${a.time_slot_index}`
            : null;
        const logical = chainKey ? (chainLogical.get(chainKey) || null) : null;
        const who = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : a.student_id;
        const label = `${who} · ${branchName.get(a.branch_id) || a.branch_id} · ${a.schedule_type} · idx ${a.time_slot_index} · row ${a.id}`;

        if (!logical) {
            actions.orphan.push({ a, label });
            continue;
        }

        const base = `${a.student_id}|${a.branch_id}|${a.schedule_type}|${logical}`;
        const dupOfModern = modernVisibleByLogical.has(base);
        const laterDelete = hiddenLogicalChains.has(base);

        if (a.hidden !== true && (dupOfModern || laterDelete)) {
            const reason = dupOfModern ? 'duplicate of a visible modern row' : 'a delete (hidden logical row) exists for this slot';
            actions.hide.push({ a, label, logical, reason });
        } else {
            actions.backfill.push({ a, label, logical });
        }
    }

    out(`── HIDE legacy duplicates (${actions.hide.length}) ${'─'.repeat(30)}`);
    for (const h of actions.hide) out(`  HIDE   ${h.label}\n         → set hidden=true, logical_slot_id=${h.logical}  (${h.reason})`);
    out('');
    out(`── BACKFILL logical id (${actions.backfill.length}) ${'─'.repeat(28)}`);
    for (const b of actions.backfill) out(`  FILL   ${b.label}\n         → set logical_slot_id=${b.logical}`);
    out('');
    out(`── UNRESOLVED orphans, left untouched (${actions.orphan.length}) ${'─'.repeat(14)}`);
    for (const o of actions.orphan) out(`  SKIP   ${o.label}  (no matching time_slots chain)`);
    out('');

    if (!APPLY) {
        out('DRY RUN — no writes performed. Re-run with --apply to write the above.');
        writeReport();
        return;
    }

    out('APPLYING changes…');
    let ok = 0, fail = 0;
    for (const h of actions.hide) {
        try {
            await rest('PATCH', `student_time_slot_assignments?id=eq.${h.a.id}`,
                { hidden: true, logical_slot_id: h.logical }, 'return=minimal');
            ok++;
        } catch (e) { fail++; out(`  ✗ HIDE ${h.a.id}: ${e.message}`); }
    }
    for (const b of actions.backfill) {
        try {
            await rest('PATCH', `student_time_slot_assignments?id=eq.${b.a.id}`,
                { logical_slot_id: b.logical }, 'return=minimal');
            ok++;
        } catch (e) { fail++; out(`  ✗ FILL ${b.a.id}: ${e.message}`); }
    }
    out(`\nApplied ${ok} change(s), ${fail} failure(s).`);
    if (fail > 0) process.exit(1);
}

function writeReport() {
    try {
        fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
        fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
        console.log(`\n📝 Report written to ${path.relative(ROOT, REPORT_PATH)}`);
    } catch (e) {
        console.error(`Could not write report: ${e.message}`);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
