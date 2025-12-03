# Coach Cannot Delete Students - RLS Policy Fix

## Problem

Coach `dysonsphere01@proton.me` is unable to delete students from the dashboard. When attempting to delete a student, the error message "Student not found" appears.

**Root Cause**: Missing or incorrect DELETE policy on the `students` table in Supabase RLS (Row Level Security).

## Error Screenshot Analysis

From the screenshot:
- User: `dysonsphere01@proton.me` (Coach)
- Error: "Student not found" (red notification in top-right)
- Action: Attempting to delete a student
- Console shows: Students array has 345 items
- The delete operation is being blocked by RLS policies

## Issue Diagnosis

### Current RLS Policies on Students Table:

✅ **SELECT Policy** - Coaches can view students
✅ **INSERT Policy** - Coaches with `can_edit_students = true` can add students
✅ **UPDATE Policy** - Coaches with `can_edit_students = true` can edit students
❌ **DELETE Policy** - MISSING or INCORRECT

### Expected Behavior:

Coaches with dashboard access and `can_edit_students = true` should be able to:
1. ✅ View students (SELECT) - Working
2. ✅ Add students (INSERT) - Working (fixed previously)
3. ✅ Edit students (UPDATE) - Working (fixed previously)
4. ❌ Delete students (DELETE) - NOT WORKING

## Solution

Add a DELETE policy to the `students` table that matches the logic of the UPDATE policy.

### DELETE Policy Logic:

Allow deletion if ANY of these conditions are true:
1. User is an **Admin** (`role = 'admin'`)
2. User is a **Coach** with `can_edit_students = true` AND their assigned students (`coach_id` matches)
3. User is a **Coach** with `can_edit_students = true` AND no specific coach assignment (`coach_id IS NULL`)

This matches the requirement: **"Coaches that have access to the Dashboard must be able to add/edit/delete any student"**

## SQL Fix

Run this SQL in Supabase SQL Editor:

```sql
-- Drop existing DELETE policy if exists
DROP POLICY IF EXISTS "Authorized users can delete students" ON students;

-- Create DELETE policy with same logic as UPDATE
CREATE POLICY "Authorized users can delete students"
    ON students FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                -- Admins can delete any student
                ur.role = 'admin'
                -- Coaches with edit permission can delete their own students
                OR (ur.can_edit_students = true AND students.coach_id = ur.coach_id)
                -- Coaches with edit permission and no specific coach assignment can delete any
                OR (ur.can_edit_students = true AND ur.coach_id IS NULL)
            )
        )
    );
```

## Verification Steps

### 1. Run the Fix SQL

Execute [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql) in Supabase SQL Editor.

### 2. Verify Coach Permissions

Execute [VERIFY_COACH_PERMISSIONS.sql](VERIFY_COACH_PERMISSIONS.sql) to check coach's permissions:

```sql
SELECT
    u.email,
    ur.role,
    ur.can_edit_students,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✓ Can delete all'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✓ Can delete all'
        WHEN ur.can_edit_students = true THEN '✓ Can delete own students'
        ELSE '✗ Cannot delete'
    END as delete_permission
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'dysonsphere01@proton.me';
```

Expected result for `dysonsphere01@proton.me`:
- `can_edit_students`: `true`
- `coach_id`: `NULL` (can manage all students)
- `delete_permission`: "✓ Can delete all"

### 3. Test Deletion

1. Log in as coach `dysonsphere01@proton.me`
2. Go to Students Dashboard
3. Click the delete (trash) icon on any student
4. Confirm deletion
5. Student should be successfully deleted ✅

## Related Files

- **[FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql)** - SQL script to add DELETE policy
- **[VERIFY_COACH_PERMISSIONS.sql](VERIFY_COACH_PERMISSIONS.sql)** - Verification queries
- **[FIX_STUDENT_UPDATE_RLS.sql](FIX_STUDENT_UPDATE_RLS.sql)** - Previous UPDATE policy fix (reference)

## Technical Details

### RLS Policy Structure

**USING Clause for DELETE**:
- Determines which rows can be deleted
- Evaluates BEFORE the delete operation
- If returns `false`, delete is blocked with "Student not found" error

**Policy Evaluation Flow**:
```
1. User clicks delete button
   ↓
2. Frontend calls deleteStudent(id)
   ↓
3. Supabase receives DELETE FROM students WHERE id = ?
   ↓
4. RLS evaluates USING clause:
   - Check if auth.uid() exists in user_roles
   - Check if user is admin OR has can_edit_students = true
   - Check coach_id match (if applicable)
   ↓
5. If USING returns true: ✅ Delete succeeds
   If USING returns false: ❌ "Student not found" error
```

### Why "Student not found" Error?

When RLS blocks a DELETE operation:
- Supabase doesn't reveal that the row exists (security feature)
- Returns as if the student doesn't exist
- This prevents information leakage about data existence

## Complete RLS Policy Set (After Fix)

### Students Table Policies:

1. **SELECT (Read)**: All authenticated users can view students
2. **INSERT (Create)**: Admins + Coaches with `can_edit_students = true`
3. **UPDATE (Edit)**: Admins + Coaches with `can_edit_students = true`
4. **DELETE (Delete)**: Admins + Coaches with `can_edit_students = true` ✅ FIXED

## User Requirement

> "Coaches that have access to the Dashboard must be able to add/edit/delete any student"

### How This Fix Satisfies the Requirement:

✅ **Add students**: INSERT policy allows coaches with `can_edit_students = true`
✅ **Edit students**: UPDATE policy allows coaches with `can_edit_students = true`
✅ **Delete students**: DELETE policy allows coaches with `can_edit_students = true` (NEW)

All three operations use consistent logic:
- Admins have full access
- Coaches with `can_edit_students = true` have full access
- Respects coach assignment if `coach_id` is set

## Deployment Checklist

- [x] Create FIX_STUDENT_DELETE_RLS.sql
- [x] Create VERIFY_COACH_PERMISSIONS.sql
- [x] Document the issue and fix
- [ ] **Run SQL fix in Supabase SQL Editor**
- [ ] Verify coach permissions with verification query
- [ ] Test delete functionality as coach
- [ ] Confirm error no longer appears

## Post-Fix Testing

After applying the SQL fix, test these scenarios:

### Scenario 1: Coach Deletes Student
1. Login as `dysonsphere01@proton.me`
2. Navigate to Students Dashboard
3. Click delete on student "test test"
4. Confirm deletion
5. **Expected**: Student deleted successfully ✅

### Scenario 2: Coach Deletes Multiple Students
1. Delete another student
2. Check that stats update correctly (Total Students count decreases)
3. **Expected**: All deletions work smoothly ✅

### Scenario 3: Admin Deletes Student
1. Login as admin user
2. Delete a student
3. **Expected**: Works as before ✅

## Future Considerations

If you want to restrict coaches to only delete their assigned students:
1. Set `coach_id` in `user_roles` to match the coach's ID in `coaches` table
2. Remove the `OR (ur.can_edit_students = true AND ur.coach_id IS NULL)` clause
3. This will limit coaches to only manage students where `student.coach_id = coach.id`

Current implementation allows coaches with dashboard access to manage ALL students (as per your requirement).

---

## Summary

**Issue**: Missing DELETE policy on students table
**Impact**: Coaches cannot delete students (error: "Student not found")
**Fix**: Add DELETE RLS policy matching UPDATE policy logic
**Result**: Coaches with `can_edit_students = true` can delete any student
**Status**: SQL fix ready, awaiting deployment to Supabase
