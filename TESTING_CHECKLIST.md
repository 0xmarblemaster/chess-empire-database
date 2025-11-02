# Chess Empire Database - Testing Checklist

## Complete System Testing Guide

Use this checklist to verify all functionality works correctly in both local and production environments.

---

## 🔧 Pre-Testing Setup

### Local Environment
- [ ] Open project in browser: `http://localhost:8000`
- [ ] Open browser DevTools (F12)
- [ ] Check Console tab for errors
- [ ] Verify Network tab shows successful requests

### Production Environment
- [ ] Access Vercel deployment URL
- [ ] Open browser DevTools (F12)
- [ ] Check Console tab for errors
- [ ] Verify SSL certificate (🔒 in address bar)

---

## 📊 Phase 1: Data Loading & Initialization

### Test Data Layer Initialization
- [ ] Open homepage
- [ ] Open Console (F12)
- [ ] Verify log: `📊 Initializing data from Supabase...`
- [ ] Verify log: `✅ Loaded from Supabase: { students: X, coaches: Y, branches: Z }`
- [ ] No errors in console

**Expected Console Output**:
```
📊 Initializing data from Supabase...
✅ Loaded from Supabase: { students: 10, coaches: 5, branches: 1 }
```

**If Failed**:
- Check supabase-config.js exists and has correct credentials
- Verify Supabase database has data
- Check browser Network tab for failed requests

---

## 🔐 Phase 2: Authentication Testing

### Test Public Access (No Auth Required)
- [ ] Access homepage (`/index.html`)
- [ ] Page loads without login
- [ ] Search bar is functional
- [ ] "Login" button visible in header
- [ ] Can search for students (if public search enabled)

### Test Login Flow - Admin User
1. **Navigate to Login**
   - [ ] Click "Login" button → redirects to `/login.html`
   - [ ] Login page loads with Chess Empire branding
   - [ ] Form fields visible (email, password)

2. **Enter Credentials**
   - [ ] Email: `0xmarblemaster@gmail.com`
   - [ ] Password: `TheBestGame2025!`
   - [ ] No browser autofill issues

3. **Submit Login**
   - [ ] Click "Sign In" button
   - [ ] Loading indicator appears (if implemented)
   - [ ] No console errors

4. **Post-Login Redirect**
   - [ ] Redirects to `/admin.html` automatically
   - [ ] No redirect loops (watch console for multiple redirects)
   - [ ] Session persists (check `sessionStorage`)

5. **Verify Session Storage**
   - [ ] Open DevTools → Application → Session Storage
   - [ ] Key `userRole` exists
   - [ ] Value: `{"role":"admin","user_id":"...", ...}`

### Test Authentication Failures
1. **Wrong Password**
   - [ ] Enter: `0xmarblemaster@gmail.com` / `wrongpassword`
   - [ ] Error message displays: "Invalid login credentials"
   - [ ] Does NOT redirect to admin
   - [ ] Can retry login

2. **Wrong Email**
   - [ ] Enter: `nonexistent@gmail.com` / `TheBestGame2025!`
   - [ ] Error message displays
   - [ ] No redirect

3. **Empty Fields**
   - [ ] Try submit with empty email
   - [ ] Browser validation prevents submit
   - [ ] Try submit with empty password
   - [ ] Browser validation prevents submit

### Test Logout Flow
1. **Logout from Admin**
   - [ ] Click "Logout" button in sidebar
   - [ ] Confirmation dialog appears
   - [ ] Click "Yes" to confirm

2. **Post-Logout State**
   - [ ] Redirects to homepage (`/index.html`)
   - [ ] Session cleared (check sessionStorage)
   - [ ] Cannot access `/admin.html` without login

3. **Verify Session Cleared**
   - [ ] DevTools → Application → Session Storage
   - [ ] `userRole` key removed or cleared
   - [ ] Attempting to access `/admin.html` redirects to login

### Test Session Persistence
1. **Login as Admin**
2. **Refresh Page**
   - [ ] Still logged in
   - [ ] Admin dashboard loads
   - [ ] No re-login required

3. **Open New Tab**
   - [ ] Navigate to `/admin.html` in new tab
   - [ ] Automatically logged in (session persists)
   - [ ] Dashboard loads immediately

