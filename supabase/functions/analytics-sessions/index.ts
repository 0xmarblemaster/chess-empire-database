import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function authenticate(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey === API_KEY) return true
  return req.headers.get('authorization') === `Bearer ${SERVICE_ROLE_KEY}`
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
    const limit = parseInt(p('limit') || '100')
    const offset = parseInt(p('offset') || '0')

    if (action === 'list') {
      let query = supabase.from('user_sessions').select('*', { count: 'exact' })
      if (p('user_email')) query = query.eq('user_email', p('user_email'))
      if (p('status')) query = query.eq('status', p('status'))
      if (p('device_type')) query = query.eq('device_type', p('device_type'))
      if (p('from')) query = query.gte('login_at', p('from'))
      if (p('to')) query = query.lte('login_at', p('to'))
      query = query.order('login_at', { ascending: false }).range(offset, offset + limit - 1)
      const { data, error, count } = await query
      if (error) throw error
      return json({ success: true, data, count, meta: { limit, offset } })
    }

    if (action === 'stats') {
      const { data: all, error } = await supabase.from('user_sessions').select('user_email, duration_minutes, device_type')
      if (error) throw error
      const rows = all || []
      const uniqueUsers = new Set(rows.map(r => r.user_email)).size
      const totalDuration = rows.reduce((s, r) => s + (r.duration_minutes || 0), 0)
      const byDevice: Record<string, number> = {}
      for (const r of rows) {
        const d = r.device_type || 'unknown'
        byDevice[d] = (byDevice[d] || 0) + 1
      }
      return json({
        success: true,
        data: {
          total_sessions: rows.length,
          unique_users: uniqueUsers,
          avg_duration_minutes: rows.length ? Math.round(totalDuration / rows.length * 10) / 10 : 0,
          total_duration_minutes: totalDuration,
          by_device: byDevice,
        },
      })
    }

    if (action === 'detail') {
      const sessionId = p('session_id')
      if (!sessionId) return json({ success: false, error: 'session_id required' }, 400)
      const { data: session, error: e1 } = await supabase.from('user_sessions').select('*').eq('id', sessionId).maybeSingle()
      if (e1) throw e1
      if (!session) return json({ success: false, error: 'Session not found' }, 404)
      const { data: actions, error: e2 } = await supabase.from('session_actions').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
      if (e2) throw e2
      return json({ success: true, data: { ...session, actions } })
    }

    return json({ success: false, error: 'Invalid action. Use: list, stats, detail' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
