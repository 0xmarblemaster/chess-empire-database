import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-session-id',
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
      const limit = Math.min(parseInt(p('limit') || '50'), 200)
      const offset = parseInt(p('offset') || '0')
      const league = p('league')
      const branchId = p('branch_id')
      const dateFrom = p('date_from')
      const dateTo = p('date_to')

      let q = supabase.from('tournaments').select('*', { count: 'exact' })
      if (league) q = q.eq('league', league)
      if (dateFrom) q = q.gte('tournament_date', dateFrom)
      if (dateTo) q = q.lte('tournament_date', dateTo)
      q = q.order('tournament_date', { ascending: false }).range(offset, offset + limit - 1)

      const { data, error, count } = await q
      if (error) throw error

      let tournaments = data || []

      // Optional branch filter — keeps only tournaments where at least one
      // participant belongs to that branch. Done client-side since tournaments
      // table itself has no branch_id column.
      if (branchId && tournaments.length > 0) {
        const ids = tournaments.map((t: any) => t.id)
        const { data: parts, error: pErr } = await supabase
          .from('tournament_participants')
          .select('tournament_id, student:students(branch_id)')
          .in('tournament_id', ids)
        if (pErr) throw pErr
        const branchTournamentIds = new Set(
          (parts || []).filter((row: any) => row.student?.branch_id === branchId).map((row: any) => row.tournament_id)
        )
        tournaments = tournaments.filter((t: any) => branchTournamentIds.has(t.id))
      }

      return json({ success: true, data: tournaments, count: count || tournaments.length, limit, offset })
    }

    if (action === 'detail') {
      const tournamentId = p('tournament_id')
      if (!tournamentId) return json({ success: false, error: 'tournament_id required' }, 400)

      const { data: tournament, error: tErr } = await supabase
        .from('tournaments').select('*').eq('id', tournamentId).maybeSingle()
      if (tErr) throw tErr
      if (!tournament) return json({ success: false, error: 'Tournament not found' }, 404)

      const { data: participants, error: pErr } = await supabase
        .from('tournament_participants')
        .select('id, place, rating_before, rating_after, rating_delta, raw_name, student:students(id, first_name, last_name, branch_id)')
        .eq('tournament_id', tournamentId)
        .order('place', { ascending: true })
      if (pErr) throw pErr

      return json({
        success: true,
        data: {
          tournament,
          participants: (participants || []).map((p: any) => ({
            id: p.id,
            place: p.place,
            rating_before: p.rating_before,
            rating_after: p.rating_after,
            rating_delta: p.rating_delta,
            raw_name: p.raw_name,
            student_id: p.student?.id || null,
            student_name: p.student ? `${p.student.first_name} ${p.student.last_name}` : p.raw_name,
            branch_id: p.student?.branch_id || null,
          })),
        },
      })
    }

    if (action === 'student_history') {
      const studentId = p('student_id')
      if (!studentId) return json({ success: false, error: 'student_id required' }, 400)

      const { data, error } = await supabase
        .from('tournament_participants')
        .select('id, place, rating_before, rating_after, rating_delta, tournament:tournaments(id, name, league, tournament_date)')
        .eq('student_id', studentId)
      if (error) throw error

      const rows = (data || [])
        .filter((r: any) => r.tournament)
        .map((r: any) => ({
          id: r.id,
          place: r.place,
          rating_before: r.rating_before,
          rating_after: r.rating_after,
          rating_delta: r.rating_delta,
          tournament_id: r.tournament.id,
          tournament_name: r.tournament.name,
          league: r.tournament.league,
          tournament_date: r.tournament.tournament_date,
        }))
        .sort((a, b) => (b.tournament_date || '').localeCompare(a.tournament_date || ''))

      const places = rows.map(r => r.place).filter((n): n is number => Number.isFinite(n))
      const deltas = rows.map(r => r.rating_delta).filter((n): n is number => Number.isFinite(n))
      const year = new Date().getFullYear()

      const aggregates = {
        total: rows.length,
        ytd: rows.filter(r => String(r.tournament_date || '').startsWith(`${year}-`)).length,
        best_place: places.length ? Math.min(...places) : null,
        avg_place: places.length ? Math.round(places.reduce((a, b) => a + b, 0) / places.length) : null,
        total_rating_gained: deltas.reduce((a, b) => a + b, 0),
        last_date: rows[0]?.tournament_date || null,
      }

      return json({ success: true, data: { tournaments: rows, aggregates }, count: rows.length })
    }

    if (action === 'branch_leaderboard') {
      const branchId = p('branch_id')
      const league = p('league')
      if (!branchId) return json({ success: false, error: 'branch_id required' }, 400)
      if (!league) return json({ success: false, error: 'league required' }, 400)

      const days = parseInt(p('days') || '90')
      const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('tournament_participants')
        .select('student_id, place, rating_delta, tournament:tournaments!inner(id, league, tournament_date), student:students!inner(id, first_name, last_name, branch_id, status)')
        .eq('student.branch_id', branchId)
        .eq('student.status', 'active')
        .eq('tournament.league', league)
        .gte('tournament.tournament_date', since)
      if (error) throw error

      const byStudent = new Map<string, { studentId: string; firstName: string; lastName: string; places: number[]; deltas: number[] }>()
      for (const row of data || []) {
        const r: any = row
        if (!r.student || !r.tournament) continue
        const id = r.student.id
        const slot = byStudent.get(id) || { studentId: id, firstName: r.student.first_name, lastName: r.student.last_name, places: [], deltas: [] }
        if (Number.isFinite(r.place)) slot.places.push(r.place)
        if (Number.isFinite(r.rating_delta)) slot.deltas.push(r.rating_delta)
        byStudent.set(id, slot)
      }

      const leaderboard = [...byStudent.values()]
        .filter(s => s.places.length > 0)
        .map(s => ({
          student_id: s.studentId,
          first_name: s.firstName,
          last_name: s.lastName,
          tournaments_played: s.places.length,
          avg_place: Math.round((s.places.reduce((a, b) => a + b, 0) / s.places.length) * 100) / 100,
          best_place: Math.min(...s.places),
          total_rating_gained: s.deltas.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => a.avg_place - b.avg_place)

      return json({ success: true, data: leaderboard, count: leaderboard.length, league, branch_id: branchId, days })
    }

    return json({ success: false, error: 'Invalid action. Use: list, detail, student_history, branch_leaderboard' }, 400)
  } catch (error) {
    return json({ success: false, error: error.message }, 500)
  }
})