4. **Close Browser & Reopen**
   - [ ] Session should expire (sessionStorage cleared)
   - [ ] Must login again

---

## 📈 Phase 3: Admin Dashboard Testing

### Dashboard Statistics
- [ ] Login as admin
- [ ] Dashboard loads with 4 stat cards:
  - [ ] Total Students (shows correct count)
  - [ ] Active Students (shows correct count)
  - [ ] Total Coaches (shows correct count)
  - [ ] Total Branches (shows correct count)

### Sidebar Navigation
- [ ] "Students" section active by default
- [ ] Click "Branches" → dropdown opens
- [ ] Click a branch → branch view loads
- [ ] Click "Coaches" → dropdown opens
- [ ] Click a coach → coach view loads
- [ ] Click "App Access" → redirects to app-access.html
- [ ] Click "Manage Coaches" → coaches management loads
- [ ] Click "Manage Branches" → branches management loads

### Students Table
- [ ] Table displays with columns: Student, Age, Branch, Coach, Level, Razryad, Status, Actions
- [ ] Student avatars show initials
- [ ] Data loads from Supabase (check console for query)
- [ ] All students visible (or paginated if >50)

### Filters
1. **Status Filter**
   - [ ] Select "Active" → only active students shown
   - [ ] Select "Frozen" → only frozen students shown
   - [ ] Select "Left" → only left students shown
   - [ ] Select "All" → all students shown

2. **Branch Filter**
   - [ ] Dropdown populated with branch names
   - [ ] Select branch → only students from that branch shown
   - [ ] Branch names translated (if using i18n)

3. **Coach Filter**
   - [ ] Dropdown populated with coach names
   - [ ] Select coach → only students assigned to that coach shown

4. **Level Filter**
   - [ ] Select Level 1 → only Level 1 students shown
   - [ ] Test other levels (2-8)

### Search Functionality
1. **Search by Name**
   - [ ] Type "Alex" in search box
   - [ ] Debounce works (300ms delay)
   - [ ] Loading indicator appears
   - [ ] Results filter in real-time
   - [ ] Clear button (X) appears

2. **Clear Search**
   - [ ] Click X button
   - [ ] Search cleared
   - [ ] Full list restored

3. **Search Performance**
   - [ ] Console shows: Supabase query executed
   - [ ] Results appear in < 1 second
   - [ ] No duplicate queries

---

## ➕ Phase 4: Create Operations (CRUD - C)

### Create Student
1. **Open Modal**
   - [ ] Click "Add Student" button
   - [ ] Modal appears with form
   - [ ] All form fields visible

2. **Fill Required Fields**
   - [ ] First Name: `Test`
   - [ ] Last Name: `Student`
   - [ ] Date of Birth: `2010-01-01`
   - [ ] Gender: `Male`
   - [ ] Branch: Select any branch
   - [ ] Coach: Select any coach (filtered by branch)
   - [ ] Status: `Active`

3. **Fill Optional Fields**
   - [ ] Razryad: `3rd`
   - [ ] Parent Name: `Test Parent`
   - [ ] Phone: `+71234567890`
   - [ ] Email: `parent@test.com`

4. **Submit Form**
   - [ ] Click "Add Student"
   - [ ] Success message appears
   - [ ] Modal closes
   - [ ] New student appears in table

5. **Verify in Database**
   - [ ] Open Supabase Dashboard → Table Editor → students
   - [ ] New row exists with correct data
   - [ ] `created_at` timestamp is recent

6. **Verify in UI**
   - [ ] Refresh page
   - [ ] Student still appears in table
   - [ ] Total students count increased by 1

### Create Branch
1. **Navigate to Branch Management**
   - [ ] Sidebar → "Manage Branches"

2. **Open Create Form**
   - [ ] Click "Add Branch"
   - [ ] Modal appears

3. **Fill Form**
   - [ ] Name: `Test Branch`
   - [ ] Location: `Test Location`
   - [ ] Phone: `+71111111111`
   - [ ] Email: `testbranch@test.com`

4. **Submit**
   - [ ] Click "Add Branch"
   - [ ] Success message
   - [ ] Branch appears in list

