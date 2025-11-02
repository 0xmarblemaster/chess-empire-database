# Chess Empire Invitation System - Complete Implementation Guide

## 📋 **Overview**

This guide documents the complete invitation and registration system for Chess Empire, using Supabase native authentication.

**Date**: 2025-01-30
**Status**: ✅ **IMPLEMENTED with Edge Functions - Ready for Deployment**
**Email Sending**: ✅ **Automatic via Supabase Edge Function**

---

## 🎯 **System Flow**

### **The Complete Journey:**

```
1. Admin sends invitation
   ↓
2. Supabase sends email with registration link
   ↓
3. User clicks link → Opens register.html?token=xxx
   ↓
4. User creates password
   ↓
5. Account created in Supabase Auth
   ↓
6. User role created in database
   ↓
7. Invitation marked as "used"
   ↓
8. User redirected to login.html
   ↓
9. User logs in with email + password
   ↓
10. Redirected to admin.html (or index.html based on role)
```

---

## 📁 **Files Created/Modified**

| File | Status | Description |
|------|--------|-------------|
| [register.html](register.html) | ✅ Created | Registration page matching login.html design |
| [register.js](register.js) | ✅ Created | Registration logic with validation |
| [supabase-schema.sql](supabase-schema.sql:361-388) | ✅ Updated | Updated `create_user_invitation()` function |
| [crud-management.js](crud-management.js:726-758) | ✅ Updated | Calls Edge Function to send emails |
| [i18n.js](i18n.js) | ✅ Updated | Added registration translations (EN, RU, KK) |
| [supabase/functions/send-invitation/index.ts](supabase/functions/send-invitation/index.ts) | ✅ Created | **Edge Function for automatic email sending** |

---

## 🚀 **Deployment Steps**

> **📖 For detailed Edge Function deployment instructions, see [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md)**

### Step 1: Deploy the Edge Function

The Edge Function enables **automatic email sending** without exposing service role keys in the frontend.

**Quick deployment**:
```bash
# Install Supabase CLI
brew install supabase/tap/supabase  # macOS
# OR
npm install -g supabase  # Windows/Linux

# Login
supabase login

# Link your project
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy send-invitation

# Set the site URL
supabase secrets set SITE_URL=http://localhost:3000
```

**See [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md) for complete instructions.**

---

### Step 2: Update Database Function

**Go to Supabase Dashboard** → **SQL Editor** → Run:

```sql
-- New simplified function for sending invitations
CREATE OR REPLACE FUNCTION create_user_invitation(
    p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    invitation_token TEXT;
    invitation_id UUID;
BEGIN
    -- Generate random token
    invitation_token := encode(gen_random_bytes(32), 'hex');

    -- Insert invitation without coach_id (NULL by default)
    INSERT INTO coach_invitations (email, token, expires_at)
    VALUES (
        p_email,
        invitation_token,
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO invitation_id;

    -- Return invitation details for email sending via frontend/API
    RETURN jsonb_build_object(
        'invitation_id', invitation_id,
        'token', invitation_token,
        'email', p_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Verify**: Run `SELECT create_user_invitation('test@example.com');`
**Expected**: Returns JSON with `invitation_id`, `token`, and `email`

---

### Step 2: Configure Supabase Email Settings

#### 2.1 Enable Email Auth

1. **Go to**: Supabase Dashboard → **Authentication** → **Providers**
2. **Enable**: Email provider (should be enabled by default)
3. **Confirm Email**: Toggle to "Enabled" (recommended)

#### 2.2 Customize Email Templates

1. **Go to**: Supabase Dashboard → **Authentication** → **Email Templates**
2. **Select**: "Invite user" template
3. **Update template** with:

```html
<h2>You're invited to Chess Empire!</h2>

<p>Hello,</p>

<p>You've been invited to join Chess Empire. Click the button below to create your account:</p>

<p><a href="{{ .ConfirmationURL }}">Accept Invitation</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>

<p>This invitation expires in 7 days.</p>

