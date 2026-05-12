# PRD — Tournament Tracking & Per-Tournament CSV Upload

**Status:** Draft v1
**Author:** clawdbot (with Alex)
**Date:** 2026-05-12
**Project:** Chess Empire Database (`/root/clawd/chess-empire-database/`)

---

## 1. Problem

Today the app ingests one merged weekly CSV that only carries new ratings per student. The merge step happens by hand and drops everything else the tournament produced — place, score, performance rating, which event the student played in, even how many tournaments they played that week.

We want the student card to answer:

- Which league is the student playing in? (A / B / C — determined by current rating)
- When did they play their last tournaments?
- How actively are they participating? (every week / monthly / rarely)
- Where did they place?
- How are they trending?

To do that, tournaments must become first-class data, and the CSV upload format must capture the full Swiss-Manager export, not a hand-merged summary.

## 2. Goals / Non-Goals

**Goals**
- Make every tournament a first-class entity in the DB with full participant data.
- Replace the merged weekly CSV with **per-tournament CSV uploads** (one file per Swiss-Manager export), supporting multi-file drop for one-click weekly ingest.
- Surface league + tournament participation widgets on student card (active students only).
- Permission-gated: only users with `can_manage_tournaments` can upload / edit / delete.

**Non-Goals**
- Live tournament running (pairings, clocks). Swiss-Manager handles that.
- Federation/national rating sync — purely internal Chess Empire rating.
- Mobile-native app. Web UI parity is enough.
- Backfilling pre-existing rating history into tournaments — only forward from rollout, plus optional historical re-import if files exist.

## 3. Source of Truth — the CSV

Each tournament produces one Swiss-Manager export. From the sample (`Debut`, Лига B, 2026-05-03) the file contains:

**Header rows (before the table):**
- `Организатор(ы) : Chess Empire`
- `Турнирный директор : <name>`
- `Рейтинг-Ø : 579` (average rating)
- `Дата : 03.05.2026` (DD.MM.YYYY)
- Title line: `Chess Empire | Лига B | Debut` → gives league + tournament name

**Participant table columns we use:**
| Column (Ru) | Meaning | Use |
|---|---|---|
| Ном. | Final place (row order) | `place` |
| Имя | Player name | fuzzy-match to `students` |
| Рейт. | Starting rating | `rating_before` |
| Рейт+/- | Rating delta | `rating_delta` (→ `rating_after = before + delta`) |

All other columns (Фед, Оцен. Очки, оцен. партии, НРейт.-Ø) are ignored. The importer parses the header for tournament metadata and the table for participants — no manual entry, no merge step.

## 4. Data Model Changes

### 4.1 New table — `tournaments`

```sql
CREATE TABLE tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,              -- "Debut"
  league          TEXT NOT NULL CHECK (league IN ('A','B','C')),
  tournament_date DATE NOT NULL,
  director_name   TEXT,                       -- "Karayev Assylkhan"
  organizer       TEXT,                       -- "Chess Empire"
  avg_rating      INTEGER,                    -- 579
  rounds          INTEGER,                    -- max(games_played) inferred
  source_file     TEXT,                       -- original filename for audit
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id),
  UNIQUE (name, tournament_date, league)      -- dedupe same file re-upload
);

CREATE INDEX idx_tournaments_date ON tournaments(tournament_date DESC);
CREATE INDEX idx_tournaments_league ON tournaments(league);
```

### 4.2 New table — `tournament_participants`

```sql
CREATE TABLE tournament_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  place           INTEGER NOT NULL,
  rating_before   INTEGER,
  rating_after    INTEGER,
  rating_delta    INTEGER,
  raw_name        TEXT,                        -- name as it appeared in CSV
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tournament_id, student_id)
);

CREATE INDEX idx_tp_student_date ON tournament_participants(student_id, tournament_id);
CREATE INDEX idx_tp_tournament ON tournament_participants(tournament_id);
```

### 4.3 Extend `student_ratings`

```sql
ALTER TABLE student_ratings
  ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;

CREATE INDEX idx_student_ratings_tournament ON student_ratings(tournament_id);
```

