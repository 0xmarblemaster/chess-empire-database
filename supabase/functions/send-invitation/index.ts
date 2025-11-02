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
    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Step 1: Create invitation in database
    const { data: invitationData, error: dbError } = await supabaseAdmin
      .rpc('create_user_invitation', {
        p_email: email
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation', details: dbError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('✅ Invitation created:', invitationData)

    // Step 2: Build registration URL
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3000'
    const registrationUrl = `${siteUrl}/register.html?token=${invitationData.token}`

    // Step 3: Send invitation email using Supabase Auth
    const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: registrationUrl,
        data: {
          invitation_token: invitationData.token,
          invitation_id: invitationData.invitation_id
        }
      }
    )

    if (inviteError) {
      console.error('Invite error:', inviteError)

      // Clean up the invitation record if email failed
      await supabaseAdmin
        .from('coach_invitations')
        .delete()
        .eq('id', invitationData.invitation_id)

      return new Response(
        JSON.stringify({
          error: 'Failed to send invitation email',
          details: inviteError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('✅ Invitation email sent successfully')

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation sent successfully',
        email: email,
        registration_url: registrationUrl
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
