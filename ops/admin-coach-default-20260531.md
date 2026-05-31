# Admin coach auto-default for time-slot edit

**Date:** 2026-05-31
**Commit:** (this commit)
**Files:** `admin-v2.js` (populateAttendanceCoachDropdown)

## Problem

After commit `e6c1918` gated the edit-time-slot pencil on a specific coach
being selected, admins lost the ability to edit time slots in two scenarios:

1. **Single-coach branches** — the coach dropdown is hidden
   (`branchCoaches.length <= 1`). Admin literally cannot pick a coach via the
   UI. `attendanceCurrentCoach` stays at `'all'`, `attendanceCurrentCoachName`
   stays `null`, pencil disabled. Hard block.

2. **Multi-coach branches with default "All Coaches"** — admin lands in
   unified view. Pencil disabled with tooltip telling them to pick a coach.
   Discoverable in principle but UX friction.

User report (admin): "I am unable to edit the time slot."

## Fix

`populateAttendanceCoachDropdown` now auto-pins admins to a specific coach
so the edit pencil works without requiring a manual dropdown click:

- **Single-coach branches** (`branchCoaches.length === 1`):
  auto-set `attendanceCurrentCoach` to that one coach + sync the (hidden)
  `<select>` value. Admin sees the coach's calendar and can edit.

- **Multi-coach branches with admin where `attendanceCurrentCoach` is empty
  or `'all'`**: default to the first coach in `branchCoaches`. The
  "All Coaches" option remains in the dropdown — admin can opt in to the
  unified read-only view if they want, but the default is editable.

Branch-change flows (`onAttendanceBranchChange`, mobile equivalent) still
reset `attendanceCurrentCoach` to `'all'` for admins; the next
`populateAttendanceCoachDropdown` call re-applies the auto-default for the
new branch.

## Coach behavior — unchanged

Coaches stay locked to their own `coachId` via `attendanceRoleLock`:
- Single-coach branch: pinned to self, dropdown hidden.
- Multi-coach branch: dropdown shows only the branch's coaches (no "All"),
  default = self. Can switch to a peer for read-only view but
  `canEditCurrentSlots` returns false for peers (the
  `attendanceCurrentCoach === attendanceRoleInfo.coachId` check).

## Verification

Manual UI checks needed after deploy:

1. **Admin at multi-coach branch (Halyk Arena)** — default view shows first
   coach (e.g., Aibek). Pencil enabled. Click edits successfully.
2. **Admin at multi-coach branch + opts into "All Coaches" via dropdown** —
   pencil disabled with tooltip "Select a coach to edit time slots".
3. **Admin at single-coach branch (Zhandosova)** — dropdown hidden but
   coach is pinned. Pencil enabled. Click edits successfully.
4. **Coach Aleksandr at Halyk Arena** — pinned to self, dropdown shows only
   Halyk coaches with self as default. Pencil enabled for own slots.
5. **Coach switches dropdown to peer** — pencil disabled (only own table
   editable).

## Tests

- `test-time-slot-edit-zero-row-detection.js` — still passes (24/24)
- `test-attendance-role-lock.js` — still passes (128/128); admin "branch-aware
  coach filter preserves 'all'" test continues to pass because
  `resolveCoachFilter` semantics are unchanged. The auto-default happens
  downstream in `populateAttendanceCoachDropdown`, not in the role-lock layer.

## Out of scope

- The "All Coaches" view is now reset-on-refresh (admin must re-pick).
  Acceptable trade-off; the view is read-only by design and re-picking is
  one click. Persisting the choice would require distinguishing
  default-`'all'` from user-`'all'`.
