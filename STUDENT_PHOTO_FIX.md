# Student Photo Upload Fix

## Issue Summary

Student profile edits were failing with HTTP 400 error when saving. Root causes:

1. **Field name mismatch**: JavaScript code was sending camelCase field names (firstName, lastName) directly to Supabase, but the database expects snake_case (first_name, last_name)
2. **Missing storage bucket**: The `student-photos` storage bucket doesn't exist in Supabase
3. **Missing storage policies**: No Row Level Security policies defined for the storage bucket

## Files Changed

### 1. [student.js](student.js) (Lines 519-526)

**Before:**
```javascript
// Update student in Supabase
if (window.supabaseClient) {
    const { data, error } = await window.supabaseClient
        .from('students')
        .update(studentData)  // ❌ Sends camelCase directly
        .eq('id', student.id)
        .select()
        .single();
```

**After:**
```javascript
// Update student in Supabase using the proper data layer function
// This handles camelCase -> snake_case transformation
if (window.supabaseData) {
    const updatedStudent = await window.supabaseData.updateStudent(student.id, studentData);

    // Update local student object with the transformed data
    Object.assign(window.currentStudent, updatedStudent);
```

### 2. [student.js](student.js) (Lines 545-548) - Enhanced Error Messages

**Before:**
```javascript
} catch (error) {
    console.error('Error updating student:', error);
    showToast(t('admin.error.updateFailed') || 'Failed to update student profile', 'error');
```

**After:**
```javascript
} catch (error) {
    console.error('Error updating student:', error);
    // Show detailed error message for debugging
    const errorMessage = error.message || error.toString();
    showToast(`${t('admin.error.updateFailed') || 'Failed to update student profile'}: ${errorMessage}`, 'error');
```

### 3. [supabase-schema.sql](supabase-schema.sql) (Lines 390-430) - Added Storage Policies

Added complete storage bucket policies for the `student-photos` bucket:
- Upload policy for authenticated users
- Update policy for authenticated users
- Delete policy for authenticated users (for photo replacements)
- Public read policy (anyone can view photos)

## Setup Instructions

### Step 1: Create Storage Bucket in Supabase Dashboard

⚠️ **IMPORTANT**: You must create the storage bucket manually in Supabase Dashboard before the photo upload will work.

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `student-photos`
   - **Public bucket**: ✅ **Yes** (to allow public URL access for displaying photos)
   - **File size limit**: 5 MB (recommended)
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`
5. Click **Create bucket**

### Step 2: Apply Storage Policies

After creating the bucket, apply the RLS policies:

1. In Supabase Dashboard, go to **Storage** > **Policies**
2. Select the `student-photos` bucket
3. Copy and paste the storage policies from [supabase-schema.sql](supabase-schema.sql) (lines 402-430)
4. Execute the policies in the SQL Editor

**OR** run these commands in the Supabase SQL Editor:

```sql
-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload student photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'students'
    );

-- Allow authenticated users to update their uploaded photos
CREATE POLICY "Authenticated users can update student photos"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

-- Allow authenticated users to delete photos (for replacements)
CREATE POLICY "Authenticated users can delete student photos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'student-photos'
        AND auth.role() = 'authenticated'
    );

-- Allow anyone to read photos (public bucket)
CREATE POLICY "Anyone can view student photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'student-photos');
```

### Step 3: Test the Fix

1. **Login as admin** at https://your-domain.com/login.html
2. **Navigate to a student profile**
3. **Click "Edit Profile"**
4. **Make a change** (e.g., change first name or upload photo)
5. **Click "Save Changes"**
6. **Verify**:
   - ✅ No 400 error in browser console
   - ✅ Success toast appears
   - ✅ Changes are reflected in the profile
   - ✅ Page doesn't refresh/redirect (stays on student profile)

### Step 4: Test Photo Upload (if applicable)

1. **Edit student profile**
2. **Click photo upload** and select an image
3. **Click "Save Changes"**
4. **Verify**:
   - ✅ Photo uploads successfully
   - ✅ Photo appears in student profile
   - ✅ Check Supabase Storage > `student-photos` > `students/` folder
   - ✅ Photo file should be named like `{student-id}_{timestamp}.jpg`

## How the Fix Works

### Before (Broken)

```
JavaScript (student.js)
    ↓
