# students-api — shared family phones, E.164 phones, phone-optional create

Spec: `/root/clawd/files/5731393254/specs/2026-10-14-students-api-shared-intl-phones.md`
Nothing deployed, no migration applied, no live API call, nothing pushed.

## Commits
- `dc99b41` feat(db): migration `097_students_phone_e164_lookup.sql`
- `5868dbf` feat(students-api): E.164 normalization, Buyer-ID-first create, shared phones, deno.json import maps, tests
- docs(api): README-API.md + this report (`docs/AI_AGENT_API_MANUAL.md` was also updated, but `docs/` is untracked in git, so it is not in the commit)

## Files
- `supabase/migrations/097_students_phone_e164_lookup.sql`: new RPC `find_students_by_phone_e164(TEXT)` and a non-unique expression index. `find_students_by_phone_digits` is left unchanged, and no data is rewritten.
- `supabase/functions/students-api/students-logic.mjs`:
  - `normalizePhone` now returns E.164 using libphonenumber-js/max.
  - New functions: `normalizeName`, `validateCreate`, `createStudent`.
  - `phoneDigits` is removed.
- `supabase/functions/students-api/index.ts`: thin create handler and adapter, a shared `findByPhone` helper using the new RPC for all three call sites, and updated OpenAPI docs and examples.
- `supabase/functions/{students-api,tournaments-api,analytics-leaderboards,analytics-students,analytics-attendance,analytics-status,analytics-tournaments}/deno.json`: import map `libphonenumber-js/max → npm:libphonenumber-js@1.13.15/max`.
- `package.json` / `package-lock.json`: devDependency `libphonenumber-js` pinned to exactly 1.13.15. The new test is registered in `npm test`.
- Tests:
  - New: `tests/test-students-api-phones.mjs` (114 checks).
  - Updated: `test-students-api-logic.mjs`, `test-students-api.js` (static checks for migration 097 added), `test-student-code-api.mjs` (the insert row moved into the logic module).

## Behaviour notes
- **create, Buyer ID already owned:** returns that student. As before, a frozen owner is reactivated (3-day guard still applies). A student matched only by phone is never touched.
- **create, phone + name:**
  - one match → that student; the Buyer ID is linked if the student has none (`linked:true`).
  - match already has a different Buyer ID → 409 `amocrm_customer_id_conflict`.
  - several matches → 409 `ambiguous` with `candidates`.
  - no match → 201 new student.
  - Every create response includes `matched_by`. Nothing is written on any 4xx.
- **Phone on create:** optional only when `amocrm_customer_id` is given. Missing, null or blank is stored as `null`. A phone that is present but invalid returns 400 `field:"phone"` with a `message`.
- **`amocrm_customer_id` on create** is now parsed with `parseAmocrmId`, so 0, negatives and floats → 400. Previously any integer was accepted.
- **find by phone** already returned every match; it now uses the exact lookup.

## Deploy order (when approved)
1. Apply migration 097 (Management API `/database/query`). It is idempotent.
2. Deploy all 7 functions that import `students-logic.mjs` (students-api, tournaments-api, analytics-leaderboards, analytics-students, analytics-attendance, analytics-status, analytics-tournaments). Each needs its `deno.json`, otherwise the bare import fails at boot. Supabase CLI 2.x picks up a per-function `deno.json` automatically.
3. Smoke-test with disposable records (acceptance 12): two Buyer IDs sharing one phone, a replay, `find?phone=`, and reading each write back by UUID and `amocrm_customer_id`. Then clean up through the approved process.

The new code calls `find_students_by_phone_e164`, so the migration must be applied before the functions are deployed.

## Verification
- `npm test`: exit 0, all 5014 checks pass. There were no failures before the change either (`test-students-api-phones.mjs`: 114, `test-students-api.js`: 120, `test-students-api-logic.mjs`: 144, `test-student-code-api.mjs`: 81).
- `deno check`:
  - Passes for students-api, tournaments-api and analytics-tournaments.
  - Fails for students-api when its `deno.json` is removed, which shows the import map is what resolves the dependency.
  - analytics-leaderboards, analytics-students, analytics-attendance and analytics-status: `deno cache` passes. Their `deno check` reports only a TS18046 error (`error` is of type unknown) that already exists at HEAD and is unrelated to this change.
- `deno lint`: students-api has the same 6 findings as at HEAD; this change adds none.
- Migration 097 was run on a throwaway PG16:
  - It applies twice without error.
  - `+77001234567` matches `+7…`, `8…` and 10-digit stored values.
  - `+447911123456` does not match `+77911123456`.
  - `anon` has no execute permission.
  - The planner uses an index scan.
