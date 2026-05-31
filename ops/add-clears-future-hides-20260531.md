# Add-to-slot clears future -1 hides

**Date:** 2026-05-31
**File touched:** `supabase-data.js` — `upsertTimeSlotAssignment`
**Test:** `tests/test-add-clears-future-hides.js`
**Reporters:** Berik (49 students), Nail (37), Aleksandr (12), plus 6 other
coaches.

## Symptom

A coach clicks "Add" on a student in the attendance calendar (or drags one
onto a time slot). The success toast fires, the row briefly appears, then
the student is gone again on the next render. Re-clicking "Add" does not
help — the student keeps vanishing.

## Root cause: 057 hide rows beat fresh add rows

Two write paths land in the same `student_time_slot_assignments` table at
two different `effective_from` dates:

1. **Add flow** (`upsertTimeSlotAssignment`) writes the baseline row at
   `effective_from = '1970-01-01'`. Same semantic as pre-versioning: this
   slot is the student's "forever" assignment.
2. **Hide flow** (`hide_student_versioned`, plus the migration-057 rewrite)
   writes a `time_slot_index = -1` row at a forward-looking
   `effective_from` — currently `'2026-06-01'` for all 057-restored hides.

The read path `getTimeSlotAssignments` (`supabase-data.js` ~line 2598)
orders by `effective_from DESC` and keeps the first row per student. So
for any student in the 057 cohort, the `2026-06-01` `-1` row wins over
the freshly-written `1970-01-01` slot row. The student stays hidden.

Until migration 057 ran on 2026-05-31, all the legacy hides lived at
`2026-03/04/05-01` and were already in the past relative to the
displayed-month query, so the conflict was invisible. 057 bumped them
all to `2026-06-01` (correctly — see `hide-effective-from-shift-20260531.md`),
which made today's add-flow conflict surface immediately for any coach
who tried to put one of those students back.

## Fix: add = wipe my future hides for this schedule

After the upsert succeeds, run a scoped DELETE:

```
delete from student_time_slot_assignments
 where student_id    = $1
   and branch_id     = $2
   and schedule_type = $3
   and time_slot_index = -1
   and effective_from > '1970-01-01';
```

The new semantic: **"Add this student to this slot" means "this student
belongs here; wipe any future hide markers for the same (student, branch,
schedule)."** Adding contradicts hiding by definition.

### Why scoped to `(student_id, branch_id, schedule_type)`

- **`student_id`** — obvious; never touch other students.
- **`branch_id`** — a student transferring between branches keeps the
  origin-branch hide row valid.
- **`schedule_type`** — a coach adding a kid to `sat_sun` must NOT clear
  a `mon_wed` hide for the same kid. Each schedule is independently
  managed by potentially different coaches.

### Why `time_slot_index = -1` only

The DELETE matches the hide sentinel exclusively, so a positive slot row
(an actual assignment to slot 0, 1, 2, ...) is never affected.

### Why `effective_from > '1970-01-01'`

Defence in depth. The upsert already overwrites the `'1970-01-01'` row
via `onConflict`, but the explicit `> '1970-01-01'` guard means even if
that semantic shifts in the future, the DELETE only kills forward-dated
hides.

## Affected cohort (from migration 057's audit query, 2026-05-31)

126 hidden students across 9 coaches and 6 branches, all at
`effective_from = '2026-06-01'` with `time_slot_index = -1`:

| Coach        | Hidden students |
| :----------- | --------------: |
| Berik        |              49 |
| Nail         |              37 |
| Aleksandr    |              12 |
| Chingis      |               9 |
| Vasily       |               6 |
| Assylkhan    |               6 |
| Shokhan      |               4 |
| Tanirbergen  |               3 |
| (one more)   |               — |
| **Total**    |         **126** |

## Recovery instructions

No migration is needed. Each affected coach can recover their roster the
same way they would normally add a student:

1. Open the attendance calendar for the branch/schedule.
2. Click "Add" (or drag the student from the sidebar) onto the desired
   time slot for any of the missing students.
3. The new `upsert + delete` pair lands the baseline row at `1970-01-01`
   and wipes the matching `2026-06-01` `-1` row in a single function
   call. The student appears immediately and stays visible.

Students the coach does NOT re-add stay hidden — the intentional 057
hides remain. This matches the original 057 intent: "we don't know which
hides were deliberate, so we deferred them all to June." Today's fix
just makes "un-defer this one" trivial.

## Drag-drop inherits the fix automatically

Both the click-to-add and drag-drop code paths in `admin-v2.js` and
`coach.js` funnel through `dataService.upsertTimeSlotAssignment`. No
additional changes were needed at the call sites — the fix sits at the
single chokepoint.

## Out of scope

- **Atomicity** — the fix is two round-trips (upsert then delete), not
  a single transaction. If the network dies between the two, the user
  sees the same broken behaviour as before and re-clicking "Add" still
  fixes it. The race window is narrow and the failure mode is benign
  (same state as pre-fix). Wrapping both writes in a SQL function is
  worth doing later, not blocking today.
- **Mid-year exit UX** — a coach who legitimately wants to hide a
  student from a future month still uses the existing "Delete from this
  month onward" path. This fix doesn't change hide semantics; it only
  changes what "add" means when an old hide is in the way.
- **Audit trail** — the silent DELETE is not logged separately from the
  upsert. If we ever need "who un-hid Vasily on what date" the existing
  `student_time_slot_assignments` audit triggers cover the underlying
  table row delete.
