# Chess Empire Analytics API

Base URL: `https://papgcizhfkngubwofjuo.supabase.co/functions/v1`

## Authentication

All endpoints require one of:
- Header: `x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>`
- Header: `Authorization: Bearer <service_role_key>`

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
| student_id | int | Filter by student |
| old_status / new_status | string | Filter by status |
| from / to | ISO date | Date range |
| limit / offset | int | Pagination |

```bash
# Status transitions summary
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-status?action=transitions"

# Freeze periods for a student
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-status?action=freezes&student_id=42"
```

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
| student_id | int | Student filter |
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

---

## 6. Analytics - Leaderboards

**Endpoint:** `GET /analytics-leaderboards`

| Param | Values | Description |
|-------|--------|-------------|
| action | `ratings` `survival` `bot_battles` | Leaderboard type |
| branch_id | int | Filter by branch |
| mode | string | Survival mode filter |
| limit | int | Top N (default 20) |

```bash
# Top rated students
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=ratings&limit=10"

# Survival leaderboard
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=survival&mode=blitz"

# Bot battles leaderboard
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=bot_battles"
```

---

## 7. Analytics - Students

**Endpoint:** `GET /analytics-students`

| Param | Values | Description |
|-------|--------|-------------|
| action | `profile` `ratings` `achievements` `ranking` | Operation type |
| student_id | int | **Required** — Student ID |
| days | int | Rating history period (default 365) |

```bash
# Full student profile
curl -H "x-api-key: <CHESS_EMPIRE_API_KEY — see supabase secrets>" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=profile&student_id=42"

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
| `GET` | `/students/search?q=&limit=` | — | Autocomplete active+frozen students |
| `GET` | `/students/:student_id/registrations` | key | This student's registrations — `{id, tournament_id, registered_at}`, `registered_at` ascending. Empty array if none. Key-gated (links registrations to student identity) |
| `POST` | `/tournaments/:id/register` | key | Body: `{ student_id }` OR `{ player_name }`. Optional `external_contact`. Header `x-source: telegram\|whatsapp\|online\|web` |
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
| `CHESS_EMPIRE_WRITE_KEY` | API key clients send as `x-api-key`. Required. |
| `CHESSTER_SYNC_TOKEN` | Bearer token for the freeze/thaw poke to Chesster. If unset, the poke is skipped and the hourly reconcile cron is the safety net. |
| `CHESSTER_SYNC_URL` | Override the Chesster freeze/thaw endpoint (default `https://chesster.io/api/chess-empire/sync/freeze-thaw`). |

### Actions

| Action | Method | Body / Query | Description |
|--------|--------|--------------|-------------|
| `create` | POST | `{full_name, phone, branch_id, amocrm_customer_id?}` | Create a student (dedups first; see below). |
| `freeze` | POST | `{student_id}` \| `{phone}` \| `{amocrm_customer_id}` | Set status → `frozen`. |
| `activate` | POST | `{student_id}` \| `{phone}` \| `{amocrm_customer_id}` | Set status → `active` (unfreeze). |
| `find` | GET | `?phone=...` | Look up students by normalized phone. |
| `branches` | GET | — | List all branches (`id` + `name`) for branch mapping. |

**Phone normalization.** Phones are normalized to canonical KZ/RU `+7XXXXXXXXXX`
(spaces/dashes/parens/dots stripped; a leading domestic `8` → `+7`; a bare
10-digit number gets `+7` prepended). Matching is on the last 10 digits, so a
student is found regardless of how their stored `parent_phone` is formatted.

**Dedup (create).** Before creating, the API looks for an existing student by
`amocrm_customer_id` (exact) and by normalized phone. On a hit it returns the
existing student (`existing: true`) and does **not** create a duplicate; if the
match is `frozen` it is reactivated (`reactivated: true`). A phone / amocrm
selector that matches more than one student → `409 {reason:"ambiguous"}`.

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

The API never touches `student_time_slot_assignments` (migration 081 blocks
automatic slot moves at the DB level by design).

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

# Find by phone (any format)
curl "$BASE?action=find&phone=%2B77771234567" -H "x-api-key: $KEY"

# Freeze / activate (resolve by id, phone, or amocrm_customer_id)
curl -X POST "$BASE?action=freeze"   -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"amocrm_customer_id":123456}'
curl -X POST "$BASE?action=activate" -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"phone":"+77771234567"}'
```

Requires migration `091_students_api.sql` applied (adds
`students.amocrm_customer_id`, the `student_status_history` actor columns, and
the `find_students_by_phone_digits` lookup).

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

# Tournament registration API (or run scripts/deploy-tournaments-api.sh)
supabase secrets set CHESS_EMPIRE_API_KEY='<CHESS_EMPIRE_API_KEY — see supabase secrets>'
supabase functions deploy tournaments-api

# Students write API (apply migration 091 first, then set the NEW write key)
supabase secrets set CHESS_EMPIRE_WRITE_KEY='<CHESS_EMPIRE_WRITE_KEY — see supabase secrets>'
# optional (enables the server-side Chesster freeze/thaw poke):
supabase secrets set CHESSTER_SYNC_TOKEN='<CE_SYNC_SERVICE_TOKEN — see supabase secrets>'
supabase functions deploy students-api
```
