# PRD — Coach Performance KPI Dashboard

**Status:** Draft v1.1 (Phase 1 shipped)
**Author:** clawdbot (with Alex)
**Date:** 2026-05-14
**Project:** Chess Empire Database (`/root/clawd/chess-empire-database/`)

---

## 1. Problem

Admins have no way to monitor coach performance against a consistent set of KPIs. Today, tournament results, ratings, razryad changes, and league movement all live in the DB but are not rolled up to the coach level. We need a UI surface (and the data layer to power it) that exposes:

- How many of each coach's students are participating in tournaments, and at what level (League A / B / C / qualifications)
- How well each coach's students perform (top-3 finishes, razryads earned, league promotions, avg rating delta)
- A school-wide and per-branch comparison view so admins can rank coaches and trigger conversations

This dashboard will directly inform coach KPI evaluation and compensation, so accuracy and transparency are non-negotiable.

## 2. Goals / Non-Goals

**Goals**
- First-class roll-up of tournament + rating + razryad + league-progression data at the **coach**, **branch**, and **school** level
- Three drill-down views: School → Branch → Coach
- Composite coach score (tunable weights) plus the raw sub-metric columns
- Role-scoped: admins see all; coaches see their own branches/self only
- Mobile parity (stacked cards, sortable lists)

**Non-Goals**
- Predicting "which student is close to qualifying for next razryad" (out of scope until qualification rules are formalized)
- Per-student bonus calculation — dashboard surfaces inputs; bonus logic lives elsewhere
- Real-time push updates — read-on-demand with optional nightly materialized view

## 3. Required KPIs

Grouped into four buckets. All are computed per coach / per branch / school-wide for a selectable time window.

**A. Participation**
- Active students (≥1 tournament in window)
- Participation rate (% of active students who competed)
- Avg tournaments per student per month
- League mix (% of students who played League A / B / C)
- Qualification-tournament participation
- Inactive list (no tournament 90+ days)

**B. Performance**
- Avg place across all tournaments (overall + per-league)
- # top-1 / top-3 / top-10 finishes
- % of tournaments with positive rating delta
- Total & avg rating gained
- Best climber (single student, max delta)

**C. Progression**
- Students promoted (B→A, C→B in window)
- Students demoted
- New razryads earned in window
- Current razryad distribution (snapshot)
- League stability (% who stayed or moved up)

**D. Activity & retention**
- Headcount change (joined / left)
- Avg session attendance for coach's students (cross-join with `attendance` table)
- Attendance vs tournament participation correlation

## 4. Composite Coach Score

Single 0–100 number for at-a-glance ranking. Weights are exposed as constants (tunable without code surgery):

```
score = 0.30 × participation_rate
      + 0.25 × normalized_avg_rating_delta
      + 0.20 × top3_finish_rate
      + 0.15 × promotion_rate
      + 0.10 × razryad_earned_rate
```

Color-coded badge: red <40, amber 40–70, green >70.

## 5. UI Design

New top-level nav item **"Coach Performance"** between Tournaments and Coach Activity.

**View 1 — School overview** (admin only)
- 6 hero stat cards (total active students, tournaments YTD, top-3 finishes, promotions, new razryads, school participation %)
- Coach leaderboard table (sortable columns: branches, active students, tournaments, avg place, top-3, rating gained, promotions, razryads, score)
- Two charts: tournaments by league (stacked bar per branch), razryad distribution (doughnut)
- Filters: time window (30d / 90d / YTD / all-time), league (A/B/C/all), branch

**View 2 — Branch detail**
- Hero cards scoped to branch
- Coaches-at-this-branch leaderboard with drill-down

**View 3 — Coach detail**
- Hero cards for single coach
- Students table (per-student: tournaments, best place, rating delta, current razryad, last tournament date, active/inactive)
- Charts: avg place trend (line, 6 months), razryad mix (doughnut), tournaments by league (bar)
- Insights panel: top performer, biggest climber, inactive list

**Mobile:** stat cards stack 1-col, leaderboard table → vertical cards (existing `renderMobileStudentCards` pattern).

## 6. Role Lock

| Role | School view | Branch view | Coach view |
|---|---|---|---|
| Admin | ✅ all | ✅ all | ✅ all |
| Coach | ❌ hidden | ✅ own branches | ✅ self only |

Implemented in new `coach-kpi-role-lock.js`, mirroring `attendance-role-lock.js`. Wired into `updateMenuVisibility()`.

## 7. Implementation Phases

Each phase has an explicit **Exit Criteria** block. **A phase is not done until every unit test in its test file passes locally AND the test count is reported in the commit message and the user-facing completion summary.** No phase may begin until the previous phase's tests are green.

---

### Phase 1 — Data layer ✅ shipped (commit `197d869`)

**Deliverables**
- `migrations/036_razryad_history.sql` — table + trigger on `students.razryad` change + RLS
- `migrations/037_tournament_type.sql` — enum (`regular`/`qualification`/`team`/`other`) + column on `tournaments`
- `migrations/038_student_league_events.sql` — `calc_league_from_rating()` helper + `student_league_events` table + trigger on `student_ratings` insert
- Extend `supabase/functions/analytics-tournaments/index.ts` with `coach_leaderboard`, `coach_kpi_summary`, `school_kpi_summary` actions + composite score
- `tests/test-coach-kpi-migrations.js`
- `tests/test-coach-kpi-edge-function.js`

