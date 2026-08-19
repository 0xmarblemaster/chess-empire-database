import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-session-id',
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'
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
  return req.headers.get('x-api-key') === API_KEY || validBearer(req.headers.get('authorization'))
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
      const { data: student, error: e1 } = await supabase
        .from('students').select('id, branch_id, status').eq('id', studentId).maybeSingle()
      if (e1) throw e1
      if (!student) return json({ success: false, error: 'Student not found' }, 404)

      const { data: peers, error: e2 } = await supabase
        .from('students').select('id, branch_id').eq('status', 'active')
      if (e2) throw e2
      const activePeers = peers || []
      const activeIds = activePeers.map(p => p.id)

      const branchPeerIds = new Set(activePeers.filter(p => p.branch_id === student.branch_id).map(p => p.id))

      const CHUNK = 100
      const latest = new Map<string, number>()
      for (let i = 0; i < activeIds.length; i += CHUNK) {
        const slice = activeIds.slice(i, i + CHUNK)
        const { data: rows, error: e3 } = await supabase
          .from('student_ratings')
          .select('student_id, rating, rating_date, created_at')
          .in('student_id', slice)
          .order('rating_date', { ascending: false })
          .order('created_at', { ascending: false })
        if (e3) throw e3
        for (const r of rows || []) {
          if (!latest.has(r.student_id)) latest.set(r.student_id, r.rating)
        }
      }

      const myRating = latest.get(studentId) ?? null
      const branchWithRating = [...branchPeerIds].filter(id => latest.has(id))
      const schoolWithRating = activeIds.filter(id => latest.has(id))

      let branchRank: number | null = null
      let schoolRank: number | null = null
      if (myRating !== null) {
        branchRank = branchWithRating.filter(id => id !== studentId && (latest.get(id) as number) > myRating).length + 1
        schoolRank = schoolWithRating.filter(id => id !== studentId && (latest.get(id) as number) > myRating).length + 1
      }

      return json({
        success: true,
        data: {
          student_id: student.id,
          rating: myRating,
          branch_rank: branchRank,
          branch_size: branchWithRating.length,
          school_rank: schoolRank,
          school_size: schoolWithRating.length,
        },
      })
    }

    if (action === 'progress_ranking') {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, branch_id, current_level, current_lesson, last_name, first_name')
        .eq('status', 'active')
      if (error) throw error

      const list = students || []
      list.sort((a, b) => {
        if ((b.current_level || 1) !== (a.current_level || 1)) return (b.current_level || 1) - (a.current_level || 1)
        if ((b.current_lesson || 1) !== (a.current_lesson || 1)) return (b.current_lesson || 1) - (a.current_lesson || 1)
        const lastCmp = (a.last_name || '').localeCompare(b.last_name || '')
        if (lastCmp !== 0) return lastCmp
        return (a.first_name || '').localeCompare(b.first_name || '')
      })

      const idx = list.findIndex(s => s.id === studentId)
      if (idx === -1) {
        return json({
          success: true,
          data: {
            student_id: studentId,
            school_rank: null,
            school_size: list.length,
            branch_rank: null,
            branch_size: null,
          },
        })
      }

      const branchList = list.filter(s => s.branch_id === list[idx].branch_id)
      const branchIdx = branchList.findIndex(s => s.id === studentId)

      return json({
        success: true,
        data: {
          student_id: studentId,
          school_rank: idx + 1,
          school_size: list.length,
          branch_rank: branchIdx + 1,
          branch_size: branchList.length,
        },
      })
    }

    return json({ success: false, error: 'Invalid action. Use: profile, ratings, achievements, ranking, progress_ranking' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
