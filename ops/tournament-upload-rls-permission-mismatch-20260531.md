# Tournament upload RLS / permission flag drift

**Date:** 2026-05-31
**Reporter:** Alex (Maksut hit the error in the Ratings Management dashboard)
**Severity:** Sev-3 — non-admin coaches with `can_manage_ratings` permission saw the UI but couldn't commit any upload
**Status:** Fixed — migration 058 + frontend rounds-lock + commit guard

---

## What the coach saw

Screenshot from a coach (avatar "M" — almost certainly Maksut Kuanyshbekovich, the only "M" with `can_manage_ratings`):

- Modal: **Тип импорта = Лига С** (League C)
- Rounds: **7**
- Top-right red banner: `new row violates row-level security policy for table "tournaments_uploads"`

## Two issues, one error message

### Primary cause: RLS predicate hard-coded `role = 'admin'`

`tournaments_uploads` / `tournament_results` / `rating_uploads` were created by migrations 039 / 041 with RLS policies that only let `role = 'admin'` INSERT:

```sql
USING (EXISTS (SELECT 1 FROM user_roles
               WHERE user_id = auth.uid() AND role = 'admin'))
```

But admin-v2.js gates the **Ratings Management menu** on `can_manage_ratings = true`:

```js
// admin-v2.js:207
if (userPermissions.can_manage_ratings) showRatingsManagementMenu();
```

Three coaches had `can_manage_ratings = true` but `role = 'coach'`. They saw the menu and the modal, but Postgres rejected every INSERT they tried.

### Secondary cause: rounds field stayed editable for fixed-kind tournaments

The rounds field in the import modal was always editable. When Maksut picked "League C" (6 fixed rounds) and typed 7, the value passed client-side validation. Had RLS not fired first, the CHECK constraint `tu_rounds_match_kind` would have rejected the row with a constraint error.

Postgres evaluates `WITH CHECK` predicates **before** CHECK constraints, so the RLS error masked the rounds error. Either bug alone is fatal — both were live.

## Why the round count didn't matter to the failure

User asked: "is this the rounds-mismatch error?" Answer: no. The visible error is RLS. Even with the correct **Rated Tournament** kind selected and 7 rounds — exactly what Maksut intended — the upload would have failed with the same RLS error. He never reached the constraint check.

## Affected users (as of pre-fix)

| User | Coach | Branch | Role | can_manage_ratings | can_manage_tournaments | Blocked? |
|---|---|---|---|---|---|---|
| Maksut Kuanyshbekovich | yes | — | coach | true | false | ✗ blocked |
| Assylkhan Agbaevich | yes | Debut | coach | true | false | ✗ blocked |
| Vasily Mikhaylovich | yes | — | coach | true | false | ✗ blocked |
| Alex | — | — | admin | true | true | ✓ ok |
| (other admin) | — | — | admin | true | true | ✓ ok |

## Fix — migration 058

Three parts:

### 1. Backfill the two flags so they agree

```sql
UPDATE user_roles SET can_manage_tournaments = true
  WHERE can_manage_ratings = true AND can_manage_tournaments IS NOT TRUE;
UPDATE user_roles SET can_manage_ratings = true
  WHERE can_manage_tournaments = true AND can_manage_ratings IS NOT TRUE;
```

### 2. Sync trigger on `user_roles` — flags stay equal on future writes

```sql
CREATE TRIGGER sync_ratings_tournaments_permissions_trg
    BEFORE INSERT OR UPDATE OF can_manage_ratings, can_manage_tournaments
    ON user_roles FOR EACH ROW
    EXECUTE FUNCTION sync_ratings_tournaments_permissions();
```

The function: toggling either flag flips the other to match. The UI only surfaces `can_manage_ratings` today — `can_manage_tournaments` exists from earlier work in migration 035 and is now kept in lockstep so any old code path stays consistent.

### 3. RLS expansion on the three upload tables

All three policies now accept admin **or** `can_manage_ratings` **or** `can_manage_tournaments`:

```sql
USING (EXISTS (SELECT 1 FROM user_roles
               WHERE user_id = auth.uid()
                 AND (role = 'admin'
                      OR can_manage_ratings = true
                      OR can_manage_tournaments = true)))
```

Same predicate on `tournaments_uploads`, `tournament_results`, and `rating_uploads`.

Coach SELECT policies unchanged (they already allowed any coach to read).

## Frontend — secondary defense

Two changes in `admin-v2.js`:

1. **`onCsvUploadKindChange` locks the rounds field** for fixed-kind tournaments (`league_c`, `league_b`, `razryad_4`, `razryad_3`) — sets both `readOnly = true` and `disabled = true`. The Rated Tournament option still leaves the field editable so the parser-derived `max(games_played)` flows in.
2. **`commitTournamentUpload` rejects mismatched rounds for fixed kinds** before the DB call — surfaces a clear toast (`admin.imports.roundsFixedMismatch`) instead of relying on the constraint error.

New i18n key `admin.imports.roundsFixedMismatch` in en/ru/kk.

## Verification

| Check | Result |
|---|---|
| Migration applied (Management API) | empty result array → success |
| `user_roles` flag sync | 5 rows with either flag set → all have both flags true |
| RLS predicate on 3 tables | all 3 use the expanded admin/ratings/tournaments OR |
| Sync trigger live | UPDATE on one flag flips the other (verified in rolled-back transaction) |
| Frontend tests | tournament-upload-rls-permissions: **19/19 pass** |
| Existing tournament suites | parser 41, validation 11, parser-legacy 61, importer 15, admin 240 — all green, zero regressions |
| Syntax check | admin-v2.js + supabase-data.js — clean |

## What Maksut sees after refresh

1. Open `app.chessempire.kz/admin#ratings` → Ratings Management menu visible (unchanged).
2. Click Import → pick **Rated Tournament** (or League C with the correct 6 rounds).
3. Upload Swiss-Manager export → rounds auto-fills from `max(Оцен.партии)` for rated, locks at 6 for League C, etc.
4. Commit → row inserts successfully. No more RLS error.

## What didn't ship

- **UI for `can_manage_tournaments`** as a separate checkbox. The trigger makes the second flag invisible in practice — granting/revoking `can_manage_ratings` from the App Access panel is enough to manage tournament permissions too. If we ever need different policies for the two flags later, a small UI addition is straightforward.
- **Server-side enum lock** of the round count per kind. The CHECK constraint already enforces this; doubling up at the trigger level is unnecessary noise.

## Risk

- RLS expansion is **additive**. Existing admin path unaffected; the 3 coaches gain INSERT access they already had UI for.
- Reversible: a future migration can re-narrow the predicate or drop the trigger.
- The trigger is `BEFORE` and only modifies the two named columns — won't interfere with other `user_roles` writes.

## Related

- Migration 039: `tournaments_uploads` + RLS (the predicate this fixes)
- Migration 041: `rating_uploads` + RLS (same predicate, same fix)
- Migration 035: introduced `can_manage_tournaments` flag (now synced via trigger)
- Migration 056: rated tournament kind (the variable-rounds path that exposed the locked-field UX bug)
