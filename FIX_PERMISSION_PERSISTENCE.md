# Fix: Permission Changes Not Persisting

## Problem
When you toggle permissions for users in the App Access section, the changes revert to default when the page is refreshed.

## Root Cause
The database migration to add the `can_manage_app_access` column and the `get_user_roles_with_emails()` function has not been applied to your Supabase database yet.

## Solution: Apply Database Migration

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to: **SQL Editor** (in the left sidebar)
4. Click **New Query**

### Step 2: Run the Migration
1. Open the file: `migrations/apply_app_access_permission.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **RUN** (or press Ctrl+Enter)

### Step 3: Verify Success
You should see a success message like:
```
Success. No rows returned
```

### Step 4: Test Permission Persistence
1. Refresh your `admin.html` page
2. Navigate to the **App Access** tab
3. Toggle any permission for a non-admin user
4. You should see: "Permission updated successfully"
5. **Refresh the page**
6. ✅ The permission should still be set!

## What This Migration Does

1. **Adds `can_manage_app_access` column** to the `user_roles` table
2. **Sets all admin users** to have `can_manage_app_access = true` by default
3. **Creates the `get_user_roles_with_emails()` function** that fetches all users with their complete permission data
4. **Grants permission** for authenticated users to execute the function

## Technical Details

### Before Migration:
- The `user_roles` table only had 4 permission columns:
  - `can_view_all_students`
  - `can_edit_students`
  - `can_manage_branches`
  - `can_manage_coaches`
- No database function to fetch users with emails

### After Migration:
- Adds 5th permission column: `can_manage_app_access`
- Creates `get_user_roles_with_emails()` function to fetch all user data including:
  - User role and permissions
  - Email from auth.users
  - Coach name (if applicable)

## Troubleshooting

### If migration fails with "column already exists":
The column was already added. That's OK! The function will still be created/updated.

### If permission toggles still don't work:
1. Open browser console (F12)
2. Try toggling a permission
3. Check for error messages
4. Look for any errors related to `handleAppAccessPermissionChange`

### If function errors occur:
Check that the function exists:
```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'get_user_roles_with_emails';
```

## Files Changed
- `migrations/apply_app_access_permission.sql` - Complete migration to run in Supabase
- This guide: `FIX_PERMISSION_PERSISTENCE.md`

## After Migration Success
Once the migration is applied successfully:
- ✅ All permission changes will persist across page refreshes
- ✅ Admin users will automatically have `can_manage_app_access = true`
- ✅ The App Access interface will load user data correctly
- ✅ Permission toggles will update the database in real-time
