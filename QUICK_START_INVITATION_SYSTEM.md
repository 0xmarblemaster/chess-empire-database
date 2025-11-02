# Quick Start: Invitation System with Automatic Emails

## 🎯 Goal

Enable automatic email sending when admins invite users to Chess Empire - **no third-party email provider needed**.

---

## ⚡ Quick Deploy (5 minutes)

### 1. Install Supabase CLI

**macOS/Linux**:
```bash
brew install supabase/tap/supabase
```

**Windows**:
```bash
npm install -g supabase
```

### 2. Login and Link Project

```bash
# Login
supabase login

# Navigate to project
cd /home/marblemaster/Desktop/Cursor/chess-empire-database

# Link project (get YOUR_PROJECT_REF from Supabase Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Deploy Edge Function

```bash
# Deploy the function
supabase functions deploy send-invitation

# Set your site URL
supabase secrets set SITE_URL=http://localhost:3000
```

### 4. Update Database

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

### 5. Configure Email Template

1. Go to **Supabase Dashboard → Authentication → Email Templates**
2. Select **"Invite user"**
3. Paste this template:

```html
<h2>You're invited to Chess Empire!</h2>

<p>Hello,</p>

<p>You've been invited to join Chess Empire. Click the button below to create your account:</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: white; text-decoration: none; border-radius: 8px;">Accept Invitation</a></p>

<p>Or copy this URL: {{ .ConfirmationURL }}</p>

<p>This invitation expires in 7 days.</p>

<p>Best regards,<br/>Chess Empire Team</p>
```

4. **Save**

### 6. Set Redirect URL

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Add redirect URL: `http://localhost:3000/register.html`

### 7. Deploy Frontend Files

Upload these files to your server:
- `register.html` (new)
- `register.js` (new)
- `crud-management.js` (updated)
- `i18n.js` (updated)

---

## ✅ Test It

1. Login as admin: `http://localhost:3000/admin.html`
2. Go to **App Access** page
3. Enter test email: `test@example.com`
4. Click **"Send Invite"**

**Expected**:
- ✅ Success message: "Invitation sent successfully!"
- ✅ Email received automatically
- ✅ No manual link copying needed

---

## 🔍 What Changed?

### Before (Manual):
```
Admin clicks "Send Invite"
  ↓
Link copied to clipboard
  ↓
Admin manually emails the link
  ↓
User receives email
```

### After (Automatic):
```
Admin clicks "Send Invite"
  ↓
Edge Function sends email via Supabase
  ↓
User receives email automatically
```

---

## 📚 Documentation

For detailed information, see:
- **[EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md)** - Complete Edge Function setup
- **[INVITATION_SYSTEM_GUIDE.md](INVITATION_SYSTEM_GUIDE.md)** - Full system documentation

---

## 🐛 Troubleshooting

**Email not sent?**
```bash
# Check function logs
supabase functions logs send-invitation

# Verify secrets
supabase secrets list
```

**Function not found?**
```bash
# Verify deployment
supabase functions list

# Re-deploy if needed
supabase functions deploy send-invitation
```

**Still having issues?**
Check [EDGE_FUNCTION_DEPLOYMENT_GUIDE.md](EDGE_FUNCTION_DEPLOYMENT_GUIDE.md#troubleshooting) for more solutions.

---

## 🎉 That's It!

Your invitation system now sends emails automatically using Supabase's built-in email functionality - **no third-party provider needed**.
