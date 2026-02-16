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
    const action = p('action') || 'profile'
    const studentId = p('student_id')

    if (!studentId) return json({ success: false, error: 'student_id required' }, 400)

    if (action === 'profile') {
      const [studentRes, ratingsRes, battlesRes, survivalRes, statusRes] = await Promise.all([
        supabase.from('students').select('*, branches(name), coaches(first_name, last_name)').eq('id', studentId).maybeSingle(),
        supabase.from('student_ratings').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(20),
        supabase.from('bot_battles').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(20),
        supabase.from('survival_scores').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(20),
        supabase.from('student_status_history').select('*').eq('student_id', studentId).order('changed_at', { ascending: false }).limit(10),
      ])

      if (studentRes.error) throw studentRes.error
      if (!studentRes.data) return json({ success: false, error: 'Student not found' }, 404)

      return json({
        success: true,
        data: {
          student: studentRes.data,
          ratings: ratingsRes.data || [],
          bot_battles: battlesRes.data || [],
          survival_scores: survivalRes.data || [],
          status_history: statusRes.data || [],
        },
      })
    }

    if (action === 'ratings') {
      const days = parseInt(p('days') || '365')
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await supabase.from('student_ratings').select('*')
        .eq('student_id', studentId).gte('created_at', since).order('created_at', { ascending: true })
      if (error) throw error

      const rows = data || []
      const trend = rows.length >= 2 ? {
        first: rows[0].rating,
        last: rows[rows.length - 1].rating,
        change: rows[rows.length - 1].rating - rows[0].rating,
        max: Math.max(...rows.map(r => r.rating)),
        min: Math.min(...rows.map(r => r.rating)),
      } : null

      return json({ success: true, data: rows, count: rows.length, trend })
    }

    if (action === 'achievements') {
      // Compute achievements from data
      const [battlesRes, survivalRes, ratingsRes] = await Promise.all([
        supabase.from('bot_battles').select('bot_rating').eq('student_id', studentId),
        supabase.from('survival_scores').select('score, mode').eq('student_id', studentId),
        supabase.from('student_ratings').select('rating').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1),
      ])

      const achievements: { name: string; description: string }[] = []
      const battles = battlesRes.data || []
      const survival = survivalRes.data || []
      const currentRating = ratingsRes.data?.[0]?.rating

      if (battles.length >= 1) achievements.push({ name: 'Bot Slayer', description: 'Completed first bot battle' })
      if (battles.length >= 10) achievements.push({ name: 'Bot Hunter', description: 'Completed 10 bot battles' })
      if (battles.length >= 50) achievements.push({ name: 'Bot Destroyer', description: 'Completed 50 bot battles' })
      const maxBot = Math.max(0, ...battles.map(b => b.bot_rating))
      if (maxBot >= 1500) achievements.push({ name: 'Giant Slayer', description: 'Defeated a 1500+ rated bot' })
      if (maxBot >= 2000) achievements.push({ name: 'Grandmaster Hunter', description: 'Defeated a 2000+ rated bot' })

      const maxSurvival = Math.max(0, ...survival.map(s => s.score))
      if (maxSurvival >= 10) achievements.push({ name: 'Survivor', description: 'Scored 10+ in survival mode' })
      if (maxSurvival >= 25) achievements.push({ name: 'Endurance Master', description: 'Scored 25+ in survival mode' })

      if (currentRating && currentRating >= 1000) achievements.push({ name: 'Four Digits', description: 'Reached 1000+ rating' })
      if (currentRating && currentRating >= 1500) achievements.push({ name: 'Advanced Player', description: 'Reached 1500+ rating' })

      return json({ success: true, data: achievements, count: achievements.length })
    }

    if (action === 'ranking') {
      const { data: student, error: e1 } = await supabase.from('students').select('id, rating, branch_id').eq('id', studentId).maybeSingle()
      if (e1) throw e1
      if (!student || !student.rating) return json({ success: false, error: 'Student not found or no rating' }, 404)

      // Branch rank
      const { count: branchHigher } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('branch_id', student.branch_id).eq('status', 'active').gt('rating', student.rating)
      const { count: branchTotal } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('branch_id', student.branch_id).eq('status', 'active').not('rating', 'is', null)

      // School rank
      const { count: schoolHigher } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('status', 'active').gt('rating', student.rating)
      const { count: schoolTotal } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('status', 'active').not('rating', 'is', null)

      return json({
        success: true,
        data: {
          student_id: student.id,
          rating: student.rating,
          branch_rank: (branchHigher || 0) + 1,
          branch_total: branchTotal || 0,
          school_rank: (schoolHigher || 0) + 1,
          school_total: schoolTotal || 0,
        },
      })
    }

    return json({ success: false, error: 'Invalid action. Use: profile, ratings, achievements, ranking' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