5. **Verify**
   - [ ] Check Supabase `branches` table
   - [ ] Refresh page → branch persists
   - [ ] Sidebar branches dropdown includes new branch

### Create Coach
1. **Navigate to Coach Management**
   - [ ] Sidebar → "Manage Coaches"

2. **Open Create Form**
   - [ ] Click "Add Coach"
   - [ ] Modal appears

3. **Fill Form**
   - [ ] First Name: `Test`
   - [ ] Last Name: `Coach`
   - [ ] Branch: Select a branch
   - [ ] Phone: `+72222222222`
   - [ ] Email: `testcoach@test.com`

4. **Submit**
   - [ ] Click "Add Coach"
   - [ ] Success message
   - [ ] Coach appears in list

5. **Verify**
   - [ ] Check Supabase `coaches` table
   - [ ] Refresh page → coach persists
   - [ ] Coaches dropdown includes new coach

---

## ✏️ Phase 5: Update Operations (CRUD - U)

### Update Student
1. **Open Edit Modal**
   - [ ] Click "Edit" icon (pencil) on any student
   - [ ] Modal appears with pre-filled data
   - [ ] All current values loaded correctly

2. **Modify Fields**
   - [ ] Change Age: `13`
   - [ ] Change Level: `2`
   - [ ] Change Status: `Frozen`

3. **Submit Changes**
   - [ ] Click "Save Changes"
   - [ ] Success message appears
   - [ ] Modal closes

4. **Verify in UI**
   - [ ] Student row updates immediately
   - [ ] Age shows `13`
   - [ ] Level shows `Level 2`
   - [ ] Status badge shows `Frozen`

5. **Verify in Database**
   - [ ] Check Supabase `students` table
   - [ ] Row updated with new values
   - [ ] `updated_at` timestamp changed

6. **Verify Persistence**
   - [ ] Refresh page
   - [ ] Changes still visible

### Update Branch
1. **Open Edit Modal**
   - [ ] Go to "Manage Branches"
   - [ ] Click "Edit" on a branch

2. **Modify Fields**
   - [ ] Change Location: `New Location`
   - [ ] Change Phone: `+79999999999`

3. **Submit & Verify**
   - [ ] Click "Save"
   - [ ] Success message
   - [ ] Changes reflected in UI
   - [ ] Check Supabase table

### Update Coach
1. **Open Edit Modal**
   - [ ] Go to "Manage Coaches"
   - [ ] Click "Edit" on a coach

2. **Modify Fields**
   - [ ] Change Email: `newemail@test.com`

3. **Submit & Verify**
   - [ ] Click "Save"
   - [ ] Success message
   - [ ] Changes in UI and database

---

## 🗑️ Phase 6: Delete Operations (CRUD - D)

### Delete Student
1. **Select Student for Deletion**
   - [ ] Click "Delete" icon (trash) on test student
   - [ ] Confirmation dialog appears
   - [ ] Dialog shows student name

2. **Confirm Deletion**
   - [ ] Click "Yes, delete"
   - [ ] Success message appears
   - [ ] Student removed from table immediately

3. **Verify in Database**
   - [ ] Check Supabase `students` table
   - [ ] Row deleted (does not exist)

4. **Verify Persistence**
   - [ ] Refresh page
   - [ ] Student still gone
   - [ ] Total students count decreased by 1

### Delete Branch (With Validation)
1. **Try Delete Branch with Students**
   - [ ] Go to "Manage Branches"
   - [ ] Try delete branch that has students
   - [ ] **Expected**: Error message: "Cannot delete branch with students"
   - [ ] Branch NOT deleted

2. **Delete Empty Branch**
   - [ ] Create new branch with no students/coaches
   - [ ] Click "Delete"
   - [ ] Confirm deletion
   - [ ] Branch deleted successfully

### Delete Coach (With Validation)
1. **Try Delete Coach with Students**
   - [ ] Go to "Manage Coaches"
   - [ ] Try delete coach that has students
   - [ ] **Expected**: Error message: "Cannot delete coach with assigned students"
   - [ ] Coach NOT deleted

2. **Delete Coach Without Students**
   - [ ] Create new coach with no assigned students
   - [ ] Click "Delete"
   - [ ] Confirm deletion
   - [ ] Coach deleted successfully

