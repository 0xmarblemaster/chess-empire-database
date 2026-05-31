# hide_student_versioned — relax-if-missing fix (2026-05-31)

## Symptom
Coach Aleksandr Olegovich at Almaty-1 / mon_wed could not delete students.
Browser console showed:
```
P0001 — student_time_slot_assignments not found for student=<uuid> schedule=mon_wed
```
Source: `hide_student_versioned()` RPC introduced by migration 051.

## Root cause
The attendance calendar renders a student into a (branch, schedule_type) view two independent ways:

1. **Explicit assignment row** in `student_time_slot_assignments`.
2. **Attendance-history inference** — `loadStudentScheduleAssignments`
   (`admin-v2.js:7283`) groups each student's attendance by `schedule_type`
   and assigns them to whichever schedule has the most rows.

The RPC required (1). Students rendered via (2) only — e.g. Ruslan Azizov
(`c7967833-…`), who has 16 mon_wed attendance rows but whose only
`student_time_slot_assignments` row is `tue_thu / time_slot_index=-1`
(set on 2026-03-31 when he was first hidden from tue_thu) — triggered
`RAISE EXCEPTION` at line 73 of migration 051.

Scope at Aleksandr's branch alone: 132 students, only 62 mon_wed assignment
rows → ~70 students would error on delete from the mon_wed view. Same
asymmetry exists for every (branch, schedule_type) pair across the school.

This is **not** caused by the 2026-05-31 restoration migrations
(052/053). The asymmetry predates them; the restoration just made
the affected students visible again.

## Fix — migration 054

`CREATE OR REPLACE FUNCTION hide_student_versioned`: the `IF NOT FOUND`
branch now INSERTs a fresh row at `p_effective_from` with the requested
`time_slot_index` instead of raising. `ON CONFLICT
(student_id, branch_id, schedule_type, effective_from) DO UPDATE` makes
the insert path itself idempotent against races.

```sql
IF NOT FOUND THEN
  INSERT INTO student_time_slot_assignments
    (student_id, branch_id, schedule_type, time_slot_index,
     effective_from, created_at, updated_at)
  VALUES
    (p_student_id, p_branch_id, p_schedule_type, p_time_slot_index,
     p_effective_from, NOW(), NOW())
  ON CONFLICT (student_id, branch_id, schedule_type, effective_from) DO UPDATE
    SET time_slot_index = EXCLUDED.time_slot_index,
        updated_at      = NOW()
  RETURNING * INTO v_new;
  RETURN v_new;
END IF;
```

Existing branches (same-month UPDATE, later-month INSERT new version)
unchanged. RLS unchanged (`SECURITY INVOKER`; policy "Authorized users
can manage time slot assignments" already grants INSERT to admins and
coaches with `can_edit_students`).

## Verification (live DB)

| Check | Result |
|---|---|
| Migration applied | OK — empty `[]` response from Management API |
| RPC call: Ruslan Azizov + Almaty-1 / mon_wed / `-1` / `2026-06-01` | Returns new row `f4dd1c71-…`, no exception |
| Idempotent second call | Returns row, same-month UPDATE branch — no error |
| Version resolution as-of `2026-05-31` | `null` → falls back to attendance-history inference → Ruslan remains visible in May |
| Version resolution as-of `2026-06-30` | `-1` → Ruslan hidden in June and forward |

## Behavior delta

- Past months keep rendering via attendance-history inference (no assignment
  row ≤ prior month-end = no opinion → fall back).
- The new `effective_from='2026-06-01'` row gates hiding to the displayed
  month and forward only — matches the versioned write contract from 051.

## Out of scope (flagged)

- **Asymmetry cleanup**: backfill `(student, branch, schedule_type)`
  assignment rows at `effective_from='1970-01-01'` for every distinct
  combo that appears in `attendance` but is missing from
  `student_time_slot_assignments`. Makes the read path explicit-first
  and the write path simpler. Recommended follow-up.
- **`attendanceCurrentScheduleStudents` semantics**: same idea on the
  frontend, defer until after backfill.

## Reversibility

Re-apply migration 051's function body to revert.
