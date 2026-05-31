# Berik Zhumabekovich — attendance visibility restoration — 2026-05-31

## Scope

Berik Zhumabekovich only. Other coaches (~5) with similar hide-event collateral
damage are **out of scope** (Phase 7, deferred).

- Berik coach_id: `d5d68db8-f1e5-4033-8dbc-69ca3a81d5b0`
- Berik auth user_id (`audit_log.changed_by`): `ada27d52-28ff-4b70-b78b-caa27a3cfd69`
- Berik branch_id (Almaty-1): `7d1946c8-183b-4ad9-8f49-77402bac2210`

## Background

`deleteStudentFromCalendar` in `admin-v2.js` did two destructive things globally,
not per-month:

1. `DELETE FROM attendance` for every attendance row of the student in the branch
   — every month, including past.
2. `UPDATE student_time_slot_assignments SET time_slot_index = -1` for the
   `(student, branch, schedule_type)` row — single row, no versioning. The
   calendar render path reads this globally, so the student vanished from every
   month, including past months.

The render path (`loadAttendanceCalendar` and the assignment cache) reads
`student_time_slot_assignments` once and applies globally. There is no monthKey
threading.

This mirrors the bug we fixed for `time_slots` in migrations 049 + 050. We are
applying the same effective-dating pattern to `student_time_slot_assignments`,
then restoring Berik's 41 hide events and the 7 Zakhar Osipov attendance rows
that were collateral damage from his calendar-deletion of Zakhar.

## Phase 1 — Audit results

### Hide events (41)

`audit_log` filter:
`entity_type='time_slots' AND field_name='time_slot_index' AND
changed_by='ada27d52-28ff-4b70-b78b-caa27a3cfd69' AND
new_value LIKE '% | slot -1'`

Count: **41 rows** ✓ matches PRD expectation.
All 41 entity_ids are still present in `student_time_slot_assignments` and
all 41 sit on branch `7d1946c8-…` (Almaty-1).

Current `time_slot_index` distribution (before migration 052):

| time_slot_index | rows |
|---|---|
| -1  (still hidden) | 39 |
| 1   (manually restored — Alexander Shin) | 1 |
| 2   (manually restored — Timofey Zakharenko, mon_wed) | 1 |

The two "manually restored" rows are already at a positive slot at
`effective_from = 1970-01-01`. Migration 052 leaves them untouched (the INSERT
hits `ON CONFLICT DO NOTHING` and the UPDATE is gated on `time_slot_index = -1`).
The end-state verification counts both as already-baselined.

#### Full table

