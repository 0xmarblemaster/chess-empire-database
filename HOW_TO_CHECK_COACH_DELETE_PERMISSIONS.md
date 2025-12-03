# How to Check if a Coach Has Delete Permissions

## Quick Check Method

### Step 1: Run the Verification Query

Open Supabase Dashboard → SQL Editor and run:

```sql
SELECT
    u.email,
    ur.role,
    ur.can_edit_students,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '✅ Can delete ALL students (Admin)'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✅ Can delete ALL students'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NOT NULL THEN '⚠️ Can delete OWN students only'
        WHEN ur.can_edit_students = false THEN '❌ Cannot delete students'
        ELSE '❓ Unknown'
    END as delete_permission
FROM auth.users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';
```

### Step 2: Interpret the Results

**Can Delete ALL Students** if ANY of these are true:
- ✅ `role = 'admin'`
- ✅ `can_edit_students = true` AND `coach_id IS NULL`

**Can Delete ONLY OWN Students** if:
- ⚠️ `can_edit_students = true` AND `coach_id IS NOT NULL` (coach_id matches a specific coach)

**CANNOT Delete Students** if:
- ❌ `can_edit_students = false`
- ❌ No row returned (user doesn't exist or has no role)

---

## Permission Matrix

| Role  | can_edit_students | coach_id | Delete Permission                        |
|-------|-------------------|----------|------------------------------------------|
| admin | true              | any      | ✅ Delete ALL students                   |
| coach | true              | NULL     | ✅ Delete ALL students                   |
| coach | true              | 123      | ⚠️ Delete only students with coach_id=123 |
| coach | false             | any      | ❌ Cannot delete (read-only)             |

---

## Check Specific Coach: vasilyevvasily.1997@mail.ru

Run this comprehensive check: [CHECK_VASILY_PERMISSIONS.sql](CHECK_VASILY_PERMISSIONS.sql)

This will show:
1. User's role and permissions
2. Whether they exist in coaches table
3. Comparison with other coaches
4. All coaches with dashboard access

---

## Required Database Policies

For coaches to delete students, you need:

### 1. DELETE RLS Policy (REQUIRED)

```sql
CREATE POLICY "Authorized users can delete students"
    ON students FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND (
                ur.role = 'admin'
                OR (ur.can_edit_students = true AND students.coach_id = ur.coach_id)
                OR (ur.can_edit_students = true AND ur.coach_id IS NULL)
            )
        )
    );
```

**Status**: This policy needs to be applied in Supabase (from [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql))

### 2. Frontend Code (FIXED)

The async/await fix has been deployed: [FIX_DELETE_ASYNC_AWAIT.md](FIX_DELETE_ASYNC_AWAIT.md)

---

## How to Grant Delete Permission to a Coach

If a coach doesn't have delete permission, run this SQL:

```sql
UPDATE user_roles
SET can_edit_students = true,
    coach_id = NULL  -- NULL means can manage ALL students
WHERE user_id = (
    SELECT id FROM auth.users WHERE email = 'coach@example.com'
);
```

**For vasilyevvasily.1997@mail.ru specifically**:

```sql
UPDATE user_roles
SET can_edit_students = true,
    coach_id = NULL
WHERE user_id = (
    SELECT id FROM auth.users WHERE email = 'vasilyevvasily.1997@mail.ru'
);
```

---

## Verification After Grant

Run this to confirm the change:

```sql
SELECT
    u.email,
    ur.can_edit_students,
    ur.coach_id,
    '✅ Can now delete students' as status
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'vasilyevvasily.1997@mail.ru';
```

Expected result:
- `can_edit_students`: `true`
- `coach_id`: `null`
- Status: ✅ Can now delete students

---

## Testing Delete Permission

### In the UI:
1. Login as the coach
2. Go to Students Dashboard
3. Look for the delete (trash) icon next to each student
4. Click delete on any student
5. Confirm deletion
6. Should see: "Student deleted successfully!" ✅

### Expected Behavior:
- **With permission**: Delete icon visible, deletion works
- **Without permission**: Either delete icon hidden OR deletion fails with error

---

## Common Issues

### Issue 1: "Student not found" error
**Cause**: Missing DELETE RLS policy in Supabase
**Fix**: Apply [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql)

### Issue 2: Coach can edit but not delete
**Cause**: `can_edit_students = false` in user_roles
**Fix**: Run the UPDATE query above to grant permission

### Issue 3: Deletion appears to succeed but student still visible
**Cause**: Frontend async/await bug (NOW FIXED)
**Status**: Deployed in [FIX_DELETE_ASYNC_AWAIT.md](FIX_DELETE_ASYNC_AWAIT.md)

### Issue 4: User doesn't exist
**Cause**: Coach hasn't registered or invitation expired
**Fix**: Create new invitation link in App Access dashboard

---

## Current Status

### Coach: dysonsphere01@proton.me
- ✅ Has delete permission (`can_edit_students = true`, `coach_id = null`)
- ✅ Frontend code fixed (async/await)
- ⚠️ RLS policy needs to be applied

### Coach: vasilyevvasily.1997@mail.ru
- ❓ Unknown - Run [CHECK_VASILY_PERMISSIONS.sql](CHECK_VASILY_PERMISSIONS.sql) to verify
- ⚠️ May need permission grant
- ⚠️ RLS policy needs to be applied

---

## Action Items

### For All Coaches to Delete Students:

1. **Apply RLS DELETE Policy** (Required)
   - Open Supabase SQL Editor
   - Run [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql)
   - This enables DELETE operations at the database level

2. **Verify Coach Permissions** (Per Coach)
   - Run [CHECK_VASILY_PERMISSIONS.sql](CHECK_VASILY_PERMISSIONS.sql)
   - If `can_edit_students = false`, grant permission with UPDATE query

3. **Test Deletion** (Per Coach)
   - Login as coach
   - Try to delete a test student
   - Verify success message appears

### Quick Checklist:

- [x] Frontend code fixed (async/await) ✅ Deployed
- [ ] RLS DELETE policy applied ⚠️ Needs to be run in Supabase
- [ ] Coach vasilyevvasily.1997@mail.ru permissions verified
- [ ] Coach vasilyevvasily.1997@mail.ru can delete students tested

---

## Summary

**To check if a coach can delete students**:

1. Run the SQL query at the top of this document
2. Look for `can_edit_students = true`
3. If `coach_id IS NULL`, they can delete ALL students
4. If `coach_id` is a number, they can only delete their own students

**To grant delete permission**:

1. Set `can_edit_students = true` in user_roles
2. Set `coach_id = NULL` to allow deleting all students
3. Apply the DELETE RLS policy in Supabase

**Current priority**: Apply [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql) to enable DELETE operations in Supabase.
