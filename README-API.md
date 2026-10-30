# Chess Empire Analytics API

Base URL: `https://papgcizhfkngubwofjuo.supabase.co/functions/v1`

## Authentication

All endpoints require one of:
- Header: `x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>`
- Header: `Authorization: Bearer <service_role_key>`

---

## Student ID (`student_code`)

Every student has a permanent, human-readable **Student ID** next to the
internal UUID `id` (migration `096_student_code.sql`):

- **Format:** `CE-` + the number zero-padded to 5 digits — `CE-00001` …
  `CE-99999`, then `CE-100000`, `CE-100001`, … (never truncated). Pattern
  `^CE-[0-9]{5,}$`. Input is trimmed and uppercased, so `ce-00452` works; the
  short form `CE-452` does **not** (no padding is guessed).
- **Assigned by the database** on insert, from a sequence. Any value a client
  sends on create is ignored.
- **Immutable:** an update that changes it is rejected by a DB trigger.
- **Never reused:** the sequence only moves forward; a deleted student's code is
  retired forever.
- **Every key's student payloads include it** (`CHESS_EMPIRE_API_KEY`,
  `CHESS_EMPIRE_READONLY_KEY`, `CHESS_EMPIRE_WRITE_KEY`): wherever a student
  object / row carries `student_id` (or `id`) and a name, it also carries
  `student_code`.
- **Alternative key:** wherever a `student_id` is accepted (query param or JSON
  body), `student_code` may be sent instead. If both are sent they must name the
  same student — otherwise `400` (`student_id_code_mismatch`). An unknown code
  → `404`; a malformed one → `400` naming the field `student_code`.

---

## 1. Analytics - Audit Log

**Endpoint:** `GET /analytics-audit`

| Param | Values | Description |
|-------|--------|-------------|
| action | `list` `entity` `recent` `stats` | Operation type |
| entity_type | string | Filter by entity type |
| entity_id | string | Filter by entity ID |
| changed_by_email | string | Filter by user |
| action_filter | string | Filter by action (create/update/delete) |
| from / to | ISO date | Date range |
| limit / offset | int | Pagination (default 100/0) |

```bash
# List recent audit entries
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-audit?action=recent&limit=10"

# Entity history
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-audit?action=entity&entity_type=students&entity_id=123"

# Audit stats
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-audit?action=stats"
```

---

## 2. Analytics - Status History

**Endpoint:** `GET /analytics-status`

| Param | Values | Description |
|-------|--------|-------------|
| action | `history` `transitions` `freezes` `stats` | Operation type |
| student_id | uuid | Filter by student |
| student_code | `CE-00452` | Alternative to `student_id` |
| old_status / new_status | string | Filter by status |
| from / to | ISO date | Date range |
| limit / offset | int | Pagination |

```bash
# Status transitions summary
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-status?action=transitions"

# Freeze periods for a student
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-status?action=freezes&student_code=CE-00452"
```

`history` rows embed `students{student_code, first_name, last_name}`.

---

## 3. Analytics - Sessions

**Endpoint:** `GET /analytics-sessions`

| Param | Values | Description |
|-------|--------|-------------|
| action | `list` `stats` `detail` | Operation type |
| user_email | string | Filter by user |
| status | string | Filter by session status |
| device_type | string | Filter by device |
| session_id | string | For detail action |
| from / to | ISO date | Date range |
| limit / offset | int | Pagination |

```bash
# Session stats
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-sessions?action=stats"

# Session detail with actions
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-sessions?action=detail&session_id=abc-123"
```

---

## 4. Analytics - Users

**Endpoint:** `GET /analytics-users`

| Param | Values | Description |
|-------|--------|-------------|
| action | `list` `summary` `stats` | Operation type |
| email | string | User email (required for summary/stats) |
| from / to | ISO date | Date range (for stats) |

```bash
# List all admin/coach users
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-users?action=list"

# User summary
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-users?action=summary&email=coach@example.com"
```

---

## 5. Analytics - Attendance

**Endpoint:** `GET /analytics-attendance`

| Param | Values | Description |
|-------|--------|-------------|
| action | `list` `rates` `summary` `alerts` `calendar` | Operation type |
| branch_id | int | Branch filter |
| schedule_type | string | Schedule filter |
| student_id | uuid | Student filter |
| student_code | `CE-00452` | Alternative to `student_id` |
| coach_id | int | Coach filter |
| year / month | int | Calendar period |
| threshold | int | Alert threshold % (default 70) |
| from / to | ISO date | Date range |
| limit / offset | int | Pagination |

