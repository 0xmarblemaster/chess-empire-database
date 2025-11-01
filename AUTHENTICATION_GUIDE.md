# 🔐 Chess Empire Authentication System - Quick Reference

## Overview

The Chess Empire Database now has a complete authentication system powered by Supabase. This guide provides a quick reference for testing and using the authentication features.

---

## 🚀 Quick Start

### 1. Set Up Supabase (First Time Only)

Follow the detailed instructions in [SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md):

1. Create Supabase project
2. Run `supabase-schema.sql`
3. Run `supabase-data-migration.sql`
4. Create admin user with credentials:
   - Email: `0xmarblemaster@gmail.com`
   - Password: `TheBestGame2025!`
5. Add Vercel environment variables:
   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 2. Configure Local Development

Update `supabase-client.js` with your credentials (temporarily for testing):

```javascript
// Line 11-12 in supabase-client.js
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'your-anon-key-here';
```

**⚠️ Important**: Never commit real credentials to git!

---

## 🎯 User Roles

### 1. **Public Users** (No Authentication)
- ✅ Can search for students on home page
- ✅ Can view student profile cards
- ❌ Cannot access admin dashboard
- ❌ Cannot edit any data

### 2. **Coaches** (Authenticated)
- ✅ Login via special invitation link
- ✅ Access admin dashboard
- ✅ View their assigned students
- ⚠️ Edit permissions managed by admins
- ❌ Cannot manage other coaches or branches

### 3. **Admins** (Authenticated)
- ✅ Full access to all features
- ✅ Manage all students, coaches, and branches
- ✅ Grant/revoke permissions to other users
- ✅ Create coach invitations

---

## 🔑 Authentication Flow

### Login Process

1. **Home Page** → Click "Login" button
2. **Redirected to** → `login.html`
3. **Enter credentials** → Email & Password
4. **Authentication** → Supabase validates credentials
5. **Role Check** → System fetches user role from `user_roles` table
6. **Redirect**:
   - Admin/Coach → `admin.html`
   - Viewer → `index.html`

### Logout Process

1. **Admin Dashboard** → Click "Logout" button (bottom of sidebar)
2. **Confirmation** → "Are you sure you want to logout?"
3. **Sign Out** → Supabase ends session
4. **Redirect** → `index.html`

### Protected Routes

Pages with authentication checks:
- ✅ `admin.html` - Requires admin or coach role
- ✅ `branch.html` - Will require authentication (Phase 7)
- ✅ Future: Coach invitation pages

---

## 📁 File Structure

### Authentication Files

```
chess-empire-database/
├── login.html                      # Login page UI
├── supabase-client.js             # Supabase client initialization
├── supabase-schema.sql            # Database schema with RLS
├── supabase-data-migration.sql    # Initial data migration
├── SUPABASE_SETUP_GUIDE.md        # Detailed setup instructions
└── AUTHENTICATION_GUIDE.md        # This file
```

### Modified Files

```
chess-empire-database/
├── admin.html                     # Added logout + auth check
├── index.html                     # Login button redirects to login.html
└── i18n.js                        # Added login/logout translations
```

---

## 🛠️ Helper Functions

The `supabase-client.js` provides these global helper functions:

### Check Authentication Status

```javascript
// Check if user is logged in
const isAuth = await window.supabaseAuth.isAuthenticated();

// Get current user object
const user = await window.supabaseAuth.getCurrentUser();

// Get user role from session
const role = window.supabaseAuth.getCurrentUserRole();
// Returns: { role: 'admin', can_edit_students: true, ... }
```

### Check User Roles

```javascript
// Check if current user is admin
const isAdmin = window.supabaseAuth.isAdmin();

// Check if current user is coach
const isCoach = window.supabaseAuth.isCoach();
```

### Authentication Guards

```javascript
// Redirect to login if not authenticated
await window.supabaseAuth.requireAuth();

// Redirect to home if not admin
await window.supabaseAuth.requireAdmin();
```

### Logout

```javascript
// Sign out current user
const { error } = await window.supabaseAuth.signOut();
```

---

## 🔒 Security Features

### Row Level Security (RLS)

All tables have RLS policies:

**Students Table**:
- ✅ Anyone can read (public search)
- ✅ Admin can insert/update/delete
- ✅ Coaches can update their own students (if permission granted)

