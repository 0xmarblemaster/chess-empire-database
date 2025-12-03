# 🔍 Login Issue Troubleshooting Guide

## 🎯 Most Likely Issue: Email Confirmation Required

If registration was successful but login fails, the most common cause is:

**Supabase Email Confirmation is ENABLED**

When email confirmation is enabled:
- ✅ User account IS created
- ✅ User role IS created
- ❌ BUT user cannot login until they confirm their email
- ❌ We're not sending confirmation emails (SMTP not configured)
- ❌ Result: User cannot login

---

## 🔧 Fix: Disable Email Confirmation

### **Step 1: Go to Supabase Dashboard**

1. Open: https://app.supabase.com/project/papgcizhfkngubwofjuo
2. Click on **Authentication** in left sidebar
3. Click on **Providers**
4. Click on **Email** provider

### **Step 2: Disable Email Confirmation**

Look for a setting called:
- "Confirm email" or
- "Enable email confirmations" or
- "Require email verification"

**Toggle it OFF** (disable it)

Click **Save**

### **Step 3: Test Login Again**

After disabling email confirmation:
1. Go to login page
2. Try logging in with the newly registered account
3. Should work now! ✅

---

## 🔍 Alternative: Check User Account Status

### **Method 1: Check in Supabase Dashboard**

1. Go to: https://app.supabase.com/project/papgcizhfkngubwofjuo
2. Click **Authentication** → **Users**
3. Find the user by email
4. Check the **Email Confirmed** column
5. If it says "Not confirmed" or shows a warning icon, that's the issue!

**Fix**: You can manually confirm the email:
- Click on the user
- Find "Email Confirmed" field
- Click to confirm it manually
- Save

### **Method 2: Check User Role in Database**

1. Go to: https://app.supabase.com/project/papgcizhfkngubwofjuo
2. Click **Table Editor** or **SQL Editor**
3. Run this query:

```sql
-- Check if user role exists
SELECT ur.*, u.email
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE u.email = 'COACH_EMAIL_HERE';
```

Replace `COACH_EMAIL_HERE` with the actual email.

**Expected Result**: Should return one row with:
- user_id: (UUID)
- role: `coach`
- email: (the coach's email)

**If no results**: The user role wasn't created. See "Manual Fix" below.

---

## 🐛 Other Possible Issues

### **Issue 1: User Account Not Created**

**Check**:
1. Supabase Dashboard → Authentication → Users
2. Search for the email
3. If user doesn't exist → Account creation failed

**Fix**:
- Check browser console for errors during registration
- Resend invitation and try again
- Check if email is already registered with a different account

### **Issue 2: User Role Not Created**

**Symptoms**: User can login but sees "Access denied" or no permissions

**Check** (SQL):
```sql
SELECT * FROM user_roles
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'COACH_EMAIL_HERE'
);
```

**If no role exists**, create it manually:
```sql
INSERT INTO user_roles (user_id, role, can_view_all_students, can_edit_students, can_manage_branches, can_manage_coaches)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'COACH_EMAIL_HERE'),
  'coach',
  false,
  false,
  false,
  false
);
```

### **Issue 3: Wrong Password**

**Symptoms**: "Invalid email or password" error

**Causes**:
- User typed wrong password
- Password doesn't meet requirements (even though registration succeeded)
- Browser autofill used wrong password

**Fix**:
- Try password reset (if implemented)
- Or create new invitation for the user

### **Issue 4: Email Already Registered**

**Symptoms**: Login works but redirects to wrong page, or shows "already registered"

**Check**:
```sql
SELECT email, created_at, email_confirmed_at
FROM auth.users
WHERE email = 'COACH_EMAIL_HERE';
```

**If multiple accounts exist**:
- Delete duplicate accounts
- Keep the most recent one

---

## 📊 Complete Account Verification Checklist

Use this SQL query to check everything at once:

```sql
-- Complete account verification
WITH user_check AS (
  SELECT
    id,
    email,
    created_at,
    email_confirmed_at,
    CASE
      WHEN email_confirmed_at IS NULL THEN '❌ Email not confirmed'
      ELSE '✅ Email confirmed'
    END as email_status
  FROM auth.users
  WHERE email = 'COACH_EMAIL_HERE'
),
role_check AS (
  SELECT
    user_id,
    role,
    can_view_all_students,
    can_edit_students,
    can_manage_branches,
    can_manage_coaches
  FROM user_roles
  WHERE user_id IN (SELECT id FROM user_check)
)
SELECT
  u.email,
  u.email_status,
  u.created_at,
  CASE
    WHEN r.user_id IS NULL THEN '❌ No role assigned'
    ELSE '✅ Role: ' || r.role
  END as role_status,
  r.*
FROM user_check u
LEFT JOIN role_check r ON r.user_id = u.id;
```

**Expected Good Result**:
```
email               | email_status          | role_status     | role
--------------------|----------------------|-----------------|-------
coach@example.com   | ✅ Email confirmed   | ✅ Role: coach | coach
```

**If you see**:
- `❌ Email not confirmed` → Disable email confirmation (Step 2 above)
- `❌ No role assigned` → Create role manually (SQL above)

---

## 🎯 Quick Fix Summary

**Most Common Solution** (fixes 90% of cases):

1. **Disable Email Confirmation**:
   - Supabase Dashboard → Authentication → Providers → Email
   - Turn OFF "Confirm email"
   - Save

2. **Manually Confirm Existing Users** (if needed):
   - Authentication → Users → Find user → Confirm email manually

3. **Try Login Again**

---

## 🧪 Test Login After Fix

1. Go to: https://chess-empire-database.vercel.app/admin.html
2. Enter:
   - Email: (the coach's email)
   - Password: (what they set during registration)
3. Click "Login"
4. **Expected**: ✅ Successfully logs in!

---

## 📞 If Still Not Working

### **Collect This Information**:

1. **Browser Console Errors**:
   - Open DevTools (F12)
   - Try to login
   - Check Console tab for errors
   - Screenshot the errors

2. **User Email Status**:
   - Run the verification SQL query above
   - Share the results

3. **Registration Timestamp**:
   - When was the account created?
   - Did it happen just now or earlier?

4. **Error Message**:
   - What exact error does the user see?
   - "Invalid credentials"?
   - "Email not confirmed"?
   - No error but doesn't redirect?

### **Emergency Manual Account Creation**

If all else fails, create account manually:

```sql
-- 1. First, create user role if it exists but has no role
INSERT INTO user_roles (user_id, role, can_view_all_students, can_edit_students)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'COACH_EMAIL_HERE'),
  'coach',
  false,
  false
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'coach';

-- 2. Confirm email manually
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'COACH_EMAIL_HERE'
AND email_confirmed_at IS NULL;
```

---

## ✅ Success Checklist

After fixing, verify:

- [ ] User exists in `auth.users`
- [ ] Email is confirmed (or confirmation disabled)
- [ ] User role exists in `user_roles`
- [ ] Role is set to `coach`
- [ ] User can login successfully
- [ ] User is redirected to dashboard
- [ ] User has appropriate permissions

---

**Last Updated**: 2025-11-10 07:25 UTC
**Status**: Troubleshooting Guide
**Most Likely Fix**: Disable email confirmation in Supabase