```bash
# Attendance rates by branch
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-attendance?action=rates&branch_id=1"

# Low attendance alerts
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-attendance?action=alerts&branch_id=1&threshold=60"

# Calendar view
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-attendance?action=calendar&branch_id=1&year=2026&month=2"
```

`list` / `calendar` records embed `students{student_code, …}`; `rates` / `alerts`
rows carry `student_id` (UUID) + `student_code`.

---

## 6. Analytics - Leaderboards

**Endpoint:** `GET /analytics-leaderboards`

| Param | Values | Description |
|-------|--------|-------------|
| action | `ratings` `survival` `bot_battles` | Leaderboard type |
| branch_id | uuid | Filter by branch (for `survival`: implies `scope=branch`) |
| scope | `school` `branch` | `survival` only — default `school` |
| period | `week` `month` `all` | `survival` only — default `all`; windows in Asia/Almaty, week starts Monday 00:00 |
| student_id | uuid | `survival` only — append this student's row (`is_self:true`) when outside the top N |
| student_code | `CE-00452` | `survival` only — alternative to `student_id` |
| limit | int | Top N (default 20, max 500 for `survival`) |

`action=survival` is the Puzzle Rush board, served by the
`get_puzzle_rush_leaderboard` RPC (migration `093_puzzle_rush_rankings.sql`):
best score per **active** student in the window, competition ranking (ties share
a place, tie order = earliest `achieved_at`), no 1000-row cap. Each row keeps the
legacy shape `rank, student_id, score, mode, student{first_name,last_name,branch_id}`
and adds `student_code, branch_name, achieved_at, source, is_self`; the response adds
`total_count, scope, period`. The old `mode` param is ignored (all rows are
`puzzle_rush`). `ratings` and `bot_battles` rows also carry `student_code`.

```bash
# Top rated students
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=ratings&limit=10"

# Survival leaderboard
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=survival&period=week&branch_id=<uuid>"

# Bot battles leaderboard
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=bot_battles"
```

---

## 7. Analytics - Students

**Endpoint:** `GET /analytics-students`

| Param | Values | Description |
|-------|--------|-------------|
| action | `profile` `ratings` `achievements` `ranking` `progress_ranking` | Operation type |
| student_id | uuid | **Required** unless `student_code` is given |
| student_code | `CE-00452` | Look the student up by Student ID — same response as by `student_id` |
| days | int | Rating history period (default 365) |

```bash
# Full student profile
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=profile&student_id=42"

# Same profile by Student ID
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=profile&student_code=CE-00452"

# Rating history with trend
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=ratings&student_id=42&days=90"

# Achievements
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=achievements&student_id=42"

# Ranking
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=ranking&student_id=42"
```

`profile.student` includes `student_code`; `ranking` / `progress_ranking` return
`student_id` + `student_code`. `analytics-tournaments` likewise adds
`student_code` to `detail` participants, `branch_leaderboard`,
`coach_kpi_summary` students and every `school_student_drilldown` row, and
`student_history` accepts `student_code`.

---

## 8. Analytics - Schedule

**Endpoint:** `GET /analytics-schedule`

Read-only view of the group schedule grid. One row per **current** group slot
(latest effective version per logical chain; soft-deleted/retired chains are
excluded — migrations 065/083). Also accepts the read-only key
`CHESS_EMPIRE_READONLY_KEY`.

| Param | Values | Description |
|-------|--------|-------------|
| action | `list` | Operation type (default `list`) |
| branch_id | uuid | Filter by branch |
| coach_id | uuid | Filter by coach |
| schedule_type | `mon_wed` `tue_thu` `sat_sun` `mon_wed_fri` `wed_fri` | Filter by schedule |
| limit / offset | int | Pagination (default 200/0) |

Each `data` row:

| Field | Description |
|-------|-------------|
| group_id | Stable `time_slots.logical_slot_id` (migration 076) — use this as the group key; it is invariant across slot edits |
| slot_version_id | Raw `time_slots.id` of the current version (debugging only; changes on every edit) |
| group_name | `time_slots.label`; when null, composed `"<coach_name> · <start>–<end>"` |
| branch_id / branch_name | Branch of the slot |
| coach_id / coach_name | Coach of the slot (full name) |
| schedule_type | Enum from `time_slots` |
| days | `schedule_type` expanded to lowercase English day names, e.g. `mon_wed` → `["monday","wednesday"]` |
| start_time / end_time | Slot times (`HH:MM:SS`) |
| active_student_count | Distinct `active`-status students currently assigned to the slot chain, minus `student_slot_exclusions` (migration 086) |

