# Supabase Edge Function Deployment Guide

## 📋 Overview

This guide explains how to deploy the `send-invitation` Edge Function to enable **automatic email sending** when admins invite users.

**Why Edge Functions?**
- ✅ Server-side execution (secure)
- ✅ Access to service role key (can use admin API)
- ✅ Built-in CORS handling
- ✅ Automatic email sending via Supabase Auth
- ✅ No third-party email provider needed

---

## 🚀 Deployment Steps

### Prerequisites

1. **Install Supabase CLI**:
```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (via npm)
npm install -g supabase

# Verify installation
supabase --version
```

2. **Login to Supabase**:
```bash
supabase login
```
This will open your browser - login with your Supabase account.

---

### Step 1: Link Your Project

Navigate to your project directory:
```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
```

Link to your Supabase project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**To find your project ref**:
1. Go to Supabase Dashboard → Project Settings
2. Copy the "Reference ID" (looks like: `abcdefghijklmnop`)

---

### Step 2: Deploy the Edge Function

Deploy the function:
```bash
supabase functions deploy send-invitation
```

**Expected output**:
```
Deploying function send-invitation (script: supabase/functions/send-invitation/index.ts)
Bundled send-invitation in XX ms.
Deployed function send-invitation with version XXX-XXX-XXX
```

---

### Step 3: Set Environment Variables

The Edge Function needs these environment variables:
- `SUPABASE_URL` (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)
- `SITE_URL` (you need to set this)

Set the site URL:
```bash
# For development
supabase secrets set SITE_URL=http://localhost:3000

# For production
supabase secrets set SITE_URL=https://yourdomain.com
```

Verify secrets:
```bash
supabase secrets list
```

---

### Step 4: Configure Email Templates (IMPORTANT!)

The Edge Function uses Supabase's built-in email system. You MUST configure the email template:

1. **Go to Supabase Dashboard** → **Authentication** → **Email Templates**
2. **Select**: "Invite user" template
3. **Update the template**:

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

**Important**: The `{{ .ConfirmationURL }}` will automatically be replaced with the registration link.

4. **Save the template**

---

### Step 5: Update Redirect URLs

1. **Go to**: Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Add these redirect URLs**:
   - Development: `http://localhost:3000/register.html`
   - Production: `https://yourdomain.com/register.html`

---

### Step 6: Test the Function

Test the Edge Function locally first:

```bash
# Start local development
supabase functions serve send-invitation

# In another terminal, test it:
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-invitation' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"email":"test@example.com"}'
```

**Expected response**:
```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "email": "test@example.com",
  "registration_url": "http://localhost:3000/register.html?token=..."
}
```

---

### Step 7: Test in Your Application

1. **Login to admin panel**: `http://localhost:3000/admin.html`
2. **Go to**: App Access page
3. **Enter test email**: `test@example.com`
4. **Click**: "Send Invite"

**Expected behavior**:
- ✅ Console shows: "✅ Invitation sent successfully"
- ✅ Success message: "Invitation sent successfully!"
- ✅ Email received with registration link
- ✅ No manual copying/pasting needed

---

## 🔧 Troubleshooting

### Issue 1: "Function not found"

**Symptom**: Error when calling the function
**Solution**:
```bash
# Re-deploy the function
supabase functions deploy send-invitation

# Verify it's deployed
supabase functions list
```

### Issue 2: "Invalid JWT"

**Symptom**: Authorization error
**Solution**: Make sure you're logged in and linked:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### Issue 3: Email not sent

**Symptom**: Function succeeds but no email
**Causes**:
1. Email template not configured
2. Redirect URLs not set
3. Email provider not enabled

**Solutions**:
1. Check Dashboard → Authentication → Email Templates
2. Check Dashboard → Authentication → URL Configuration
3. Check Dashboard → Project Settings → Auth → Email Provider

### Issue 4: "SITE_URL not set"

**Symptom**: Registration URL shows "undefined"
**Solution**:
```bash
supabase secrets set SITE_URL=http://localhost:3000
```

### Issue 5: CORS errors

**Symptom**: Browser shows CORS error
**Solution**: The function includes CORS headers. If still failing:
1. Check that OPTIONS requests are handled (they are in the code)
2. Verify the function is deployed correctly
3. Try clearing browser cache

---

## 📊 Monitoring

### View Function Logs

