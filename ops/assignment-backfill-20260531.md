# Assignment Backfill — 2026-05-31

## Context

Followup to migration 054 (`hide_student_versioned` no longer raises P0001 when
no prior assignment row exists). Migration 054 patched the symptom; this
migration closes one slice of the underlying read/write asymmetry by giving the
11 currently-invisible active non-Halyk students an explicit assignment row so
they render in the calendar with their existing attendance checkmarks.

## Scope (Option 2)

| Bucket | Combos | Action |
|---|---|---|
| **Non-Halyk active** | **11** | **Backfilled at slot 0, effective_from='1970-01-01'** |
| Halyk active | 18 | Skipped — array-position auto-assignment preserved |
| Inactive (all branches) | 58 | Skipped — filtered out of UI rendering anyway |
| No `students` row | 0 | None remain (migration 053 ghost-revived) |

## Backfilled students

All 11 are on `schedule_type='mon_wed'`. Slot 0, `effective_from='1970-01-01'` (covers all months past and future).

| # | Student | Branch |
|---|---|---|
| 1 | Maryam Adilkhan | Zhandosova |
| 2 | Rauana Bolat | Zhandosova |
| 3 | Adam Esembayev | НИШ |
| 4 | Alan Esembayev | НИШ |
| 5 | Alikhan Tokan | НИШ |
| 6 | Aruzhan Shyngysqyzy | НИШ |
| 7 | Askar Omirbaev | НИШ |
| 8 | Avraam Ismailov | НИШ |
| 9 | Jasmin Alshynbek | НИШ |
| 10 | Nurtai Zhumagulov | НИШ |
| 11 | Shakir Surtaev | НИШ |

## Verification

- Migration applied 2026-05-31 10:12:48 UTC.
- 11 rows inserted (verified count matches expectation).
- Post-migration check: 0 active non-Halyk students remain without an assignment row.
- All 18 Halyk active combos intentionally untouched.
- All 58 inactive combos intentionally untouched.

## Reversal

```sql
DELETE FROM student_time_slot_assignments
WHERE effective_from = '1970-01-01'
  AND created_at = updated_at
  AND created_at = '2026-05-31 10:12:48.042914+00';
```

## Out of scope

- **Halyk Arena's array-position rendering** — fragile but functional. Ripping
  it out and replacing with explicit assignment rows for all 18 active combos
  would be a separate deliberate project, not silent cleanup. Would cause
  visible slot churn (all students pinned to slot 0 until coaches manually
  re-distribute via drag-drop).
- **Inactive students** — currently invisible by design; no change here.
