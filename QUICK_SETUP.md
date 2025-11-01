# 🚀 Quick Supabase Setup (5 Minutes)

Follow these steps to get your Chess Empire Database connected to Supabase:

## Step 1: Create Supabase Project (2 min)

1. Go to **[https://supabase.com/dashboard](https://supabase.com/dashboard)**
2. Click **"New Project"**
3. Fill in:
   - Name: `chess-empire-database`
   - Database Password: **(generate and save it!)**
   - Region: Europe or closest to you
4. Click **"Create new project"** (wait 2-3 minutes)

## Step 2: Run Schema SQL (1 min)

1. In Supabase dashboard → **SQL Editor** (left sidebar)
2. Click **"+ New query"**
3. Open `supabase-schema.sql` from your project
4. Copy **entire file** contents
5. Paste into SQL Editor
6. Click **"Run"** (Ctrl+Enter)
7. ✅ Should see success message

## Step 3: Run Migration SQL (30 sec)

1. Still in SQL Editor, click **"+ New query"** again
2. Open `supabase-data-migration.sql`
3. Copy and paste entire contents
4. Click **"Run"**
5. ✅ Should insert 7 branches and 10 coaches

## Step 4: Create Admin User (1 min)

1. Go to **Authentication** → **Users** (left sidebar)
2. Click **"Add user"** → **"Create new user"**
3. Fill in:
   - Email: `0xmarblemaster@gmail.com`
   - Password: `TheBestGame2025!`
   - ✅ Check "Auto Confirm User"
4. Click **"Create user"**
5. **Copy the User UID** (you'll need it in next step!)

## Step 5: Grant Admin Role (30 sec)

1. Go back to **SQL Editor**
2. Create new query
3. Paste this (replace `YOUR_USER_ID` with copied UID):
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('YOUR_USER_ID', 'admin');
   ```
4. Click **"Run"**
5. ✅ Admin role created!

## Step 6: Get API Credentials (30 sec)

1. Go to **Settings** → **API** (left sidebar)
2. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbG...` (long string)

## Step 7: Configure Local Development (1 min)

In your terminal:

```bash
# Navigate to project
cd chess-empire-database

# Copy config example
cp supabase-config.example.js supabase-config.js

# Edit the file (use any editor)
nano supabase-config.js
```

Paste your credentials:

```javascript
window.supabaseConfig = {
    url: 'https://YOUR_PROJECT_ID.supabase.co',  // from Step 6
    anonKey: 'YOUR_ANON_KEY'  // from Step 6
};
```

Save and close.

## Step 8: Test It! (10 sec)

1. Open your local site: `http://localhost:3000/login.html`
2. Should now show NO blue banner (Supabase is connected!)
3. Login with:
   - Email: `0xmarblemaster@gmail.com`
   - Password: `TheBestGame2025!`
4. ✅ Should redirect to admin dashboard!

---

## 🎉 You're Done!

Your Chess Empire Database is now:
- ✅ Connected to Supabase
- ✅ Has 7 branches
- ✅ Has 10 coaches
- ✅ Has admin user with full access
- ✅ Ready to add students!

---

## Next Steps

1. **Add Students**: Use the admin dashboard to add your 70 students
2. **Deploy to Vercel**: Follow `SUPABASE_SETUP_GUIDE.md` Step 9
3. **Invite Coaches**: Use "App Access" page to send coach invitations

---

## 🆘 Troubleshooting

**Still seeing blue banner?**
- Hard refresh browser (Ctrl+Shift+R)
- Check supabase-config.js has correct credentials
- Check browser console for errors

**Can't login?**
- Verify admin user was created in Supabase Auth → Users
- Check user email is confirmed (auto-confirm should be checked)
- Verify admin role was inserted in user_roles table

**Need help?**
- Check `SUPABASE_SETUP_GUIDE.md` for detailed instructions
- Check `AUTHENTICATION_GUIDE.md` for auth system docs