<p>If you didn't expect this invitation, you can safely ignore this email.</p>

<p>Best regards,<br/>Chess Empire Team</p>
```

**IMPORTANT**: The `{{ .ConfirmationURL }}` will be automatically replaced by Supabase with the actual registration link.

#### 2.3 Set Redirect URLs

1. **Go to**: Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL**: `http://localhost:3000` (for development) or `https://yourdomain.com` (for production)
3. **Redirect URLs**: Add `http://localhost:3000/register.html` (and production URL)

---

### Step 3: Deploy Frontend Files

Upload to your server:

```bash
# Upload new files
- register.html
- register.js

# Upload updated files
- crud-management.js
- i18n.js?v=12 (increment version)
- supabase-schema.sql
```

**Update version numbers** in HTML to bust cache:
```html
<script src="i18n.js?v=13"></script>  <!-- Increment! -->
<script src="register.js?v=1"></script>
```

---

## 🧪 **Testing the Complete Flow**

### Test 1: Send Invitation

1. **Login as admin**: `0xmarblemaster@gmail.com`
2. **Go to**: App Access page
3. **Enter email**: `test@example.com`
4. **Click**: "Send Invite"

**Expected Console Output**:
```javascript
Invitation created: {
    invitation_id: "xxx-xxx-xxx",
    token: "64-char-hex-string",
    email: "test@example.com"
}
```

**Check Email**:
- User should receive invitation email
- Email should contain registration link: `http://localhost:3000/register.html?token=xxx`

### Test 2: Registration Process

1. **Open email** sent to `test@example.com`
2. **Click** registration link
3. **Verify** page shows:
   - ✅ Email pre-filled (readonly)
   - ✅ Password requirements visible
   - ✅ "Create Account" button enabled

4. **Create password**: e.g., `Test123456`
5. **Confirm password**: `Test123456`
6. **Click** "Create Account"

**Expected**:
```
✅ Success message: "Account created successfully! Redirecting to login page..."
✅ Redirects to login.html after 2 seconds
```

**Verify in Database**:
```sql
-- Check invitation was marked as used
SELECT email, used FROM coach_invitations WHERE email = 'test@example.com';
-- Should show: used = true

-- Check user was created in auth
SELECT email FROM auth.users WHERE email = 'test@example.com';

-- Check user role was created
SELECT role FROM user_roles WHERE user_id = (
    SELECT id FROM auth.users WHERE email = 'test@example.com'
);
-- Should show: role = 'viewer'
```

### Test 3: Login with New Account

1. **On login.html**
2. **Email**: `test@example.com`
3. **Password**: `Test123456`
4. **Click**: "Login"

**Expected**:
```
✅ Successful login
✅ Redirected to index.html (viewer role) or admin.html (admin/coach role)
```

---

## 🔧 **Troubleshooting**

### Issue 1: Email Not Sent

**Symptom**: Invitation created in database but no email received

**Solutions**:

1. **Check Spam folder**

2. **Check Supabase Dashboard** → **Authentication** → **Users**
   - Look for "Invited" status

3. **Check Auth Logs**:
   - Dashboard → **Authentication** → **Logs**
   - Look for email sending errors

4. **Verify Email Provider**:
   - Dashboard → **Project Settings** → **Auth**
   - Ensure SMTP is configured (or using Supabase default)

5. **Manual workaround** (temporary):
   ```javascript
   // In browser console after sending invitation:
   const invitationData = { /* from console log */ };
   const url = `http://localhost:3000/register.html?token=${invitationData.token}`;
   console.log('Registration URL:', url);
   // Copy and send manually
   ```

### Issue 2: "Invitation not found or has expired"

**Causes**:
- Token is invalid
- Invitation already used
- Invitation expired (> 7 days)

**Fix**:
```sql
-- Check invitation status
SELECT * FROM coach_invitations WHERE email = 'user@example.com' ORDER BY created_at DESC LIMIT 1;

