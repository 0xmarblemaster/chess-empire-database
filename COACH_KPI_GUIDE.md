# Coach Performance KPI — Admin Guide

This guide explains every metric on the **Coach Performance** dashboard
(`#section-coach-kpi`), what it measures, where the number comes from, and how
to read it. Source PRD: `PRD_COACH_KPI.md`.

The dashboard has three drill-down views — **School → Branch → Coach** — plus a
shared filter bar (time window / league / branch). All numbers are computed by
the `analytics-tournaments` edge function from the `tournament_participants`,
`student_league_events`, and `razryad_history` tables.

---

## 1. Filters (apply to every view)

| Control | Choices | What it does |
|---|---|---|
| **Time window** | `30d`, `90d`, `YTD`, `All time` | Anchors `window_start` / `window_end`. Default is **90 days**. Tournaments, promotions, and razryad earnings outside the window are excluded. `All time` resolves to `2000-01-01 → today`. |
| **League** | `All`, `A`, `B`, `C` | Filters tournament-participation metrics to one league. League is derived from rating at the time of the event (`calc_league_from_rating`: A > 800, B ≥ 450, C < 450). |
| **Branch** | `All branches` or one school | Scopes coach roll-ups to one branch. A coach who works at multiple branches still shows their full roster when `branch_id` is omitted; the picker narrows it down. |

> An empty card or a row of em-dashes (`—`) means **no data in the selected
> window/league/branch combination** — not zero. If you see this everywhere,
> the migrations 036/037/038 may not be applied yet (see §6).

---

## 2. School view — hero cards

Six top-of-page cards rendered by `renderSchoolHero`. Source:
`school_kpi_summary` action.

| Card | Field | Definition |
|---|---|---|
| **Active students** | `active_students_count` | Count of students with `status = 'active'` (school-wide). Not windowed — it's a snapshot. |
| **Tournaments** | `total_tournaments` | Distinct tournaments in the window where ≥1 active student played. |
| **Top-3 finishes** | `top3_count` | Sum of tournament_participants rows with `place ≤ 3`. |
| **Promotions** | `promotions_count` | Count of `student_league_events` rows with `event_type = 'promotion'` in the window. Forward-only — historical promotions are not backfilled (PRD §9). |
| **New razryads** | `new_razryads_count` | Count of `razryad_history` rows in the window whose `new_razryad ≠ 'none'` (and non-null). |
| **Participation** | `participation_pct` | `(students who played ≥1 tournament in window) / active_students_count × 100`, rounded to 1 dp. Empty cohort → 0%. |

### School view — charts

- **Tournaments by league (stacked bar, one column per branch)** —
  `renderTournamentsByLeagueStackedBar`. Each branch's tournament count split
  into A/B/C using the league recorded on the `tournaments` row.
- **Razryad distribution (doughnut)** — `renderRazryadDoughnut`. Counts of
  active students by current `students.razryad` value. DB stores razryad
  lowercase (`kms`, `none`, `1st`, `2nd`, `3rd`, `4th`); the doughnut buckets
  lowercase and uppercase variants together so a `kms` student is never
  silently dropped.

---

## 3. Branch view — coach leaderboard

Source: `coach_leaderboard` action, scoped by `branch_id`. Rendered by
`renderLeaderboard`. Default sort: composite score, descending. Stable
ties preserve insertion order; null/undefined sort last regardless of
direction. Click a column header to re-sort. Sort key falls back to
`composite_score` desc if the column name is unknown.

| Column | Field | Definition |
|---|---|---|
| **Coach** | `coach_name` | `first_name last_name`. Sort: alphabetical asc by default. |
| **Active** | `active_students_count` | Distinct active students assigned to this coach via `students.coach_id`. |
| **Tournaments** | `total_tournaments` | Distinct tournaments any of this coach's students played in the window. |
| **Top-3** | `top3_count` | Number of `place ≤ 3` finishes by this coach's students. |
| **Rating gained** | `total_rating_gained` | Sum of `rating_delta` across every result by this coach's students in the window. Signed — negative values render with a leading `-`. |
| **Promotions** | `promotions_count` | League-up events for this coach's students in the window. |
| **Razryads** | `new_razryads_count` | New-razryad earnings (excluding transitions to `none`) for this coach's students. |
| **Score** | `composite_score` | See §5. Coloured red / amber / green. |

