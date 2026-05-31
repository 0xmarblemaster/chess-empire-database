# Edit Time Slot Button — Gate on "Specific Coach Selected"

**Date:** 2026-05-31
**Reported by:** Alex (Kuroki)
**Symptom (browser console screenshot):**
> "This slot has no ID in the database (probably a fallback/reserve entry). Editing is currently unavailable."

## Root cause

`openEditTimeSlotModal` (`admin-v2.js`) refuses to open when `getTimeSlotIdForTime` returns
null. The cache key it builds is:

```
${branchName}|${coachName}|${scheduleType}|${monthKey}
```

When the admin filter has **no specific coach selected** ("All Coaches" or "Unassigned"),
`attendanceCurrentCoachName` is set to `null` (`admin-v2.js:6646-6650`, `6783-6784`). The
key collapses to `"halyk arena||mon_wed|2026-05"` — a key the cache never holds because
every cached row has a coach. Bucket lookup → `undefined` → `id` → `null` → alert.

Meanwhile `getTimeSlotsForBranch` quietly falls through to the hard-coded
`ATTENDANCE_TIME_SLOTS_HALYK` array, so the calendar renders 8 slots that *look* editable.
`canEditCurrentSlots()` returns `true` for any admin regardless of coach filter, so the
pencil button is shown — and clicking it triggers the alert.

This affects every branch + every admin in "All Coaches" / "Unassigned" mode.

## Data verified intact

- 322 total `time_slots` rows
- 42 unique `(branch, coach, schedule_type)` buckets
- 0 coach-branch pairs without time_slots rows
- 0 rows with NULL `coach_id` or NULL `branch_id`

This is a purely client-side fix. No migration needed.

## Fix (4 changes, single commit, no migration)

### Change 1 — Gate `canEditCurrentSlots()` on `attendanceCurrentCoachName`

```js
function canEditCurrentSlots() {
    if (!attendanceRoleInfo) return false;
    if (!attendanceCurrentCoachName) return false;   // ← new
    if (attendanceRoleInfo.isAdmin) return true;
    return !!attendanceRoleInfo.coachId
        && attendanceCurrentCoach === attendanceRoleInfo.coachId;
}
```

### Change 2 — Helper `editButtonHiddenReason()`

Reports `'admin_no_coach_selected'` for admins viewing "All Coaches" / "Unassigned" so the
calendar render code can surface a tooltip instead of just hiding the button silently.

### Change 3 — Disabled pencil w/ tooltip in calendar header

When the reason matches, render a faded, disabled pencil with the tooltip
`admin.attendance.editTimeSlot.selectCoachToEdit`. The action is discoverable; the
tooltip explains how to enable it. Coaches see no change.

### Change 4 — Cache-not-yet-loaded guard in `openEditTimeSlotModal`

```js
async function openEditTimeSlotModal(timeSlot) {
    const mk = _currentAttendanceMonthKey();
    if (TIME_SLOTS_CACHE === null || !TIME_SLOTS_CACHE_LOADED[mk]) {
        await loadTimeSlotsCache();
    }
    // ... resolve id, open modal ...
}
```

Prevents the alert from firing on a click during initial page load where the cache
hasn't finished loading yet.

## i18n strings added

- `en`: "Select a coach to edit time slots"
- `ru`: "Выберите тренера, чтобы редактировать слоты"
- `kk`: "Слоттарды өңдеу үшін жаттықтырушыны таңдаңыз"

## Verification

- `node --check admin-v2.js && node --check i18n.js` → `SYNTAX_OK`
- `tests/test-time-slot-edit-zero-row-detection.js` → 24 passed, 0 failed (unchanged)

## Out of scope (flagged)

- **Bulk edit across all coaches at a branch**: real workflow but doesn't exist today.
  Could be a separate feature.
- **`upsert_time_slot_versioned` RPC** as defensive fix for hypothetical cache misses
  where coach IS selected. Not needed today (data coverage verified); mirrors the
  `hide_student_versioned` migration 054 pattern if/when needed.

## Risk

- Frontend only. 1 file logic + 1 file i18n. Reversible by reverting commit.
- Behavior delta: admins in "All Coaches" mode no longer see a clickable pencil;
  see a disabled one with a tooltip instead. Specific-coach selections unchanged.
