# 🎯 How to Add Redirect URL in Supabase Dashboard

## Step-by-Step Instructions (With Exact Location)

### **Step 1: Go to Supabase Dashboard**

1. Open your browser and go to: https://app.supabase.com
2. Login if needed
3. Click on your project: **ChessEmpire_student_database**

### **Step 2: Navigate to Authentication Settings**

1. In the left sidebar, click on **"Authentication"** (shield icon)
2. You'll see several sub-menu options appear
3. Click on **"URL Configuration"**

**Path**: `Authentication → URL Configuration`

### **Step 3: Find the Redirect URLs Section**

On the URL Configuration page, you should see several sections:

1. **Site URL** (at the top)
2. **Redirect URLs** (scroll down a bit - it's below Site URL)

The "Redirect URLs" section has:
- A text label: "Redirect URLs"
- A textarea/input field where you can enter URLs
- Usually shows something like "Add additional redirect URLs (one per line)"

### **Step 4: Add Your Redirect URL**

In the **Redirect URLs** field:

1. Click in the text area
2. Type or paste this URL:
   ```
   https://chess-empire-database.vercel.app/register.html
   ```
3. If there are already other URLs listed, add this on a new line
4. Click the **"Save"** button at the bottom of the page

---

## Alternative Method (If you can't find "URL Configuration")

If you don't see "URL Configuration" in the Authentication menu, try this:

### **Option 1: Try "Settings" Instead**

1. Click **"Settings"** in the left sidebar (gear icon)
2. Click **"Authentication"** under Settings
3. Scroll down to find **"Redirect URLs"** section
4. Add the URL there

**Path**: `Settings → Authentication → Redirect URLs`

### **Option 2: Look for "Providers" Settings**

1. Click **"Authentication"** in the left sidebar
2. Click **"Providers"** (not URL Configuration)
3. Click on **"Email"** provider
4. Look for a field called **"Redirect URLs"** or **"Authorized Redirect URLs"**
5. Add the URL there

---

## What It Should Look Like

The **Redirect URLs** section typically looks like this:

```
┌─────────────────────────────────────────────────┐
│ Redirect URLs                                   │
│                                                 │
│ Add additional redirect URLs (one per line)    │
│ ┌─────────────────────────────────────────┐   │
│ │ https://example.com/auth/callback       │   │
│ │ https://chess-empire-database.vercel... │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│                                    [Save]       │
└─────────────────────────────────────────────────┘
```

---

## Direct URL (Try This First!)

Go directly to this URL in your browser:

```
https://app.supabase.com/project/papgcizhfkngubwofjuo/settings/auth
```

Then scroll down to find **"Redirect URLs"** section.

---

## What You're Looking For

You need to add this URL:
```
https://chess-empire-database.vercel.app/register.html
```

This tells Supabase: "Yes, it's safe to redirect users to this URL after they click the invitation link."

---

## Still Can't Find It?

### Try This Navigation Path:

1. **Dashboard** (home screen after login)
2. **Select your project**: ChessEmpire_student_database
3. **Left sidebar**: Click "Project Settings" (or "Settings" with gear icon)
4. **Under Settings**: Click "Authentication"
5. **Scroll down**: Look for "Redirect URLs" or "Additional Redirect URLs"

OR

1. **Dashboard**
2. **Select project**: ChessEmpire_student_database
3. **Left sidebar**: Click "Authentication"
4. **Sub-menu**: Click "URL Configuration"
5. **Scroll down**: Find "Redirect URLs" section (below "Site URL")

---

## Screenshot Description

The page should have:
- **Header**: "URL Configuration" or "Authentication Settings"
- **Section 1**: "Site URL" with a single input field
- **Section 2**: "Redirect URLs" with a multi-line text area
- **Description**: Usually says something like "Enter URLs where users can be redirected after authentication"

---

## If You're Still Stuck

Take a screenshot of:
1. The left sidebar menu (showing Authentication or Settings)
2. The main content area of the page

And I can help you find the exact location!

---

## Why This Is Needed

Without adding this redirect URL, when users click the invitation link in their email:
- Supabase will see `https://chess-empire-database.vercel.app/register.html`
- Supabase will check: "Is this URL in my allowed list?"
- If NOT in the list → **Blocks the redirect** → User sees an error
- If IN the list → ✅ Allows redirect → User sees registration page

That's why this step is critical!

---

**Quick Link**: Try going directly to https://app.supabase.com/project/papgcizhfkngubwofjuo/settings/auth and scroll down to find "Redirect URLs".