```bash
# All current group slots
curl -H "x-api-key: <CHESS_EMPIRE_READONLY_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-schedule?action=list"

# Filter by branch and schedule
curl -H "x-api-key: <CHESS_EMPIRE_READONLY_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-schedule?action=list&branch_id=<uuid>&schedule_type=mon_wed"
```

---

## 8a. Analytics - Coach reports (`analytics-coaches`)

Ranked coach performance reports (PRD_COACH_REPORTS.md). **Read-only**; reads
the migration `101_coach_reports.sql` RPCs `coach_report` / `coach_cohort_matrix` /
`coach_cohort_matrix_all`
(EXECUTE for `service_role` only). Full schemas: `docs/openapi/analytics-coaches.yaml`.

**Auth** (either):
- `x-api-key` (as analytics-tournaments) **and** `Authorization: Bearer <access
  token of an admin session>` — non-admin sessions get `403`.
- `Authorization: Bearer <service-role / sb_secret key>` — used by the cron
  script `scripts/coach_report.py`.

**`GET ?action=report&period=week|month|quarter|half|year[&date=YYYY-MM-DD]`** —
the period that contains `date` (default: **yesterday in Almaty**, so a run on
Monday / the 1st reports the period that just ended). Windows are Asia/Almaty
(UTC+5): week Mon–Sun, calendar month, calendar quarter, Jan–Jun / Jul–Dec,
calendar year; `end` is exclusive. Response `data`:
`{period, previous_period, generated_at, weights, coaches:[…], unattributed,
school, data_notes, previous:{coaches:[{coach_id, coach_name, score, rank}], school}, movers:{up, down}}`.

Each coach row (and `unattributed` / `school`, which have no score):
`active_students`, `small_sample` (< 10 active), `new_students`, `left`,
`frozen_30d`, `churn` (= left + frozen_30d), `net_growth` (= new − left),
`retention {n, events, left_censored, mean_months, median_months,
km_survival_3m, km_survival_6m}`, `razryad_snapshot {none|4th|3rd|2nd|1st|other:
{count, pct}}`, `razryad_changes {promotions, downgrades, promotions_by_razryad,
downgrades_by_razryad}`, `participation {period, lifetime}` (buckets `0`–`4+`,
`{count, pct}` of active students), `podiums {participants, students, finishes,
entries, pct_of_participants, by_kind}`; ranked coaches add `score` (0–100),
`sub_scores`, `rank` and per-metric `ranks`.

Rules:
- Counts are credited to the **coach at the time of the event** (audit_log
  coach_id timeline; no coach change since 2026-02-10 → current coach); unknown
  or deleted coach → `unattributed`. Razryad changes use
  `razryad_history.trainer_id_at_change`.
- New = first activation in the window (new student row, or left → active after
  > 60 days). Left and frozen 30+ (a freeze whose 30th day falls in the window
  while still frozen — weeks sum to months, months to quarters) are separate;
  headline churn = left + frozen 30+.
- Status events are de-duplicated (same student + transition within 5 minutes).
- **2026-10-14 inactive-student cleanup** (`cleanup_freeze_2026_10_14`, →frozen
  with `changed_by` NULL 16:00–17:15 UTC): the batch freeze never counts itself.
  Students who came back (→active or a lesson later) are ignored; students
  still gone are `left` on their **last present lesson** (credited to the coach
  then — past windows such as September change on purpose); those who never
  attended only appear in `data_notes`.
- The **Feb 2026 status-history backfill** (022) is initial state: no
  departures, no freeze spells; students whose first `left` is a backfill row
  are excluded from retention / cohort matrix (`excluded_pre_history_leavers`).
- Active roster, razryad snapshot and participation buckets are the roster **as
  of the window end** (live while the window is running); the previous period
  is its own as-of report.
- `data_notes`: `cleanup_freeze {label, window, evaluated_at, batch_students,
  returned, real_left, cleanup_leavers_dated {total, in_window, by_coach},
  cleanup_leavers_undated {total, by_coach}}`, `excluded_pre_history_leavers`.
- Score = Σ weight × sub-score (0..1): retention 30 (KM 6-month survival, else
  3-month, else 0.5), net growth 20 (0.5 ± (new − left) / active × 5),
  razryad promotions 20 (promotions / active × 4), tournament participation 15
  (share of active students with ≥ 1 tournament), podiums 15 (Coach KPI top-3
  rate = finishes / entries, shrunk toward the school rate:
  (finishes + 10 × school rate) / (entries + 10); 0 without entries). Weights live in `REPORT_WEIGHTS`
  (`supabase/functions/analytics-coaches/coach-reports-logic.mjs`). Ties share a
  rank; coaches with no roster and no movement are unranked (`rank: null`).