Every tournament participant row writes a paired `student_ratings(rating = rating_after, source='tournament', tournament_id=…)` row — so the existing rating history view keeps working, and we can join to events when needed.

### 4.4 League view — no change

`student_current_ratings` already computes `>800 = A, >450 = B, else C`. That matches Alex's spec. Keep as-is.

### 4.5 Permissions

Add to `user_roles`:

```sql
ALTER TABLE user_roles ADD COLUMN can_manage_tournaments BOOLEAN DEFAULT FALSE;
UPDATE user_roles SET can_manage_tournaments = TRUE WHERE role = 'admin';
```

Reuse the existing `can_*` pattern. UI hides the Tournaments admin section if false.

### 4.6 RLS

- `tournaments`, `tournament_participants` — SELECT open to authenticated; INSERT/UPDATE/DELETE require `can_manage_tournaments`.
- Mirror the existing permission-check pattern from `student_ratings` RLS.

## 5. CSV Upload — UX

### 5.1 Format detection
Swiss-Manager exports come as `.txt`/`.csv` with a structured header. Detector reads first ~30 lines for `Дата :` and `Лига [ABC]` markers. If absent, importer falls back to "manual metadata" preview where admin types name/date/league.

### 5.2 Flow

1. Admin opens **Admin → Tournaments → Upload** (gated by `can_manage_tournaments`).
2. **Multi-file drop zone.** Admin drags one or several Swiss-Manager files at once.
3. Per file, importer parses header + table → builds a preview card:
   - Tournament: `Debut`
   - League B, 2026-05-03, 28 players
   - Match summary: `26 matched, 2 ambiguous, 0 unmatched`
4. **Ambiguity resolution** — re-use existing fuzzy-match UI from the current rating importer (`csvAmbiguousCount` flow in `admin-v2.js:3087+`). Admin picks the right student per ambiguous name.
5. **Confirm import.** Atomic per tournament:
   - Upsert into `tournaments` on `(name, date, league)`.
   - Insert participants (skip on duplicate `(tournament_id, student_id)` — re-upload is idempotent).
   - Insert `student_ratings` rows with `tournament_id`.
6. Success toast lists what was imported. Errors don't block other files in the batch.

### 5.3 Parser rules

| Input | Rule |
|---|---|
| `5½`, `4½` | Replace `½` → `.5`, parse as numeric |
| `03.05.2026` (DD.MM.YYYY) | Parse explicitly — never let JS coerce |
| `Рейт+/-` empty or `0` | Treat as 0 |
| Player name with diacritics / Cyrillic | Normalize Unicode before fuzzy match |
| Place ties | Trust Swiss-Manager row order — first listed = better place |
| Re-upload same file | Idempotent — skip duplicate participants, no double rating row |

### 5.4 Validation errors that block import

- Header missing date → admin must enter manually
- Header missing league → admin must pick from dropdown
- >50% of names unmatched → block file, surface roster mismatch
- Place column not monotonically increasing → warn (might be sorted wrong), allow override

## 6. Student Card — New Widgets

Render only for `students.status = 'active'`. Hide section entirely for `frozen` / `left`.

### 6.1 League badge
Pill rendered next to student name. Color coded: A=gold, B=silver, C=bronze. Uses `student_current_ratings.league` view.

### 6.2 Recent tournaments (last 5)
Mini-table:
| Date | Tournament | League | Place | Δ |
|---|---|---|---|---|
| 03.05 | Debut | B | 7 | +108 |

### 6.3 Participation cadence
Single-line widget driven by `last_tournament_date`:
- **Active** — ≥1 tournament in the last **4 weeks**
- **Occasional** — 1 in the last **5–8 weeks**
- **Inactive** — none in the last **8 weeks**

Show with timestamp: "Active — last played 2026-05-03 (Debut, place 7)".

### 6.4 Aggregate stats
- Tournaments played (total, year-to-date)
- Best place
- Avg place
- Total rating gained (sum of `rating_delta`)

### 6.5 Performance sparkline
Inline mini-chart of rating across last 10 tournaments. Chart.js (already loaded in `branch.html` — reuse).

### 6.6 League progression note
If the student crossed a league threshold in the last 90 days, show: "Promoted C → B on 2026-03-14". Detected by scanning rating history for league boundary crossings.