| # | changed_at (UTC) | entity_id (assignment row) | student | prior slot | schedule | current slot |
|---|---|---|---|---|---|---|
| 1  | 2026-04-08 05:51 | 6742ee3b-5001-431f-ad1d-92c647142afb | Natan Dadamyan        | 2 | sat_sun | -1 |
| 2  | 2026-04-11 06:30 | eb82ff5a-5933-4d04-8c25-8b466eccb1c5 | Ramazan Zhazken       | 2 | sat_sun | -1 |
| 3  | 2026-04-16 06:52 | 4fe23316-3531-44de-9109-1be375785130 | Timofey Zakharenko    | 6 | mon_wed |  2 |
| 4  | 2026-04-17 08:12 | 327771e1-7dd7-4aac-b458-3200cfe0ec75 | Timofey Zakharenko    | 6 | tue_thu | -1 |
| 5  | 2026-04-23 11:10 | bd5d4739-440d-42e1-80a0-7ceb6093a340 | Alan Nursultan        | 5 | tue_thu | -1 |
| 6  | 2026-05-05 15:47 | 8bc7943e-2e2b-49dd-8591-11d7dcc4dac9 | Milla Kogay           | 1 | tue_thu | -1 |
| 7  | 2026-05-16 05:08 | d2ca102f-b30c-4775-9941-6cac7faccd7f | Insar Arnuruly        | 1 | tue_thu | -1 |
| 8  | 2026-05-20 07:46 | 7850a59f-91d0-4bf0-ada4-2ec934d7262f | Eva Mulyukova         | 1 | mon_wed | -1 |
| 9  | 2026-05-31 05:07 | 07b0d3c2-9c27-47bd-8f1f-8c57e1ba5619 | Mansur Alzhan         | 1 | sat_sun | -1 |
| 10 | 2026-05-31 05:10 | ba6824e1-4f52-471f-a962-238689d710c9 | Insar Arnuruly        | 1 | sat_sun | -1 |
| 11 | 2026-05-31 05:10 | b689443b-8bac-407b-8f43-b7207839d7d0 | Arslan Bagaev         | 1 | sat_sun | -1 |
| 12 | 2026-05-31 05:10 | daf47b43-5860-4aef-b6be-528475a75de4 | Adel Baiguzhanova     | 1 | sat_sun | -1 |
| 13 | 2026-05-31 05:10 | 71a455fc-b7d8-46e2-b0ea-83eddf4608f5 | Stepan Belokopytov    | 1 | sat_sun | -1 |
| 14 | 2026-05-31 05:10 | 9a33132a-43ee-4271-9e33-c99217294d7d | Anastasiya Glushkova  | 1 | sat_sun | -1 |
| 15 | 2026-05-31 05:11 | 860db763-15cb-40c7-bb87-2206754153b0 | Malika Maratova       | 1 | sat_sun | -1 |
| 16 | 2026-05-31 05:11 | 36050042-8056-4b11-824d-69dfcace9564 | Elnar Nabiyev         | 1 | sat_sun | -1 |
| 17 | 2026-05-31 05:11 | 55ca4cf5-7f63-45bf-a93e-2136de256fab | Alexander Shin        | 1 | sat_sun |  1 |
| 18 | 2026-05-31 05:11 | 07f09994-ae31-47fc-a0a4-1db363a5170b | Temirlan Akimguzhin   | 2 | sat_sun | -1 |
| 19 | 2026-05-31 05:12 | 993a4dfd-3c93-4cc9-8008-8b8413f7974b | Ratmir Bakirov        | 2 | sat_sun | -1 |
| 20 | 2026-05-31 05:12 | 854cde6b-2dd1-4d33-9182-290196660bc9 | Daniel Leiman         | 2 | sat_sun | -1 |
| 21 | 2026-05-31 05:12 | da198a6c-ccf6-4071-8f5f-ab13ac119da3 | Sungat Marat          | 2 | sat_sun | -1 |
| 22 | 2026-05-31 05:13 | 624f2bfc-d5fe-4984-bb56-ec9a22fde6a6 | Sagdat Marat          | 2 | sat_sun | -1 |
| 23 | 2026-05-31 05:13 | 1702d17c-9745-43a5-aae7-f6f70b7f7556 | Alikhan Nazarov       | 2 | sat_sun | -1 |
| 24 | 2026-05-31 05:13 | 1be5353c-eccd-4706-9da5-9f73b8840c05 | Ayaulym Samat         | 2 | sat_sun | -1 |
| 25 | 2026-05-31 05:13 | 3d597468-bdc7-4e6f-9b95-398e1deac404 | Kamila Sayfullova     | 2 | sat_sun | -1 |
| 26 | 2026-05-31 05:13 | 240ff9d2-6025-4f5a-a193-0184b64d9d05 | Sabina Sayfullova     | 2 | sat_sun | -1 |
| 27 | 2026-05-31 05:14 | a39de071-76fb-48aa-acbd-d74177bde8a8 | Tamerlan Batalov      | 3 | sat_sun | -1 |
| 28 | 2026-05-31 05:14 | 5ae1098c-5f4c-48df-b8ea-ddb00d59c167 | Alina Batalova        | 3 | sat_sun | -1 |
| 29 | 2026-05-31 05:14 | 6c9687b5-efd1-40f4-96ff-352d0d210310 | Aleksandr Roslavtsev  | 3 | sat_sun | -1 |
| 30 | 2026-05-31 05:21 | 2c61f8f7-fe0b-47a1-a7b9-d17d20a15264 | Milana Chernogor      | 1 | mon_wed | -1 |
| 31 | 2026-05-31 05:21 | 6d06e2d8-28bc-4613-b25a-e012e3a0f7d4 | Damir Davletbay       | 1 | mon_wed | -1 |
| 32 | 2026-05-31 05:21 | 86a86967-dc37-455b-b24d-2715bda8c0e3 | Milla Kogay           | 1 | mon_wed | -1 |
| 33 | 2026-05-31 05:22 | cb0058a3-407f-4749-90c9-5ce0538cf63b | Zhanali Nietzhan      | 1 | mon_wed | -1 |
| 34 | 2026-05-31 05:22 | 1e85d069-037d-4a89-a033-0856a91cfb12 | Makariy Nozdrin       | 1 | mon_wed | -1 |
| 35 | 2026-05-31 05:22 | 763b14af-296d-4fcb-9bda-2e804c86a603 | Abylay Sagitzhan      | 1 | mon_wed | -1 |
| 36 | 2026-05-31 05:22 | 27a1e7b9-411e-4a75-a770-70dab7380ded | Ilyas Sagyngali       | 1 | mon_wed | -1 |
| 37 | 2026-05-31 05:22 | 3e8dbaa5-19ca-4742-a43b-ed9d351bef76 | Mansur Sagyngali      | 1 | mon_wed | -1 |
| 38 | 2026-05-31 05:22 | 95f7489e-0d23-4150-bdf5-57fc4817439f | Mukhammedzhan Turgan  | 1 | mon_wed | -1 |
| 39 | 2026-05-31 05:22 | 696e18fd-256a-49ea-967d-226e6c7ca76f | Dilen Yakupov         | 1 | mon_wed | -1 |
| 40 | 2026-05-31 05:22 | f6dbd8a7-bc73-495f-a223-d7856b2190c5 | Natan Dadamyan        | 2 | mon_wed | -1 |
| 41 | 2026-05-31 05:22 | 8cb64e2a-ec62-40f1-a7e3-6b5fca4b8e72 | Emil Gammer           | 2 | mon_wed | -1 |