- Movers = biggest score gains / drops vs the previous period (top 3 each).

**`GET ?action=cohort_matrix[&coach_id=<uuid>]`** — start month × months since
start: `{coach_id, generated_at, max_months, rows:[{start_month, cohort_size,
left_censored, left_pct:[…], churn_pct:[…]}], by_level_at_leaving:[{level, left,
churn}], by_razryad_at_leaving:[{razryad, left, churn}]}`. `left_pct[k]` /
`churn_pct[k]` = cumulative % of the cohort that left (or left + frozen 30+)
within `k` months. Cohort membership per coach = coach at the start date;
no `coach_id` = school-wide; also `excluded_pre_history_leavers` /
`cleanup_leavers_undated` (not in the cohorts). `coach_id=all` →
`{generated_at, school, coaches:[{…matrix, coach_name}]}` in one call.

Data limits: tournament / razryad metrics start May 2026 (2026 yearly report is
partial); retention for students who started before Dec 2025 is a lower bound;
the cohort matrix is only used for monthly and longer reports.

```bash
curl -H "Authorization: Bearer $CE_SERVICE_KEY" -H "apikey: $CE_SERVICE_KEY" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-coaches?action=report&period=month&date=2026-10-15"

CE_SERVICE_KEY=… CE_SUPABASE_URL=https://papgcizhfkngubwofjuo.supabase.co \
  python3 scripts/coach_report.py --period month --out /tmp/coach-reports
# → {"xlsx": "/tmp/coach-reports/coach-report-month-2026-10-01.xlsx", "summary": "…-summary.txt"}
```

---

## Response Format

**Success:**
```json
{
  "success": true,
  "data": [...],
  "count": 42,
  "meta": { "limit": 100, "offset": 0 }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## 9. Tournaments API (public registration)

**Base path:** `/tournaments-api`
**Vercel proxy:** `https://app.chessempire.kz/api/tournaments-api/<path>` rewrites
to the Supabase edge function so bots can use the friendlier domain.

Read endpoints are open. Write endpoints (`POST /register`, `DELETE /registrations/:id`)
require the shared header `x-api-key: <CHESS_EMPIRE_API_KEY>`. The function reads
its key from the `CHESS_EMPIRE_API_KEY` env var (set via `supabase secrets set`).

Each response uses a consistent envelope:

```json
{ "ok": true,  ... }
{ "ok": false, "reason": "unauthorized | not_found | closed | full | duplicate | invalid_input | server_error" }
```

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/branches` | — | Public branches (excludes "НИШ" / "Zhandosova") |
| `GET` | `/tournaments?branch_id=&upcoming=true` | — | List tournaments (upcoming by default) with `registered_count` |
| `GET` | `/tournaments/:id` | — | One tournament |
| `GET` | `/tournaments/:id/registrations` | — | Roster — `{id, source, registered_at, display_name}` (no `external_contact`) |
| `GET` | `/students/search?q=&limit=` | — | Autocomplete active+frozen students by name or Student ID (`CE-00452`, `00452`). Hits carry `student_code` |
| `GET` | `/students/:student_id/registrations` | key | `:student_id` may be the UUID or the Student ID (`CE-00452`). | This student's registrations — `{id, tournament_id, registered_at}`, `registered_at` ascending. Empty array if none. Key-gated (links registrations to student identity) |
| `POST` | `/tournaments/:id/register` | key | Body: `{ student_id }` / `{ student_code }` OR `{ player_name }`. Optional `external_contact`. Header `x-source: telegram\|whatsapp\|online\|web` |
| `DELETE` | `/registrations/:registration_id` | key | Cancel a registration; reopens the tournament if it was full |
| `GET` | `/openapi.json` | — | Hand-written OpenAPI 3.0.3 contract |

### Bot example

```bash
# 1. Find a tournament
curl https://app.chessempire.kz/api/tournaments-api/tournaments?upcoming=true

# 2. Optionally look up a student
curl 'https://app.chessempire.kz/api/tournaments-api/students/search?q=ad'

# 3. Register a known student
curl -X POST https://app.chessempire.kz/api/tournaments-api/tournaments/<uuid>/register \
  -H 'x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>' \
  -H 'x-source: telegram' \
  -H 'content-type: application/json' \
  -d '{"student_id":"<uuid>"}'

