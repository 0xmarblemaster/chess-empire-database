# Invitation System - Deployment Checklist

Use this checklist to deploy the complete invitation system with automatic email sending.

---

## 📋 Pre-Deployment

- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Logged into Supabase (`supabase login`)
- [ ] Project reference ID ready (from Dashboard → Settings → General)
- [ ] All files present in project:
  - [ ] `supabase/functions/send-invitation/index.ts`
  - [ ] `register.html`
  - [ ] `register.js`
  - [ ] `crud-management.js` (updated)
  - [ ] `i18n.js` (updated)

---

## 🚀 Step 1: Edge Function Deployment

### 1.1 Link Project
```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
supabase link --project-ref YOUR_PROJECT_REF
```
- [ ] Project linked successfully
- [ ] No errors in console

### 1.2 Deploy Function
```bash
supabase functions deploy send-invitation
```
- [ ] Deployment successful
- [ ] Function version shown in output

### 1.3 Set Environment Variables
```bash
# Development
supabase secrets set SITE_URL=http://localhost:3000

# Production (when ready)
# supabase secrets set SITE_URL=https://yourdomain.com
```
- [ ] SITE_URL set correctly
- [ ] Verify with: `supabase secrets list`

### 1.4 Verify Deployment
```bash
supabase functions list
```
- [ ] `send-invitation` appears in list
- [ ] Status shows as ACTIVE

---

## 🗄️ Step 2: Database Updates