> A coach with **0 tournaments in the window** still appears in the
> leaderboard. They'll show `0` across the activity columns and a composite
> score of **12.5** (neutral rating delta, all other inputs zero) — colour-
> coded red. This is intentional: invisible coaches read as a bug.

> A branch with **0 coaches assigned via `coach_branches`** returns an empty
> leaderboard (the empty-state card renders instead).

---

## 4. Coach view — single-coach detail

Source: `coach_kpi_summary` action, scoped by `coach_id`.

### Hero cards

Same six numbers as the school view, narrowed to one coach: `active_students_count`,
`total_tournaments`, `top3_count`, `promotions_count`, `new_razryads_count`, and
`composite_score` (replaces school's `participation_pct` for the per-coach
context).

Extra fields available from `hero`: `active_players_count`, `total_results`,
`avg_place` (mean place across finite places, `null` if no results),
`top1_count`, `total_rating_gained`.

### Per-student table

`data.students` — one row per active student assigned to the coach. Fields:

- `student_name`, `razryad` (current snapshot from `students.razryad`)
- `tournaments_played`, `top1_count`, `top3_count`
- `rating_gained` (sum of `rating_delta` for this student in window)
- `promotions`, `new_razryads`

Sorted by `rating_gained` desc.

### Charts

- **Razryad mix doughnut** — `renderRazryadDoughnut(aggregateRazryadFromStudents(students))`.
- **Tournaments by league (plain bar)** — `renderTournamentsByLeagueBar`, one bar per A/B/C.
- **Avg place trend (line, 6 months)** — `renderAvgPlaceTrendLine`. Y-axis is
  **reversed** so improvement (lower place number = better) reads as upward
  movement. Missing months render as gaps.

### Insights

- **Top performer** (`coachKpiTopPerformer`) — student with the highest
  `rating_gained` in window.
- **Biggest climber** (`coachKpiBiggestClimber`) — single max-delta tournament
  result (handled in renderer).
- **Inactive student** (`coachKpiInactiveStudent`) — any student where the
  most recent tournament date is **>90 days** older than today, or whose
  last-tournament date is unknown. Rule lives in `isStudentInactive`
  (`INACTIVE_THRESHOLD_DAYS = 90`); missing/invalid dates → inactive (we
  cannot prove activity).

---

## 5. Composite score (`composite_score`)

A single 0–100 rollup of the five sub-metrics. Computed by `calcCompositeScore`
in `supabase/functions/analytics-tournaments/index.ts`. Each sub-metric is
first normalized to 0–100, then blended:

```
score = 0.30 × participation
      + 0.25 × normalized_avg_rating_delta
      + 0.20 × top3_finish_rate
      + 0.15 × promotion_rate
      + 0.10 × razryad_earned_rate
```

### Sub-metric normalisation

| Sub-metric | Raw input | 0–100 formula |
|---|---|---|
| Participation | `participants_count / active_students_count` | Clamped × 100. Empty cohort → 0. |
| Rating delta | `avg(rating_delta)` over all results | `clamp(50 + avgDelta, 0, 100)` — 0 delta anchors to 50, +50 → 100, −50 → 0. |
| Top-3 rate | `top3_count / total_results` | × 100, clamped. No results → 0. |
| Promotion rate | `promotions_count / active_students_count` | × 200 (50% promoted → 100). Empty cohort → 0. |
| Razryad rate | `new_razryads_count / active_students_count` | × 400 (25% earning a new razryad → 100). Empty cohort → 0. |

### Empty-cohort baseline

A coach with no students or no activity gets:

- participation 0 × 0.30 = 0
- rating-delta **50** × 0.25 = 12.5   ← only non-zero piece
- top-3 0 × 0.20 = 0
- promotion 0 × 0.15 = 0
- razryad 0 × 0.10 = 0
- **Total: 12.5** → red

That's the "12.5 neutral" baseline you'll see for any inactive coach. It
ensures inactive coaches don't appear identical to coaches with negative
deltas (who score below 12.5).

### Colour bands

`scoreColor` (`coach-kpi.js`):

| Score | Colour | Meaning |
|---|---|---|
| `< 40` | **red** | Below target — conversation time. |
| `40–70` (inclusive) | **amber** | Meeting baseline. |
| `> 70` | **green** | Strong performance. |