### Zakhar Osipov attendance deletes (7)

PRD filter (matches naively):
`entity_type='attendance' AND action='DELETE' AND
changed_by='ada27d52-28ff-4b70-b78b-caa27a3cfd69' AND
old_value LIKE 'Zakhar Osipov | %' AND split_part(old_value, ' | ', 3)::date < '2026-05-01'`

Naive count: **8 rows** — 1 from a separate earlier deletion event
(2026-03-16 → date 2026-03-08) and 7 from the 2026-05-02 batch (April rows that
were collateral damage when Berik clicked "remove Zakhar from calendar").

The 2026-03-08 row was deleted weeks before the Berik calendar-deletion event;
it is *not* knock-on damage. Per the PRD spec ("Zakhar Osipov's 7 attendance
rows"), migration 052 narrows the filter to the 2026-05-02 batch by adding
`AND al.changed_at >= '2026-05-01'`. Net inserts: **7** ✓.

| # | changed_at (UTC) | attendance_id (entity_id) | attendance_date | status |
|---|---|---|---|---|
| 1 | 2026-05-02 05:58:56 | 6dd8cb74-d3f1-4a9b-9909-c5f4b393b402 | 2026-04-04 | present |
| 2 | 2026-05-02 05:58:57 | 72412f93-f230-4496-8f62-43eeabdad339 | 2026-04-11 | present |
| 3 | 2026-05-02 05:58:58 | 2fa7c81a-0d05-4599-8eca-e241cdb56c60 | 2026-04-12 | present |
| 4 | 2026-05-02 05:58:59 | 4be12c79-6011-48f1-814a-9e41cb1b950f | 2026-04-18 | present |
| 5 | 2026-05-02 05:59:00 | 81f61a7f-4229-4654-9b7c-19b159042243 | 2026-04-19 | present |
| 6 | 2026-05-02 05:59:01 | 3f0296de-ea5a-43cd-ba5b-18362b881f38 | 2026-04-25 | present |
| 7 | 2026-05-02 05:59:02 | f43ec3ea-479e-4c20-946b-7f25d5e73682 | 2026-04-26 | present |

Pre-flight check on Zakhar's schedule for migration 052 Block B:

```
SELECT id, schedule_type FROM student_time_slot_assignments
WHERE student_id = (SELECT id FROM students WHERE first_name='Zakhar' AND last_name='Osipov' LIMIT 1)
→ ('40b0cabd-…', 'sat_sun')
```

Schedule confirmed `sat_sun` ✓. Zakhar has only one assignment row.

### Baselines for verification

- Total `attendance` row count before migration 052: **18072**
- Expected after migration 052: **18079** (= 18072 + 7)

## Phase 6 — Verification results

Both migrations applied via Supabase Management API on 2026-05-31.

### Migration 051 (schema) — applied ✓

```
SELECT column_name FROM information_schema.columns
  WHERE table_name='student_time_slot_assignments' AND column_name='effective_from';
→ effective_from

SELECT conname FROM pg_constraint
  WHERE conrelid='student_time_slot_assignments'::regclass AND contype='u';
→ student_time_slot_assignments_version_uk

\df hide_student_versioned
→ public.hide_student_versioned(uuid, uuid, text, integer, date)
  RETURNS student_time_slot_assignments
```

### Migration 052 Block A (41 hide reversals) — applied ✓

```
WITH events AS (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE entity_type='time_slots' AND field_name='time_slot_index'
    AND changed_by='ada27d52-…' AND new_value LIKE '% | slot -1'
)
SELECT COUNT(DISTINCT orig.id) AS total_tuples,
       COUNT(DISTINCT CASE WHEN baseline.time_slot_index >= 0 THEN orig.id END) AS baseline_visible,
       COUNT(DISTINCT CASE WHEN hide.time_slot_index = -1 THEN orig.id END) AS hide_rows
FROM events e JOIN student_time_slot_assignments orig ON orig.id = e.entity_id
LEFT JOIN student_time_slot_assignments baseline
  ON baseline.student_id=orig.student_id AND baseline.branch_id=orig.branch_id
  AND baseline.schedule_type=orig.schedule_type AND baseline.effective_from='1970-01-01'
LEFT JOIN student_time_slot_assignments hide
  ON hide.student_id=orig.student_id AND hide.branch_id=orig.branch_id
  AND hide.schedule_type=orig.schedule_type AND hide.effective_from > '1970-01-01';
→ { total_tuples: 41, baseline_visible: 41, hide_rows: 39 }
```

41 / 41 tuples have a positive-slot baseline at `1970-01-01`. 39 / 41 have a
hide row at the click-month's first day. The 2 already-restored tuples
(Alexander Shin sat_sun, Timofey Zakharenko mon_wed) correctly have no hide
row — their manually-set positive slot at `1970-01-01` is unchanged.

Spot check (5 students, expecting two rows each except the already-restored
ones):

| Student | Schedule | Slot | effective_from |
|---|---|---|---|
| Alan Nursultan       | tue_thu | 5  | 1970-01-01 |
| Alan Nursultan       | tue_thu | -1 | 2026-04-01 |
| Mansur Alzhan        | sat_sun | 1  | 1970-01-01 |
| Mansur Alzhan        | sat_sun | -1 | 2026-05-01 |
| Natan Dadamyan       | sat_sun | 2  | 1970-01-01 |
| Natan Dadamyan       | sat_sun | -1 | 2026-04-01 |
| Ramazan Zhazken      | sat_sun | 2  | 1970-01-01 |
| Ramazan Zhazken      | sat_sun | -1 | 2026-04-01 |
| Tamerlan Batalov     | sat_sun | 3  | 1970-01-01 |
| Tamerlan Batalov     | sat_sun | -1 | 2026-05-01 |

Migration 052's `DO $$ … $$;` verification block raised no exception; if it
had detected `<> 41` baseline rows or `<> 7` Zakhar attendance rows, the
whole transaction would have rolled back.

### Migration 052 Block B (7 attendance inserts) — applied ✓

```
SELECT COUNT(*) FROM attendance
  WHERE notes = 'restored from audit_log on 2026-05-31 — Berik knock-on';
→ 7

SELECT COUNT(*) FROM attendance;
→ 18079   (was 18072 before migration 052; delta = +7) ✓
```

### UI verification (manual)

Manual steps (no automation per PRD):

1. Log in as admin. Open the attendance calendar.
2. Navigate to Berik → Almaty-1 → `sat_sun` → **May 2026**. The 25 hidden
   sat_sun students appear back in their original slots with their existing
   checkmarks. Zakhar Osipov shows in slot 1 of sat_sun (April 2026) with his
   7 restored checkmarks.
3. Navigate to **June 2026**. The hidden students are *gone* — Berik's
   intended June roster shows (the May 31 hide takes effect from `2026-06-01`).
4. Navigate to `mon_wed` for May 2026 → hidden mon_wed students are back.
   June 2026 → hidden again.
5. Navigate to `tue_thu` likewise.

## Out of scope — future work (Phase 7)

- Restoring hide events from the **5 other coaches** (~80 students). Same
  pattern applies; user wants Berik only for now.
- Past-month edit clamp
  (`effective_from = max(displayedMonthStart, currentCalendarMonthStart)`)
  on `saveTimeSlotEdit` / `hide_student_versioned` to prevent retroactive edits
  from the UI.
- Audit trigger expansion (capturing `schedule_type` / `branch_id` on attendance
  DELETE, full JSON snapshots on student DELETE).
- Hide events that hard-deleted students entirely (separate ghost-revival
  decision).

## Modal copy follow-up (Phase 3)

i18n keys for the new hide semantics ("Hide student from {Month YYYY} onward.
Previous months will keep their schedule.") were added to `i18n.js` under:

- `admin.attendance.confirmHideStudent` (en/ru/kk)
- `admin.attendance.studentHidden` (en/ru/kk)

The legacy keys `confirmDeleteStudent` / `studentDeleted` remain untouched —
no other callers were found, but they are left in place to be safe.
