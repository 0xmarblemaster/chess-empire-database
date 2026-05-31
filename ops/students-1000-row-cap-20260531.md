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

## Correction (later same day, after user re-tested)

**Commit `4baa8ae` did NOT fix the bug.** The user hard-refreshed and the
Nurym brothers were still missing. Re-investigation revealed:

PostgREST on this Supabase project enforces `db-max-rows=1000` **server-side**.
Direct curl proves it — even with `Range: 0-9999` header, the response is
`Content-Range: 0-999/1051` with 1000 rows. The client cannot override
this cap with `.range()`, with `?limit=5000`, or any other header.

What `.range()` *does* do: scope the SELECT to a window *within* the cap.
So `.range(0, 999)` returns the first 1000 rows, `.range(1000, 1999)`
returns the next 51 rows (yes — the Nurym brothers come back in that
second call). That's the actual mechanism that works.

### Real fix — client-side pagination loop

```js
const PAGE = 1000;
const HARD_CEILING = 50;          // safety belt: never loop more than 50k rows
const rows = [];
for (let page = 0; page < HARD_CEILING; page++) {
    const from = page * PAGE;
    const to   = from + PAGE - 1;
    const { data, error } = await window.supabaseClient
        .from('students')
        .select(...)
        .order('created_at', { ascending: false })
        .range(from, to);
    if (error) { /* return [] */ }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;     // short page = end of data
}
```

Applied to both call sites (`getStudents()` and `exportRatings()`).

### Verification

```
# Direct PostgREST probe with service-role key
curl -sS -H "Range: 0-9999" .../students?select=id&order=created_at.desc
  → 1000 rows                       (server cap kicks in, ignores Range upper bound)

curl -sS -H "Range: 1000-1999" .../students?select=id&order=created_at.desc
  → 51 rows                         (page 2 returns the missing tail)

# Nurym brothers via direct filter
curl ".../students?first_name=in.(Sungat,Nurmukhamed)&last_name=eq.Nurym"
  → 2 rows ✓                        (they exist, just past the cap)
```

After this fix `getStudents()` returns 1051 rows in two HTTP calls
(1000 + 51), all 24 hidden active students appear in search.

### Why the broken fix slipped through

Test `test-students-pagination-cap.js` was a source-grep that asserted
the literal string `.range(0, 9999)` was present. The string was there;
the underlying behavior wasn't tested. Updated test now asserts the
**pagination loop pattern** (for-loop, computed from/to, short-page
break) and explicitly rejects the broken `.range(0, 9999)` pattern as
a regression guard.

## Commit

`4baa8ae` — added the broken `.range(0, 9999)` pattern (kept in history
as documentation of what doesn't work).

`<filled in by next commit>` — replaces with client-side pagination loop +
source-grep test + this audit doc.