**Exit criteria (MANDATORY — phase is NOT done until ALL pass)**
- [x] `node tests/test-coach-kpi-migrations.js` → **58/58 passed**
- [x] `node tests/test-coach-kpi-edge-function.js` → **80/80 passed**
- [x] No existing test suites broken (`bash tests/run-all.sh` if a runner exists, else run each `tests/test-*.js` file)
- [x] Commit message reports test pass counts
- [x] Migrations applied to live Supabase by Alex (manual, per safety rule)

**Status:** Implementation merged. Migrations pending live application.

---

### Phase 2 — Frontend (UI)

**Deliverables**
- `index.html` / `admin-v2.html`: add nav item + 3 section containers
- `coach-kpi.js`: fetch + render (school/branch/coach views, view switcher, filters)
- `coach-kpi-role-lock.js`: scoping helpers (mirror `attendance-role-lock.js`)
- Reuse `.stat-card`, `.table-container`, Chart.js patterns
- i18n keys for EN + RU (`t()` pattern)
- `tests/test-coach-kpi-role-lock.js` — admin sees all; coach scoped to own branches/self
- `tests/test-coach-kpi-ui-aggregations.js` — client-side aggregation helpers (sort, filter, score format)

**Exit criteria (MANDATORY — phase is NOT done until ALL pass)**
- [ ] `node tests/test-coach-kpi-role-lock.js` → all pass; count reported in commit message
- [ ] `node tests/test-coach-kpi-ui-aggregations.js` → all pass; count reported in commit message
- [ ] Phase 1 tests still pass (regression check — re-run both Phase 1 test files)
- [ ] No existing test suites broken — run full `tests/` directory
- [ ] Manual smoke test on live (Halyk Arena, Aibek's 33 students) — screenshot or curl evidence in completion summary
- [ ] HTTP 200 from `admin.chessempire.kz/admin` after Vercel auto-deploy

---

### Phase 3 — Polish, full integration, deploy verification

**Deliverables**
- Optional: materialized view `vw_coach_kpi_snapshot` + nightly cron refresh (only if perf becomes a problem at 14 coaches × 778 students)
- Edge-case fixes from Phase 2 smoke (e.g. coach with 0 tournaments, branch with 0 students)
- Production smoke tests across all 8 branches and 14 coaches
- Documentation: `COACH_KPI_GUIDE.md` for admins explaining what each metric means

**Exit criteria (MANDATORY — phase is NOT done until ALL pass)**
- [ ] All Phase 1 + Phase 2 test files re-run and pass
- [ ] New tests for any added helpers/edge cases pass
- [ ] Full `tests/` directory clean (no regressions)
- [ ] Live verification: hit each view as admin + as one coach; numbers match a hand-spot-checked SQL query for ≥2 coaches
- [ ] Composite score weights confirmed correct with Alex before final lock-in

---

## 8. Cross-Phase Test Discipline (MANDATORY)

This section codifies the test-gating rule the project now follows. **Applies to every phase, including future ones not yet listed.**

1. **No phase is "done" without test evidence.** Phase completion summary must include `<test-file>: <passed>/<total>` for every test file owned by that phase.
2. **Regression check on every phase.** Re-run all prior phases' test files before declaring a new phase complete. If any prior test fails, fix it before merging.
3. **Tests run locally, not in CI only.** Ralph (or the executing agent) runs `node tests/test-*.js` and pastes counts into the commit message.
4. **Failing tests block commit.** If a test fails, the agent fixes it before pushing. Never push with a known-red test.
5. **New helpers require new tests.** If a phase introduces a new function in role-lock / aggregation / score-calc, it ships with corresponding test coverage in the same commit.
6. **User-facing completion report.** Every "Phase N done" message to Alex includes a per-test-file pass count table — no "tests passed" hand-waves.

This is enforced by spawn-prompt convention: every `sessions_spawn` for a coach-KPI phase includes the line *"Run all tests in tests/ before claiming done. Report per-file pass counts in the commit message and final summary. Do not push with any failing test."*

## 9. Critical Data Gaps (must be filled before Phase 2)

- **Razryad history** — captured forward-only via 036's trigger. No backfill possible (only snapshot exists).
- **Tournament types** — added in 037 with default `regular`. Backfill of existing tournaments to `qualification`/`team` is a manual admin task; Phase 1 does not include a tagging UI.
- **League promotions** — recorded forward-only via 038's trigger. Historical promotions inferred client-side as today (acceptable cost; switch to SQL aggregation later if slow).
- **Razryad qualification rules** — formal requirements not yet provided. Until then, "who's close to next razryad" is out of scope; we surface current razryad and earned-in-window count only.

## 10. Open Questions

1. Razryad qualification requirements — formal rules?
2. Composite score weights — keep 30/25/20/15/10 or tune?
3. Coach permissions — see other coaches' leaderboard, or only own?
4. Default time window — 90 days OK?
5. Attendance correlation — column in leaderboard, or separate view?

---

## Changelog

- **v1.1 (2026-05-14):** Added Section 8 (Cross-Phase Test Discipline) and per-phase Exit Criteria blocks requiring unit tests pass before phase completion. Phase 1 marked shipped with test counts logged.
- **v1.0 (2026-05-14):** Initial PRD covering KPI catalog, composite score, UI design, role lock, 3-phase plan.
