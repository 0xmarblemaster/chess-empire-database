# Manual Deployment Steps - Complete These Now

## 🎯 Quick Commands Reference

Since we're using `npx` instead of global install, replace `supabase` with `npx supabase` in all commands.

---

## ✅ Step 1: Login to Supabase (MANUAL - Browser Required)

Run this command in your terminal:

```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
npx supabase login
```

**What will happen:**
1. Terminal will show: "Opening browser for authentication..."
2. Browser opens with Supabase login page
3. Login with your Supabase credentials
4. Browser shows "Success! You can close this tab"
5. Terminal shows "Logged in successfully"

**If browser doesn't open automatically:**
- Copy the URL from terminal
- Paste in browser manually
- Complete login
- Return to terminal

---

## ✅ Step 2: Get Your Project Reference ID

You need your Supabase project reference ID. Here's how to find it:

### Option A: From Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your Chess Empire project
3. Click **Settings** (gear icon in sidebar)
4. Click **General**
5. Copy the **Reference ID** (looks like: `abcdefghijklmnop`)

### Option B: From Project URL
Your project URL looks like: `https://abcdefghijklmnop.supabase.co`
The reference ID is the part before `.supabase.co`

**Save this ID - you'll need it next!**

---

## ✅ Step 3: Link Your Project

Replace `YOUR_PROJECT_REF` with the ID you got in Step 2:

```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
npx supabase link --project-ref YOUR_PROJECT_REF
```

**Example:**
```bash
npx supabase link --project-ref abcdefghijklmnop
```

**Expected output:**
```
Linking project...
Linked project: YOUR_PROJECT_REF
```

---

## ✅ Step 4: Deploy the Edge Function

```bash
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
npx supabase functions deploy send-invitation
```

**Expected output:**
```
Deploying function send-invitation...
Bundled send-invitation in XX ms.
Deployed function send-invitation with version XXX-XXX-XXX
```

**If you see errors:**
- Check that you're in the correct directory
- Verify the file exists: `supabase/functions/send-invitation/index.ts`
- Make sure you're logged in and linked

---

## ✅ Step 5: Set Environment Variable

Set your site URL (use localhost for development):

```bash
npx supabase secrets set SITE_URL=http://localhost:3000
```

**For production later, use your domain:**
```bash
npx supabase secrets set SITE_URL=https://yourdomain.com
```

**Verify it was set:**
```bash
npx supabase secrets list
```

**Expected output:**
```
SITE_URL=http://localhost:3000
```

---

## ✅ Step 6: Update Database Function (Manual - Browser Required)

1. **Go to Supabase Dashboard**: https://app.supabase.com
2. **Select your Chess Empire project**
3. **Click SQL Editor** (in left sidebar)
4. **Click "New Query"**
5. **Paste this SQL:**

```sql
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

    -- Return invitation details for email sending via Edge Function
    RETURN jsonb_build_object(
        'invitation_id', invitation_id,
        'token', invitation_token,
        'email', p_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

6. **Click "Run"** (or press Ctrl+Enter)
7. **Verify**: Should show "Success. No rows returned"

---

## ✅ Step 7: Configure Email Template (Manual - Browser Required)

### 7.1 Set Email Template

1. **Go to Supabase Dashboard**: https://app.supabase.com
2. **Select your project**
3. **Click Authentication** → **Email Templates**
4. **Select "Invite user"** from dropdown
5. **Replace the template** with this:

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

6. **Click "Save"**

### 7.2 Add Redirect URLs

1. **Still in Dashboard** → **Authentication** → **URL Configuration**
2. **Under "Redirect URLs"**, click "Add URL"
3. **Add**: `http://localhost:3000/register.html`
4. **(For production later)** Add: `https://yourdomain.com/register.html`
5. **Click "Save"**

### 7.3 Verify Email Provider

1. **Go to** Authentication → **Providers**
2. **Check "Email"** is enabled (toggle should be ON)
3. **Note**: "Confirm email" can be ON or OFF based on your preference

---

## ✅ Step 8: Verify Deployment

Check if the Edge Function is deployed:

```bash
npx supabase functions list
```

**Expected output:**
```
NAME              VERSION         STATUS    CREATED AT
send-invitation   XXX-XXX-XXX     ACTIVE    2025-01-30 ...
```

Check environment variables:

```bash
npx supabase secrets list
```

**Expected output:**
```
SITE_URL=http://localhost:3000
```

