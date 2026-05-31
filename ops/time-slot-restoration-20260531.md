# Time-slot historical restoration — 2026-05-31

## Goal

Restore the original (seed) attendance schedule for **May 2026 and earlier**.
Preserve coach/admin edits made on 2026-05-30 → 2026-05-31 for **June 2026 onward**.
Checkmarks (`attendance` rows) are untouched: they are matched to calendar columns
by `(date, students.time_slot_index)`, so restoring the slot version headers
automatically restores how past months render — no attendance rows are modified.

## Reference

- Pre-edit ground truth: `supabase/migrations/044_seed_time_slots.sql`
  (applied 2026-05-30 14:35:44 UTC).
- Versioning infrastructure: `supabase/migrations/049_time_slots_effective_dating.sql`
  (`effective_from DATE`, `edit_time_slot_versioned()` RPC).
- Edit window: first edit at 2026-05-30 17:24:48 UTC (Aleksandr / Halyk),
  last edit at 2026-05-31 05:18:33 UTC (Berik / Almaty-1).

## Mutated rows (10)

All 10 rows currently have `effective_from = 1970-01-01`, so every historical
month resolves to the *current* (post-edit) value. The restoration migration
pins each one to `effective_from = 2026-06-01` and inserts a sibling row at
`effective_from = 1970-01-01` carrying the seed values.

| # | Slot ID | Coach | Branch | Sched | Idx | Seed (Jan 1970 →) | Current (June 2026 →) | Change |
|---|---|---|---|---|---|---|---|---|
| 1 | 13fb6782 | Aleksandr | Halyk Arena | tue_thu | 0 | 10:00 – 11:00, ∅ | 10:00 – 11:00, "Группа A" | label |
| 2 | d4e3d77b | Chingis | Gagarin Park | mon_wed | 0 | 09:00 – 10:00, ∅ | 09:00 – 10:00, "С" | label |
| 3 | 727d160b | Chingis | Gagarin Park | mon_wed | 1 | 10:00 – 11:00, ∅ | 10:00 – 11:30, ∅ | time |
| 4 | 04e05a2e | Chingis | Gagarin Park | mon_wed | 3 | 12:00 – 13:00, ∅ | 12:00 – 13:00, "D" | label |
| 5 | 9f9f736d | Assylkhan | Debut | sat_sun | 0 | 09:00 – 10:30, ∅ | 09:00 – 10:30, "ГРУППА А" | label |
| 6 | ea74d63f | Berik | Almaty-1 | sat_sun | 0 | 09:00 – 10:00, ∅ | 09:30 – 10:00, "Окно для пробного" | time + label |
| 7 | cc405fc8 | Berik | Almaty-1 | sat_sun | 1 | 10:00 – 11:00, ∅ | 10:00 – 11:00, "Группа D" | label |
| 8 | b25a5b86 | Berik | Almaty-1 | sat_sun | 2 | 11:00 – 12:00, ∅ | 11:00 – 12:00, "Группа C" | label |
| 9 | 4fc20cab | Berik | Almaty-1 | sat_sun | 3 | 12:00 – 13:00, ∅ | 12:00 – 13:30, "Группа B" | time + label |
| 10 | 8974a5ea | Berik | Almaty-1 | sat_sun | 4 | 13:00 – 14:00, ∅ | 14:00 – 16:00, "Лига С" | time + label |

## Approach

`supabase/migrations/050_restore_time_slot_history.sql` (BEGIN/COMMIT, idempotent):

For each of the 10 slot IDs:

1. `UPDATE time_slots SET effective_from = '2026-06-01' WHERE id = '<slot_id>'`
   — pins the current (edited) row to render only from June 2026 onward.
2. `INSERT INTO time_slots (branch_id, coach_id, schedule_type, slot_index,
   start_time, end_time, label, effective_from)`
   `SELECT branch_id, coach_id, schedule_type, slot_index, '<seed_start>',
   '<seed_end>', NULL, '1970-01-01' FROM time_slots WHERE id = '<slot_id>'`
   — adds the seed-value version covering all prior months.
   Guarded by `ON CONFLICT (branch_id, coach_id, schedule_type, slot_index,
   effective_from) DO NOTHING` so re-runs are safe.

## Verification

- For each affected `(branch, coach, schedule, slot_index)`:
  - latest version on/before `2026-05-31` → seed row (start/end/label = NULL)
  - latest version on/before `2026-06-30` → current (edited) row
- Attendance rows untouched: same counts pre- and post-migration.

## Out of scope

- No frontend changes. Versioning render path shipped in commit 5314445.
- No RLS changes.
- No deletes of `attendance` rows.
