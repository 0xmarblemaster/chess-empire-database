#!/bin/bash
# Chess Empire - Invitation System Deployment Commands
# Copy and paste these commands one by one

# ============================================================================
# STEP 1: Login to Supabase
# ============================================================================
# This will open your browser for authentication
cd /home/marblemaster/Desktop/Cursor/chess-empire-database
npx supabase login

# ============================================================================
# STEP 2: Link Project
# ============================================================================
# IMPORTANT: Replace YOUR_PROJECT_REF with your actual project reference ID
# Get it from: Supabase Dashboard → Settings → General → Reference ID
npx supabase link --project-ref YOUR_PROJECT_REF

# ============================================================================
# STEP 3: Deploy Edge Function
# ============================================================================
npx supabase functions deploy send-invitation

# ============================================================================
# STEP 4: Set Environment Variables
# ============================================================================
# Development
npx supabase secrets set SITE_URL=http://localhost:3000

# Production (use this later when deploying to production)
# npx supabase secrets set SITE_URL=https://yourdomain.com

# ============================================================================
# STEP 5: Verify Deployment
# ============================================================================
# List deployed functions
npx supabase functions list

# List environment secrets
npx supabase secrets list

# ============================================================================
# MONITORING & DEBUGGING
# ============================================================================
# View function logs (real-time)
npx supabase functions logs send-invitation --follow

# View last 100 log lines
npx supabase functions logs send-invitation --limit 100

# List all projects you have access to
npx supabase projects list

# ============================================================================
# NOTES:
# ============================================================================
# 1. Steps 6-7 must be done in Supabase Dashboard (browser):
#    - Update database function (SQL Editor)
#    - Configure email template (Authentication → Email Templates)
#    - Add redirect URLs (Authentication → URL Configuration)
#
# 2. See DEPLOYMENT_STEPS_TO_COMPLETE.md for detailed instructions
#
# 3. For troubleshooting, see EDGE_FUNCTION_DEPLOYMENT_GUIDE.md
# ============================================================================
