# Grant ratings/tournament-upload permission to all coaches

**Date:** 2026-06-06
**Reporter:** Alex (preference, 2026-06-06 11:37 UTC)
**Severity:** Sev-4 — UX preference, not an incident
**Status:** Applied — migration 060 deployed via Supabase Management API on 2026-06-06.

---

## Why

After migration 058 unified `can_manage_ratings` and `can_manage_tournaments` and expanded the upload RLS to honor either flag, the Ratings Management menu finally worked for coaches who had the flag flipped. Only three coaches did: Maksut Kuanyshbekovich, Assylkhan Agbaevich, Vasily Mikhaylovich.

Alex's preference (2026-06-06 11:37 UTC): **every coach** should be able to upload tournaments and ratings, not just the three above. Granting case-by-case adds friction every time a new coach joins, and the flag is the right gate — we just want it on by default for the coach role.

## What changed — migration 060

Three parts, all confined to `user_roles`:

### 1. Backfill — every existing coach gets the flag

```sql
UPDATE user_roles
SET can_manage_ratings = true, updated_at = NOW()
WHERE role = 'coach'
  AND COALESCE(can_manage_ratings, false) = false;
```

The sync trigger from 058 (`sync_ratings_tournaments_permissions_trg`) fires on `UPDATE OF can_manage_ratings` and mirrors the value into `can_manage_tournaments` automatically. Only `role = 'coach'` rows are touched — `admin` and `viewer` rows are left alone.

### 2. Default-grant trigger — new coaches auto-receive the flag

```sql
CREATE TRIGGER default_coach_ratings_permission_trg
    BEFORE INSERT OR UPDATE OF role
    ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION default_coach_ratings_permission();
```

Function: when `NEW.role = 'coach'`, set both flags to `true` on the row. On INSERT this works in concert with the 058 sync trigger; on `UPDATE OF role` the sync trigger does **not** fire (role isn't in its column list), so we set both flags directly. Trigger name was chosen so it sorts alphabetically before `sync_ratings_tournaments_permissions_trg` and runs first.

### 3. Verification block

```sql
DO $$
DECLARE v_missing INT;
BEGIN
    SELECT COUNT(*) INTO v_missing
    FROM user_roles
    WHERE role = 'coach' AND COALESCE(can_manage_ratings, false) = false;
    IF v_missing <> 0 THEN
        RAISE EXCEPTION 'backfill failed: % coach rows still missing can_manage_ratings', v_missing;
    END IF;
END$$;
```

Wrapped in `BEGIN; ... COMMIT;` so a failed verification rolls everything back.

## Before / after

| State | Coaches with `can_manage_ratings = true` |
|---|---|
| **Before** (2026-06-06 pre-migration) | 3 of 16 |
| **After**  (2026-06-06 post-migration) | 16 of 16 |

`can_manage_tournaments` matches `can_manage_ratings` row-for-row (sync trigger from 058). `role = 'admin'` rows (count: 2) untouched.

## Live DB

Applied via Supabase Management API (project `papgcizhfkngubwofjuo`):

```
POST /v1/projects/papgcizhfkngubwofjuo/database/query
→ 201, body: []   (empty array = success)
```

Post-apply query: `SELECT count(*) FROM user_roles WHERE role = 'coach' AND COALESCE(can_manage_ratings, false) = false` → **0**.

## Tests

`tests/test-all-coaches-ratings-permission.js` — 26 assertions, all green:
- **Source-grep (13)** locks migration 060's backfill predicate, function/trigger definitions, verification block, and BEGIN/COMMIT wrapper.
- **Live (13)** runs against production via service role:
  - all existing coaches have both flags true,
  - inserting a fresh `role = 'coach'` row with both flags `false` ends with both `true`,
  - flipping a `role = 'viewer'` row to `role = 'coach'` flips both flags to `true`.
  Each live test creates a synthetic `auth.users` entry and tears it down — no production rows touched.

Regression check on all suites that touch `user_roles` / tournament uploads:

| Suite | Result |
|---|---|
| `test-tournament-upload-rls-permissions.js` (058) | 19/19 |
| `test-tournaments-admin.js` | 240/240 |
| `test-tournament-importer.js` | 15/15 |
| `test-tournament-upload-validation.js` | 11/11 |
| `test-tournament-upload-parser.js` | 41/41 |
| `test-tournament-parser.js` | 61/61 |
| `test-tournaments-api.js` | 157/157 |
| `test-coach-kpi-migrations.js` | 58/58 |
| `test-auth-helpers.js` | 23/23 |
| `test-time-slot-edit-zero-row-detection.js` | 24/24 |
| `test-admin-more-menu-completeness.js` | 73/73 |

`test-ratings-export-excel.js` crashes with `Invalid Workbook` on `xlsx.write()` — pre-existing failure on `main`, unrelated to this change.

## Risk

- **Additive.** The migration only flips a boolean from `false` to `true` on existing rows where `role = 'coach'`. No data loss possible.
- **Reversible.** A follow-up migration can drop `default_coach_ratings_permission_trg` and `UPDATE user_roles SET can_manage_ratings = false WHERE user_id IN (...)` to restore the prior state.
- **Trigger scope.** `default_coach_ratings_permission_trg` only touches `can_manage_ratings` / `can_manage_tournaments` and only when `NEW.role = 'coach'`. Won't interfere with admin / viewer writes or with App Access UI panels that toggle other permission flags.
- **Frontend unchanged.** `admin-v2.js:207` still gates the Ratings Management menu on `can_manage_ratings` — we deliberately did **not** touch that gate. Flipping the flag is sufficient because all 16 coaches now satisfy it.
- **Future App Access UI flips.** The App Access panel surfaces `can_manage_ratings` as a checkbox; admins can still un-check it for a specific coach (the 058 sync trigger keeps `can_manage_tournaments` aligned). The default-grant trigger only fires on INSERT or `UPDATE OF role`, so it won't fight subsequent manual flag-only changes.

## What's not in scope

- Per-coach revocation UI. Existing App Access checkbox already does this; no new UI needed.
- Granting upload access to `role = 'viewer'` rows. Out of scope — viewers are read-only by design.
- Touching the RLS predicates from 058. They already accept the flag — we're just making sure every coach has it.

## Related

- Migration 058 (`058_tournament_uploads_honor_ratings_permission.sql`) — RLS expansion + sync trigger this migration depends on.
- Ops: `ops/tournament-upload-rls-permission-mismatch-20260531.md` — the 058 incident this preference grew out of.
- `admin-v2.js` ratings menu gate at line ~207 (unchanged).
