import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseLeaderboardParams } from '../students-api/students-logic.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-session-id',
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


function authenticate(req: Request): boolean {
  return API_KEYS.includes(req.headers.get('x-api-key') ?? '') || validBearer(req.headers.get('authorization'))
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!authenticate(req)) return json({ success: false, error: 'Unauthorized' }, 401)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', DB_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
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
      // Puzzle Rush board via the get_puzzle_rush_leaderboard RPC (migration 093):
      // best per active student, competition rank, Almaty windows, no row cap.
      const parsed = parseLeaderboardParams({
        scope: p('scope'), period: p('period'), branch_id: p('branch_id'),
        student_id: p('student_id'), limit: p('limit'),
      }, 20)
      if (!parsed.value) return json({ success: false, error: `Invalid parameter: ${parsed.field}` }, 400)
      const q = parsed.value
      const { data, error } = await supabase.rpc('get_puzzle_rush_leaderboard', {
        p_scope: q.scope, p_period: q.period, p_branch_id: q.branch_id,
        p_student_id: q.student_id, p_limit: q.limit,
      })
      if (error) throw error
      const leaderboard = (data || []).map((r: any) => ({
        rank: Number(r.rank),
        student_id: r.student_id,
        score: r.best_score,
        mode: 'puzzle_rush',
        student: { first_name: r.first_name, last_name: r.last_name, branch_id: r.branch_id },
        branch_name: r.branch_name,
        achieved_at: r.achieved_at,
        source: r.source,
        is_self: r.is_self,
      }))
      const total = data && data.length ? Number(data[0].total_count) : 0
      return json({ success: true, data: leaderboard, count: leaderboard.length, total_count: total, scope: q.scope, period: q.period })
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