# 4. Or register a free-text player not in the DB
curl -X POST https://app.chessempire.kz/api/tournaments-api/tournaments/<uuid>/register \
  -H 'x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>' \
  -H 'x-source: whatsapp' \
  -H 'content-type: application/json' \
  -d '{"player_name":"Walk-In Wendy","external_contact":"+77001234567"}'

# 5. Check what a student is registered for (key-gated → resolves the id for self-cancel)
curl 'https://app.chessempire.kz/api/tournaments-api/students/<uuid>/registrations' \
  -H 'x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>'
```

The OpenAPI spec at `/openapi.json` is the source of truth for request/response
shapes — point your client generator there.

---

## Students (write) API

**Endpoint:** `POST|GET /students-api?action=<action>`

The **write** API for external integrations (e.g. AmoCRM sync). Unlike the
read-only `analytics-*` functions, this one creates and mutates students. It is
**not** part of the tournaments surface and uses a **separate** key.

### Authentication

Every action requires a header:

```
x-api-key: <CHESS_EMPIRE_WRITE_KEY — see supabase secrets>
```

`CHESS_EMPIRE_WRITE_KEY` is a **new, distinct** secret — it is NOT
`CHESS_EMPIRE_API_KEY` (which stays tournament-only). A missing or wrong key →
`401 {ok:false, reason:"unauthorized"}`. `GET /students-api` with no `action`
returns the OpenAPI self-doc (public).

### Environment variables

| Var | Purpose |
|-----|---------|
| `CHESS_EMPIRE_WRITE_KEY` | API key(s) clients send as `x-api-key`. Required. Comma-separated list — each external consumer gets its own key so keys can be revoked individually (remove one from the list + redeploy). |
| `CHESSTER_SYNC_TOKEN` | Bearer token for the freeze/thaw poke to Chesster. If unset, the poke is skipped and the hourly reconcile cron is the safety net. |
| `CHESSTER_SYNC_URL` | Override the Chesster freeze/thaw endpoint (default `https://chesster.io/api/chess-empire/sync/freeze-thaw`). |

### Actions

| Action | Method | Body / Query | Description |
|--------|--------|--------------|-------------|
| `create` | POST | `{full_name, branch_id, phone?, amocrm_customer_id?}` | Create-or-activate a student (Buyer ID first, then phone + name; see below). `phone` is required only without `amocrm_customer_id`. |
| `freeze` | POST | `{student_code}` \| `{student_id}` \| `{phone}` \| `{amocrm_customer_id}` | Set status → `frozen`. |
| `activate` | POST | `{student_code}` \| `{student_id}` \| `{phone}` \| `{amocrm_customer_id}` | Set status → `active` (unfreeze). |
| `link_amocrm` | POST | `{student_id \| student_code, amocrm_customer_id}` | Link an amoCRM id to an existing student (never overwrites a different id). |
| `update_contact` | POST | `{student_id \| student_code, phone?, amocrm_customer_id?}` | Overwrite the parent phone / amoCRM id. |
| `find` | GET | `?student_code=` \| `?amocrm_customer_id=` \| `?phone=` | Look up students. Precedence `student_code` > `amocrm_customer_id` > `phone`. Response `{ok, student_code\|amocrm_customer_id\|phone, students:[…]}`. |
| `list` | GET | `?limit=&offset=&branch_id=&status=` | Paginated list ordered by `student_code`: `limit` 1..500 (default 100), `offset` ≥ 0, `status` ∈ `active` `frozen` `left`. Response `{ok, total, limit, offset, students:[…]}` (`total` = exact count for the filters). |
| `branches` | GET | — | List all branches (`id` + `name`) for branch mapping. |
| `roster` | GET | `?status=&limit=&offset=\|after_id=` | Weekly roster snapshot ordered by `id` (see *Rank tracking export* below). Read-only. |
| `rank_history` | GET | `?student_id=\|student_code=&from=&to=&limit=&offset=` | Rank (razryad) change log ordered by `changed_at, id`. Read-only. |
| `survival-score` | POST | `{student_id \| student_code, score, external_ref, achieved_at?}` | Push a Chesster Puzzle Rush **Survival** run (see below). |
| `survival-best` | GET | `?student_id=` \| `?student_code=` | `{best:{week,month,all}}` — the student's Puzzle Rush bests. |
| `survival-leaderboard` | GET | `?scope=&period=&branch_id=&student_id=\|student_code=&limit=` | Puzzle Rush ranking board. |

**Student object.** Every student in a response has the same shape:
`{id, student_code, name, first_name, last_name, status, branch_id, branch,
amocrm_customer_id, phone}`. `student_code` is never accepted on `create` — the
database assigns it.

