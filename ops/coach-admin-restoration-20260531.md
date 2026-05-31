# Coach/Admin attendance restoration — 2026-05-31

Universal follow-up to `ops/berik-restoration-20260531.md` (Ralph, commit
`7fcaecb`). Applies the same effective-dating + audit-log replay pattern to
every other changer who ran `deleteStudentFromCalendar` before the write-path
rewrite in commit `7fcaecb`.

Migration: `supabase/migrations/053_restore_all_coach_admin_deletions.sql`.
Applied to live DB 2026-05-31 via Supabase Management API.

## Scope (excluding Berik)

| Changer | Email | Role | Hide events | Knock-on att rows | Orphan students |
|---|---|---|---|---|---|
| Nail Ildusovich | xasnylinnail@gmail.com | admin | 46 | 121 | 6 |
| Vasily Mikhaylovich | vasilyevvasily.1997@mail.ru | coach (Gagarin) | 12 | 9 | 1 |
| Assylkhan Agbaevich | asik1404@mail.ru | coach (Debut) | 7 | 0 | 0 |
| Alex (admin) | 0xmarblemaster@gmail.com | admin | 3 | 504 | 2 |
| Chingis Baurzhanovich | nurgalimov.chingis@gmail.com | coach (Gagarin) | 5 | 0 | 0 |
| Shokhan Okenovich | karimov.shokan@gmail.com | coach (Zhandosova) | 4 | 0 | 0 |
| Tanirbergen Aybekovich | kenzhebekov16@mail.ru | coach (Almaty Arena) | 3 | 44 | 24 |
| kazakhstan.chess.school | (no coach record) | admin | 0 | 9 (skipped) | 1 (skipped) |
| vladislavmaltsev | (no coach record) | admin | 0 | 2 (skipped) | 0 |

**Totals:** 80 hide events, 1,235 knock-on attendance rows, 34 distinct orphan
students. After filtering to still-hidden + derivable-branch: 68 hide
reversals, 693 recoverable attendance, 352 orphan attendance, 33 ghost
students. (11 rows / 1 student skipped: Alseit Malik, primary deleter is
kazakhstan.chess.school which has no coaches row → no branch resolution.)

## What changed in the DB

| Block | Description | Rows |
|---|---|---|
| A | Hide reversals: pin `time_slot_index=-1` row to click month, INSERT `effective_from='1970-01-01'` row with prior slot | 68 active (8 manually-reassigned + 4 deleted = no-op) |
| B | Restore knock-on attendance for surviving students. Branch+schedule resolved via cascade (proximity → overall → assignment → student.branch+DOW) | 693 |
| C | Ghost students for hard-deleted orphans. `id=md5(name)::uuid`, `status='left'`, `parent_name='[ghost: restored from audit_log 2026-05-31]'` | 33 |
| D | Orphan attendance rows pointing at ghosts. Branch from primary changer's coach record, schedule from DOW. | 352 |

## Per-month breakdown of restored attendance rows

| Month | Block B (surviving students) | Block D (ghost orphans) | Total restored |
|---|---|---|---|
| 2026-01 | 217 | 11 | 228 |
| 2026-02 | 435 | 120 | 555 |
| 2026-03 | 16 | 132 | 148 |
| 2026-04 | 25 | 89 | 114 |
| 2026-05 | 0 | 0 | 0 |

Total **+1,045 attendance rows** for pre-June months. Plus Berik's 7 Zakhar
rows from migration 052 = **1,052 rows restored overall today**.

## Hide reversals: still-hidden vs no-op cases

| State | Events | Outcome |
|---|---|---|
| `still_hidden` (currently `time_slot_index=-1`) | 68 | Active reversal — UPDATE + INSERT |
| `manually_reassigned` (later set to a positive slot) | 8 | No-op by design — UPDATE filter and ON CONFLICT skip |
| `assignment_deleted` (assignment row gone entirely) | 4 | No-op — JOIN against assignment row finds nothing |

## Ghost student inventory (33)

All saved with `status='left'`, `parent_name='[ghost: restored from audit_log 2026-05-31]'`.
Branch assigned from the primary deleter's coach record. Coach association
is intentionally NULL because we cannot derive it from `audit_log` (only
attendance rows, not student rows, were field-tracked).