## 7. Optional / Stretch Stats

Stuff worth adding if cheap:

- **Branch leaderboard within league** — "3rd in League B at Astana branch this month"
- **Streak** — N tournaments in consecutive weeks (motivates consistency)
- **Season summary card** — last 90 days roll-up
- **Coach-facing comparison view** — coach can see all their students' cadence at a glance

## 8. Edge Function — `analytics-tournaments`

Match existing `analytics-*` pattern. Endpoints:
- `GET /tournaments` — list (paginated, filter by league/date/branch)
- `GET /tournaments/:id` — detail + participants
- `GET /students/:id/tournaments` — student's tournament history with aggregates
- `GET /leaderboards/league/:league` — current standings within a league
- Auth: `x-api-key` header per existing pattern.

(Most queries can be done directly via supabase-js with proper RLS; the edge function exists for aggregate queries that are awkward in client SQL and for caching.)

## 9. Files Touched

| File | Change |
|---|---|
| `supabase/migrations/035_tournaments.sql` | New tables, view, RLS, permission |
| `supabase-data.js` | Tournament CRUD, participation queries, CSV parser |
| `admin-v2.html` | New Tournaments section, upload modal |
| `admin-v2.js` | Section router, upload flow, ambiguity UI reuse |
| `student.html` + `student-stats.html` | New widgets (badge, table, cadence, sparkline) |
| `coach.html` / `coach.js` | Cadence at-a-glance for their students |
| `branch.html` | (Optional) league filter for branch leaderboard |
| `supabase/functions/analytics-tournaments/index.ts` | New edge function |
| `i18n.js` | Strings: en/ru/kk for all new UI |
| `vercel.json` | No change |

## 10. Rollout

1. **Phase 1 — DB.** Migration + RLS + permission flag. No UI change. Verify with manual insert.
2. **Phase 2 — Importer.** Admin Tournaments page + multi-file upload + parser + ambiguity reuse. Test with last week's Swiss-Manager exports.
3. **Phase 3 — Student card widgets.** League badge → recent table → cadence → aggregates → sparkline (in that order, each shippable on its own).
4. **Phase 4 — Edge function + coach view.**
5. **Phase 5 — Polish.** Stretch stats, league progression notes, branch leaderboards.

Each phase has its own Ralph task. Phase 1 needs Alex's approval before running on prod Supabase.

## 11. Open Questions (Resolved)

| # | Q | A |
|---|---|---|
| 1 | League thresholds | `<450 C`, `450-800 B`, `>800 A` — matches existing view |
| 2 | Multiple tournaments same day | Allowed — separate rows by `(name, date, league)` |
| 3 | Tiebreaks | Just final place, no tiebreak columns |
| 4 | Cadence window | Active = 4w, Occasional = 5-8w, Inactive = >8w |
| 5 | Backfill | Forward from rollout; this week's exports are first test data |
| 6 | Who manages | Anyone with `can_manage_tournaments` permission |
| 7 | Status filter | Only render widgets for `students.status='active'` |
| 8 | Manual rating rows | Still allowed (no `tournament_id`, source stays `manual`/`csv_import`) |
| 9 | CSV format | Per-tournament Swiss-Manager export, multi-file upload |

## 12. Risks

- **Name fuzzy matching** is the biggest fragility — if the roster's transliteration differs from Swiss-Manager's, every import has ambiguities. Mitigation: persist resolved name→student mappings to `tournament_participants.raw_name` so future re-imports of the same name auto-resolve.
- **Schema drift** — admin-v2.js is already a 10K-line monolith. Tournaments adds ~1K more. Mitigation: isolate tournament code into its own module file imported by admin-v2.js (small step toward module split).
- **Re-upload of same file** — must be idempotent. Mitigation: UNIQUE constraint on `(name, date, league)` + insert-or-skip on participants.
- **Performance** — student card with sparkline does 2 queries per render. Mitigation: a single materialized view `student_tournament_summary` aggregating per-student counts/best/avg, refreshed nightly.

---

**Next step:** Alex reviews. Once approved, dispatch Phase 1 (migration) via Ralph.