-- If needed, create new invitation
SELECT create_user_invitation('user@example.com');
```

### Issue 3: "Email already registered"

**Cause**: User account already exists in Supabase Auth

**Fix**:
1. User should use login page instead
2. Or admin can delete user:
   - Dashboard → **Authentication** → **Users** → Find user → Delete
3. Then send new invitation

### Issue 4: Password Validation Fails

**Common issues**:
- Password < 8 characters
- Missing uppercase letter
- Missing lowercase letter
- Missing number

**Fix**: Ensure password meets all requirements (checklist turns green)

### Issue 5: User Role Not Created

**Symptom**: User can login but has no permissions

**Fix**:
```sql
-- Manually create user role
INSERT INTO user_roles (user_id, role, can_view_all_students, can_edit_students)
VALUES (
    (SELECT id FROM auth.users WHERE email = 'user@example.com'),
    'viewer',  -- or 'coach', 'admin'
    false,
    false
);
```

---

## 🔐 **Security Considerations**

### Token Security

✅ **Tokens are**:
- 64 characters (256 bits)
- Cryptographically random
- One-time use (marked as `used` after registration)
- Time-limited (7 days expiration)

### Password Requirements

✅ **Enforced**:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

✅ **Supabase adds**:
- Password hashing (bcrypt)
- Rate limiting on auth endpoints
- CAPTCHA protection (can be enabled)

### Email Verification

⚠️ **Current Implementation**:
- Email confirmation can be enabled in Supabase settings
- Recommended for production

**To enable**:
1. Dashboard → **Authentication** → **Providers** → **Email**
2. Toggle "Confirm email" to ON
3. Users must click confirmation link before login

---

## 📊 **Database Schema**

### coach_invitations Table

```sql
CREATE TABLE coach_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    coach_id UUID REFERENCES coaches(id),  -- NULL for general invitations
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### user_roles Table