Display: `formatScore` rounds to an integer 0–100 (`>100` clamps to 100,
negative clamps to 0). Missing / non-numeric scores render as `—`.

> **Open question for Alex (carried from PRD §10 Q2 → Phase 3 exit
> criteria):** confirm the 30/25/20/15/10 weights and the
> normalisation anchors above are correct before final lock-in.
> Phase 3 explicitly does NOT re-tune these weights without Alex's sign-off.

---

## 6. Role lock — who sees what

Implemented in `coach-kpi-role-lock.js`. Matches PRD §6:

| Role | Nav menu | School view | Branch view | Coach view |
|---|---|---|---|---|
| **Admin** | ✅ visible | ✅ all | ✅ all branches | ✅ all coaches |
| **Coach** (non-admin, has `coachId`) | ✅ visible | ❌ hidden | ✅ own branches only | ✅ self only |
| Anyone else (anon, unknown role) | ❌ hidden | ❌ | ❌ | ❌ |

Deep-link safety: a locked coach who pastes a URL with someone else's
`coachId` or an out-of-scope `branchName` gets the request **refused at
`kpiQueryScope`** — the edge function never receives an out-of-scope call.

Default landing view: admin → school, locked coach → coach (self).

---

## 7. Empty-state cards

A card or chart renders the empty-state stub (`renderEmptyState`) when:

- The edge function returns `success: false`, `null`, or `data: []` / `data: {}`.
- A chart's input counts are all zero (e.g. razryad doughnut with no students).
- The browser hasn't loaded Chart.js yet.

The default message is:

> *"Coach KPI data not yet available — apply migrations 036/037/038 on Supabase to enable."*

If you're seeing this on a known-working environment, check:

1. Migrations 036 (razryad history), 037 (tournament types), 038
   (student league events) are applied — `tests/test-coach-kpi-migrations.js`
   validates the SQL is well-formed but a live `psql` check is the source of truth.
2. The `analytics-tournaments` edge function is deployed with the latest
   `coach_leaderboard` / `coach_kpi_summary` / `school_kpi_summary` actions.
3. The `x-api-key` header in `supabase-config.js` matches the function's
   `API_KEY` constant.

---

## 8. Data gotchas

- **Razryad history is forward-only** (PRD §9). Backfill is not possible —
  only razryad changes that occurred after migration 036 shipped are counted.
- **League promotions are forward-only** for the same reason (migration 038).
  Pre-migration promotions show up as "current league" but not as
  `promotions_count`.
- **Tournament types** (`regular` / `qualification` / `team` / `other`,
  migration 037) default to `regular`. Qualification-tournament KPIs assume
  an admin tagged the tournament — the dashboard does not infer type.
- **Rating delta of 0** counts as a participation event but does not change
  `total_rating_gained`. A coach with all 0-delta results still has a non-zero
  composite via the 50-anchor.
- **Razryad storage casing** — the DB CHECK constraint stores razryad
  lowercase (`'kms' / 'none' / '1st' / ...`). The doughnut aggregator
  normalises to lowercase before bucketing, so the legacy uppercase `'KMS'`
  and the live lowercase `'kms'` both land in the KMS slot.

---

## 9. Where the metrics live (quick map)

| Concept | Code |
|---|---|
| Composite score formula | `calcCompositeScore`, `COACH_SCORE_WEIGHTS` — `supabase/functions/analytics-tournaments/index.ts` |
| Sub-metric normalisation | `normalizeParticipation`, `normalizeRatingDelta`, `normalizeTop3`, `normalizePromotion`, `normalizeRazryad` (same file) |
| Time window resolver | `resolveTimeWindow` — `coach-kpi.js` |
| Score colour bucket | `scoreColor` / `computeScoreBadgeColor` — `coach-kpi.js` |
| Inactive-student rule | `isStudentInactive` (90-day) — `coach-kpi.js` |
| Leaderboard sort / filter | `sortLeaderboard`, `filterLeaderboardByBranch` — `coach-kpi.js` |
| Razryad bucketing | `aggregateRazryadFromStudents` — `coach-kpi.js` |
| School-hero rollup | `aggregateSchoolHero` (fallback) — `coach-kpi.js` |
| Role lock | `canViewCoachKpi`, `canAccessView`, `kpiQueryScope` — `coach-kpi-role-lock.js` |
