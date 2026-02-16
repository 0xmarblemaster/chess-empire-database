# Chess Empire Analytics API

Base URL: `https://papgcizhfkngubwofjuo.supabase.co/functions/v1`

## Authentication

All endpoints require one of:
- Header: `x-api-key: ce-api-2026-k8x9m2p4q7w1`
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-audit?action=recent&limit=10"

# Entity history
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-audit?action=entity&entity_type=students&entity_id=123"

# Audit stats
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-status?action=transitions"

# Freeze periods for a student
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-sessions?action=stats"

# Session detail with actions
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-users?action=list"

# User summary
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-attendance?action=rates&branch_id=1"

# Low attendance alerts
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-attendance?action=alerts&branch_id=1&threshold=60"

# Calendar view
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=ratings&limit=10"

# Survival leaderboard
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-leaderboards?action=survival&mode=blitz"

# Bot battles leaderboard
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
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
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=profile&student_id=42"

# Rating history with trend
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=ratings&student_id=42&days=90"

# Achievements
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=achievements&student_id=42"

# Ranking
curl -H "x-api-key: ce-api-2026-k8x9m2p4q7w1" \
  "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/analytics-students?action=ranking&student_id=42"
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

## Deployment

```bash
supabase functions deploy analytics-audit
supabase functions deploy analytics-status
supabase functions deploy analytics-sessions
supabase functions deploy analytics-users
supabase functions deploy analytics-attendance
supabase functions deploy analytics-leaderboards
supabase functions deploy analytics-students
```
