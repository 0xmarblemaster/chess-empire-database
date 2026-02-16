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
    const action = p('action') || 'ratings'
    const limit = parseInt(p('limit') || '20')

    if (action === 'ratings') {
      // Get all ratings, then pick latest per student (no DISTINCT ON via REST)
      const { data: allRatings, error } = await supabase
        .from('student_ratings')
        .select('student_id, rating, rating_date')
        .order('rating_date', { ascending: false })
        .limit(5000)
      if (error) throw error
      if (!allRatings || allRatings.length === 0) return json({ success: true, data: [], count: 0 })

      const latestRatings = new Map<string, any>()
      for (const r of allRatings) {
        if (!latestRatings.has(r.student_id)) latestRatings.set(r.student_id, r)
      }

      const sorted = [...latestRatings.values()].sort((a, b) => b.rating - a.rating).slice(0, limit)
      if (sorted.length === 0) return json({ success: true, data: [], count: 0 })

      // Fetch ALL students (simpler than .in() with many UUIDs which hits URL limits)
      let studentsQuery = supabase.from('students').select('id, first_name, last_name, branch_id, status').limit(1000)
      if (p('branch_id')) studentsQuery = studentsQuery.eq('branch_id', p('branch_id'))
      const { data: students, error: sErr } = await studentsQuery
      if (sErr) throw sErr
      const studentMap = new Map((students || []).map((s: any) => [s.id, s]))

      const leaderboard = sorted
        .filter(r => studentMap.has(r.student_id))
        .map((r, i) => {
          const s = studentMap.get(r.student_id)!
          return { rank: i + 1, student_id: r.student_id, rating: r.rating, rating_date: r.rating_date, first_name: s.first_name, last_name: s.last_name, branch_id: s.branch_id, status: s.status }
        })
      return json({ success: true, data: leaderboard, count: leaderboard.length })
    }

    if (action === 'survival') {
      // Get best score per student, optionally filtered by mode
      let query = supabase.from('survival_scores').select('student_id, score, mode, students(first_name, last_name, branch_id)')
      if (p('mode')) query = query.eq('mode', p('mode'))
      const { data, error } = await query.order('score', { ascending: false })
      if (error) throw error

      // Keep best per student
      const best = new Map<string, any>()
      for (const r of data || []) {
        if (!best.has(r.student_id) || r.score > best.get(r.student_id).score) {
          best.set(r.student_id, r)
        }
      }
      const leaderboard = [...best.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r, i) => ({ rank: i + 1, student_id: r.student_id, score: r.score, mode: r.mode, student: r.students }))

      return json({ success: true, data: leaderboard, count: leaderboard.length })
    }

    if (action === 'bot_battles') {
      const { data, error } = await supabase.from('bot_battles').select('student_id, bot_name, bot_rating, students(first_name, last_name, branch_id)')
      if (error) throw error

      // Count battles and max bot rating per student
      const stats = new Map<string, { count: number; maxRating: number; student: any }>()
      for (const r of data || []) {
        const s = stats.get(r.student_id) || { count: 0, maxRating: 0, student: r.students }
        s.count++
        if (r.bot_rating > s.maxRating) s.maxRating = r.bot_rating
        stats.set(r.student_id, s)
      }

      const leaderboard = [...stats.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([id, s], i) => ({ rank: i + 1, student_id: parseInt(id), battles: s.count, max_bot_rating: s.maxRating, student: s.student }))

      return json({ success: true, data: leaderboard, count: leaderboard.length })
    }

    return json({ success: false, error: 'Invalid action. Use: ratings, survival, bot_battles' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
