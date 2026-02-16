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
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${SERVICE_ROLE_KEY}`) return true
  return false
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
    const action = p('action') || 'history'
    const limit = parseInt(p('limit') || '100')
    const offset = parseInt(p('offset') || '0')

    if (action === 'history') {
      let query = supabase.from('student_status_history').select('*, students(first_name, last_name)', { count: 'exact' })
      if (p('student_id')) query = query.eq('student_id', p('student_id'))
      if (p('old_status')) query = query.eq('old_status', p('old_status'))
      if (p('new_status')) query = query.eq('new_status', p('new_status'))
      if (p('from')) query = query.gte('changed_at', p('from'))
      if (p('to')) query = query.lte('changed_at', p('to'))
      query = query.order('changed_at', { ascending: false }).range(offset, offset + limit - 1)
      const { data, error, count } = await query
      if (error) throw error
      return json({ success: true, data, count, meta: { limit, offset } })
    }

    if (action === 'transitions') {
      const { data: all, error } = await supabase.from('student_status_history').select('old_status, new_status')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const r of all || []) {
        const key = `${r.old_status} → ${r.new_status}`
        counts[key] = (counts[key] || 0) + 1
      }
      return json({ success: true, data: counts, total: (all || []).length })
    }

    if (action === 'freezes') {
      const studentId = p('student_id')
      if (!studentId) return json({ success: false, error: 'student_id required' }, 400)
      const { data, error } = await supabase.from('student_status_history')
        .select('*')
        .eq('student_id', studentId)
        .or('old_status.eq.frozen,new_status.eq.frozen')
        .order('changed_at', { ascending: true })
      if (error) throw error
      return json({ success: true, data, count: (data || []).length })
    }

    if (action === 'stats') {
      const { data: all, error } = await supabase.from('student_status_history').select('old_status, new_status, changed_by')
      if (error) throw error
      const byType: Record<string, number> = {}
      const byChanger: Record<string, number> = {}
      for (const r of all || []) {
        const key = `${r.old_status} → ${r.new_status}`
        byType[key] = (byType[key] || 0) + 1
        if (r.changed_by) byChanger[r.changed_by] = (byChanger[r.changed_by] || 0) + 1
      }
      return json({ success: true, data: { by_transition: byType, by_changer: byChanger, total: (all || []).length } })
    }

    return json({ success: false, error: 'Invalid action. Use: history, transitions, freezes, stats' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