**Phones (E.164, any country).** Phones are validated with libphonenumber and
normalized to E.164 — `+` country calling code + national number, no spaces —
keeping the real country code (`+7`, `+351`, `+44`, `+420`, `+90`, …). Spaces,
dashes, parens and dots are ignored and a `00` prefix is read as `+`. Legacy KZ
input without a prefix still works: `8XXXXXXXXXX` / `7XXXXXXXXXX` / a bare 10-digit
number → `+7…`. An invalid or impossible number (e.g. `+3…`, which is not a
complete country code) → `400 {reason:"invalid_input", field:"phone", message}`;
the country code is never guessed, truncated or rewritten. Lookups are exact on
the full number (a `+44` number never matches a `+7` one with the same last 10
digits); stored legacy `8…` / 10-digit values still match their `+7` form.
**Phones are not unique** — siblings may share a parent's phone, so a phone
lookup (`find`) returns **every** matching student. `freeze`/`activate` by a
shared phone → `409 ambiguous` (use `student_id` / `amocrm_customer_id`).

**Create (Buyer ID first, then phone + name).** `amocrm_customer_id` (the amoCRM
Buyer ID) is unique and is the primary identity:
1. If the Buyer ID already belongs to a student, that student is returned
   (`existing:true, matched_by:"amocrm_customer_id"`) — a replay never creates a
   duplicate, and a different student found by phone is never touched.
2. Otherwise every student with the same phone is compared by normalized full
   name (trimmed, spaces collapsed, case-insensitive, `ё` = `е`):
   exactly one match → that student (`matched_by:"phone_name"`; the Buyer ID is
   written onto it when it has none, `linked:true`; if it already has a
   *different* Buyer ID → `409 amocrm_customer_id_conflict`); several matches →
   `409 {reason:"ambiguous", candidates:[…]}` for manual review; no match → a
   **new** student with the same phone (`201`).
3. Without a phone (allowed only with a Buyer ID) a new student is created with
   `phone: null` — no placeholder is ever generated. A phone that is present but
   invalid is rejected (`400`), never silently dropped.

A matched student that is `frozen` is reactivated (`reactivated: true`, subject
to the 3-day guard below). Nothing is written on any 4xx; a concurrent create
with the same Buyer ID → `409 amocrm_customer_id_conflict`. Verify a write by
reading it back with `find?amocrm_customer_id=` or by `student_code`.

**3-day manual guard.** Coaches win over automation: `freeze`/`activate` (and the
create-time reactivation) are **refused** with `409 {reason:"manual_change_recent"}`
when the most recent *manual* (dashboard) status change for that student is
younger than **3 days**. The dashboard records those manual changes into
`student_status_history` (`changed_by_type='manual'`, `source='dashboard'`); the
API writes `changed_by_type='api'`, `source='students-api'`.

**Audit.** Every status write returns the inserted `status_history_id` so callers
can audit the change. A no-op (already in the target status) returns
`{ok:true, changed:false}`. After a successful status write the API fires a
non-blocking freeze/thaw poke to Chesster and reports the outcome as
`chesster_poke: "ok" | "skipped" | "failed"` — a failed poke never fails or rolls
back the response.

**Puzzle Rush push (`survival-score`).** Chesster pushes a student's Survival run
into `survival_scores` (CE stays the source of truth). `score` must be an integer
`0..200` (else `400 {reason:"invalid_input", field:"score"}`); `external_ref` (the
Chesster run id) is required; `achieved_at` is optional ISO-8601 (defaults to now).
Unknown student → `404 not_found`; a student who is not `active` →
`409 student_inactive`. The row is stored with `mode='puzzle_rush'`,
`source='chesster'`, `notes='Chesster Puzzle Rush (survival)'`. Response:
`{ok:true, id, best:{week, month, all}}`.

**Idempotency rule.** `external_ref` is unique. Re-sending a run whose
`external_ref` is already stored returns `200 {ok:true, duplicate:true, id}` with
the existing row id and inserts nothing — so Chesster can safely retry any push
(timeouts, 5xx) with the same `external_ref`. Use `survival-best` to decide
whether a run is worth pushing (e.g. only when it beats the current week best).

