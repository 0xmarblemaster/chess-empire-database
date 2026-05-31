# Hide-event effective_from shift to versioning cutover

**Date:** 2026-05-31
**Migration:** `057_shift_restoration_hides_one_month.sql`
**Reporter:** Berik Zhumabekovich (Almaty-1)
**Symptom:** After clicking delete on students from June 2026 view at Almaty-1
(sat_sun and mon_wed 10:00-11:00 schedules), those students disappeared from
May and earlier views as well — even though migrations 052/053 were supposed
to preserve historical visibility.

## Root cause

Migrations 052 and 053 reconstructed historical hide events from `audit_log`
and stamped them at `effective_from = date_trunc('month', changed_at)`.
That heuristic has no real signal:

- The legacy DELETE code path (pre-migration 051) did not carry a
  `displayed_month`. It just hard-deleted the
  `student_time_slot_assignments` row and the corresponding `attendance`
  rows.
- A click made on 2026-05-31 while viewing **June** was therefore stamped
  at `2026-05-01` (wrong, should be `2026-06-01`).
- Same logic applied to every "next-month planning" click in the
  reconstructed dataset.

The read path (`getTimeSlotAssignments` → "find latest version where
`effective_from <= monthEnd`") then treats a `2026-05-01` `-1` row as
"hide applies to May" — wiping the May view that Berik was supposed to
keep intact.

There was also a **feedback loop** at 2026-05-31 11:11–11:12 UTC:
after migration 052 ran (~07:30 UTC) and Berik saw students still missing
from May, he clicked delete on 10 mon_wed students while viewing
**May 2026**, adding 10 new `-1` rows at `effective_from = 2026-05-01`
via `hide_student_versioned`. These overlapped with 10 clicks he had
already done at 10:54 UTC in June view (already at `2026-06-01`).

## Decision

There is no defensible per-month "correct" `effective_from` for
migration-restored rows, because the legacy code never recorded which
month the coach was viewing. The least-surprising rule is:

> Show every student in every month through May 2026 with their existing
> attendance checkmarks. Apply hides only from `2026-06-01` onward,
> when the versioned write path (`hide_student_versioned`, migration 051)
> takes over.

This migration re-stamps every `-1` row currently at `2026-03-01`,
`2026-04-01`, or `2026-05-01` to `2026-06-01`. Today's live June-view
clicks (already at `2026-06-01`) and pre-existing `1970-01-01`
forever-hidden markers are untouched.

## State delta

### Pre-migration

| effective_from | -1 rows |
| -------------: | ------: |
| 1970-01-01     |      87 |
| 2026-03-01     |       5 |
| 2026-04-01     |      48 |
| 2026-05-01     |      64 |
| 2026-06-01     |      13 |

### Post-migration

| effective_from | -1 rows |
| -------------: | ------: |
| 1970-01-01     |      87 |
| 2026-06-01     |     120 |

Net: **10 redundant overlap rows deleted**, **107 rows re-stamped** to
`2026-06-01`.

### Almaty-1 (Berik) verification

| schedule | hidden in May | visible in May | hidden in June | visible in June |
| -------- | ------------: | -------------: | -------------: | --------------: |
| sat_sun  |             0 |             31 |             22 |               9 |
| mon_wed  |             0 |             32 |             23 |               9 |

Berik's May view now shows the full original roster with all original
checkmarks. June onward keeps the intentional cleaned-up roster from his
2026-05-31 clicks.

## Why no code change

The live write path (`deleteStudentFromCalendar` →
`hide_student_versioned`) already passes
`effective_from = displayedMonthStart`, which matches the modal's
"Hide from {month} onward. Previous months will keep their schedule"
contract. The bug was only in the restoration migrations' heuristic, not
the live path.

## Idempotency

Re-running migration 057 is a no-op: after the first run, no rows match
the `effective_from IN ('2026-03-01','2026-04-01','2026-05-01')` filter.

## Out of scope

- **87 `-1` rows at `1970-01-01`** at 6 other branches (Halyk Arena 62,
  Almaty Arena 0, Gagarin Park 9, Debut 6, Zhandosova 7, НИШ 3) — these
  are pre-existing forever-hidden markers, likely from students hard-
  deleted before the versioning system shipped. They do not affect
  Berik's complaint and have separate semantics from the restoration
  rows. Investigate separately if any coach reports missing students
  outside the restoration window.
- **Mid-month-exit workflow** ("student leaves on May 15"). Today the
  coach can drag them off, but there is no "End enrollment as of date X"
  affordance. The bump-to-June semantic means any rare migration-restored
  hide that was genuinely meant to start mid-month becomes visible-with-
  stale-attendance until June. Net: no data lost, the student shows up
  with their existing checkmarks. Defer the proper UX as a separate
  feature.
- **Audit-log displayed_month capture** — a trigger that records the
  displayed month on every `student_time_slot_assignments` write would
  prevent future restorations from depending on a `date_trunc` guess.
  Worth doing, not blocking today.