If any of these students are revived (e.g. the school provides their phone /
coach), the records can be enriched in place — the `md5(name)::uuid` ID is
deterministic and reusable.

| Name | Branch | Restored att rows |
|---|---|---|
| Abilmansur Marat | Almaty Arena | 13 |
| Adilet Amankeldi | Almaty Arena | 12 |
| Aibek Seidilda | Debut | 2 |
| Alima Arystan | Almaty Arena | 5 |
| Alinur Nursultan | Almaty Arena | 19 |
| Amanzhol Dias | Debut | 1 |
| Amire Talaptan | Almaty Arena | 9 |
| Anvarov Danial | Debut | 3 |
| Armanov Arystan | Debut | 3 |
| Arsen kaldibay | Almaty Arena | 23 |
| Aruzhan Nurlan | Almaty Arena | 9 |
| Ayim Erlan | Almaty Arena | 17 |
| Baibolat Arman | Almaty Arena | 19 |
| Bekbolat Tanirbergen | Almaty Arena | 9 |
| Beksultan Bahtybai | Almaty Arena | 12 |
| Bekzhan Nursultanuly | Almaty Arena | 12 |
| Danial Talgat | Almaty Arena | 9 |
| Dinmuhamed Seitzhan | Almaty Arena | 21 |
| Elkhan Ashken | Almaty Arena | 10 |
| Elnur Tralbek | Debut | 1 |
| Kausar Bekmuhamet | Almaty Arena | 11 |
| Magzhan Isa | Almaty Arena | 9 |
| Malika Sayfutdinova | Halyk Arena | 13 |
| Mansur Aselov | Almaty Arena | 9 |
| Mansur Assilov | Almaty Arena | 12 |
| Margulan Tuligazi | Almaty Arena | 16 |
| Medet Toktarbek | Almaty Arena | 7 |
| Nurzhan Amankeldi | Almaty Arena | 12 |
| Ramazan Nurdaulet | Almaty Arena | 12 |
| Rayimbek Sayfutdinov | Halyk Arena | 14 |
| Samatov Alikhan | Debut | 1 |
| Sergazy Dinmukhammed | Gagarin Park | 9 |
| Yasmin Maksat | Almaty Arena | 20 |

## Excluded from restoration

| Row count | Reason |
|---|---|
| 11 (Alseit Malik) | Primary deleter `kazakhstan.chess.school@gmail.com` has no `coaches` row → no branch resolution |
| ~179 | Knock-on rows where neither `audit_log` DELETE nor CREATE row preserved a student name |

The 179 nameless rows are tracked but not actionable without manual lookup
from external records.

## Reversibility

```sql
DELETE FROM attendance
  WHERE notes IN (
    'restored from audit_log on 2026-05-31 - coach/admin knock-on',
    'restored from audit_log on 2026-05-31 - orphan ghost');

DELETE FROM students
  WHERE parent_name = '[ghost: restored from audit_log 2026-05-31]';

-- For Block A reversal, see migration 053 — would need a reverse query
-- gated on the same audit_log filter (changed_by <> berik_uid).
```

## Verification (post-apply)

| Check | Expected | Actual |
|---|---|---|
| Block B restored rows | 693 | 693 ✓ |
| Block C ghosts | 33 | 33 ✓ |
| Block D restored rows | 352 | 352 ✓ |
| Total versioned hides (slot=-1, effective_from > 1970) | 39 (Berik) + 68 (others) = 107 | 107 ✓ |
| Total attendance | 18,072 + 1,052 = 19,124 | 19,124 ✓ |

## Out of scope (separately tracked)

- **Recurrence prevention**: write-path rewrite in commit `7fcaecb` already
  routes through `hide_student_versioned()` — new clicks no longer wipe past
  months. No further code change needed.
- **Past-month edit clamp** in `deleteStudentFromCalendar` (proposed in
  earlier scope discussion): would prevent operators from setting
  `effective_from` to a back-dated month. Not implemented.
- **Audit log enrichment** for `students` and `student_time_slot_assignments`
  DELETE: would have made full ghost revival possible (with phones, parent
  info). Currently only `attendance` DELETE preserves the human-readable
  payload. Out of scope.
