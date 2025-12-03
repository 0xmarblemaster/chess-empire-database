## ✅ All Coaches Now Have Full CRUD Permissions

### Changes Made

All coaches registered through invitation links now automatically receive:

✅ **Add Students** (`can_edit_students = true`)
✅ **Edit Students** (`can_edit_students = true`)
✅ **Delete Students** (`can_edit_students = true`)
✅ **Dashboard Access** (`can_manage_app_access = true`)
✅ **Manage ALL Students** (`coach_id = NULL`)

---

## Files Modified

### 1. complete-registration Edge Function

**File**: [supabase/functions/complete-registration/index.ts](supabase/functions/complete-registration/index.ts#L139-L151)

**Changes**:
```typescript
// BEFORE
const { data: roleData, error: roleError } = await supabaseAdmin
  .rpc('create_user_role', {
    p_user_id: userData.user.id,
    p_role: 'coach',
    p_can_view_all_students: false,
    p_can_edit_students: true,
    p_can_manage_branches: false,
    p_can_manage_coaches: false
  })

// AFTER
const { data: roleData, error: roleError } = await supabaseAdmin
  .rpc('create_user_role', {
    p_user_id: userData.user.id,
    p_role: 'coach',
    p_can_view_all_students: false,
    p_can_edit_students: true,  // ✅ Can add/edit/delete students
    p_can_manage_branches: false,
    p_can_manage_coaches: false,
    p_can_manage_app_access: true,  // ✅ NEW: Dashboard access
    p_coach_id: null  // ✅ NEW: Can manage ALL students
  })
```

**Status**: ✅ Deployed to Supabase

### 2. create_user_role Database Function

**File**: [CREATE_USER_ROLE_FUNCTION.sql](CREATE_USER_ROLE_FUNCTION.sql)

**Purpose**: Database function that creates user_roles entry with proper permissions

**Status**: ⚠️ **NEEDS TO BE RUN IN SUPABASE**

---

## Required Database Setup

### Step 1: Create the `create_user_role` Function

Run this SQL in **Supabase SQL Editor**:

```sql
CREATE OR REPLACE FUNCTION create_user_role(
    p_user_id UUID,
    p_role TEXT,
    p_can_view_all_students BOOLEAN DEFAULT false,
    p_can_edit_students BOOLEAN DEFAULT true,
    p_can_manage_branches BOOLEAN DEFAULT false,
    p_can_manage_coaches BOOLEAN DEFAULT false,
    p_can_manage_app_access BOOLEAN DEFAULT true,  -- Coaches get dashboard access
    p_coach_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    role_id UUID;
BEGIN
    INSERT INTO user_roles (
        user_id,
        role,
        can_view_all_students,
        can_edit_students,
        can_manage_branches,
        can_manage_coaches,
        can_manage_app_access,
        coach_id
    )
    VALUES (
        p_user_id,
        p_role,
        p_can_view_all_students,
        p_can_edit_students,
        p_can_manage_branches,
        p_can_manage_coaches,
        p_can_manage_app_access,
        p_coach_id
    )
    RETURNING id INTO role_id;

    RETURN role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_user_role TO authenticated, service_role;
```

**Or run the complete file**: [CREATE_USER_ROLE_FUNCTION.sql](CREATE_USER_ROLE_FUNCTION.sql)

### Step 2: Apply DELETE RLS Policy

Run this SQL to enable DELETE operations:

```sql
DROP POLICY IF EXISTS "Authorized users can delete students" ON students;

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

**Or run the complete file**: [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql)

### Step 3: (Optional) Fix Existing Coaches

If you have existing coaches who need these permissions, run:

```sql
-- Grant full CRUD permissions to ALL existing coaches
UPDATE user_roles
SET can_edit_students = true,
    can_manage_app_access = true,
    coach_id = NULL  -- Can manage ALL students
WHERE role = 'coach';
```

**Verify**:
```sql
SELECT
    u.email,
    ur.role,
    ur.can_edit_students as can_add_edit_delete,
    ur.can_manage_app_access as has_dashboard_access,
    ur.coach_id,
    CASE
        WHEN ur.role = 'admin' THEN '👑 Admin - Full access'
        WHEN ur.can_edit_students = true AND ur.coach_id IS NULL THEN '✅ Coach - Can manage ALL students'
        WHEN ur.can_edit_students = true THEN '⚠️ Coach - Can manage ASSIGNED students only'
        ELSE '❌ Coach - Read-only'
    END as permission_level
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role IN ('coach', 'admin')
ORDER BY ur.role, u.email;
```

---

## Permission Matrix

### New Coaches (via invitation link):

| Permission | Value | Description |
|------------|-------|-------------|
| `role` | `coach` | Coach role |
| `can_edit_students` | `true` | ✅ Can add/edit/delete students |
| `can_manage_app_access` | `true` | ✅ Can access dashboard |
| `coach_id` | `NULL` | ✅ Can manage ALL students |
| `can_view_all_students` | `false` | Not needed (dashboard shows all anyway) |
| `can_manage_branches` | `false` | Cannot add/edit branches |
| `can_manage_coaches` | `false` | Cannot add/edit coaches |

### CRUD Operations:

| Operation | Permission Required | New Coaches |
|-----------|---------------------|-------------|
| **View** students | Any authenticated user | ✅ Yes |
| **Add** students | `can_edit_students = true` | ✅ Yes |
| **Edit** students | `can_edit_students = true` | ✅ Yes |
| **Delete** students | `can_edit_students = true` + DELETE RLS policy | ✅ Yes (after RLS applied) |
| **Access Dashboard** | `can_manage_app_access = true` | ✅ Yes |

---

## Testing the Setup

### Test 1: Create New Coach Invitation

1. Login as admin
2. Go to **App Access** tab
3. Enter email: `testcoach@example.com`
4. Click "Send Invite"
5. **Expected**: Invitation link created ✅

### Test 2: Register as Coach

1. Click registration link
2. Complete registration with password
3. **Expected**: Account created successfully ✅

### Test 3: Verify Coach Permissions (Database)

Run this SQL:
```sql
SELECT
    u.email,
    ur.can_edit_students,
    ur.can_manage_app_access,
    ur.coach_id
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'testcoach@example.com';
```

**Expected Result**:
- `can_edit_students`: `true`
- `can_manage_app_access`: `true`
- `coach_id`: `null`

### Test 4: Login and Access Dashboard

1. Login as `testcoach@example.com`
2. **Expected**: Redirected to Students Dashboard ✅
3. **Expected**: Can see all students ✅

### Test 5: Add Student

1. Click "Add New Student" button
2. Fill required fields: Name, Surname, Age, Coach, Branch
3. Click Save
4. **Expected**: Student created successfully ✅
5. **Expected**: Student appears in list ✅

### Test 6: Edit Student

1. Click Edit icon on any student
2. Change student's age
3. Click Save
4. **Expected**: Student updated successfully ✅

### Test 7: Delete Student

1. Click Delete (trash) icon on any student
2. Confirm deletion
3. **Expected**: "Student deleted successfully!" message ✅
4. **Expected**: Student removed from list ✅
5. **Expected**: Total Students count decreases ✅

---

## Current Status

### ✅ Completed:

1. ✅ Updated `complete-registration` Edge Function
2. ✅ Deployed Edge Function to Supabase
3. ✅ Created `create_user_role` SQL function
4. ✅ Fixed frontend delete async/await bug
5. ✅ Deployed frontend fix to Vercel

### ⚠️ Pending (Requires Supabase SQL):

1. ⚠️ **Create `create_user_role` function** in Supabase
   - File: [CREATE_USER_ROLE_FUNCTION.sql](CREATE_USER_ROLE_FUNCTION.sql)
   - Required for new coach registrations

2. ⚠️ **Apply DELETE RLS policy** in Supabase
   - File: [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql)
   - Required for delete operations to work

3. ⚠️ **(Optional) Update existing coaches** permissions
   - Grant `can_edit_students = true` and `can_manage_app_access = true`
   - Set `coach_id = NULL`

---

## Deployment Checklist

- [x] Update complete-registration Edge Function
- [x] Deploy Edge Function
- [x] Fix frontend delete bug (async/await)
- [x] Deploy frontend to Vercel
- [x] Create SQL function file
- [x] Create RLS policy file
- [ ] **Run CREATE_USER_ROLE_FUNCTION.sql in Supabase**
- [ ] **Run FIX_STUDENT_DELETE_RLS.sql in Supabase**
- [ ] **(Optional) Update existing coaches permissions**
- [ ] Test new coach registration
- [ ] Test add/edit/delete operations

---

## How It Works

### Registration Flow:

```
1. Admin creates invitation
   ↓
2. Coach receives registration link
   ↓
3. Coach registers with email/password
   ↓
4. complete-registration Edge Function:
   - Creates auth.users entry (auto-confirmed)
   - Calls create_user_role() function
   ↓
5. create_user_role() inserts into user_roles:
   - role = 'coach'
   - can_edit_students = true  ✅
   - can_manage_app_access = true  ✅
   - coach_id = NULL  ✅
   ↓
6. Coach can now:
   - ✅ Login
   - ✅ Access dashboard
   - ✅ View all students
   - ✅ Add new students
   - ✅ Edit existing students
   - ✅ Delete students (after RLS policy applied)
```

### DELETE Operation Flow:

```
1. Coach clicks delete button
   ↓
2. Frontend: deleteStudentConfirm() (async)
   ↓
3. Frontend: await deleteStudent(id)
   ↓
4. Backend: DELETE FROM students WHERE id = ?
   ↓
5. Supabase RLS Policy Check:
   - Is auth.uid() valid? ✅
   - Does user_roles exist? ✅
   - Is can_edit_students = true? ✅
   - Is coach_id NULL? ✅
   ↓
6. DELETE succeeds ✅
   ↓
7. Frontend updates UI
   ↓
8. Success message shown ✅
```

---

## Related Documentation

- [FIX_DELETE_ASYNC_AWAIT.md](FIX_DELETE_ASYNC_AWAIT.md) - Frontend async/await fix
- [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql) - DELETE RLS policy
- [CREATE_USER_ROLE_FUNCTION.sql](CREATE_USER_ROLE_FUNCTION.sql) - Database function
- [HOW_TO_CHECK_COACH_DELETE_PERMISSIONS.md](HOW_TO_CHECK_COACH_DELETE_PERMISSIONS.md) - Permission checking guide
- [CHECK_VASILY_PERMISSIONS.sql](CHECK_VASILY_PERMISSIONS.sql) - Specific coach check

---

## Summary

✅ **All coaches created via invitation links will now have:**

1. Full CRUD permissions on students (add/edit/delete)
2. Dashboard access
3. Ability to manage ALL students (not restricted to assigned ones)

**Action Required**:

1. Run [CREATE_USER_ROLE_FUNCTION.sql](CREATE_USER_ROLE_FUNCTION.sql) in Supabase SQL Editor
2. Run [FIX_STUDENT_DELETE_RLS.sql](FIX_STUDENT_DELETE_RLS.sql) in Supabase SQL Editor
3. (Optional) Update existing coaches with the UPDATE query above

**After these SQL scripts run, the system will be fully operational!**