---

## ✅ Step 9: Test the System

### 9.1 Test Invitation Sending

1. **Open**: http://localhost:3000/admin.html
2. **Login** as admin: `0xmarblemaster@gmail.com`
3. **Go to**: App Access page
4. **Enter test email**: `test@example.com` (or your real email)
5. **Click**: "Send Invite"

**Expected:**
- ✅ Success message: "Invitation sent successfully!"
- ✅ No errors in browser console
- ✅ Email received within 1-2 minutes

### 9.2 Check Email

1. **Open inbox** for the test email
2. **Look for email** from Supabase (subject: invitation to Chess Empire)
3. **Verify link** looks like: `http://localhost:3000/register.html?token=...`

### 9.3 Test Registration

1. **Click link** in email
2. **Verify**:
   - Email is pre-filled
   - Page loads without errors
   - Password requirements shown
3. **Create password**: e.g., `Test123456`
4. **Confirm password**: `Test123456`
5. **Click**: "Create Account"

**Expected:**
- ✅ Success message: "Account created successfully!"
- ✅ Redirected to login page after 2 seconds

### 9.4 Test Login

1. **On login page**
2. **Email**: `test@example.com`
3. **Password**: `Test123456`
4. **Click**: "Login"

**Expected:**
- ✅ Login successful
- ✅ Redirected to appropriate page (index.html for viewer role)

---

## 🐛 Troubleshooting

### Email Not Received?

**Check Edge Function logs:**
```bash
npx supabase functions logs send-invitation --follow
```

**Look for:**
- ✅ "Invitation created" message
- ✅ "Invitation email sent successfully"
- ❌ Any error messages

### Function Not Working?

**1. Verify function deployed:**
```bash
npx supabase functions list
```

**2. Check if you're logged in:**
```bash
npx supabase projects list
```

**3. Re-deploy if needed:**
```bash
npx supabase functions deploy send-invitation
```

### Browser Console Errors?

**Open browser DevTools (F12) and check:**
- Network tab for failed requests
- Console tab for JavaScript errors
- Look for red error messages

### Database Errors?

**Check if function was created:**
```sql
-- Run in Supabase SQL Editor
SELECT create_user_invitation('test@example.com');
```

**Should return:**
```json
{
  "invitation_id": "...",
  "token": "...",
  "email": "test@example.com"
}
```

---

## 📋 Checklist

Copy this and check off as you complete each step:

```
[ ] Step 1: Logged into Supabase (`npx supabase login`)
[ ] Step 2: Got project reference ID from Dashboard
[ ] Step 3: Linked project (`npx supabase link --project-ref ...`)
[ ] Step 4: Deployed Edge Function (`npx supabase functions deploy send-invitation`)
[ ] Step 5: Set SITE_URL (`npx supabase secrets set SITE_URL=...`)
[ ] Step 6: Updated database function in SQL Editor
[ ] Step 7.1: Configured email template
[ ] Step 7.2: Added redirect URLs
[ ] Step 7.3: Verified email provider enabled
[ ] Step 8: Verified deployment with `functions list` and `secrets list`
[ ] Step 9.1: Tested sending invitation
[ ] Step 9.2: Received email
[ ] Step 9.3: Completed registration
[ ] Step 9.4: Logged in successfully
```

---

## 🎉 Success Criteria

✅ **System is working when:**
1. Admin clicks "Send Invite" → Immediate success message
2. Email received automatically within 1-2 minutes
3. Registration link works without errors
4. User can create account and login
5. **No manual copying/pasting needed!**

---

## 📞 Need Help?

### Common Issues:

**"Not logged in"**
- Run: `npx supabase login`
- Follow browser authentication

**"Project not linked"**
- Get project ref from Dashboard
- Run: `npx supabase link --project-ref YOUR_REF`

**"Function not found"**
- Check you're in correct directory
- Re-deploy: `npx supabase functions deploy send-invitation`

**"Email not sent"**
- Check logs: `npx supabase functions logs send-invitation`
- Verify email template configured
- Check redirect URLs set

### Full Documentation:

- **Quick Start**: [QUICK_START_INVITATION_SYSTEM.md](QUICK_START_INVITATION_SYSTEM.md)
- **Detailed Guide**: [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md)
- **Troubleshooting**: [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md#troubleshooting](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md#troubleshooting)

---

**Ready to start?** Open your terminal and begin with Step 1! 🚀
