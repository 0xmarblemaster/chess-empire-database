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
    const limit = parseInt(p('limit') || '100')
    const offset = parseInt(p('offset') || '0')

    if (action === 'list') {
      let query = supabase.from('attendance').select('*, students(first_name, last_name)', { count: 'exact' })
      if (p('branch_id')) query = query.eq('branch_id', p('branch_id'))
      if (p('schedule_type')) query = query.eq('schedule_type', p('schedule_type'))
      if (p('student_id')) query = query.eq('student_id', p('student_id'))
      if (p('coach_id')) query = query.eq('coach_id', p('coach_id'))
      if (p('status')) query = query.eq('status', p('status'))
      if (p('from')) query = query.gte('attendance_date', p('from'))
      if (p('to')) query = query.lte('attendance_date', p('to'))
      query = query.order('attendance_date', { ascending: false }).range(offset, offset + limit - 1)
      const { data, error, count } = await query
      if (error) throw error
      return json({ success: true, data, count, meta: { limit, offset } })
    }

    if (action === 'rates') {
      const branchId = p('branch_id')
      if (!branchId) return json({ success: false, error: 'branch_id required' }, 400)
      
      let query = supabase.from('attendance').select('student_id, status').eq('branch_id', branchId)
      if (p('schedule_type')) query = query.eq('schedule_type', p('schedule_type'))
      if (p('from')) query = query.gte('attendance_date', p('from'))
      if (p('to')) query = query.lte('attendance_date', p('to'))
      const { data, error } = await query
      if (error) throw error

      const studentStats: Record<string, { total: number; present: number }> = {}
      for (const r of data || []) {
        if (!studentStats[r.student_id]) studentStats[r.student_id] = { total: 0, present: 0 }
        studentStats[r.student_id].total++
        if (r.status === 'present') studentStats[r.student_id].present++
      }

      const rates = Object.entries(studentStats).map(([id, s]) => ({
        student_id: parseInt(id),
        total: s.total,
        present: s.present,
        rate: Math.round(s.present / s.total * 1000) / 10,
      })).sort((a, b) => b.rate - a.rate)

      return json({ success: true, data: rates, count: rates.length })
    }

    if (action === 'summary') {
      const branchId = p('branch_id')
      const year = p('year')
      const month = p('month')
      
      let query = supabase.from('attendance').select('status, schedule_type, student_id')
      if (branchId) query = query.eq('branch_id', branchId)
      if (year && month) {
        const from = `${year}-${month.padStart(2, '0')}-01`
        const to = `${year}-${month.padStart(2, '0')}-31`
        query = query.gte('attendance_date', from).lte('attendance_date', to)
      }
      const { data, error } = await query
      if (error) throw error

      const rows = data || []
      const statusCounts: Record<string, number> = {}
      const bySchedule: Record<string, number> = {}
      const uniqueStudents = new Set<string>()
      for (const r of rows) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
        bySchedule[r.schedule_type || 'unknown'] = (bySchedule[r.schedule_type || 'unknown'] || 0) + 1
        uniqueStudents.add(r.student_id)
      }

      return json({
        success: true,
        data: {
          total_records: rows.length,
          unique_students: uniqueStudents.size,
          by_status: statusCounts,
          by_schedule: bySchedule,
          attendance_rate: rows.length ? Math.round((statusCounts['present'] || 0) / rows.length * 1000) / 10 : 0,
        },
      })
    }

    if (action === 'alerts') {
      const branchId = p('branch_id')
      const threshold = parseInt(p('threshold') || '70')
      if (!branchId) return json({ success: false, error: 'branch_id required' }, 400)

      let query = supabase.from('attendance').select('student_id, status').eq('branch_id', branchId)
      if (p('from')) query = query.gte('attendance_date', p('from'))
      if (p('to')) query = query.lte('attendance_date', p('to'))
      const { data, error } = await query
      if (error) throw error

      const stats: Record<string, { total: number; present: number }> = {}
      for (const r of data || []) {
        if (!stats[r.student_id]) stats[r.student_id] = { total: 0, present: 0 }
        stats[r.student_id].total++
        if (r.status === 'present') stats[r.student_id].present++
      }

      const alerts = Object.entries(stats)
        .map(([id, s]) => ({ student_id: parseInt(id), total: s.total, present: s.present, rate: Math.round(s.present / s.total * 1000) / 10 }))
        .filter(s => s.rate < threshold)
        .sort((a, b) => a.rate - b.rate)

      // Get student names
      const studentIds = alerts.map(a => a.student_id)
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('students').select('id, first_name, last_name').in('id', studentIds)
        const nameMap = new Map((students || []).map(s => [s.id, `${s.first_name} ${s.last_name}`]))
        for (const a of alerts) (a as any).student_name = nameMap.get(a.student_id) || 'Unknown'
      }

      return json({ success: true, data: alerts, count: alerts.length, meta: { threshold } })
    }

    if (action === 'calendar') {
      const branchId = p('branch_id')
      const year = p('year')
      const month = p('month')
      if (!branchId || !year || !month) return json({ success: false, error: 'branch_id, year, month required' }, 400)

      const from = `${year}-${month.padStart(2, '0')}-01`
      const to = `${year}-${month.padStart(2, '0')}-31`
      let query = supabase.from('attendance').select('attendance_date, student_id, status, schedule_type, time_slot')
        .eq('branch_id', branchId).gte('attendance_date', from).lte('attendance_date', to)
      if (p('schedule_type')) query = query.eq('schedule_type', p('schedule_type'))
      const { data, error } = await query.order('attendance_date', { ascending: true })
      if (error) throw error

      // Group by date
      const calendar: Record<string, any[]> = {}
      for (const r of data || []) {
        if (!calendar[r.attendance_date]) calendar[r.attendance_date] = []
        calendar[r.attendance_date].push(r)
      }

      return json({ success: true, data: calendar, total_records: (data || []).length })
    }

    return json({ success: false, error: 'Invalid action. Use: list, rates, summary, alerts, calendar' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
