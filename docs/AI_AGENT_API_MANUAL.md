# Chess Empire Database — AI Agent API Manual

**Audience:** AI agents integrating with the Chess Empire school-management database.
**Version:** 1.0 · 2026-10-09
**Ground truth:** this manual was extracted directly from the deployed edge-function source code (`supabase/functions/*/index.ts`), not from prose docs. Where `README-API.md` or the inline openapi.json disagree with this manual, **this manual (and the code) win** — see the Appendix for the known discrepancies.
**Live-verified:** 2026-10-09 (auth behavior, self-doc endpoints, write-API end-to-end create/freeze).

---

## Содержание / Table of contents

- [0. Быстрый старт (Русский)](#0-быстрый-старт-русский)
- [1. Mental model — read this first](#1-mental-model--read-this-first)
- [2. Authentication](#2-authentication)
- [3. Quickstart (copy-paste curl)](#3-quickstart-copy-paste-curl)
- [4. Write API — `students-api`](#4-write-api--students-api)
- [5. Tournaments API — `tournaments-api`](#5-tournaments-api--tournaments-api)
- [6. Read API — the 9 `analytics-*` functions](#6-read-api--the-9-analytics--functions)
- [7. Error taxonomy — what to do per error](#7-error-taxonomy--what-to-do-per-error)
- [8. Agent behavior rules](#8-agent-behavior-rules)
- [9. Data model cheat sheet](#9-data-model-cheat-sheet)
- [10. Internal endpoints — DO NOT CALL](#10-internal-endpoints--do-not-call)
- [Appendix A. Known README/spec discrepancies](#appendix-a-known-readmespec-discrepancies)

---

## 0. Быстрый старт (Русский)

**База:** `https://papgcizhfkngubwofjuo.supabase.co/functions/v1`
**Авторизация:** заголовок `x-api-key: <ваш ключ>` (НЕ `Bearer`, НЕ `apikey`). Один и тот же ключ работает и для чтения (analytics-*), и для записи (students-api).

**ВАЖНО:** путь `/rest/v1/*` (прямой PostgREST) с этим ключом **всегда вернёт 401 — это задумано так**. Не пытайтесь его использовать. Единственный вход — `/functions/v1/<имя-функции>`.

### Создать ученика
```bash
curl -X POST "https://papgcizhfkngubwofjuo.supabase.co/functions/v1/students-api?action=create" \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"full_name":"Аскар Жумабек","phone":"8 (777) 123-45-67","branch_id":"<uuid из action=branches>","amocrm_customer_id":123456}'
```
- Успех: `201 {"ok":true,"existing":false,"student":{…},"status_history_id":"<uuid>"}`
- Ученик уже есть: `200 {"ok":true,"existing":true,…}` — дубликат НЕ создаётся; замороженный реактивируется (`"reactivated":true`). Сначала ищется `amocrm_customer_id` (ID покупателя); если не найден — ученики с тем же телефоном сравниваются по ФИО (без учёта регистра, лишних пробелов, ё=е): одно совпадение → этот ученик, несколько → `409 ambiguous` с `candidates` (ручная проверка), ни одного → создаётся новый ученик с тем же телефоном (братья/сёстры).
- Телефон не уникален и необязателен, если передан `amocrm_customer_id` (тогда сохраняется `null`). Международные номера принимаются в формате E.164 с кодом страны (`+351…`, `+44…`, `+420…`, `+90…`, `+7…`); казахстанские `8 777…` / 10 цифр → `+7…`. Неверный номер → `400 invalid_input, field:"phone"`.

### Изменить статус
```bash
# заморозить
curl -X POST "{BASE}/students-api?action=freeze" -H "x-api-key: $KEY" \
  -H "content-type: application/json" -d '{"phone":"+77771234567"}'
# активировать
curl -X POST "{BASE}/students-api?action=activate" -H "x-api-key: $KEY" \
  -H "content-type: application/json" -d '{"student_id":"<uuid>"}'
```
Селектор ученика — ровно одно из: `student_id` (uuid) | `amocrm_customer_id` (int) | `phone`. Статусы не передаются полем — статус задаётся выбором действия. Допустимые целевые статусы: только `frozen` и `active`.

### Справочники и поиск
```bash
curl "{BASE}/students-api?action=branches" -H "x-api-key: $KEY"       # список филиалов (id + name)
curl "{BASE}/students-api?action=find&phone=87771234567" -H "x-api-key: $KEY"  # поиск по телефону
curl "{BASE}/students-api"                                            # openapi.json — публично, без ключа
```

### Критичные правила
1. **`409 manual_change_recent`** — если тренер менял статус ученика вручную менее 3 дней назад, API откажет. Это защита, не баг: решение человека важнее автоматики. Повторите позже или эскалируйте человеку.
2. **`409 ambiguous`** — селектор (телефон/amocrm_id) совпал с несколькими учениками. Уточните через `student_id`.
3. Каждая запись статуса фиксируется в журнале `student_status_history` (`changed_by_type='api'`, `source='students-api'`); API возвращает `status_history_id` для аудита.
4. Create идемпотентен (дедупликация) — повтор запроса безопасен.
5. Не создавайте тестовые записи в проде без подтверждения человека.

Полный контракт — ниже по-английски; это условный минимум для интеграции.

---

## 1. Mental model — read this first

One Supabase project (`papgcizhfkngubwofjuo`) exposes **14 edge functions** at:

```
https://papgcizhfkngubwofjuo.supabase.co/functions/v1/<function-name>
```

That is the **only** door. Specifically:

- ❌ **Raw PostgREST (`/rest/v1/*`) will ALWAYS return 401 with your key. This is by design, not a failure.** The `x-api-key` values issued to integrations are custom gateway keys that only the edge functions validate. No amount of retrying, header permutation, or key re-issuing will open `/rest/v1/*`. Do not attempt it; do not report it as a bug.
- ❌ There is no GraphQL, no direct DB connection, no Supabase client-library path for integrations.
- ✅ Everything you can do is one of the 11 agent-facing functions below. The other 3 are internal (§10).

| Surface | Functions | Access |
|---|---|---|
| **Read (analytics)** | `analytics-attendance`, `analytics-audit`, `analytics-leaderboards`, `analytics-schedule`, `analytics-sessions`, `analytics-status`, `analytics-students`, `analytics-tournaments`, `analytics-users` | key-gated, read-only, GET with query params |
| **Write (students)** | `students-api` | key-gated, create/freeze/activate/find/branches |
| **Tournaments** | `tournaments-api` | most reads public; register/cancel key-gated |
| **Internal** | `complete-registration`, `delete-user`, `send-invitation` | DO NOT CALL (§10) |

**Self-documentation (no key needed):**
- `GET {BASE}/students-api` (no params) → OpenAPI 3.0.3 JSON
- `GET {BASE}/tournaments-api/openapi.json` → OpenAPI 3.0.3 JSON

If you are unsure about a contract, fetch those — but note the tournaments spec has two known divergences from actual behavior (Appendix A); this manual is more accurate.

**Response envelopes differ by surface** (historical reasons — handle both):
- `analytics-*`: `{"success": true, "data": …}` / `{"success": false, "error": "…"}`
- `students-api` & `tournaments-api`: `{"ok": true, …}` / `{"ok": false, "reason": "…"}`

---

## 2. Authentication

**One header: `x-api-key: <key>`.** Exact lowercase header name. Never `Authorization: Bearer <your key>`, never `apikey`.

Different surfaces validate against different server-side secrets:

| Surface | Server secret your key must match | Notes |
|---|---|---|
| `analytics-*` (all 9) | `CHESS_EMPIRE_API_KEY` **or** `CHESS_EMPIRE_READONLY_KEY` | also accepts `Authorization: Bearer <service-role key>` — internal only, integrations never get that |
| `students-api` | `CHESS_EMPIRE_WRITE_KEY` (comma-separated list; any entry matches) | deliberately distinct secret from the others |
| `tournaments-api` (gated routes) | `CHESS_EMPIRE_API_KEY` (single key) | most GET routes need no key at all |

**What this means for an integration key:** a key may be registered in more than one of those secrets. The current external-integration key (`ce-wr-…`) is registered for **analytics reads AND students-api writes**. It does **not** open the key-gated tournaments-api routes unless separately registered there. If you get 401 on one surface while another works, that's key registration scope — ask the operator, don't brute-force.

**401 semantics:** missing header, wrong key, or the server secret being unset all look identical:
- analytics: `401 {"success":false,"error":"Unauthorized"}`
- students/tournaments: `401 {"ok":false,"reason":"unauthorized"}`

Auth is checked **before** routing on students-api, so a bad key + unknown action returns 401, not 404.

**CORS:** all functions answer `OPTIONS` preflight (200/204) and send `Access-Control-Allow-Origin: *`.

---

## 3. Quickstart (copy-paste curl)

```bash
BASE="https://papgcizhfkngubwofjuo.supabase.co/functions/v1"
KEY="<your x-api-key>"
```

**1. List branches (needed for create — `branch_id` must be a real UUID from here):**
```bash
curl "$BASE/students-api?action=branches" -H "x-api-key: $KEY"
# 200 {"ok":true,"branches":[{"id":"<uuid>","name":"Almaty Center"},…]}
```

**2. Find a student by phone (any format):**
```bash
curl "$BASE/students-api?action=find&phone=8%20777%20123%2045%2067" -H "x-api-key: $KEY"
# 200 {"ok":true,"phone":"+77771234567","students":[…]}   (possibly empty; ALL students sharing the phone)
```

**3. Create a student (idempotent — dedup built in):**
```bash
curl -X POST "$BASE/students-api?action=create" \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"full_name":"Askar Zhumabek","phone":"8 (777) 123-45-67","branch_id":"<uuid>","amocrm_customer_id":123456}'
# new:      201 {"ok":true,"existing":false,"student":{…},"status_history_id":"<uuid>"}
# existing: 200 {"ok":true,"existing":true,"matched_by":"amocrm_customer_id"|"phone_name","student":{…}}
# siblings: 409 {"ok":false,"reason":"ambiguous","candidates":[…]}   (same phone AND same name — manual review)
# no phone / international phone (country code kept):
#   -d '{"full_name":"Timur Akhmetov","branch_id":"<uuid>","amocrm_customer_id":1004}'          → phone:null
#   -d '{"full_name":"Maria Silva","phone":"+351 912 345 678","branch_id":"<uuid>","amocrm_customer_id":1003}' → phone:"+351912345678"
```

**4. Freeze / activate:**
```bash
curl -X POST "$BASE/students-api?action=freeze" \
  -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"amocrm_customer_id":123456}'
# 200 {"ok":true,"changed":true,"student":{…},"status_history_id":"<uuid>","chesster_poke":"ok"}
```

**5. Verify via the read surface:**
```bash
curl "$BASE/analytics-status?action=history&student_id=<uuid>&limit=5" -H "x-api-key: $KEY"
# 200 {"success":true,"data":[{…,"new_status":"frozen","changed_by_type":"api","source":"students-api"}],…}
```

---

## 4. Write API — `students-api`

**Purpose:** write API for external integrations (e.g. AmoCRM sync): create / freeze / activate students, find by phone, list branches. Routes on the `?action=` query param.

### 4.1 Authentication
- Header `x-api-key`, validated against env `CHESS_EMPIRE_WRITE_KEY` — a comma-separated list of keys (each trimmed; empty entries dropped). Any one key matches.
- Missing/wrong key, or the secret unset server-side → `401 {"ok":false,"reason":"unauthorized"}` on every route except the self-doc.
- `OPTIONS` → 204 (no auth).

### 4.2 Self-documentation
`GET {BASE}/students-api` with **no** `action` param → `200` OpenAPI 3.0.3 JSON. **Public — no key required.** Every other method/action combination is key-gated (auth is checked before action routing).

### 4.3 Phone normalization (exact logic) — E.164, any country
1. Only digits, spaces, dashes, parens, dots and one leading `+` are allowed (letters → `400 invalid_input`).
2. Leading `+` (or `00`) → international: the country calling code is kept as given (`+7`, `+351`, `+44`, `+420`, `+90`, …).
3. No prefix (legacy KZ): 11 digits starting with `8` or `7` → `+7` + last 10 digits; exactly 10 digits → `+7` prepended. Any other unprefixed input → `400 invalid_input` (the country code is never guessed).
4. The number must be valid per libphonenumber (max metadata); otherwise → `400 {reason:"invalid_input", field:"phone", message}`. `+3…` is not a country code (`+33` France, `+34` Spain, `+351` Portugal) → rejected. Never truncated, padded or rewritten.
5. Canonical form: E.164 — `+77001234567`, `+351912345678`, `+447400123456`, `+420601123456`, `+905012345678`.

**Matching** is **exact on the full number** (a `+44 7400123456` never matches `+7 7400123456`). For `+7` numbers, stored legacy values `8XXXXXXXXXX` and bare `XXXXXXXXXX` also match; other stored formatting (spaces, dashes) is irrelevant. **Phones are not unique** — siblings share a parent's phone — so a phone can match several students. The API's `phone` field maps to the `parent_phone` column (there is no bare `phone` column).

### 4.4 Full-name splitting
`full_name` is trimmed and split on whitespace: first token → `first_name`, all remaining tokens joined → `last_name` (may be empty). Empty/whitespace-only → `400 invalid_input, field:"full_name"`.

### 4.5 Selector semantics (freeze / activate body)
Priority order — the first present field wins:
1. **`student_id`** (non-empty string): must be a UUID, else `400 invalid_input`. Exact `students.id` lookup; never ambiguous. **Prefer this selector when you know the UUID.**
2. **`amocrm_customer_id`** (only if `student_id` absent): coerced with `Number()`, must be an integer, else `400 invalid_input`. Exact match. >1 match → `409 ambiguous`.
3. **`phone`** (only if neither above): normalized per §4.3, then exact lookup. >1 match (e.g. siblings) → `409 ambiguous` — use `student_id` / `amocrm_customer_id`.
4. None present → `400 invalid_input`.

### 4.6 Actions

#### `POST ?action=create`
Body (JSON; unparseable body → `400 invalid_input`):

| Field | Type | Required | Validation |
|---|---|---|---|
| `full_name` | string | **yes** | non-empty after trim. Fail → `400 {reason:"invalid_input", field:"full_name"}` |
| `phone` | string | **only without `amocrm_customer_id`** | normalized per §4.3. Absent (missing / null / blank) is allowed with a Buyer ID → stored as `null` (never a placeholder). Present but invalid → `400 {…, field:"phone", message}` — never silently dropped. |
| `branch_id` | uuid string | **yes** | must be a UUID → else `400 {…, field:"branch_id"}`; must exist in `branches` → else `400 {reason:"invalid_branch"}`. Never silently defaults. |
| `amocrm_customer_id` | integer | no | amoCRM Buyer ID, unique per student. If present and not null/`''`: positive integer (numeric string accepted) → else `400 {…, field:"amocrm_customer_id"}` |

**Matching order (Buyer ID first, then phone + name):**
1. `amocrm_customer_id` given and it already belongs to a student → that student (`matched_by:"amocrm_customer_id"`). A replay never creates a duplicate and never touches a student found by phone.
2. Otherwise, if a phone is given, all students with that phone are compared by normalized full name (`first_name last_name` vs `full_name`: trimmed, spaces collapsed, case-insensitive, `ё`=`е`):
   - exactly 1 match → that student (`matched_by:"phone_name"`). If it has no Buyer ID, the given one is linked (`linked:true`); if it has a **different** one → `409 amocrm_customer_id_conflict` (`conflict_student_id`), nothing written.
   - more than 1 match → `409 {ok:false, reason:"ambiguous", candidates:[Student,…]}` for manual review, nothing written.
   - 0 matches → step 3 (a differently named sibling is never returned or activated).
3. Insert a new student (same phone allowed; `phone:null` when none given).

A concurrent create with the same Buyer ID → `409 amocrm_customer_id_conflict`. **Create is safe to retry with the same Buyer ID.** Without a Buyer ID, retries are safe as long as the name is unchanged.

**Outcomes:**

| Outcome | HTTP | Body |
|---|---|---|
| New student created | **201** | `{ok:true, existing:false, student:{…}, status_history_id:"<uuid>"}` |
| Match, student not frozen | **200** | `{ok:true, existing:true, matched_by, student:{…}}` — no mutation (`linked:true` when the Buyer ID was just written onto it) |
| Dedup hit, frozen → reactivated | **200** | `{ok:true, existing:true, reactivated:true, student:{…, status:"active"}, status_history_id:"<uuid>", chesster_poke:"ok"\|"skipped"\|"failed"}` |
| Dedup hit, frozen, 3-day manual guard blocks reactivation | **200** (⚠️ not 409!) | `{ok:true, existing:true, reactivated:false, reason:"manual_change_recent", student:{…still frozen}}` |

⚠️ **Agent trap:** on the create path, a guard-blocked reactivation comes back as HTTP 200 with `ok:true` — you must check `reactivated:false` + `reason` in the body, not just the status code.

| Several same-name students share the phone | **409** | `{ok:false, reason:"ambiguous", candidates:[…]}` |
| Phone+name match has a different Buyer ID / id taken concurrently | **409** | `{ok:false, reason:"amocrm_customer_id_conflict", conflict_student_id}` |

New-student insert defaults: `status:'active'`, `razryad:'none'`, `current_level:1`, `current_lesson:1`, `total_lessons:120`; `parent_phone` = normalized E.164 phone or `null`.

#### `POST ?action=freeze` / `POST ?action=activate`
Body: one selector (§4.5). Target status: `frozen` / `active`.

| Outcome | HTTP | Body |
|---|---|---|
| Status changed | 200 | `{ok:true, changed:true, student:{…}, status_history_id:"<uuid>", chesster_poke:"ok"\|"skipped"\|"failed"}` |
| Already in target status (no-op) | 200 | `{ok:true, changed:false, student:{…}}` — no history row, no poke |
| Manual guard trips | **409** | `{ok:false, reason:"manual_change_recent"}` |
| Selector malformed/missing | 400 | `{ok:false, reason:"invalid_input"}` |
| Selector matches >1 student | 409 | `{ok:false, reason:"ambiguous"}` |
| No match | 404 | `{ok:false, reason:"not_found"}` |

#### `GET ?action=find&phone=<any format>`
Key-gated. Phone normalized (fail → `400 invalid_input, field:"phone"`).
`200 {ok:true, phone:"<E.164>", students:[Student,…]}` — may be empty; **every** student sharing the phone is returned (no ambiguity error on find). URL-encode `+` as `%2B`.

#### `GET ?action=branches`
Key-gated. `200 {ok:true, branches:[{id:"<uuid>", name:"<string>"},…]}` ordered by name. All branches, no filtering.

#### `GET ?action=roster`
Key-gated, read-only. Weekly roster snapshot ordered by `id`.
Query: `status` = `active` (default) | `frozen` | `left` | `all`; `limit` 1..1000 (default 1000); page with `offset` **or** `after_id` (keyset: pass the previous page's `next_after_id`; combining a non-zero `offset` with `after_id` → `400 field:"after_id"`).
`200 {ok:true, as_of:"<ISO>", status, total, limit, offset, after_id, next_after_id, students:[RosterRow,…]}` — `total` = exact count for the status filter (independent of the page); `next_after_id:null` = last page.
`RosterRow = {student_id, student_code, full_name, status, branch_id, branch_name, trainer_id, trainer_name, stage_id, stage_name, current_rank, student_created_at}`.

#### `GET ?action=rank_history`
Key-gated, read-only. Append-only rank (razryad) change log ordered by `changed_at, id`.
Query: `student_id` | `student_code` (optional; mismatch → `400 student_id_code_mismatch`, unknown code → `404`); `from` (inclusive) / `to` (exclusive) — ISO date (`2026-10-19` = 00:00 UTC) or date-time with an explicit offset (`…T00:00:00+05:00`, URL-encode `+` as `%2B`); zone-less times, impossible dates or `to` ≤ `from` → `400 invalid_input` with `field`. `limit` 1..1000 (default 1000), `offset` ≥ 0.
`200 {ok:true, as_of, student_id, from, to, total, limit, offset, rank_changes:[RankChange,…]}`.
`RankChange = {rank_change_id, student_id, student_code, previous_rank, new_rank, changed_at, changed_by_id, changed_by_name, source, source_derived, trainer_id_at_change, trainer_name_at_change, trainer_attribution}`.

#### Rank tracking — interpretation rules (read before computing metrics)
1. **`student_created_at` ≠ training start.** It is when the DB row was created; 522 students were bulk-imported in 2025-11. Never use it as a start date or for tenure.
2. **History starts 2026-05-18.** No rank change before that date was recorded. A student whose current rank has no event simply earned it earlier — do not treat it as missing data or as earned in your window.
3. **Downgrades exist.** Corrections such as `3rd → none` or `2nd → 3rd` are real rows. A promotion is `rank_order(new_rank) > rank_order(previous_rank)` with order `none < 4th < 3rd < 2nd < 1st < kms`; never count every row as a promotion.
4. **Ranks are never null** — no rank is the explicit value `none`.
5. **`trainer_attribution`**: `event_time` = coach who held the student at the change (one save changing coach + rank credits the **previous** coach); `derived_audit_log` = reconstructed from the coach-change audit log (rows before migration 099); `unknown` = no evidence. **Unknown trainer ≠ conversion / churn signal** and must not be replaced with the student's current trainer.
6. **`source`**: `admin_ui`, `coach_ui`, `api`, `tournament` (auto-promotion from a razryad tournament), `system`, or legacy `trigger` (origin unresolved). `source_derived:true` = derived after the fact, not captured at event time — treat as best evidence, not certainty.
7. **`stage_id`** is `students.current_level` (1–8) and `stage_name` its label `"Ступень N"` — there is no stage table and no stage history.
8. **`changed_by_name`**: coach name for coach accounts, staff email otherwise, `null` for deleted / unknown users.

#### Anything else
Any other method/action (with a valid key) → `404 {ok:false, reason:"not_found"}`.

### 4.7 The 3-day manual guard (exact logic)
Applied before **every** status write (freeze, activate, create-time reactivation — but not plain create):
1. Fetch the single most recent `student_status_history` row for the student **where `changed_by_type` IS NOT NULL**, ordered by `created_at` desc.
2. Refuse iff that row has `changed_by_type === 'manual'` **and** it is less than **exactly 3 days** (3 × 24h) old.
3. Only the latest typed row matters — a newer `'api'`/`'system'` row shadows an older manual one.

**Rationale (hard product rule): coaches win over automation.** If a coach manually set a status within 3 days, the API refuses to override. **Correct agent handling: retry after the window, or escalate to a human. Never treat as a transient error and hammer-retry.**

### 4.8 Error taxonomy (students-api)
All errors: `{ok:false, reason:"…"}` (+ optional `field` on invalid_input).

| reason | HTTP | Trigger | Agent action |
|---|---|---|---|
| `unauthorized` | 401 | missing/wrong `x-api-key` | fix key; do NOT retry same request |
| `invalid_input` | 400 | bad JSON body; bad field (see `field`); bad selector; bad `?phone=` | fix the named field; do not retry unchanged |
| `invalid_branch` | 400 | well-formed UUID but no such branch | re-fetch `?action=branches`, pick a valid id |
| `ambiguous` | 409 | phone/amocrm selector matches >1 student | switch to `student_id` selector (use `find` to list candidates) |
| `not_found` | 404 | freeze/activate selector matches 0 students; or unknown route | verify the student exists (`find`); check action spelling |
| `manual_change_recent` | 409 (freeze/activate) / inside 200 body (create-reactivation) | 3-day manual guard | wait out the window or escalate to human |
| `server_error` | 500 | unexpected server error | safe to retry once with backoff; then escalate |

### 4.9 Side effects
- **`students`**: insert on create; status UPDATE on freeze/activate/reactivation.
- **`student_status_history`**: insert on every actual status write — `{student_id, old_status (null on create), new_status, changed_by_type:'api', source:'students-api'}`. The row's `id` is returned as `status_history_id` for auditing. No-ops write nothing. (Dashboard manual changes write `changed_by_type:'manual'`, `source:'dashboard'`.)
- **Chesster poke** (after every successful freeze/activate/reactivation): POST to the Chesster platform's freeze-thaw sync endpoint, 4s timeout. Reported as `chesster_poke`: `"ok"` (2xx) / `"skipped"` (sync token unset or status not active/frozen) / `"failed"` (non-2xx, network error, timeout). The poke never fails the API response; an hourly reconcile cron is the safety net. **Agents: `chesster_poke:"failed"` is informational, not an error — do not retry the status change because of it.**
- **Never touched:** `student_time_slot_assignments` — automated slot moves are blocked at the DB level by design.

### 4.10 Student object shape (all students-api responses)
```json
{
  "id": "<uuid>",
  "name": "<first_name last_name, trimmed>",
  "first_name": "string",
  "last_name": "string",
  "status": "active | frozen | left | …",
  "branch_id": "<uuid> | null",
  "branch": "<branch name> | null",
  "amocrm_customer_id": 123456,
  "phone": "<parent_phone as stored> | null"
}
```
`phone` echoes the stored value verbatim (not re-normalized on read). This API only ever writes statuses `active`/`frozen`; `left` exists in the DB but is never set here.

---

## 5. Tournaments API — `tournaments-api`

**Purpose:** public registration API for Chess Empire tournaments (Telegram/WhatsApp bots, online-students site, public tournaments page). Routes on URL **path** + method (unlike students-api's `?action=`). Also proxied at `https://app.chessempire.kz/api/tournaments-api/<path>`.

### 5.1 Authentication
- Key-gated routes validate `x-api-key` against env `CHESS_EMPIRE_API_KEY` (single key — **a key registered only in `CHESS_EMPIRE_WRITE_KEY` will NOT work here**).
- **Open (no auth):** `GET /openapi.json`, `GET /branches`, `GET /tournaments`, `GET /tournaments/:id`, `GET /tournaments/:id/registrations`, `GET /students/search`.
- **Key-gated:** `POST /tournaments/:id/register`, `DELETE /registrations/:registration_id`, `GET /students/:student_id/registrations`.
- Optional header `x-source` on register: one of `web`, `telegram`, `whatsapp`, `online`, `admin` (lowercased); anything else/absent → `web`.

### 5.2 Endpoints

#### `GET /branches` — public
Branches **excluding** names ILIKE-matching `%НИШ%`, `%zhandosova%`, `%online%`; ordered by name.
`200 {ok:true, branches:[{id, name, address}]}` — `address` is the DB `location` column renamed.

#### `GET /tournaments?branch_id=<uuid>&upcoming=<bool>` — public
- `upcoming` defaults to **true** when absent; only the literal string `"true"` is true when present (`upcoming=false` to see past tournaments). When true: `tournament_date >= today (UTC)`.
- `branch_id`: optional equality filter (not UUID-validated; malformed → 500).
- Ordered `tournament_date` ascending.

`200 {ok:true, tournaments:[{id, branch_id, branch:{id,name}|null, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status, registered_count}]}`

#### `GET /tournaments/:id` — public
`id` must be UUID → else `400 invalid_input`. Unknown → `404 not_found`.
`200 {ok:true, tournament:{…, registered_count}}` (⚠️ the inline openapi spec wrongly documents a bare Tournament object — the real body is wrapped).

#### `GET /tournaments/:id/registrations` — public roster
`200 {ok:true, registrations:[{id, source, registered_at, display_name}]}` ordered `registered_at` asc. `display_name` = linked student's name or the free-text `player_name`. **`external_contact` is never returned** (privacy).

#### `GET /students/search?q=<string>&limit=<int>` — public autocomplete
- `q`: required, ≥2 chars after trim → else `400 invalid_input`. `%`/`_` escaped.
- `limit`: default 8, clamped [1, 20].
- Matches first/last name ILIKE, **status in (`active`,`frozen`) only** (`left` excluded), ordered `last_name` asc.

`200 {ok:true, students:[{id, name, branch:<name|null>, current_rating:<int|null>}]}`

#### `GET /students/:student_id/registrations` — **key-gated**
`200 {ok:true, registrations:[{id, tournament_id, registered_at}]}` — empty array for unknown student (no 404).

#### `POST /tournaments/:id/register` — **key-gated**
Body fields:

| Field | Rule |
|---|---|
| `student_id` | **Exactly one** of `student_id`/`player_name` must be non-empty — both or neither → `400 invalid_input`. Must be UUID if given. |
| `player_name` | free-text walk-in name (trimmed) |
| `external_contact` | optional; stored, never exposed on the public roster |

**Success:** `200`
```json
{"ok":true, "registration_id":"<uuid>", "registered_count":<int incl. this one>,
 "capacity":<int>, "status":"open"|"closed",
 "tournament":{"id","name","date","start_time","time_format"}}
```
If this registration fills the tournament, its status flips to `closed` automatically.

**Failure passthrough** (body `{ok:false, reason, …extras}`):

| reason | HTTP | Trigger |
|---|---|---|
| `invalid_input` | 400 | exclusivity violation / empty name |
| `not_found` | 404 | no such tournament |
| `closed` | 409 | tournament not open (closed or cancelled) |
| `full` | 409 | at capacity (also auto-closes); extras: `registered_count`, `capacity` |
| `duplicate` | 409 | student already registered in this tournament |
| `ineligible` | 409 | league mismatch (A+/A/B/C league tournaments check student rating-derived league); extras: `student_rating`, `student_league`, `tournament_league` |
| `no_razryad` | 409 | titled (`R`) tournament and student has no razryad |
| `deadline_passed` | **500** ⚠️ | registration deadline passed (also auto-closes). Unmapped at the edge → falls through to 500, but the body still carries `reason:"deadline_passed"` — **parse the body, don't trust the 500** |
| `level_too_low` | **500** ⚠️ | League C with `current_level < 2`; same fall-through; extras `student_level`, `required_level:2` |

#### `DELETE /registrations/:registration_id` — **key-gated**
UUID required → else 400. Unknown → `404 not_found`.
Deletes the registration; if the tournament was `closed` and now has free capacity, it flips back to `open` (a `cancelled` tournament is never reopened). Success: `200 {"ok":true}`.

### 5.3 Side effects
- `tournament_registrations`: insert on register, delete on cancel.
- `tournaments.status`: `closed` when full/deadline passed; `closed → open` when a seat frees up.
- No status-history writes, no Chesster poke — those belong to students-api.

---

## 6. Read API — the 9 `analytics-*` functions

### 6.0 Shared conventions (all 9)

- **Auth:** `x-api-key` matching `CHESS_EMPIRE_API_KEY` or `CHESS_EMPIRE_READONLY_KEY`. Failure → `401 {"success":false,"error":"Unauthorized"}`.
- **Method:** no method check (OPTIONS aside) — **all parameters are read from the URL query string only; request bodies are ignored. Use GET.**
- **Envelope:** `{"success":true,"data":…}` + optional `count`/`meta` on success; `{"success":false,"error":"…"}` on failure.
- **Common errors:** unknown `action` → `400 "Invalid action. Use: <list>"`; DB/runtime error → `500` (error is a *string* everywhere except `analytics-tournaments`, where it's an *object* — see §6.8).
- **Numeric params:** `parseInt` with **no NaN guard** — a non-numeric `limit`/`offset`/`days` breaks range math and surfaces as 500. Always pass integers.
- **Dates:** `from`/`to` passed verbatim to `gte`/`lte`. Use `YYYY-MM-DD` for date columns, ISO timestamps for timestamp columns. No timezone handling — "today" computations are **UTC**.
- **Side effects: none.** All 9 are pure reads.
- ⚠️ **1000-row cap:** several aggregate actions scan tables unpaginated and silently cap at PostgREST's 1000-row default. Flagged per-action below — treat those stats as approximate on large data and narrow with `from`/`to`.

### 6.1 `analytics-attendance`
Attendance records: list, per-student rates, summaries, low-attendance alerts, calendar.

**Actions:** `list` (default), `rates`, `summary`, `alerts`, `calendar`.

**`action=list`** — raw rows joined with student names.
Params: `limit` (100), `offset` (0), `branch_id`, `schedule_type`, `student_id`, `coach_id`, `status`, `from`, `to` (on `attendance_date`). Sorted `attendance_date` desc.
```json
{"success":true,"data":[{…attendance cols…,"students":{"first_name":"…","last_name":"…"}}],
 "count":1234, "meta":{"limit":100,"offset":0}}
```
`count` = total matching rows, not page size.

**`action=rates`** — per-student attendance rate for one branch.
Params: `branch_id` (**required** → else 400 `"branch_id required"`), `schedule_type`, `from`, `to`.
```json
{"success":true,"data":[{"student_id":…,"total":20,"present":18,"rate":90.0}],"count":15}
```
Sorted by `rate` desc; `rate` = present/total×100, 1 decimal. ⚠️ `student_id` passes through `parseInt` — if IDs are UUIDs it's `NaN`; don't rely on it here.

**`action=summary`** — aggregate counts.
Params: `branch_id`, `year`+`month` (only applied if both given).
```json
{"success":true,"data":{"total_records":500,"unique_students":80,
 "by_status":{"present":400,"absent":100},"by_schedule":{"mon_wed":300,"unknown":5},
 "attendance_rate":80.0}}
```

**`action=alerts`** — students below a rate threshold.
Params: `branch_id` (**required**), `threshold` (default 70), `from`, `to`.
```json
{"success":true,"data":[{"student_id":…,"total":10,"present":5,"rate":50.0,"student_name":"Ivan Petrov"}],
 "count":3,"meta":{"threshold":70}}
```
Sorted `rate` asc (worst first); only rows with `rate < threshold`. `student_name` falls back to `"Unknown"` silently on lookup failure.

**`action=calendar`** — month view grouped by date.
Params: `branch_id`, `year`, `month` (**all required** → else 400 `"branch_id, year, month required"`), `schedule_type`.
```json
{"success":true,
 "data":{"2026-10-01":[{"attendance_date":"2026-10-01","student_id":"…","status":"present","schedule_type":"mon_wed","time_slot":0}]},
 "total_records":120}
```
⚠️ Uses `total_records` at top level, not `count`.

**Quirks:** `rates`/`summary`/`alerts`/`calendar` are unpaginated (1000-row cap); `limit`/`offset` only affect `list`.

### 6.2 `analytics-audit`
Change-history records from `audit_log`.

**Actions:** `list` (default), `entity`, `recent`, `stats`.

**`action=list`** — params: `limit` (100), `offset` (0), `entity_type`, `entity_id`, `changed_by_email`, `action_filter` (matches the audit `action` column — renamed to avoid colliding with the routing param), `from`/`to` (on `changed_at`). Sorted `changed_at` desc. Envelope: `data` + `count` + `meta`.

**`action=entity`** — full history for one entity. `entity_type` + `entity_id` **required** → else 400. Same envelope as list.

**`action=recent`** — last `limit` (100) rows, no filters/offset. `count` = rows returned, not total.

**`action=stats`** —
```json
{"success":true,"data":{"by_action":{"create":120,"update":300},
 "by_entity_type":{"student":200},"by_user":{"admin@chessempire.kz":250},"total":450}}
```
⚠️ Unpaginated scan — **wrong once audit_log exceeds 1000 rows**. Treat as approximate.

### 6.3 `analytics-leaderboards`
Ranked boards: latest ratings, survival scores, bot-battle counts. **Default `limit` is 20 here (not 100); no `offset` anywhere.**

**`action=ratings` (default)** — latest rating per student, top-N.
Params: `limit` (20), `branch_id`.
```json
{"success":true,"data":[{"rank":1,"student_id":"uuid","rating":1850,"rating_date":"2026-10-01",
 "first_name":"…","last_name":"…","branch_id":"uuid","status":"active"}],"count":20}
```
⚠️ `branch_id` filters **after** the global top-N cut — a branch-filtered call can return fewer than `limit` rows. Inactive students are included; filter on the returned `status` yourself.

**`action=survival`** — best score per student. Params: `limit`, `mode`.
```json
{"success":true,"data":[{"rank":1,"student_id":"uuid","score":42,"mode":"blitz",
 "student":{"first_name":"…","last_name":"…","branch_id":"uuid"}}],"count":20}
```
`student` may be null.

**`action=bot_battles`** — battle count + max bot rating faced, ranked by count desc.
```json
{"success":true,"data":[{"rank":1,"student_id":NaN,"battles":15,"max_bot_rating":2200,
 "student":{…}}],"count":20}
```
⚠️ Top-level `student_id` is `parseInt` of a UUID → `NaN`; use the nested `student` object.

Underlying scans are capped (ratings: 5000 recent rows; survival/battles: 1000).

### 6.4 `analytics-schedule`
Resolved **current** class schedule — versioned/soft-deleted slot chains collapsed to the live version, with branch/coach names, weekday expansion, and active-student headcounts.

**Only `action=list` exists** (default). Params: `limit` (200), `offset` (0), `branch_id`, `coach_id`, `schedule_type` (one of `mon_wed`, `tue_thu`, `sat_sun`, `mon_wed_fri`, `wed_fri`).
```json
{"success":true,"data":[{
  "group_id":"uuid",            // logical slot id — stable across versions
  "slot_version_id":"uuid",     // current time_slots.id
  "group_name":"Anna Kim · 10:00–11:00",
  "branch_id":"uuid","branch_name":"Almaty Center",
  "coach_id":"uuid","coach_name":"Anna Kim",
  "schedule_type":"mon_wed","days":["monday","wednesday"],
  "start_time":"10:00:00","end_time":"11:00:00",
  "active_student_count":12
 }],"count":57,"meta":{"limit":200,"offset":0}}
```
- Only **active** students are counted; exclusions subtracted.
- ✅ Unlike the other functions, this one pages past the 1000-row cap internally — results are **complete**.
- "Today" (for version effectiveness) is computed in **UTC** — around midnight it may differ from Almaty local date.
- Sorted: branch_name, coach_name, start_time. `count` = total before pagination.

### 6.5 `analytics-sessions`
Admin-user login sessions (`user_sessions`).

**Actions:** `list` (default), `stats`, `detail`.

**`action=list`** — params: `limit` (100), `offset` (0), `user_email`, `status`, `device_type`, `from`/`to` (on `login_at`). Sorted `login_at` desc. Envelope: `data`+`count`+`meta`.

**`action=stats`** — whole-table (⚠️ 1000-row cap):
```json
{"success":true,"data":{"total_sessions":500,"unique_users":12,
 "avg_duration_minutes":23.4,"total_duration_minutes":11700,
 "by_device":{"desktop":300,"mobile":180,"unknown":20}}}
```

**`action=detail`** — `session_id` **required** → else 400; unknown → **404** `"Session not found"`.
```json
{"success":true,"data":{…session cols…,"actions":[{…session_actions cols…}]}}  // actions by created_at asc
```

### 6.6 `analytics-status`
Status-transition history (`student_status_history`) — **the verification surface for students-api writes**.

**Actions:** `history` (default), `transitions`, `freezes`, `stats`.

**`action=history`** — params: `limit` (100, uncapped), `offset` (0), `student_id`, `old_status`, `new_status`, `from`/`to` (on `changed_at`). Sorted `changed_at` **desc**.
```json
{"success":true,"data":[{…history cols…,"students":{"first_name":"…","last_name":"…"}}],
 "count":123,"meta":{"limit":100,"offset":0}}
```

**`action=transitions`** — counts per transition pair, whole table:
```json
{"success":true,"data":{"active → frozen":12,"frozen → active":9},"total":21}
```
⚠️ Key format is `"<old> → <new>"` with a literal U+2192 arrow and surrounding spaces — match exactly.

**`action=freezes`** — all freeze-related rows for one student. `student_id` **required** → else 400. Sorted `changed_at` **ascending** (⚠️ opposite of `history`). `{"success":true,"data":[…],"count":N}`.

**`action=stats`** — `{"by_transition":{…},"by_changer":{…},"total":N}` (null `changed_by` omitted). Whole-table scan.

### 6.7 `analytics-students`
Per-student analytics. ⚠️ **`student_id` is required for ALL actions** — a bare call returns `400 "student_id required"`.

**Actions:** `profile` (default), `ratings`, `achievements`, `ranking`, `progress_ranking`.

**`action=profile`** — bundle: student row (+branch/coach names), latest 20 ratings, 20 bot battles, 20 survival scores, 10 status-history rows (all newest-first). Unknown student → **404** `"Student not found"`. Sub-query errors are silently swallowed (empty arrays).
```json
{"success":true,"data":{"student":{…,"branches":{"name":"…"},"coaches":{"first_name":"…","last_name":"…"}},
 "ratings":[…],"bot_battles":[…],"survival_scores":[…],"status_history":[…]}}
```

**`action=ratings`** — rating rows since `now − days` (param `days`, default 365), oldest first.
```json
{"success":true,"data":[…],"count":14,
 "trend":{"first":800,"last":950,"change":150,"max":960,"min":790}}  // null if <2 rows
```
No 404 for unknown student — empty data, `trend:null`.

**`action=achievements`** — computed on the fly. Thresholds: ≥1/10/50 battles → Bot Slayer/Hunter/Destroyer; max bot rating ≥1500/2000 → Giant Slayer/Grandmaster Hunter; max survival ≥10/25 → Survivor/Endurance Master; latest rating ≥1000/1500 → Four Digits/Advanced Player.
`{"success":true,"data":[{"name":"…","description":"…"}],"count":N}` — no 404.

**`action=ranking`** — rating rank among **active** students, school + branch.
```json
{"success":true,"data":{"student_id":"uuid","rating":950,
 "branch_rank":3,"branch_size":25,"school_rank":17,"school_size":240}}
```
`rating`/ranks null if no ratings. Unknown student → 404. Ties share a rank. ⚠️ Expensive (pulls every active student's rating history) — expect latency; don't poll it.

**`action=progress_ranking`** — rank by `current_level` desc, `current_lesson` desc, then name. If student not in the active set (inactive or unknown — **no 404**): `{school_rank:null, school_size:N, branch_rank:null, branch_size:null}`. Ties broken alphabetically, not shared.

⚠️ 404 behavior is inconsistent by action: `profile`/`ranking` 404; `ratings`/`achievements`/`progress_ranking` return 200 with empty/null data.

### 6.8 `analytics-tournaments`
Two data generations in one function: legacy (`tournaments`/`tournament_participants`: `list`, `detail`, `student_history`, `branch_leaderboard`) and Phase-2 KPI (`tournaments_uploads`/`tournament_results`: `coach_leaderboard`, `coach_kpi_summary`, `school_kpi_summary`, `school_student_drilldown`). **Counts between the two families will not agree — that's by design.**

⚠️ **Unique quirk: 500 errors here carry an `error` OBJECT** (`{message, name/code, …}`), not a string. Handle both shapes.

**Window validation** (KPI actions): `window_start` & `window_end` both **required**, `YYYY-MM-DD`, start ≤ end. Failures → 400 with a specific message. `window_end` is inclusive through end-of-day UTC.

**`action=list` (default)** — params: `limit` (50, **capped 200**), `offset`, `league`, `branch_id`, `date_from`, `date_to`. Ordered `tournament_date` desc.
⚠️ **`branch_id` pagination trap:** filtering happens client-side AFTER pagination — `count` reflects the unfiltered total and a page may be empty while later pages have matches. Never treat an empty page as end-of-data when using `branch_id`.

**`action=detail`** — `tournament_id` required → 400; unknown → 404. Returns `{tournament, participants[]}`; participants ordered by `place` asc with `student_name` falling back to `raw_name`.

**`action=student_history`** — `student_id` required. Rows + aggregates:
```json
{"data":{"tournaments":[…],"aggregates":{"total":8,"ytd":3,"best_place":1,"avg_place":4,
 "total_rating_gained":120,"last_date":"2026-05-01"}},"count":8}
```

**`action=branch_leaderboard`** — `branch_id` + `league` **required**; `days` (default 90). Active students only; zero-place students excluded. Sorted `avg_place` asc.

**`action=coach_leaderboard`** — window required; `branch_id`, `league` (`B`/`C`/`R3`/`R4`; ⚠️ other values silently ignored, no error) optional. Composite score weights: participation 0.30, rating_delta 0.25, top3 0.20, promotion 0.15, razryad 0.10. "Active students" = status active AND `current_level >= 2`. Returns per-coach rows with `composite_score` (0–100), sub-metrics, and the weights object.

**`action=coach_kpi_summary`** — `coach_id` + window required; unknown coach → 404. Hero stats + per-student breakdown (sorted by `rating_gained` desc, includes zero-stat roster students). ⚠️ Uses the **legacy Phase-1 composite formula** — its `composite_score` is NOT comparable to `coach_leaderboard`'s.

**`action=school_kpi_summary`** — window required; `branch_id`, `league` optional (⚠️ only `B`/`C` honored here — `R3`/`R4` silently ignored, though echoed back in the response). School-wide hero numbers: participation %, totals, promotions (distinct students), new razryads (distinct earners). `total_results` includes `games_played=0` rows; all other played-based metrics exclude them.

**`action=school_student_drilldown`** — `metric` **required**: one of `active_players`, `top3`, `new_razryads`, `promotions`; window required; `coach_id` (wins over `branch_id`), `branch_id`, `league` optional. Returns the row list behind each hero number:
- `active_players`: one row per distinct student with ≥1 rated game (matches `active_players_count`), sorted by `rating_delta_total` desc.
- `top3`: one row per top-3 **event** (a student can appear multiple times), date desc.
- `new_razryads`: one row per earned-razryad event, enriched from `razryad_history`.
- `promotions`: one row per **unique** student, latest promotion in window (matches `promotions_count`).

### 6.9 `analytics-users`
Admin-user analytics (roles, sessions, audit counts). **Params:** `email` required for `summary`/`stats`; `from`/`to` apply to `stats` only.

- **`action=list` (default):** full `user_roles` dump, no pagination. `{data:[…],count:N}`.
- **`action=summary`:** lifetime per-user: `{email, total_sessions, last_session, total_actions, total_duration_minutes}`. Unknown email → 200 with zeros/nulls (no 404).
- **`action=stats`:** windowed: `{email, sessions, avg_duration, total_duration, by_device:{…}, audit_actions:{…}, total_audits}`.

Email matching is exact and case-sensitive. ⚠️ `summary` for a user with very many sessions can 500 (URL-length limit on the internal query).

---

## 7. Error taxonomy — what to do per error

### HTTP status → first reflex

| Status | Meaning here | Agent action |
|---|---|---|
| 400 | your input is wrong (missing/invalid param, bad body) | read `error`/`reason` (+`field`), fix, retry once with corrected input |
| 401 | key missing/wrong/not registered for this surface | check header name is `x-api-key`; check you're on the right surface (§2); **never** retry unchanged; never fall back to `/rest/v1/*` |
| 404 | entity or route doesn't exist | verify ids via find/search/list actions; check action/path spelling |
| 409 | business-rule conflict (see below) | branch on `reason` — these are **not** transient; blind retries will loop forever |
| 500 | server error — **but check the body first** | tournaments register can 500 with meaningful `reason` (`deadline_passed`, `level_too_low`) — handle those as 409-class. True `server_error`: one retry with backoff, then escalate |

### 409-class reasons (write surfaces)

| reason | Where | What it means | Correct handling |
|---|---|---|---|
| `ambiguous` | students-api | phone/amocrm selector hit >1 student | resolve via `find`, switch to `student_id` |
| `manual_change_recent` | students-api | coach changed status manually <3 days ago | **wait out the window or escalate to a human** — product rule, not an error |
| `duplicate` | tournaments | student already registered | treat as success-equivalent (idempotency) |
| `closed` / `full` | tournaments | tournament not accepting | report to user; don't retry |
| `ineligible` / `no_razryad` | tournaments | league/title rules | report with the extras fields; don't retry |

### Envelope reminder
- analytics: `{"success":false,"error":<string, EXCEPT analytics-tournaments where 500s carry an object>}`
- students/tournaments: `{"ok":false,"reason":<enum string>}` (+ `field` on invalid_input, + extras on some tournament 409s)
- ⚠️ students-api create: a guard-blocked reactivation is `200 {"ok":true,…,"reactivated":false,"reason":"manual_change_recent"}` — success status, embedded refusal. Always check the body.

---

## 8. Agent behavior rules

1. **Never call `/rest/v1/*`.** It will 401 forever with your key. By design. (§1)
2. **Don't guess endpoints.** Both write-surface functions self-document: `GET {BASE}/students-api` and `GET {BASE}/tournaments-api/openapi.json` (both public). Fetch those instead of inventing paths — but prefer this manual where they disagree (Appendix A).
3. **Create is idempotent on the Buyer ID — retries are safe.** Always send `amocrm_customer_id`; a replay returns the same student. Two Buyer IDs sharing one phone are two students (siblings). `409 ambiguous` on create means a human must pick from `candidates`.
4. **Status codes lie twice; bodies don't.** (a) create-time guard refusal = HTTP 200 with `reactivated:false`; (b) tournament `deadline_passed`/`level_too_low` = HTTP 500 with a meaningful `reason`. Parse bodies always.
5. **`manual_change_recent` is a product rule, not an error.** A coach's manual decision beats automation for 3 days. Schedule a retry after the window or hand off to a human. Never hammer-retry.
6. **`chesster_poke:"failed"` is informational.** The status change itself succeeded; a reconcile cron fixes the downstream sync. Do not re-issue the status change.
7. **Never invent test records in production without human confirmation.** If you must verify connectivity, use non-mutating calls: `?action=branches`, `?action=find`, any analytics GET.
8. **Prefer `student_id` as a selector** once known (from create/find responses) — it can never be `ambiguous`.
9. **Always pass clean integers** for `limit`/`offset`/`days`/`threshold` — the analytics functions have no NaN guards and will 500 on garbage.
10. **Treat whole-table "stats" actions as approximate** past 1000 rows (`analytics-audit stats`, `analytics-sessions stats`, attendance aggregates). For exact numbers use filtered `list` actions with `count`.
11. **Audit trail:** every write returns `status_history_id`. Log it. Verification query: `analytics-status?action=history&student_id=<uuid>` — your writes appear with `changed_by_type:"api"`, `source:"students-api"`.
12. **Rate expectations:** no explicit rate limit in the functions, but they share one small Supabase project — keep it to a few requests/second, batch where possible, and back off on 500s.
13. **Don't probe the internal functions** (§10). They are not for integrations; `send-invitation` in particular must never be called.

---

## 9. Data model cheat sheet

### Student (students-api shape — see §4.10)
`id` (uuid) · `name` · `first_name` · `last_name` · `status` · `branch_id` · `branch` (name) · `amocrm_customer_id` (int|null) · `phone` (stored `parent_phone`, verbatim)

**Statuses:** `active`, `frozen` (the only two the write API sets), `left` (exists in DB; excluded from tournament search; never set via API). New students also get `razryad:'none'`, `current_level:1`, `current_lesson:1`, `total_lessons:120`.

### Branch
`{id: uuid, name: string}` from students-api; tournaments-api adds `address` (= DB `location`). ~8 branches (Almaty). Always fetch fresh — never hardcode UUIDs.

### student_status_history (as seen in analytics-status / returned ids)
`id` (uuid, = `status_history_id`) · `student_id` · `old_status` (null on create) · `new_status` · `changed_by_type` (`api` | `manual` | `system` | null legacy) · `source` (`students-api` | `dashboard` | …) · `changed_at` / `created_at`

### Tournament
`{id, branch_id, branch, name, info, tournament_date (YYYY-MM-DD), start_time, time_format, registration_fee, rounds, capacity, status: open|closed|cancelled, registered_count}`. DB-only gating fields (not returned): `league` (null|`A+`|`A`|`B`|`C`|`R`), `registration_deadline`.

### Registration (public roster)
`{id, source: web|telegram|whatsapp|online|admin, registered_at, display_name}` — `external_contact` never exposed.

### Selectors accepted by students-api
`student_id` (uuid, unambiguous) > `amocrm_customer_id` (int) > `phone` (E.164 or legacy KZ format, exact match; may be shared by siblings → ambiguous).

---

## 10. Internal endpoints — DO NOT CALL

These three functions exist in the same project but are **not** part of any integration surface. Do not call, probe, or retry them.

| Function | Auth | Purpose |
|---|---|---|
| `complete-registration` | invitation token possession | finishes coach onboarding (creates auth user, assigns coach role). Internal to the registration page. |
| `delete-user` | admin Supabase JWT | admin-only hard delete of an auth user. Internal to the admin dashboard. |
| `send-invitation` | ⚠️ no in-code auth | mints a coach invitation URL. **Absolutely never call this** — it has no key check in code and calling it creates real invitations. |

An agent calling any of these is a policy violation, not an integration path.

---

## Appendix A. Known README/spec discrepancies

Found during source extraction (2026-10-09). **Code wins in every case.**

1. **Tournaments error enum incomplete in README-API.md:** README lists `unauthorized|not_found|closed|full|duplicate|invalid_input|server_error`; code also emits `ineligible`, `no_razryad`, `guests_admin_only`, and the RPC can emit `deadline_passed`, `level_too_low`, `duplicate_guest` (those three fall through to HTTP 500 at the edge with the reason preserved in the body).
2. **`x-source` values:** README says `telegram|whatsapp|online|web`; code also accepts `admin` (anything else → `web`).
3. **README's top-of-file auth note** ("All endpoints require `x-api-key` or `Authorization: Bearer <service_role>`") applies only to `analytics-*`. Neither students-api nor tournaments-api accepts a Bearer service-role header, and most tournaments-api reads are fully public.
4. **tournaments-api inline openapi.json** documents `GET /tournaments/{id}` 200 as a bare `Tournament` object; the handler actually returns `{ok:true, tournament:{…}}`. Its error enum also omits the three RPC fall-through reasons.
5. **Create-time guard refusal:** README implies 409 for every `manual_change_recent`; on the **create** path it is actually HTTP 200 `{ok:true, existing:true, reactivated:false, reason:"manual_change_recent"}`.
6. **README's students-api create error list omits `invalid_branch`** as a distinct reason (code returns `400 {reason:"invalid_branch"}` for a well-formed but nonexistent `branch_id`).

---

*Manual generated from source on 2026-10-09. Regenerate after any edge-function deploy that changes a contract. Maintainer note: the per-function extraction lives in the function sources themselves — `supabase/functions/<name>/index.ts` is always the final authority.*
