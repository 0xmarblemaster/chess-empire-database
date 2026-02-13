# Migration 028: Session Heartbeat + Audit Trail Linking

## What Changed

### 1. SQL Migration (`supabase/migrations/028_link_session_to_audit.sql`)
- **`set_session_context(UUID)`** — RPC function that stores the current session ID in a Postgres session variable (`app.current_session_id`)
- **`get_current_session_id()`** — Helper to safely retrieve the session variable
- **`fill_audit_session_id()`** — BEFORE INSERT trigger on `audit_log` that auto-fills `session_id` from the session variable
- **⚠️ MUST BE APPLIED MANUALLY** via Supabase SQL Editor (Dashboard → SQL → paste and run)

### 2. `supabase-data.js` — New Methods
- **`setSessionContext(sessionId)`** — Calls `set_session_context` RPC to set the Postgres session variable
- **`sessionHeartbeat(sessionId)`** — Updates `user_sessions.updated_at` + refreshes session context

### 3. `admin.html` — Session Tracking IIFE
- On page load: calls `setSessionContext()` immediately
- **Heartbeat**: every 5 minutes, updates `updated_at` and refreshes session context
- **Visibility API**: pauses heartbeat when tab is hidden, resumes when visible
- **beforeunload**: fire-and-forget `log_user_logout` via `fetch(keepalive)` on tab close

## How It Works
1. User logs in → `login.html` creates session, stores `currentSessionId` in sessionStorage
2. User navigates to `admin.html` → IIFE reads `currentSessionId`, calls `set_session_context` RPC
3. Any CRUD operation triggers audit_log INSERT → `trg_fill_audit_session_id` auto-fills `session_id`
4. Every 5 min: heartbeat updates `updated_at` + re-calls `set_session_context` (needed because Supabase uses connection pooling)
5. Tab close → best-effort logout via keepalive fetch; stale sessions cleaned by existing `close_stale_sessions()`

## To Apply
Run the SQL in `supabase/migrations/028_link_session_to_audit.sql` in the Supabase SQL Editor.
