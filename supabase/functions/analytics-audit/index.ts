import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function authenticate(req: Request): boolean {
  const authHeader = req.headers.get('authorization')
  const apiKey = req.headers.get('x-api-key')
  if (apiKey === API_KEY) return true
  if (authHeader === `Bearer ${SERVICE_ROLE_KEY}`) return true
  return false
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!authenticate(req)) return jsonResponse({ success: false, error: 'Unauthorized' }, 401)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const url = new URL(req.url)
    const p = (k: string) => url.searchParams.get(k)
    const action = p('action') || 'list'
    const limit = parseInt(p('limit') || '100')
    const offset = parseInt(p('offset') || '0')

    if (action === 'list') {
      let query = supabase.from('audit_log').select('*', { count: 'exact' })
      if (p('entity_type')) query = query.eq('entity_type', p('entity_type'))
      if (p('entity_id')) query = query.eq('entity_id', p('entity_id'))
      if (p('changed_by_email')) query = query.eq('changed_by_email', p('changed_by_email'))
      if (p('action_filter')) query = query.eq('action', p('action_filter'))
      if (p('from')) query = query.gte('changed_at', p('from'))
      if (p('to')) query = query.lte('changed_at', p('to'))
      query = query.order('changed_at', { ascending: false }).range(offset, offset + limit - 1)
      const { data, error, count } = await query
      if (error) throw error
      return jsonResponse({ success: true, data, count, meta: { limit, offset } })
    }

    if (action === 'entity') {
      const entityType = p('entity_type')
      const entityId = p('entity_id')
      if (!entityType || !entityId) return jsonResponse({ success: false, error: 'entity_type and entity_id required' }, 400)
      const { data, error, count } = await supabase.from('audit_log')
        .select('*', { count: 'exact' })
        .eq('entity_type', entityType).eq('entity_id', entityId)
        .order('changed_at', { ascending: false }).range(offset, offset + limit - 1)
      if (error) throw error
      return jsonResponse({ success: true, data, count, meta: { limit, offset } })
    }

    if (action === 'recent') {
      const { data, error } = await supabase.from('audit_log')
        .select('*').order('changed_at', { ascending: false }).limit(limit)
      if (error) throw error
      return jsonResponse({ success: true, data, count: data.length })
    }

    if (action === 'stats') {
      const { data: byAction, error: e1 } = await supabase.rpc('exec_sql', {
        query: `SELECT action, count(*)::int FROM audit_log GROUP BY action ORDER BY count DESC`
      }).maybeSingle()
      
      // Fallback: get all and aggregate in JS
      const { data: all, error: e2 } = await supabase.from('audit_log').select('action, entity_type, changed_by_email')
      if (e2) throw e2
      
      const actionCounts: Record<string, number> = {}
      const entityCounts: Record<string, number> = {}
      const userCounts: Record<string, number> = {}
      for (const row of all || []) {
        actionCounts[row.action] = (actionCounts[row.action] || 0) + 1
        entityCounts[row.entity_type] = (entityCounts[row.entity_type] || 0) + 1
        if (row.changed_by_email) userCounts[row.changed_by_email] = (userCounts[row.changed_by_email] || 0) + 1
      }
      return jsonResponse({
        success: true,
        data: {
          by_action: actionCounts,
          by_entity_type: entityCounts,
          by_user: userCounts,
          total: (all || []).length,
        },
      })
    }

    return jsonResponse({ success: false, error: 'Invalid action. Use: list, entity, recent, stats' }, 400)
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500)
  }
})
