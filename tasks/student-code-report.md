# Student ID (`student_code`, CE-00001) — implementation report

Spec: `.ralph-task-student-code.md`. Nothing has been applied to prod, deployed or pushed.

## Commits (on `main`, not pushed)

| SHA | What |
|-----|------|
| `8d5861f` | `feat(db)`: migration 096 + read-only verify file + static migration test |
| `5350d07` | `feat(students-api)`: student_code in every payload, `find?student_code=`, `action=list`, code as alternative key |
| `e06ec8d` | `feat(api)`: analytics-* + tournaments-api payloads / `?student_code` filters |
| `50143f7` | `feat(frontend)`: profile ID, list/search by code, Add-student double-submit guard |
| `537d5c1` | `docs(api)`: README-API.md |

## Files changed

- **DB:** `supabase/migrations/096_student_code.sql`, `supabase/migrations/096_student_code_verify.sql`
- **Edge functions:** `students-api/{index.ts,students-logic.mjs}`, `analytics-students`, `analytics-leaderboards`,
  `analytics-attendance`, `analytics-status`, `analytics-tournaments`, `tournaments-api` (all `index.ts`)
- **Frontend:** `supabase-data.js`, `supabase-data-tournaments.js`, `progress-ranking.js`, `admin-v2.js`, `app.js`,
  `coach.js`, `student.js`, `i18n.js`, `admin-styles.css`, `coach-styles.css`, `student-styles.css`
- **Docs:** `README-API.md`
- **Tests (wired into `npm test`):** `test-student-code-migration.js` (35), `test-student-code-api.mjs` (80),
  `test-student-code-functions.mjs` (53), `test-student-code-frontend.js` (71). Two assertions in
  `test-students-api.js` were updated because the spec deliberately relaxed "student_id required" to
  "student_id or student_code" (OpenAPI now uses `anyOf`).

`npm test`: all green. No pre-existing failures (the baseline before this work was green too).
`deno check` passes for every changed function. The only errors are the pre-existing `catch (error)` →
`error.message` TS18046 errors in analytics-students/-leaderboards/-attendance/-status; they are identical at HEAD~.

## Migration 096 — notes

- I applied it to a **throwaway local Postgres 16** (`/tmp`, not prod) on a mock `students` table with audit and
  updated_at triggers. Confirmed: backfill in (created_at, id) order, audit/updated_at untouched by the backfill,
  re-apply is idempotent, an anon insert with `student_code:'CE-99999'` got the sequence value, immutability
  raises, the formatter gives `CE-100000` / `CE-1234567`, both RPCs return the column, and a re-apply after a
  delete does not reuse codes.
- The backfill temporarily `DISABLE`s `audit_students_changes` / `update_students_updated_at` (if present) so
  it does not write N audit rows or bump every `updated_at`. This needs the applying role to own `students`
  (the Management API runs as `postgres`, which is fine).
- RPCs recreated with `student_code`: `find_students_by_phone_digits` (service_role only, as in 091) and
  `get_puzzle_rush_leaderboard` (anon/authenticated/service_role, as in 093). `get_student_puzzle_rush_best`
  returns no student identity, so it was not touched. Other student-returning SQL functions (067 rating
  leaderboard, 034 level ranking, …) are not reached through any API-key path, so they were left alone.
- Known duplicate students were **not** merged; each duplicate gets its own code.

## Behaviour notes / deviations

- `action=list` orders by `student_code` as text. That equals numeric order up to CE-99999; past 100 000
  students, `CE-100000` would sort before `CE-99999`.
- analytics-attendance `rates`/`alerts` and analytics-leaderboards `bot_battles` returned
  `student_id: parseInt(uuid)` (garbage). These now return the real UUID, which was needed to join the code.
  This is a bug fix to an existing field.
- tournaments-api's public `/tournaments/:id/registrations` roster still exposes **no** student identity
  (display names only). I did not add the code there on purpose.
- Frontend search matches the code only when the query contains a digit, so typing "Ce…" doesn't match every
  student. `CE-00452`, `ce-00452`, `00452` and `452` all match.
- Add-student guard: `admin-v2.js` `submitAddStudent` (the real path; admin-v2 overrides crud-handlers'
  `addNewStudent`). It uses an in-flight flag plus a disabled submit button, both released in `finally`.
  Validation failures never lock the form.

## ⚠ Interaction with the pending anon-private-columns task (migration 095)

096 ends with `GRANT SELECT (student_code) ON students TO anon, authenticated`. 095 (not in the repo yet) does
`REVOKE SELECT ON students FROM anon` and then grants an explicit column list. **If 095 is applied after 096, that
REVOKE removes the student_code grant.** Whoever finishes 095 must add `student_code` to `STUDENT_PUBLIC_COLUMNS`
and to its GRANT list. Otherwise the public profile / home search lose the code, and any anon select naming it
fails with 42501.

## Deploy order (main session)

1. **Apply `096_student_code.sql`** (Management API `/database/query`), then run `096_student_code_verify.sql`:
   expect 0 NULL codes, 0 duplicates, min `CE-00001`, max = student count, all 4 triggers `O`.
2. **Deploy edge functions:** `students-api`, `analytics-students`, `analytics-leaderboards`,
   `analytics-attendance`, `analytics-status`, `analytics-tournaments`, `tournaments-api`. All import
   `../students-api/students-logic.mjs`, so deploy `students-api` alongside them.
3. **Push the frontend.** It must go **after** step 1: `getStudents()` and the leaderboard/attendance selects
   name `student_code` explicitly and would 400 before the column exists.
