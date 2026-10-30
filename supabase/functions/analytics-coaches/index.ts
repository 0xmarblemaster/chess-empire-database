import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildReport,
  parseCohortParams,
  parseReportParams,
  previousPeriod,
  resolvePeriod,
} from './coach-reports-logic.mjs'

// Coach performance reports (PRD_COACH_REPORTS.md). Read-only: only calls the
// migration 101 RPCs coach_report / coach_cohort_matrix.
//
// Auth: the Coach KPI x-api-key gate (as analytics-tournaments) plus an admin
// session (Bearer user JWT whose user_roles.role = 'admin'), OR a service key
// as Bearer (the scripts/coach_report.py cron).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

const API_KEYS = [Deno.env.get('CHESS_EMPIRE_API_KEY') ?? '', Deno.env.get('CHESS_EMPIRE_READONLY_KEY') ?? ''].filter((k) => k !== '')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CE_SECRET_KEY = Deno.env.get('CE_SECRET_KEY') ?? ''
const DB_KEY = CE_SECRET_KEY || SERVICE_ROLE_KEY
const LEGACY_SERVICE_KEY = Deno.env.get('CE_LEGACY_SERVICE_KEY') ?? ''
function validBearer(header: string | null): boolean {
  if (!header) return false
  if (SERVICE_ROLE_KEY !== '' && header === `Bearer ${SERVICE_ROLE_KEY}`) return true
  if (CE_SECRET_KEY !== '' && header === `Bearer ${CE_SECRET_KEY}`) return true
  return LEGACY_SERVICE_KEY !== '' && header === `Bearer ${LEGACY_SERVICE_KEY}`
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// 200 = allowed, 401 = no valid credentials, 403 = signed in but not admin.
// deno-lint-ignore no-explicit-any
async function authorize(req: Request, supabase: any): Promise<200 | 401 | 403> {
  const header = req.headers.get('authorization')
  if (validBearer(header)) return 200
  if (!API_KEYS.includes(req.headers.get('x-api-key') ?? '')) return 401
  const token = (header ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return 401
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return 401
  const { data: role, error: roleErr } = await supabase
    .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (roleErr) throw roleErr
  return role?.role === 'admin' ? 200 : 403
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ success: false, error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', DB_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const auth = await authorize(req, supabase)
    if (auth === 401) return json({ success: false, error: 'Unauthorized' }, 401)
    if (auth === 403) return json({ success: false, error: 'Admin role required' }, 403)

    const params = Object.fromEntries(new URL(req.url).searchParams)
    const action = params.action

    if (action === 'report') {
      const { value, error } = parseReportParams(params, Date.now())
      if (error || !value) return json({ success: false, error }, 400)
      const window = resolvePeriod(value.period, value.date)!
      const previousWindow = previousPeriod(window)!
      const [cur, prev] = await Promise.all([
        supabase.rpc('coach_report', { p_start: window.start, p_end: window.end }),
        supabase.rpc('coach_report', { p_start: previousWindow.start, p_end: previousWindow.end }),
      ])
      if (cur.error) throw cur.error
      if (prev.error) throw prev.error
      return json({ success: true, data: buildReport({ window, previousWindow, current: cur.data, previous: prev.data }) })
    }

    if (action === 'cohort_matrix') {
      const { value, error: paramError } = parseCohortParams(params)
      if (paramError || !value) return json({ success: false, error: paramError }, 400)
      const { data, error } = await supabase.rpc('coach_cohort_matrix', { p_coach: value.coach_id })
      if (error) throw error
      return json({ success: true, data })
    }

    return json({ success: false, error: 'Invalid action. Use: report, cohort_matrix' }, 400)
  } catch (e) {
    console.error('analytics-coaches error', e)
    return json({ success: false, error: (e as Error)?.message ?? String(e) }, 500)
  }
})
