# 🚀 Supabase Setup Guide for Chess Empire Database

This guide will help you set up Supabase authentication and backend for the Chess Empire Database application.

---

## 📋 Prerequisites

- Supabase account (sign up at [supabase.com](https://supabase.com))
- Access to your Vercel project

---

## Step 1: Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in the details:
   - **Project Name**: `chess-empire-database`
   - **Database Password**: *Choose a strong password and save it*
   - **Region**: Choose closest to your users (e.g., Central EU)
   - **Pricing Plan**: Free tier is sufficient to start
4. Click "Create new project"
5. Wait for the project to be provisioned (~2 minutes)

---

## Step 2: Run Database Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Copy the entire contents of `supabase-schema.sql`
4. Paste it into the SQL Editor
5. Click "Run" or press `Ctrl+Enter`
6. Verify success: You should see "Success. No rows returned"

---

## Step 3: Run Data Migration

1. Still in **SQL Editor**, create a new query
2. Copy the contents of `supabase-data-migration.sql`
3. Paste and run it
4. This will insert:
   - 7 branches
   - 10 coaches
   - Template for students (actual student migration comes next)

---

## Step 4: Migrate Student Data

You have two options:

### Option A: Manual CSV Upload (Recommended for Quick Setup)
1. Export students from the current app
2. Go to **Table Editor** > `students` table
3. Click "Insert" > "Import data from CSV"
4. Upload your student data

### Option B: Programmatic Migration (Recommended for Large Datasets)
Use the provided migration script (coming next) to programmatically insert all 70 students with proper UUIDs.

---

## Step 5: Configure Authentication

1. Go to **Authentication** > **Settings** in Supabase dashboard
2. Under **Auth Providers**, ensure "Email" is enabled
3. Configure Email Templates (optional):
   - Go to **Authentication** > **Email Templates**
   - Customize "Invite user" template if desired

---

## Step 6: Create Admin User

1. Go to **Authentication** > **Users**
2. Click "Invite User"
3. Enter the admin email: `0xmarblemaster@gmail.com`
4. Check "Auto Confirm User" (to skip email verification)
5. Click "Send Invite"
6. **Important**: Copy the user UUID (you'll need this next)

### Set Admin Password:
1. Go to **SQL Editor**
2. Run this query (replace `<user-uuid>` with the actual UUID):
```sql
-- Update user password
UPDATE auth.users
SET
  encrypted_password = crypt('TheBestGame2025!', gen_salt('bf')),
  email_confirmed_at = NOW()
WHERE id = '<user-uuid>';

-- Grant admin role
INSERT INTO user_roles (user_id, role)
VALUES ('<user-uuid>', 'admin');
```

---

## Step 7: Get Supabase Credentials

1. Go to **Settings** > **API** in your Supabase dashboard
2. Copy the following values:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public** key: `eyJhbG...` (long string)

---

## Step 8: Configure Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to **Settings** > **Environment Variables**
3. Add the following variables:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

4. Apply to: **Production, Preview, and Development**
5. Click "Save"

---

## Step 9: Verify Database Setup

Run these queries in SQL Editor to verify:

```sql
-- Check branches
SELECT COUNT(*) as branch_count FROM branches;
-- Should return 7

-- Check coaches
SELECT COUNT(*) as coach_count FROM coaches;
-- Should return 10

-- Check admin user
SELECT u.email, ur.role
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'admin';
-- Should show 0xmarblemaster@gmail.com with 'admin' role
```

---

## Step 10: Test Authentication

Before deploying, test the authentication:

1. Go to **Authentication** > **Users**
2. Find your admin user
3. Click on the user to see details
4. Verify:
   - Email is confirmed
   - User has the correct UUID
   - Password was set correctly (try logging in via the SQL editor's auth simulator)

---

## 🔐 Authentication Flow

### For Public Users (No Auth Required):
- Can search for students
- Can view student cards
- No login required

### For Coaches:
1. Admin creates coach invitation
2. Coach receives email with special link
3. Coach clicks link and sets password
4. Coach can login from home page
5. Coach sees only their students (controlled by RLS)

### For Admins:
1. Login from home page with credentials
2. Full access to all features
3. Can grant permissions via "App Access" page
4. Can create coach invitations

---

## 📊 Row Level Security (RLS)

The database is configured with RLS policies:

- **Students**: Anyone can read (public search), only authorized users can modify
- **Branches/Coaches**: Anyone can read, only admins can modify
- **User Roles**: Users can see their own role, admins see all
- **Invitations**: Only admins can create, anyone can read by token

---

## 🚨 Security Checklist

Before going live:

- [ ] Admin user created with strong password
- [ ] RLS policies are enabled on all tables
- [ ] Supabase API keys are stored in Vercel environment variables
- [ ] Email templates are customized (optional)
- [ ] Backup strategy is in place (Supabase auto-backups on Pro plan)

---

## 🔧 Troubleshooting

### Issue: "Row Level Security" errors
**Solution**: Make sure you've run the schema file completely and RLS policies are enabled.

### Issue: Can't login as admin
**Solution**: Verify the user exists in auth.users and has a record in user_roles with role='admin'.

### Issue: Environment variables not working
**Solution**: Redeploy your Vercel app after adding environment variables.

### Issue: Students not showing up
**Solution**: Check RLS policies and verify data was inserted correctly via Table Editor.

---

## 📞 Next Steps

After completing this setup:

1. ✅ Test admin login locally
2. ✅ Deploy frontend to Vercel
3. ✅ Create coach invitation system
4. ✅ Test public search functionality
5. ✅ Create App Access management page

---

## 📚 Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)

---

**Ready to proceed to Phase 2: Frontend Integration!** 🎉
