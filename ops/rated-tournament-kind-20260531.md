# Rated Tournament kind — 2026-05-31

## Goal
Add a 5th tournament kind, **Rated Tournament**, to the Ratings Management
upload flow. Variable rounds (1..20), any number of participants, no razryad
award, but still mirrors into `student_ratings` like the other kinds.

## Why
Coaches/admins import Swiss-Manager exports for tournaments that don't fit
any of the 4 internal kinds (`league_c`, `league_b`, `razryad_4`, `razryad_3`)
but should still affect students' rating history.

## Changes

### Schema (migration 056)
- `ALTER TYPE tournament_kind ADD VALUE IF NOT EXISTS 'rated';`
- `tu_rounds_match_kind` CHECK now accepts `kind='rated' AND rounds BETWEEN 1 AND 20`.

The existing razryad-detection trigger (`detect_razryad_from_result`) falls
through to `v_earned := NULL` for any kind ≠ `razryad_3`/`razryad_4`, so
`rated` results don't accidentally award razryads. No trigger change.

### Parser (`frontend/tournament-parse.js`)
- `TOURNAMENT_KINDS` adds `'rated'`. `ROUNDS_BY_KIND` is left unchanged
  (intentionally no entry for `rated`).
- `parseTournamentExport` for `rated` derives `rounds = max(games_played)`
  across the participant table. In Swiss, only top finishers play every
  round, so the max equals the total rounds.
- Empty result set or all-zero `games_played` → `rounds = null` + warning.
- `validateParsedUpload` accepts `rated` with integer rounds in `[1, 20]`;
  the other 4 kinds keep their canonical-rounds enforcement unchanged.

### Frontend modal (`admin-v2.html` + `admin-v2.js`)
- New `<option value="rated">Rated Tournament</option>` in `#csvUploadKind`.
- `onCsvUploadKindChange` clears the rounds input when the kind has no
  canonical value (so the parser's auto-detected value populates it on file
  pick, or the admin types manually).
- `commitTournamentUpload` rejects rated commits without an integer rounds
  in `[1, 20]` and surfaces `admin.imports.roundsRequired`.

### Data layer (`supabase-data.js`)
- `addTournamentUpload` keeps the `ROUNDS_BY_KIND` fallback for the 4 fixed
  kinds and throws cleanly when `kind='rated'` is submitted without rounds.

### i18n (`i18n.js`)
- `admin.coachKpi.kind.rated`:
  - en: "Rated Tournament"
  - ru: "Рейтинговый турнир"
  - kk: "Рейтингтік турнир"
- `admin.imports.roundsRequired` added in all three locales.

### Tests
- `tests/test-tournament-upload-parser.js` — 3 new blocks:
  - rated TSV → `rounds = max(games_played) = 5`
  - heterogeneous 7-round file → `rounds = 7`
  - empty result set → `rounds = null` + warning
- `tests/test-tournament-upload-validation.js` — 4 new cases:
  - rated + 7 rounds → no errors
  - rated + 0 / 21 / null rounds → error

## Live DB
Applied via Supabase Management API (project `papgcizhfkngubwofjuo`):

```text
enum_range(tournament_kind) = {league_b, league_c, rated, razryad_3, razryad_4}
tu_rounds_match_kind         = CHECK (...rated AND rounds BETWEEN 1 AND 20...)
```

## Verification
- All 6 tournament test suites pass (parser, importer, admin, API, xlsx,
  analytics, razryad-filter, page, student widgets, upload-parser,
  upload-validation) — 0 regressions.
- Manual smoke after deploy: pick `Rated Tournament` in the Import modal,
  upload a Swiss-Manager export with N rounds, confirm the rounds input
  auto-fills to N, commit, verify the upload appears in history with
  `kind='rated'`.

## Out of scope
- Coach KPI / razryad leaderboards intentionally exclude `rated` (existing
  edge functions filter on explicit kind whitelists — `rated` is for ELO
  tracking, not coach metric awards).
- The Upload History tab inherits `kind::text` via the `unified_uploads`
  view and displays `rated` without further work.
