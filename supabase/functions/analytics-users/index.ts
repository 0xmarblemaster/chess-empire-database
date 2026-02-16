import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function authenticate(req: Request): boolean {
  return req.headers.get('x-api-key') === API_KEY || req.headers.get('authorization') === `Bearer ${SERVICE_ROLE_KEY}`
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!authenticate(req)) return json({ success: false, error: 'Unauthorized' }, 401)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const url = new URL(req.url)
    const p = (k: string) => url.searchParams.get(k)
    const action = p('action') || 'list'

    if (action === 'list') {
      const { data, error, count } = await supabase.from('user_roles').select('*', { count: 'exact' })
      if (error) throw error
      return json({ success: true, data, count })
    }

    if (action === 'summary') {
      const email = p('email')
      if (!email) return json({ success: false, error: 'email required' }, 400)
      
      const { data: sessions, error: e1 } = await supabase.from('user_sessions')
        .select('id, login_at, duration_minutes').eq('user_email', email).order('login_at', { ascending: false })
      if (e1) throw e1

      const sessionIds = (sessions || []).map(s => s.id)
      let totalActions = 0
      if (sessionIds.length > 0) {
        const { count, error: e2 } = await supabase.from('session_actions')
          .select('id', { count: 'exact', head: true }).in('session_id', sessionIds)
        if (e2) throw e2
        totalActions = count || 0
      }

      return json({
        success: true,
        data: {
          email,
          total_sessions: (sessions || []).length,
          last_session: sessions?.[0]?.login_at || null,
          total_actions: totalActions,
          total_duration_minutes: (sessions || []).reduce((s, r) => s + (r.duration_minutes || 0), 0),
        },
      })
    }

    if (action === 'stats') {
      const email = p('email')
      if (!email) return json({ success: false, error: 'email required' }, 400)
      
      let query = supabase.from('user_sessions').select('*').eq('user_email', email)
      if (p('from')) query = query.gte('login_at', p('from'))
      if (p('to')) query = query.lte('login_at', p('to'))
      const { data: sessions, error } = await query.order('login_at', { ascending: false })
      if (error) throw error

      const rows = sessions || []
      const totalDuration = rows.reduce((s, r) => s + (r.duration_minutes || 0), 0)
      const devices: Record<string, number> = {}
      for (const r of rows) { const d = r.device_type || 'unknown'; devices[d] = (devices[d] || 0) + 1 }

      // Get audit actions by this user
      let auditQuery = supabase.from('audit_log').select('action, entity_type').eq('changed_by_email', email)
      if (p('from')) auditQuery = auditQuery.gte('changed_at', p('from'))
      if (p('to')) auditQuery = auditQuery.lte('changed_at', p('to'))
      const { data: audits, error: e2 } = await auditQuery
      if (e2) throw e2

      const auditActions: Record<string, number> = {}
      for (const a of audits || []) { auditActions[a.action] = (auditActions[a.action] || 0) + 1 }

      return json({
        success: true,
        data: {
          email,
          sessions: rows.length,
          avg_duration: rows.length ? Math.round(totalDuration / rows.length * 10) / 10 : 0,
          total_duration: totalDuration,
          by_device: devices,
          audit_actions: auditActions,
          total_audits: (audits || []).length,
        },
      })
    }

    return json({ success: false, error: 'Invalid action. Use: list, summary, stats' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
