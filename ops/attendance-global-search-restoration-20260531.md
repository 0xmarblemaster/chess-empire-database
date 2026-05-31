# Attendance global student search — restoration audit

**Date:** 2026-05-31
**Surface:** Admin Attendance page (`admin-v2.html` / `admin-v2.js`)
**Ticket:** restore global student search across all branches

## RCA

Commit `b51c546` (2026-05-25, "wire up orphan search bar above calendar")
re-wired the `#attendanceStudentSearch` input above the attendance calendar
to a local handler, `handleAttendanceSearchDropdown`, whose source was
`attendanceCalendarData` — i.e. only the slice of students already loaded
for the currently-selected branch / coach / schedule combination. As a
result, typing a student name only matched students inside the active view
(often ~15-30), instead of searching all ~1,051 students school-wide and
jumping the user to the right slot.

The original global-search behavior had been implemented in three orphan
helpers — `handleGlobalStudentSearch`, `clearGlobalSearch`,
`navigateToGlobalStudent` — that fed the never-rendered `#globalSearchResults`
dropdown. Those helpers held the correct auto-switch logic (branch → coach
→ schedule → expand slot → scroll + highlight), but their DOM targets had
been removed in an earlier sweep. The b51c546 wiring fix replaced the
search experience without folding the orphan global logic back in or
deleting the orphan helpers, leaving two parallel — and broken — search
code paths.

## Solution

Merged `handleAttendanceSearchDropdown` and `navigateToGlobalStudent` into
a single path on `#attendanceStudentSearch`:

1. **`handleAttendanceSearchDropdown(query)`** (now `async`) — sources from
   `window.students` (school-wide), case-insensitive `includes` match on
   `firstName + ' ' + lastName`, coach-locked users see only students in
   their assigned branches, admins see all. Renders the existing
   `.attendance-search-result` markup with `Branch · Coach` as the
   secondary line (branch name translated via `i18n.translateBranchName`).
   Cap of 10 visible + `+N more` footer preserved.
2. **`navigateToAttendanceStudent(studentId)`** (now takes `studentId` only)
   — resolves role, refuses with a toast (`admin.attendance.searchOutOfScope`)
   if the student's branch is outside a coach's scope, otherwise switches
   branch → populates coach dropdown → switches coach (locked coaches stay
   pinned to self) → resets schedule and runs `loadAttendanceData()` to
   seed `attendanceStudentScheduleAssignments` → resolves the student's
   actual schedule, sets it, and reloads → expands the time-slot group
   via `attendanceExpandedSlots['slot-' + index] = true` → scrolls and
   applies `.attendance-row-highlight` for 2 seconds.
3. The three orphan helpers and their dead DOM references
   (`#globalStudentSearchInput`, `#globalSearchResults`,
   `#globalSearchClear`) were removed from `admin-v2.js`.

## Decisions

1. **One search box, not two.** Existing search bar wired in b51c546 is
   the only entry point; orphan global helpers and their dead DOM ids
   are deleted rather than re-wired.
2. **Coach-lock filter is client-side.** We filter `window.students` by
   `coachAllowedBranchNames` before rendering matches. The same scope
   is enforced server-side via RLS — this is UX, not security.
3. **Multi-slot students resolve to dominant schedule.** We rely on the
   existing `attendanceStudentScheduleAssignments[studentId]` map (built
   from `loadAttendanceData`); if a student appears in multiple slots
   we land on the one the existing logic considers dominant. No new
   tie-breaker introduced.
4. **Standard 2-second yellow pulse.** Re-uses the existing
   `.attendance-row-highlight` CSS class (vs. the orphan helper's bespoke
   pink-3s inline style). One canonical highlight style across the page.
5. **Orphans deleted, not soft-deprecated.** No callers in `admin-v2.*`
   reference the three removed functions or DOM ids. `admin.js` (legacy
   admin) still has its own copies; left untouched per task scope.

## Affected surfaces

- Admin Attendance page only (`admin-v2.html` `#attendanceStudentSearch`).
- No backend, RLS, schema, or migration changes.
- `admin.js` (legacy) and `legacy-admin.html` are intentionally untouched.

## Files changed

- `admin-v2.js` — rewrote `handleAttendanceSearchDropdown` +
  `navigateToAttendanceStudent`; deleted `handleGlobalStudentSearch`,
  `clearGlobalSearch`, `navigateToGlobalStudent` (and the
  `// ========== Global Student Search ==========` section header).
- `i18n.js` — added `admin.attendance.searchOutOfScope` to all three
  locale blocks (en/ru/kk).
- `tests/test-attendance-global-search.js` — new source-grep test.
- `tests/test-attendance-search-wiring.js` — unchanged (it only asserts
  DOM wiring + handler existence, which still holds).

## Verification

- `node --check admin-v2.js` clean.
- `node tests/test-attendance-global-search.js` — all asserts pass.
- `node tests/test-attendance-search-wiring.js` — still passes (its
  assertions about `handleAttendanceSearch` / `handleAttendanceSearchDropdown`
  existence and the DOM wiring remain true).
- Grep for `handleGlobalStudentSearch|clearGlobalSearch|navigateToGlobalStudent`
  in `admin-v2.*` — zero matches.
