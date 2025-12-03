import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get request body
    const { email, password, invitation_token } = await req.json()

    if (!email || !password || !invitation_token) {
      return new Response(
        JSON.stringify({ error: 'Email, password, and invitation token are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Step 1: Verify invitation token
    const { data: invitationData, error: invitationError } = await supabaseAdmin
      .from('coach_invitations')
      .select('*')
      .eq('token', invitation_token)
      .single()

    if (invitationError || !invitationData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired invitation token' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if invitation has been used
    if (invitationData.used) {
      return new Response(
        JSON.stringify({ error: 'This invitation has already been used' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if invitation has expired
    const expiresAt = new Date(invitationData.expires_at)
    if (expiresAt < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This invitation has expired' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if email matches invitation
    if (invitationData.email !== email) {
      return new Response(
        JSON.stringify({ error: 'Email does not match invitation' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Step 2: Create user with admin API (auto-confirms email)
    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        invitation_token: invitation_token,
        invitation_id: invitationData.id
      }
    })

    if (createUserError) {
      console.error('Failed to create user:', createUserError)

      // Check if user already exists
      if (createUserError.message.includes('already registered') || createUserError.message.includes('User already registered')) {
        return new Response(
          JSON.stringify({ error: 'This email is already registered. Please use the login page.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create user account', details: createUserError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('✅ User created:', userData.user.id)

    // Step 3: Mark invitation as used
    const { error: updateInvitationError } = await supabaseAdmin
      .from('coach_invitations')
      .update({ used: true })
      .eq('token', invitation_token)

    if (updateInvitationError) {
      console.error('Failed to mark invitation as used:', updateInvitationError)
      // Don't fail - user is created, this is just cleanup
    }

    // Step 4: Create user role using database function
    // This function has SECURITY DEFINER and bypasses RLS
    const { data: roleData, error: roleError } = await supabaseAdmin
      .rpc('create_user_role', {
        p_user_id: userData.user.id,
        p_role: 'coach',
        p_can_view_all_students: false,
        p_can_edit_students: true,  // Coaches CAN add/edit/delete students
        p_can_manage_branches: false,
        p_can_manage_coaches: false,
        p_can_manage_app_access: true,  // Coaches CAN access the dashboard
        p_coach_id: null  // NULL = can manage ALL students (not just assigned ones)
      })

    if (roleError) {
      console.error('❌ CRITICAL: Failed to create user role:', roleError)
      // This IS critical - fail the registration if role creation fails
      return new Response(
        JSON.stringify({
          error: 'Failed to assign user role. Please contact administrator.',
          details: roleError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('✅ User role created with ID:', roleData)

    console.log('✅ Registration completed successfully for:', email)

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account created successfully',
        user_id: userData.user.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