```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'admin', 'coach', 'viewer'
    coach_id UUID REFERENCES coaches(id),
    can_view_all_students BOOLEAN DEFAULT FALSE,
    can_edit_students BOOLEAN DEFAULT FALSE,
    can_manage_branches BOOLEAN DEFAULT FALSE,
    can_manage_coaches BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 🎨 **UI/UX Features**

### Registration Page

✅ **Features**:
- Same design as login page (consistent branding)
- Email pre-filled and readonly
- Password strength indicator (real-time)
- Password requirements checklist
- Password visibility toggle
- Confirm password field
- Responsive design (mobile-friendly)
- Multi-language support (EN, RU, KK)

### Form Validation

✅ **Client-side**:
- Email format validation
- Password strength validation
- Passwords match validation
- Real-time feedback

✅ **Server-side**:
- Token validation
- Email uniqueness check
- Password policy enforcement (Supabase)

---

## 🌐 **Translations**

### English (EN)

```javascript
"register.subtitle": "Create your account"
"register.emailLabel": "Email"
"register.passwordLabel": "Password"
"register.confirmPasswordLabel": "Confirm Password"
"register.createAccountButton": "Create Account"
```

### Russian (RU)

```javascript
"register.subtitle": "Создайте свой аккаунт"
"register.emailLabel": "E-mail"
"register.passwordLabel": "Пароль"
"register.confirmPasswordLabel": "Подтвердите пароль"
"register.createAccountButton": "Создать аккаунт"
```

### Kazakh (KK)

```javascript
"register.subtitle": "Аккаунт жасаңыз"
"register.emailLabel": "Email"
"register.passwordLabel": "Құпия сөз"
"register.confirmPasswordLabel": "Құпия сөзді растаңыз"
"register.createAccountButton": "Аккаунт жасау"
```

---

## 📝 **Admin Workflow**

### Inviting a New User

1. **Navigate** to Admin Dashboard → App Access
2. **Enter** user's email address
3. **Click** "Send Invite"
4. **Wait** for confirmation message
5. **User receives** email with registration link
6. **User completes** registration
7. **Admin can** (optionally) update user role:
   - Dashboard → App Access → User Management
   - Toggle permissions as needed

### Managing Invitations

**View pending invitations**:
```sql
SELECT email, created_at, expires_at
FROM coach_invitations
WHERE used = FALSE AND expires_at > NOW()
ORDER BY created_at DESC;
```

**Resend invitation** (if expired or lost):
1. Send new invitation to same email
2. Old token becomes invalid when new one is used

**Revoke invitation**:
```sql
UPDATE coach_invitations
SET expires_at = NOW()
WHERE email = 'user@example.com' AND used = FALSE;
```

---

## 🔄 **Future Enhancements**

### Potential Improvements

1. **Email Templates**:
   - Customizable templates per language
   - Branded email design with Chess Empire logo

2. **Invitation Management UI**:
   - View pending invitations in App Access page
   - Resend button for expired invitations
   - Revoke button for pending invitations

3. **Bulk Invitations**:
   - Upload CSV of email addresses
   - Send multiple invitations at once

4. **Role Pre-Assignment**:
   - Optionally specify role when sending invitation
   - User gets assigned role automatically on registration

5. **Custom Registration Fields**:
   - First name / Last name
   - Phone number
   - Branch assignment

6. **Email Verification**:
   - Require email confirmation before login
   - Resend confirmation email option

7. **Password Reset**:
   - "Forgot password" flow
   - Password reset emails

---

## ✅ **Checklist for Production**

Before deploying to production:

- [ ] Update database function in Supabase (run SQL)
- [ ] Configure email templates in Supabase Dashboard
- [ ] Set correct Site URL and Redirect URLs
- [ ] Test complete invitation flow end-to-end
- [ ] Enable email confirmation (recommended)
- [ ] Update frontend version numbers (cache busting)
- [ ] Test in all supported languages (EN, RU, KK)
- [ ] Verify password requirements are enforced
- [ ] Test error handling (expired token, used token, etc.)
- [ ] Check spam folder behavior for emails
- [ ] Set up monitoring for failed email sends
- [ ] Document admin procedures for support team
- [ ] Test on mobile devices
- [ ] Verify HTTPS is working (production)
- [ ] Update environment variables for production URLs

---

## 📞 **Support**

### Common User Questions

**Q: I didn't receive the invitation email**
**A**: Check spam folder. If still not found, contact admin to resend.

**Q: The invitation link says "expired"**
**A**: Invitations expire after 7 days. Contact admin for a new invitation.

**Q: I already have an account**
**A**: Use the login page instead. If you forgot your password, use "Forgot Password" (to be implemented).

**Q: The password requirements are too strict**
**A**: Passwords must be at least 8 characters with uppercase, lowercase, and numbers for security.

### Admin Questions

**Q: Can I see who accepted the invitation?**
**A**: Yes, check `user_roles` table or Authentication → Users in Supabase Dashboard.

**Q: Can I change a user's role after they register?**
**A**: Yes, in App Access → User Management, toggle their permissions.

**Q: Can I delete a user?**
**A**: Yes, in Supabase Dashboard → Authentication → Users → Delete.

---

## 🎯 **Success Metrics**

Track these metrics:

- ✅ Invitation emails sent successfully
- ✅ Invitation acceptance rate
- ✅ Average time to accept invitation
- ✅ Failed registration attempts
- ✅ Password reset requests
- ✅ User activation rate (login after registration)

**Query for metrics**:
```sql
-- Invitation acceptance rate
SELECT
    COUNT(*) FILTER (WHERE used = TRUE) AS accepted,
    COUNT(*) FILTER (WHERE used = FALSE AND expires_at > NOW()) AS pending,
    COUNT(*) FILTER (WHERE expires_at < NOW() AND used = FALSE) AS expired,
    ROUND(100.0 * COUNT(*) FILTER (WHERE used = TRUE) / COUNT(*), 2) AS acceptance_rate
FROM coach_invitations;
```

---

**Implementation Status**: ✅ **COMPLETE**
**Ready for**: Production Deployment
**Last Updated**: 2025-01-30

---

**Questions or Issues?** Check the troubleshooting section or contact the development team.