```bash
# Follow logs in real-time
supabase functions logs send-invitation --follow

# View last 100 lines
supabase functions logs send-invitation --limit 100
```

### Check Function Status

```bash
supabase functions list
```

**Expected output**:
```
NAME              VERSION         STATUS    CREATED AT
send-invitation   XXX-XXX-XXX     ACTIVE    2025-01-30 ...
```

---

## 🔐 Security Notes

### Environment Variables

- ✅ `SUPABASE_SERVICE_ROLE_KEY` is **only** accessible server-side in Edge Functions
- ✅ Client-side JavaScript **cannot** access this key
- ✅ This is why the previous implementation failed - we tried to use admin API from browser

### Email Templates

- ✅ Email templates are stored server-side in Supabase
- ✅ Cannot be modified by client-side code
- ✅ Tokens are generated server-side with cryptographic randomness

### Rate Limiting

Consider adding rate limiting to prevent abuse:

```typescript
// In the Edge Function, add:
const { data: recentInvites } = await supabaseAdmin
  .from('coach_invitations')
  .select('created_at')
  .eq('email', email)
  .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour

if (recentInvites && recentInvites.length >= 3) {
  return new Response(
    JSON.stringify({ error: 'Too many invitations sent to this email. Please wait.' }),
    { status: 429, headers: corsHeaders }
  )
}
```

---

## 📝 Alternative Approach: Using Supabase Email Confirmation

If you prefer a simpler approach without Edge Functions:

### Option 1: Standard Signup with Email Confirmation

1. **Enable email confirmation**:
   - Dashboard → Authentication → Providers → Email
   - Toggle "Confirm email" to ON

2. **Modify the flow**:
   - Admin creates user directly with `auth.admin.createUser()`
   - User receives confirmation email automatically
   - User clicks link and sets password
   - This is the approach your previous project likely used

3. **Update crud-management.js**:
```javascript
// Instead of Edge Function, use direct signup
const { data, error } = await window.supabaseClient.auth.signUp({
  email: email,
  password: generateTemporaryPassword(), // Random password
  options: {
    emailRedirectTo: `${window.location.origin}/register.html`,
    data: { invited_by: 'admin' }
  }
})
```

However, this approach has limitations:
- ❌ User must set password before email confirmation
- ❌ Less control over invitation flow
- ❌ Can't track invitation expiration easily

**The Edge Function approach is recommended** for full control.

---

## ✅ Production Checklist

Before deploying to production:

- [ ] Deploy Edge Function: `supabase functions deploy send-invitation`
- [ ] Set production SITE_URL: `supabase secrets set SITE_URL=https://yourdomain.com`
- [ ] Configure email template in Supabase Dashboard
- [ ] Add production redirect URL to Authentication settings
- [ ] Test invitation flow end-to-end
- [ ] Update database function (from INVITATION_SYSTEM_GUIDE.md)
- [ ] Deploy updated crud-management.js to production
- [ ] Monitor function logs after first production invite
- [ ] Test on multiple email providers (Gmail, Outlook, etc.)
- [ ] Check spam folder behavior
- [ ] Verify HTTPS works correctly

---

## 🎯 Summary

**What this fixes**:
- ✅ Emails are now sent **automatically** when admin sends invitation
- ✅ No manual copying/pasting needed
- ✅ No third-party email provider needed
- ✅ Uses Supabase's built-in email system
- ✅ Secure server-side execution

**The complete flow**:
```
1. Admin clicks "Send Invite"
   ↓
2. Frontend calls Edge Function
   ↓
3. Edge Function creates invitation in database
   ↓
4. Edge Function calls Supabase admin API to send email
   ↓
5. Supabase sends email using configured template
   ↓
6. User receives email with registration link
   ↓
7. User clicks link → register.html?token=xxx
   ↓
8. User creates password
   ↓
9. Account created, invitation marked as used
   ↓
10. User redirected to login page
```

---

## 📞 Support

If you encounter issues:

1. **Check function logs**: `supabase functions logs send-invitation`
2. **Verify environment**: `supabase secrets list`
3. **Test locally first**: `supabase functions serve`
4. **Check email template**: Dashboard → Authentication → Email Templates
5. **Verify redirect URLs**: Dashboard → Authentication → URL Configuration

---

**Last Updated**: 2025-01-30
**Status**: ✅ Ready for deployment