---

## 🔍 Phase 7: Search & Filter Testing

### Homepage Search (Public)
1. **Basic Search**
   - [ ] Go to homepage
   - [ ] Type partial name: "Al"
   - [ ] Dropdown shows matching students
   - [ ] Shows max 10 results

2. **Case Insensitive**
   - [ ] Type "ALEX" → finds "Alex"
   - [ ] Type "alex" → finds "Alex"

3. **No Results**
   - [ ] Type "ZZZZZ"
   - [ ] Shows "No students found"

4. **Click Result**
   - [ ] Click on a student in dropdown
   - [ ] Redirects to student profile page
   - [ ] Correct student loaded

### Admin Search (Authenticated)
1. **Admin Table Search**
   - [ ] Login as admin
   - [ ] Use admin table search box
   - [ ] Real-time filtering works
   - [ ] Clear button works

2. **Combined Filters**
   - [ ] Select Branch: "Branch 1"
   - [ ] Select Status: "Active"
   - [ ] Select Level: "1"
   - [ ] Search: "Alex"
   - [ ] Only students matching ALL criteria shown

3. **Reset Filters**
   - [ ] Click "Reset" or clear all filters
   - [ ] Full list restored

---

## 📱 Phase 8: Branch & Coach Views

### Branch View
1. **Navigate to Branch**
   - [ ] Sidebar → Branches dropdown
   - [ ] Click a branch name
   - [ ] Branch view loads

2. **Verify Statistics**
   - [ ] Total Students (correct count)
   - [ ] Active Students (correct count)
   - [ ] Total Coaches (correct count)
   - [ ] Average Level (calculated correctly)

3. **Verify Charts**
   - [ ] Razryad Distribution chart displays
   - [ ] Level Distribution chart displays
   - [ ] Charts show accurate data

4. **Verify Lists**
   - [ ] Coaches list shows all coaches at this branch
   - [ ] Students list shows all students at this branch
   - [ ] Click student → goes to student profile

### Coach View
1. **Navigate to Coach**
   - [ ] Sidebar → Coaches dropdown
   - [ ] Click a coach name
   - [ ] Coach view loads