**Branches & Coaches Tables**:
- ✅ Anyone can read
- ✅ Only admins can insert/update/delete

**User Roles Table**:
- ✅ Users can read their own role
- ✅ Admins can read all roles
- ✅ Only admins can manage roles

**Coach Invitations Table**:
- ✅ Anyone can read by token (for registration)
- ✅ Only admins can create invitations

### Session Management

- Sessions stored in Supabase (secure, httpOnly cookies)
- Auto-refresh tokens enabled
- Session persists across page reloads
- User role cached in `sessionStorage` for performance

### Protected Routes

All admin pages check authentication on load:

```javascript
// Example from admin.html
if (window.supabaseAuth) {
    window.supabaseAuth.requireAuth().then(isAuth => {
        if (!isAuth) return;

        const role = window.supabaseAuth.getCurrentUserRole();
        if (role && role.role !== 'admin' && role.role !== 'coach') {
            alert('Access denied.');
            window.location.href = 'index.html';
        }
    });
}
```

---

## 🧪 Testing Checklist

### Before Deploying

- [ ] Supabase project created and configured
- [ ] Schema and migration scripts executed
- [ ] Admin user created with correct credentials
- [ ] Environment variables added to Vercel
- [ ] Local testing completed (see below)

### Local Testing

1. **Public Access**:
   - [ ] Open `index.html`
   - [ ] Search for students works without login
   - [ ] Click on student → redirects to student profile

2. **Login Flow**:
   - [ ] Click "Login" button → redirects to `login.html`
   - [ ] Enter invalid credentials → shows error
   - [ ] Enter admin credentials → redirects to `admin.html`
   - [ ] Page shows admin dashboard

3. **Admin Dashboard**:
   - [ ] Dashboard loads with statistics
   - [ ] Can view all students
   - [ ] Filters work correctly
   - [ ] Language switcher works

4. **Logout**:
   - [ ] Click "Logout" button in sidebar
   - [ ] Confirmation dialog appears
   - [ ] After logout → redirects to home page
   - [ ] Try accessing `admin.html` directly → redirects to login

5. **Session Persistence**:
   - [ ] Login as admin
   - [ ] Refresh page → still logged in
   - [ ] Close tab and reopen → still logged in
   - [ ] Logout → session cleared

---

## 🐛 Troubleshooting

### Issue: "Supabase client not initialized"

**Solution**: Check that:
1. Supabase script loads before `supabase-client.js`
2. Credentials are correctly set in `supabase-client.js`
3. Console shows "✅ Supabase client initialized successfully"

### Issue: "Invalid email or password"

**Solution**:
1. Verify admin user was created in Supabase
2. Check email is `0xmarblemaster@gmail.com`
3. Check password is `TheBestGame2025!`
4. Run admin creation SQL again if needed

### Issue: "Access denied" after login

**Solution**:
1. Check `user_roles` table has entry for admin user
2. Verify role is set to 'admin'
3. Run this SQL to fix:
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('<admin-user-uuid>', 'admin')
   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
   ```

### Issue: Redirect loop on admin.html

**Solution**:
1. Clear browser cache and cookies
2. Clear `sessionStorage` in DevTools
3. Logout and login again

### Issue: Login page doesn't redirect

**Solution**:
1. Check browser console for errors
2. Verify Supabase URL and key are correct
3. Check RLS policies are enabled
4. Verify user_roles table has data

---

## 📝 Admin Credentials (Default)

**Email**: `0xmarblemaster@gmail.com`
**Password**: `TheBestGame2025!`

⚠️ **Change these credentials after initial setup!**

---

## 🔮 Next Steps (Phases 6-8)

### Phase 6: App Access Management
- Create admin page to manage user permissions
- Interface to grant/revoke coach permissions
- Coach invitation system UI

### Phase 7: Supabase Integration
- Replace `data.js` localStorage with Supabase queries
- Update all CRUD operations to use Supabase
- Add real-time subscriptions (optional)

### Phase 8: Deployment & Testing
- Deploy to Vercel with environment variables
- Test all authentication flows in production
- Create coach accounts and test permissions

---

## 📞 Support

For detailed setup instructions, see [SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md)

For database schema details, see [supabase-schema.sql](supabase-schema.sql)

---

**Ready to deploy!** 🚀