**Leaderboard (`survival-leaderboard`).** `scope` = `school` (default) | `branch`
(`branch_id` required; a `branch_id` without `scope` implies `branch`); `period` =
`week` | `month` | `all` (default). Windows are computed in **Asia/Almaty**: the
week starts Monday 00:00 local, the month is the local calendar month. Only active
students, best score per student in the window, competition ranking (`RANK()` —
ties share a place). `limit` 1..500 (default 50); with `student_id`, that student's
row is appended (`is_self:true`) when outside the top N. Response:
`{ok, scope, period, branch_id, window_start, total_count, rows:[{rank, student_id,
student_code, first_name, last_name, branch_id, branch_name, best_score, achieved_at, source,
total_count, is_self}]}`.

The API never touches `student_time_slot_assignments` (migration 081 blocks
automatic slot moves at the DB level by design).

### Rank tracking export (`roster` / `rank_history`)

Two **read-only** actions for the weekly rank-tracking export (same
`x-api-key`). Full schemas: `docs/openapi/students-api.yaml`.

**`GET ?action=roster`** — one row per student, ordered by `id`:
`{student_id, student_code, full_name, status, branch_id, branch_name, trainer_id,
trainer_name, stage_id, stage_name, current_rank, student_created_at}`.
`status` = `active` (default) | `frozen` | `left` | `all`. `limit` 1..1000
(default 1000), then page either with `offset` **or** with the keyset cursor
`after_id=<next_after_id of the previous page>` (not both → 400). Response
`{ok, as_of, status, total, limit, offset, after_id, next_after_id, students:[…]}`
— `total` is the exact count for the status filter (independent of the page);
`next_after_id` is `null` on the last page.

**`GET ?action=rank_history`** — one row per rank change, ordered by
`changed_at, id`: `{rank_change_id, student_id, student_code, previous_rank,
new_rank, changed_at, changed_by_id, changed_by_name, source, source_derived,
trainer_id_at_change, trainer_name_at_change, trainer_attribution}`. Filters:
`student_id` / `student_code`, `from` (inclusive) and `to` (exclusive) — an ISO
date (`2026-10-19` = 00:00 **UTC**) or a date-time **with** an offset
(`2026-10-19T00:00:00+05:00`); anything else, or `to` ≤ `from`, → `400
invalid_input` naming the field. `limit` 1..1000 (default 1000), `offset`.
Response `{ok, as_of, student_id, from, to, total, limit, offset, rank_changes:[…]}`.

Field rules:

- **`current_rank` / `previous_rank` / `new_rank`** ∈ `none` `4th` `3rd` `2nd`
  `1st` `kms` — never null (no rank = `none`).
- **`stage_id`** = `students.current_level` (1–8); `stage_name` = `"Ступень N"`.
- **`student_created_at`** is when the DB record was created, **not** when
  training started (522 records were bulk-imported in 2025-11).
- **`source`**: `admin_ui` / `coach_ui` (dashboard edit by an admin / coach
  account), `api` (service-role write), `tournament` (auto-promotion from a
  razryad tournament result), `system` (no user), `trigger` (legacy row whose
  origin could not be resolved). `source_derived: true` = reconstructed after the
  fact by migration 099 for rows before it, not captured at event time.
- **`trainer_attribution`**: `event_time` (the coach who held the student when the
  rank changed — when one save changes both coach and rank the **previous** coach
  is credited), `derived_audit_log` (reconstructed from the coach-change audit
  log), `unknown` (no evidence — **not** the current coach, and not a conversion
  signal).
- **`changed_by_name`**: the coach's name for coach accounts, otherwise the
  staff account email; `null` for deleted / unknown users.