2. **Verify Statistics**
   - [ ] Total Students (coach's students only)
   - [ ] Active Students (coach's active students)
   - [ ] Average Level (of coach's students)
   - [ ] KMS Students (students with KMS razryad)

3. **Verify Charts**
   - [ ] Razryad Distribution (coach's students)
   - [ ] Level Distribution (coach's students)

4. **Verify Student List**
   - [ ] Shows only students assigned to this coach
   - [ ] Can click to view student profile

---

## 🌐 Phase 9: Internationalization (i18n)

### Language Switching
- [ ] Page loads with default language (English)
- [ ] Language selector visible in UI
- [ ] Switch to Russian → UI translates
- [ ] Switch to Kazakh → UI translates
- [ ] Switch back to English → UI translates

### Translated Elements
- [ ] Navigation labels
- [ ] Button text
- [ ] Form labels
- [ ] Table headers
- [ ] Status badges
- [ ] Error messages
- [ ] Success messages
- [ ] Modal titles

---

## 🔒 Phase 10: Security & Permissions

### Admin Permissions
- [ ] Can view all students
- [ ] Can create students
- [ ] Can update students
- [ ] Can delete students
- [ ] Can manage branches
- [ ] Can manage coaches
- [ ] Can access App Access page

### Coach Permissions (If Implemented)
- [ ] Login as coach user
- [ ] Can view only assigned students
- [ ] Can update assigned students
- [ ] Cannot delete students
- [ ] Cannot manage branches
- [ ] Cannot manage other coaches

### Viewer Permissions (If Implemented)
- [ ] Login as viewer
- [ ] Can search students
- [ ] Can view student profiles
- [ ] Cannot edit anything
- [ ] Cannot access admin features

### RLS Policy Testing
1. **Test in Supabase SQL Editor**
   ```sql
   -- As admin user (5b3f0e34-ef6d-48af-a401-5ce6311080d3)
   SELECT * FROM students; -- Should return all students

   -- As non-admin (test with different user_id)
   SELECT * FROM students; -- Should return limited results
   ```

2. **Verify Console**
   - [ ] No "RLS policy violation" errors
   - [ ] All queries authorized correctly

---

## 🚀 Phase 11: Performance Testing

### Page Load Times
- [ ] Homepage loads in < 2 seconds
- [ ] Admin dashboard loads in < 3 seconds
- [ ] Student search results in < 1 second
- [ ] Modal opens instantly (< 100ms)

### Database Query Performance
1. **Check Console Logs**
   - [ ] "Loaded from Supabase" shows reasonable time
   - [ ] No slow query warnings

2. **Monitor Supabase Dashboard**
   - [ ] Go to Supabase → Database → Usage
   - [ ] Check query execution times
   - [ ] No queries > 1000ms

### Network Performance
1. **Check Network Tab**
   - [ ] CSS/JS files load quickly
   - [ ] Supabase requests < 500ms
   - [ ] No failed requests (404, 500)

2. **Mobile Performance**
   - [ ] Test on mobile device or DevTools mobile view
   - [ ] Responsive design works
   - [ ] Touch interactions work
   - [ ] Forms are usable

---

## 🐛 Phase 12: Error Handling

### Network Errors
1. **Simulate Offline**
   - [ ] DevTools → Network → Offline
   - [ ] Attempt to load data
   - [ ] User-friendly error message shown
   - [ ] Console shows fallback to localStorage

2. **Simulate Slow 3G**
   - [ ] DevTools → Network → Slow 3G
   - [ ] Loading indicators appear
   - [ ] No timeout errors
   - [ ] Eventually loads successfully

### Form Validation Errors
- [ ] Submit form with missing required fields → validation errors
- [ ] Invalid email format → error message
- [ ] Invalid phone format → error message
- [ ] Future date in Date of Birth → error message

### Database Errors
1. **Invalid Data**
   - [ ] Try insert student with missing branch_id
   - [ ] **Expected**: Error message shown
   - [ ] Form stays open for correction

2. **Duplicate Entry**
   - [ ] Try create branch with duplicate name
   - [ ] **Expected**: "Branch already exists" error

---

## 📊 Phase 13: Data Consistency

### Cross-Tab Consistency
1. **Open 2 Browser Tabs**
   - [ ] Tab 1: Admin dashboard
   - [ ] Tab 2: Admin dashboard
   - [ ] Create student in Tab 1
   - [ ] Refresh Tab 2 → student appears

### Session Consistency
1. **Create Data**
   - [ ] Add 5 students
   - [ ] Logout
   - [ ] Login again
   - [ ] All 5 students still exist

2. **Update Data**
   - [ ] Edit a student
   - [ ] Logout
   - [ ] Login again
   - [ ] Changes persisted

---

## ✅ Final Production Checklist

### Pre-Deployment
- [ ] All tests above passed
- [ ] No console errors
- [ ] No failed network requests
- [ ] Git repository up to date
- [ ] `.gitignore` excludes `supabase-config.js`

### Deployment
- [ ] Deployed to Vercel
- [ ] Environment variables configured
- [ ] Custom domain (if applicable)
- [ ] HTTPS working
- [ ] No mixed content warnings

### Post-Deployment
- [ ] Production URL accessible
- [ ] Admin login works on production
- [ ] CRUD operations work on production
- [ ] Search works on production
- [ ] Mobile responsive on production
- [ ] Performance acceptable on production

### Documentation
- [ ] README.md updated with production URL
- [ ] DEPLOYMENT_GUIDE.md complete
- [ ] User training materials prepared
- [ ] Backup strategy documented

---

## 🎉 Sign-Off

**Tester Name**: _______________________________

**Date**: _______________________________

**Environment Tested**:
- [ ] Local Development
- [ ] Production

**Test Results**:
- Total Tests: _____ / _____
- Passed: _____
- Failed: _____
- Blocked: _____

**Critical Issues Found**: _______________________________

**Ready for Production**: [ ] Yes  [ ] No

**Notes**: _______________________________
_______________________________
_______________________________

---

**Testing Checklist Version**: 1.0
**Last Updated**: Phase 8 Implementation