### 2.1 Update Invitation Function

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
CREATE OR REPLACE FUNCTION create_user_invitation(
    p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    invitation_token TEXT;
    invitation_id UUID;
BEGIN
    invitation_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO coach_invitations (email, token, expires_at)
    VALUES (
        p_email,
        invitation_token,
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO invitation_id;

    RETURN jsonb_build_object(
        'invitation_id', invitation_id,
        'token', invitation_token,
        'email', p_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] SQL executed without errors
- [ ] Function created successfully

### 2.2 Test Function
```sql
SELECT create_user_invitation('test@example.com');
```
- [ ] Returns JSONB with `invitation_id`, `token`, and `email`
- [ ] Token is 64 characters long

### 2.3 Clean Up Test Data
```sql
DELETE FROM coach_invitations WHERE email = 'test@example.com';
```
- [ ] Test invitation removed

---

## 📧 Step 3: Email Configuration

### 3.1 Configure Email Template

1. Go to **Supabase Dashboard → Authentication → Email Templates**
2. Select **"Invite user"**
3. Paste template:

```html
<h2>You're invited to Chess Empire!</h2>

<p>Hello,</p>

<p>You've been invited to join Chess Empire. Click the button below to create your account:</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invitation</a></p>

<p>Or copy and paste this URL into your browser:</p>
<p style="background: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; word-break: break-all;">{{ .ConfirmationURL }}</p>

<p>This invitation expires in 7 days.</p>

<p>If you didn't expect this invitation, you can safely ignore this email.</p>

<p>Best regards,<br/>Chess Empire Team</p>
```

- [ ] Template saved
- [ ] Preview looks correct

### 3.2 Set Redirect URLs

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Add to **Redirect URLs**:
   - Development: `http://localhost:3000/register.html`
   - Production: `https://yourdomain.com/register.html` (when ready)

- [ ] Redirect URLs added
- [ ] Saved successfully

### 3.3 Verify Email Provider

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Check **Email** provider is enabled

- [ ] Email provider enabled
- [ ] "Confirm email" setting noted (can be ON or OFF based on your preference)

---

## 🌐 Step 4: Frontend Deployment

### 4.1 Upload Files to Server

Upload these files:
- [ ] `register.html`
- [ ] `register.js?v=1`
- [ ] `crud-management.js` (updated version)
- [ ] `i18n.js` (updated version - increment version number)

### 4.2 Update Cache Busting

In HTML files, update version numbers:
```html
<script src="i18n.js?v=13"></script>  <!-- Increment! -->
<script src="crud-management.js?v=11"></script>  <!-- Increment! -->
<script src="register.js?v=1"></script>
```

- [ ] Version numbers incremented
- [ ] Files uploaded successfully

---

## 🧪 Step 5: Testing

### 5.1 Test Edge Function Locally (Optional)

```bash
# Start local function
supabase functions serve send-invitation

# In another terminal:
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-invitation' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"email":"test@example.com"}'
```

- [ ] Function responds with 200 OK
- [ ] Response shows success message

### 5.2 Test Complete Flow

1. Login as admin: `http://localhost:3000/admin.html`
   - [ ] Login successful

2. Navigate to **App Access** page
   - [ ] Page loads correctly
   - [ ] Invitation form visible

3. Send test invitation:
   - Email: `test@example.com`
   - [ ] Click "Send Invite"
   - [ ] Success message appears: "Invitation sent successfully!"
   - [ ] No errors in browser console

4. Check email:
   - [ ] Email received at test@example.com
   - [ ] Email contains registration link
   - [ ] Link format: `http://localhost:3000/register.html?token=...`

5. Test registration:
   - [ ] Click link in email
   - [ ] Register page loads
   - [ ] Email pre-filled correctly
   - [ ] Password requirements shown
   - [ ] Create password (e.g., "Test123456")
   - [ ] Confirm password
   - [ ] Click "Create Account"
   - [ ] Success message appears
   - [ ] Redirected to login page after 2 seconds

6. Test login:
   - [ ] Enter email: `test@example.com`
   - [ ] Enter password: `Test123456`
   - [ ] Click "Login"
   - [ ] Login successful
   - [ ] Redirected to appropriate page based on role

### 5.3 Verify Database

```sql
-- Check invitation was marked as used
SELECT email, used, created_at FROM coach_invitations
WHERE email = 'test@example.com'
ORDER BY created_at DESC LIMIT 1;
```
- [ ] `used = true`

```sql
-- Check user was created
SELECT email, created_at FROM auth.users
WHERE email = 'test@example.com';
```
- [ ] User exists in auth.users

```sql
-- Check user role was created
SELECT role, can_view_all_students FROM user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'test@example.com');
```
- [ ] Role = 'viewer'
- [ ] Permissions set correctly

### 5.4 Clean Up Test Data

```sql
-- Delete test user
DELETE FROM user_roles WHERE user_id = (SELECT id FROM auth.users WHERE email = 'test@example.com');
DELETE FROM auth.users WHERE email = 'test@example.com';
DELETE FROM coach_invitations WHERE email = 'test@example.com';
```
- [ ] Test data cleaned up

---

## 🔍 Step 6: Monitoring

### 6.1 Check Function Logs

```bash
supabase functions logs send-invitation --follow
```
- [ ] No errors in logs
- [ ] Successful invitation creation logged

### 6.2 Check Browser Console

Open browser DevTools:
- [ ] No JavaScript errors
- [ ] "✅ Invitation sent successfully" logged
- [ ] Edge Function call successful

---

## 🎯 Step 7: Production Deployment

When ready for production:

- [ ] Update SITE_URL: `supabase secrets set SITE_URL=https://yourdomain.com`
- [ ] Add production redirect URL in Supabase Dashboard
- [ ] Update email template if needed (production branding)
- [ ] Test complete flow in production
- [ ] Monitor Edge Function logs in production
- [ ] Test emails from different providers (Gmail, Outlook, etc.)
- [ ] Check spam folder behavior
- [ ] Verify HTTPS works correctly

---

## ✅ Final Checks

- [ ] All steps completed successfully
- [ ] Test invitation flow works end-to-end
- [ ] No errors in console or logs
- [ ] Documentation reviewed:
  - [ ] [QUICK_START_INVITATION_SYSTEM.md](QUICK_START_INVITATION_SYSTEM.md)
  - [ ] [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md)
  - [ ] [INVITATION_SYSTEM_GUIDE.md](INVITATION_SYSTEM_GUIDE.md)
  - [ ] [WHY_EDGE_FUNCTIONS.md](WHY_EDGE_FUNCTIONS.md)

---

## 🐛 If Something Fails

1. **Check Edge Function logs**: `supabase functions logs send-invitation`
2. **Verify environment**: `supabase secrets list`
3. **Test function locally**: `supabase functions serve`
4. **Check email template**: Dashboard → Authentication → Email Templates
5. **Verify redirect URLs**: Dashboard → Authentication → URL Configuration
6. **See troubleshooting**: [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md#troubleshooting](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md#troubleshooting)

---

## 📞 Success Criteria

✅ **System is working when**:
1. Admin clicks "Send Invite" → Success message appears immediately
2. User receives email automatically within 1-2 minutes
3. Email contains clickable registration link
4. Registration flow completes without errors
5. User can login with new credentials
6. No manual copying/pasting needed

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Production URL**: _____________
**Status**: ⬜ In Progress  ⬜ Testing  ⬜ Complete

---

🎉 **Congratulations!** Your invitation system is now live with automatic email sending via Supabase!