studentData = { firstName: "John", lastName: "Doe" }  // camelCase
    ↓
Sent directly to Supabase
    ↓
Supabase expects: { first_name: "John", last_name: "Doe" }  // snake_case
    ↓
❌ 400 Bad Request - Field names don't match!
```

### After (Fixed)

```
JavaScript (student.js)
    ↓
studentData = { firstName: "John", lastName: "Doe" }  // camelCase
    ↓
supabaseData.updateStudent(id, studentData)  // Uses data layer
    ↓
Data layer transforms to: { first_name: "John", last_name: "Doe" }  // snake_case
    ↓
Supabase receives correct field names
    ↓
✅ 200 OK - Success!
```

## Troubleshooting

### Issue: Still getting 400 error

**Check:**
1. Browser console for detailed error message (now shows full error)
2. Supabase logs: Dashboard > Logs > Select "Postgres Logs"
3. Verify storage bucket exists: Dashboard > Storage
4. Check authentication: `console.log(window.supabaseClient.auth.session())`

### Issue: Photo upload fails with "Access to storage is not allowed"

**Solution:**
1. Verify storage bucket `student-photos` exists
2. Verify storage policies are applied (see Step 2)
3. Check bucket is set to **Public** (not Private)
4. Verify user is authenticated: Check browser DevTools > Application > Local Storage > supabase.auth.token

### Issue: Photo URL is null after upload

**Check:**
1. Browser console for upload errors
2. Supabase Storage logs: Dashboard > Storage > student-photos > Activity
3. Verify the photo file is in `students/` subfolder
4. Check RLS policy allows the authenticated user to upload

## File Structure Reference

```
chess-empire-database/
├── student.js              # ✅ Fixed: Now uses supabaseData.updateStudent()
├── supabase-data.js        # ✅ Already correct: Handles transformation
├── supabase-schema.sql     # ✅ Updated: Added storage policies
└── STUDENT_PHOTO_FIX.md   # 📄 This file (setup guide)
```

## Next Steps

After completing the setup:
1. ✅ Storage bucket created
2. ✅ Storage policies applied
3. ✅ Test student edit (without photo)
4. ✅ Test student edit (with photo upload)
5. ✅ Verify old photos are deleted when replaced
6. ✅ Monitor Supabase logs for any errors

## Technical Details

### Why Use the Data Layer?

The `supabaseData.updateStudent()` function in [supabase-data.js](supabase-data.js#L162-L218) handles:
- ✅ camelCase → snake_case transformation
- ✅ Proper SELECT query with joins (branch, coach)
- ✅ Error handling
- ✅ Response transformation back to camelCase for JavaScript

**Direct Supabase client calls bypass this logic**, causing field name mismatches.

### Photo Storage Path Format

Photos are stored in Supabase Storage as:
```
student-photos/
└── students/
    ├── {student-id}_1638912345678.jpg
    ├── {student-id}_1638923456789.png
    └── {student-id}_1639012345678.webp
```

File naming: `{studentId}_{timestamp}.{extension}`

### RLS Policy Logic

- **Upload**: Only authenticated users, only to `students/` subfolder
- **Update/Delete**: Only authenticated users (for replacing photos)
- **Read**: Public access (bucket is public)

This ensures:
- ❌ Anonymous users can't upload
- ✅ Any authenticated user can upload (admin/coach/viewer with login)
- ✅ Anyone can view photos (for public student profiles)
- ✅ Old photos are deleted when replaced (prevents storage bloat)

## Support

If issues persist after following this guide:
1. Check browser console for detailed errors
2. Check Supabase logs: Dashboard > Logs
3. Verify storage bucket configuration
4. Test with a simple student edit (no photo) first