Interpretation: rank history starts **2026-05-18** — earlier ranks have no
events (a student's current rank may pre-date the history). Downgrades and
corrections (e.g. `3rd → none`) are real rows; do not count every row as a
promotion — compare `razryad` order of `previous_rank` and `new_rank`. Rows are
append-only (never edited or deleted, except when the student itself is
hard-deleted).

### Examples

```bash
BASE=https://papgcizhfkngubwofjuo.supabase.co/functions/v1/students-api
KEY='<CHESS_EMPIRE_WRITE_KEY — see supabase secrets>'

# List branches (for mapping AmoCRM → branch_id)
curl "$BASE?action=branches" -H "x-api-key: $KEY"

# Create (or dedup to an existing / reactivate a frozen) student
curl -X POST "$BASE?action=create" -H "x-api-key: $KEY" \
  -H 'content-type: application/json' \
  -d '{"full_name":"Askar Zhumabek","phone":"8 (777) 123-45-67","branch_id":"<uuid>","amocrm_customer_id":123456}'

# Siblings sharing one phone: two Buyer IDs → two students (a replay of either returns the same id)
curl -X POST "$BASE?action=create" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"full_name":"Aru Sadykova","phone":"+7 700 123 45 67","branch_id":"<uuid>","amocrm_customer_id":1002}'

# International phone (country code kept: stored as +351912345678) / no phone at all
curl -X POST "$BASE?action=create" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"full_name":"Maria Silva","phone":"+351 912 345 678","branch_id":"<uuid>","amocrm_customer_id":1003}'
curl -X POST "$BASE?action=create" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"full_name":"Timur Akhmetov","branch_id":"<uuid>","amocrm_customer_id":1004}'

# Find by phone (any format; returns ALL students sharing it) / by Student ID / by Buyer ID
curl "$BASE?action=find&phone=%2B77771234567" -H "x-api-key: $KEY"
curl "$BASE?action=find&student_code=CE-00452" -H "x-api-key: $KEY"
curl "$BASE?action=find&amocrm_customer_id=1003" -H "x-api-key: $KEY"

# Page through all active students of a branch, 500 at a time
curl "$BASE?action=list&status=active&branch_id=<uuid>&limit=500&offset=0" -H "x-api-key: $KEY"

# Weekly roster: all active students (one page of ≤1000; follow next_after_id if present)
curl "$BASE?action=roster" -H "x-api-key: $KEY"
curl "$BASE?action=roster&status=all&limit=500&after_id=<next_after_id>" -H "x-api-key: $KEY"

# Rank changes in one week (Almaty Monday 00:00 → next Monday 00:00) / one student's full history
curl "$BASE?action=rank_history&from=2026-10-19T00:00:00%2B05:00&to=2026-10-26T00:00:00%2B05:00" -H "x-api-key: $KEY"
curl "$BASE?action=rank_history&student_code=CE-00452" -H "x-api-key: $KEY"

# Freeze / activate (resolve by id, phone, or amocrm_customer_id)
curl -X POST "$BASE?action=freeze"   -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"amocrm_customer_id":123456}'
curl -X POST "$BASE?action=activate" -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"phone":"+77771234567"}'
curl -X POST "$BASE?action=freeze"   -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"student_code":"CE-00452"}'

# Push a Puzzle Rush Survival run (safe to retry with the same external_ref)
curl -X POST "$BASE?action=survival-score" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"student_id":"<uuid>","score":34,"external_ref":"chesster-run-8f3a","achieved_at":"2026-10-13T15:04:00+05:00"}'

# Student bests / weekly branch board
curl "$BASE?action=survival-best&student_id=<uuid>" -H "x-api-key: $KEY"
curl "$BASE?action=survival-leaderboard&period=week&branch_id=<uuid>&student_id=<uuid>&limit=20" -H "x-api-key: $KEY"
```

Requires migration `091_students_api.sql` applied (adds
`students.amocrm_customer_id`, the `student_status_history` actor columns, and
the `find_students_by_phone_digits` lookup) and `097_students_phone_e164_lookup.sql`
(the exact `find_students_by_phone_e164` lookup used by `create` / `find` /
`freeze` / `activate`). The `survival-*` actions (and
`analytics-leaderboards?action=survival`) require migration
`093_puzzle_rush_rankings.sql` (adds `survival_scores.source` / `external_ref` and
the `get_puzzle_rush_leaderboard` / `get_student_puzzle_rush_best` RPCs).
`student_code` everywhere (and `action=list` ordering) requires migration
`096_student_code.sql`. `rank_history` (the `source_derived` / `trainer_*` /
`evidence` columns and event-time attribution) requires migration
`099_rank_history_attribution.sql`.

## Deployment

```bash
supabase functions deploy analytics-audit
supabase functions deploy analytics-status
supabase functions deploy analytics-sessions
supabase functions deploy analytics-users
supabase functions deploy analytics-attendance
supabase functions deploy analytics-leaderboards
supabase functions deploy analytics-students
supabase functions deploy analytics-schedule
supabase functions deploy analytics-coaches   # apply migration 101 first

# Tournament registration API (or run scripts/deploy-tournaments-api.sh)
supabase secrets set CHESS_EMPIRE_API_KEY='<CHESS_EMPIRE_API_KEY — see supabase secrets>'
supabase functions deploy tournaments-api

# Students write API (apply migration 091 first, then set the NEW write key)
supabase secrets set CHESS_EMPIRE_WRITE_KEY='<CHESS_EMPIRE_WRITE_KEY — see supabase secrets>'
# optional (enables the server-side Chesster freeze/thaw poke):
supabase secrets set CHESSTER_SYNC_TOKEN='<CE_SYNC_SERVICE_TOKEN — see supabase secrets>'
supabase functions deploy students-api
```
