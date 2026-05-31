# Students Table Hit PostgREST 1000-Row Cap (2026-05-31)

## Reported by
Alex, via Telegram — Halyk Arena, coach Aleksandr Olegovich, students **Sungat
Nurym** and **Nurmukhamed Nurym** missing from the Student Database tab,
but still visible in the Attendance table with checkmarks.

## Root cause

`getStudents()` in `supabase-data.js:17` does a full-table SELECT:

```js
.from('students')
.select(`...`)
.order('created_at', { ascending: false });
```

No `.range()`, no pagination. PostgREST silently truncates SELECTs to **1000
rows** by default. The students table currently has **1051 rows**, so the
51 oldest rows (the very first seed batch on `2025-11-05`) get dropped
client-side every time the Student Database tab loads.

Search and filter on `/admin#students` operate over the cached global `students`
array (admin-v2.js:419 `getFilteredStudents`), so anything missing from
`getStudents()` is invisible to search by design.

### Why attendance still showed them

`getAttendanceCalendarData()` (`supabase-data.js:2123`) queries per-branch:

```js
.from('students')
.eq('branch_id', X)
.eq('status', 'active')
```

Halyk Arena has 132 students — well under 1000. Same for every other branch.
The cap never triggers on the attendance path.

### Why it broke recently

The DB only crossed 1000 students recently (likely during May tournament uploads
and ongoing roster growth). Below 1000 the bug was invisible. Above 1000 the
oldest students are stable casualties because `ORDER BY created_at DESC` always
pushes them past row 1000.

## Scope — every silently-hidden student

51 rows hidden. By status: **24 active, 13 frozen, 14 left**. All created
`2025-11-05`.

### 24 active students (visible coaching impact)

| Branch       | Coach                  | # | Names |
|--------------|------------------------|---|-------|
| Halyk Arena  | Aleksandr Olegovich    | 20 | Nurmukhamed Nurym, Sungat Nurym, Andrey Kuznetsov, Turabay Ali, Alim Guseynov, Ramazan Beldibek, Mukhammed Nogaybay, Danel Tsay, Emil Akhunzyanov, Muratuly Diyar, Aldiyar Omarov, Ansar Tair, Akbar Serimbet, Khazret Kayrat, Sanzhar Erik, Ayaru Daniyarkyzy, Kochubey Darya, Ramzan Korganbaev, Rail Paltushev, Ilyas Malik |
| Halyk Arena  | Aibek Kaisarovich      |  3 | Ismatulla Abdrimov, Daliya Subkhanberdina, Amir Zhanabaev |
| Debut        | Assylkhan Agbaevich    |  1 | Ekaterina Kim |

### Downstream surfaces affected
- Student database table + search + filters (the user's complaint)
- Coach detail view (`coach.js:100`)
- Branch detail view (`branch.js`)
- Coach KPI calculations that iterate the cached `students` array
- Any dropdown that lists "all students"

## Fix

`.range(0, 9999)` on the two unbounded full-table selects:

1. `supabase-data.js:17` — `getStudents()` (the Student Database loader)
2. `admin-v2.js:10143` — `exportRatings()` (currently 773 rows; under cap today,
   added defensively for headroom)

10K ceiling: at current ~30 students/month growth, ~25 years of headroom before
the next bump.

All other `.from('students')` call sites are already row-bounded:

| Call site                                      | Bound                                |
|------------------------------------------------|--------------------------------------|
| `getStudentById(id)`                           | `.eq('id', id).single()`             |
| `addStudent` / `updateStudent` / `deleteStudent` | mutation, not a read               |
| `searchStudents(query)`                        | `.limit(50)`                         |
| Leaderboard student lookups                    | `.in('id', studentIds)` (input-bound)|
| Attendance calendar                            | `.eq('branch_id', X).eq('status','active')` |
| Audit-log name resolver (admin-v2.js:11635)    | `.in('id', Array.from(studentIds))`  |

## Verification

After deploy:
1. `/admin#students` → search "Nurym" → both brothers appear with full record.
2. Search "Kuznetsov", "Guseynov", "Ekaterina Kim" — all appear.
3. Filter by branch=Halyk Arena → 132 rows (vs ~82 before).
4. Coach detail page for Aleksandr → 97 active students (vs 77 before).

## Tests

`tests/test-students-pagination-cap.js` (new):
- `getStudents()` source includes `.range(0, 9999)`
- Ratings export query includes `.range(0, 9999)`
- Other call sites kept their existing bounds (regression guard)

All 8 assertions pass. Existing attendance + coach KPI suites: no regressions.
(`test-coach-kpi-section-switcher.js` has a pre-existing DOM-stub failure
unrelated to this change — `document.querySelector is not a function` in
`vm.runInContext` — was failing on `main` before this commit.)

## Risk

- Single-line addition to two functions. Reversible.
- No DB writes, no schema changes, no migration.
- 10K ceiling well above current scale.
- The 24 active students immediately reappear in search after deploy — the
  rows were never missing from the DB, just hidden by the client-side cap.

## Out of scope (flagged, not fixed)

- **`audit_log` (29 811 rows).** Admin UI paginates it server-side. Low risk;
  worth a low-priority sweep of any "last 7 days" widget that might trip the
  cap.
- **`attendance` (19 133 rows).** Only ever queried per-branch + per-month —
  each call well under cap.
- **`student_ratings` (9232 rows).** Used in tournament-paginated dropdowns;
  spot-check confirmed each call is bounded.
- **Raising the PostgREST project default `max_rows` from 1000 → 10000.**
  Would fix the cap globally, but `.range()` per query is more explicit and
  doesn't silently change behavior for unrelated tables. Keep per-query.

## Commit

`<filled in by commit step>` — adds `.range(0, 9999)` to two queries +
source-grep test + this audit doc.
