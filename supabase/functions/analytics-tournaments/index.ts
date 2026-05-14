import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-session-id',
}

const API_KEY = 'ce-api-2026-k8x9m2p4q7w1'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Weights for the coach composite score (0–100). Tune in one place — every
// metric is first normalized to 0–100 then blended via these weights.
// Must sum to 1.0.
export const COACH_SCORE_WEIGHTS = {
  participation: 0.30,
  rating_delta:  0.25,
  top3:          0.20,
  promotion:     0.15,
  razryad:       0.10,
}

function authenticate(req: Request): boolean {
  return req.headers.get('x-api-key') === API_KEY || req.headers.get('authorization') === `Bearer ${SERVICE_ROLE_KEY}`
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// League thresholds — mirror migration 038 calc_league_from_rating().
export function calcLeagueFromRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null
  if (rating > 800) return 'A'
  if (rating >= 450) return 'B'
  return 'C'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Each sub-metric maps raw aggregate into a 0–100 score. Pure functions
// so they're easy to unit-test and to retune later.
export function normalizeParticipation(participants: number, activeStudents: number): number {
  if (activeStudents <= 0) return 0
  return clamp((participants / activeStudents) * 100, 0, 100)
}

export function normalizeRatingDelta(avgDelta: number): number {
  // Anchor: 0 delta → 50, +50 delta → 100, -50 delta → 0. Tunable.
  return clamp(50 + avgDelta, 0, 100)
}

export function normalizeTop3(top3Count: number, totalResults: number): number {
  if (totalResults <= 0) return 0
  return clamp((top3Count / totalResults) * 100, 0, 100)
}

export function normalizePromotion(promotions: number, activeStudents: number): number {
  if (activeStudents <= 0) return 0
  // 50% of students promoted in window → score 100.
  return clamp((promotions / activeStudents) * 200, 0, 100)
}

export function normalizeRazryad(newRazryads: number, activeStudents: number): number {
  if (activeStudents <= 0) return 0
  // 25% of students earning a new razryad in window → score 100.
  return clamp((newRazryads / activeStudents) * 400, 0, 100)
}

export interface CompositeInput {
  active_students_count: number
  participants_count: number
  total_results: number       // total tournament_participants rows in window
  top3_count: number
  avg_rating_delta: number    // mean of rating_delta across all results in window
  promotions_count: number
  new_razryads_count: number
}

export function calcCompositeScore(m: CompositeInput): number {
  const parts = {
    participation: normalizeParticipation(m.participants_count, m.active_students_count),
    rating_delta:  normalizeRatingDelta(m.avg_rating_delta),
    top3:          normalizeTop3(m.top3_count, m.total_results),
    promotion:     normalizePromotion(m.promotions_count, m.active_students_count),
    razryad:       normalizeRazryad(m.new_razryads_count, m.active_students_count),
  }
  const score =
    parts.participation * COACH_SCORE_WEIGHTS.participation +
    parts.rating_delta  * COACH_SCORE_WEIGHTS.rating_delta +
    parts.top3          * COACH_SCORE_WEIGHTS.top3 +
    parts.promotion     * COACH_SCORE_WEIGHTS.promotion +
    parts.razryad       * COACH_SCORE_WEIGHTS.razryad
  return Math.round(score * 10) / 10
}

function validateWindow(start: string | null, end: string | null): string | null {
  if (!start) return 'window_start required (ISO date, e.g. 2026-01-01)'
  if (!end) return 'window_end required (ISO date, e.g. 2026-12-31)'
  if (!/^\d{4}-\d{2}-\d{2}/.test(start) || !/^\d{4}-\d{2}-\d{2}/.test(end)) {
    return 'window_start and window_end must be ISO dates (YYYY-MM-DD)'
  }
  if (start > end) return 'window_start must be <= window_end'
  return null
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

      type LbSlot = { studentId: string; firstName: string; lastName: string; places: number[]; deltas: number[] }
      const byStudent = new Map<string, LbSlot>()
      for (const row of data || []) {
        const r: any = row
        if (!r.student || !r.tournament) continue
        const id = r.student.id
        const slot: LbSlot = byStudent.get(id) || { studentId: id, firstName: r.student.first_name, lastName: r.student.last_name, places: [], deltas: [] }
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

    if (action === 'coach_leaderboard') {
      const windowStart = p('window_start')
      const windowEnd = p('window_end')
      const branchId = p('branch_id') // optional
      const validationError = validateWindow(windowStart, windowEnd)
      if (validationError) return json({ success: false, error: validationError }, 400)

      // 1. Coaches (optionally scoped to a branch via the junction table).
      let coachIdsScope: Set<string> | null = null
      if (branchId) {
        const { data: cb, error: cbErr } = await supabase
          .from('coach_branches').select('coach_id').eq('branch_id', branchId)
        if (cbErr) throw cbErr
        coachIdsScope = new Set((cb || []).map((r: any) => r.coach_id))
        if (coachIdsScope.size === 0) {
          return json({ success: true, data: [], count: 0, window: { start: windowStart, end: windowEnd } })
        }
      }

      let coachQuery = supabase.from('coaches').select('id, first_name, last_name')
      if (coachIdsScope) coachQuery = coachQuery.in('id', [...coachIdsScope])
      const { data: coaches, error: coachesErr } = await coachQuery
      if (coachesErr) throw coachesErr

      // Pull coach→branches mapping in one go so each row carries its branches list.
      const allCoachIds = (coaches || []).map((c: any) => c.id)
      const branchesByCoach = new Map<string, string[]>()
      if (allCoachIds.length > 0) {
        const { data: cbAll, error: cbAllErr } = await supabase
          .from('coach_branches').select('coach_id, branch_id').in('coach_id', allCoachIds)
        if (cbAllErr) throw cbAllErr
        for (const row of cbAll || []) {
          const arr = branchesByCoach.get((row as any).coach_id) || []
          arr.push((row as any).branch_id)
          branchesByCoach.set((row as any).coach_id, arr)
        }
      }

      // 2. Active students assigned to these coaches.
      const { data: students, error: stErr } = await supabase
        .from('students').select('id, coach_id, status')
        .in('coach_id', allCoachIds.length ? allCoachIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('status', 'active')
      if (stErr) throw stErr

      const studentIdsByCoach = new Map<string, string[]>()
      const coachByStudent = new Map<string, string>()
      for (const s of students || []) {
        const arr = studentIdsByCoach.get((s as any).coach_id) || []
        arr.push((s as any).id)
        studentIdsByCoach.set((s as any).coach_id, arr)
        coachByStudent.set((s as any).id, (s as any).coach_id)
      }
      const allStudentIds = [...coachByStudent.keys()]

      // 3. Tournament participations in window.
      let participations: any[] = []
      if (allStudentIds.length > 0) {
        const { data: parts, error: pErr } = await supabase
          .from('tournament_participants')
          .select('student_id, place, rating_delta, tournament:tournaments!inner(id, tournament_date)')
          .in('student_id', allStudentIds)
          .gte('tournament.tournament_date', windowStart)
          .lte('tournament.tournament_date', windowEnd)
        if (pErr) throw pErr
        participations = (parts || []).filter((r: any) => r.tournament)
      }

      // 4. League promotions in window.
      let promotions: any[] = []
      if (allStudentIds.length > 0) {
        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, occurred_at')
          .in('student_id', allStudentIds)
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) throw evErr
        promotions = ev || []
      }

      // 5. New razryads in window.
      let razryadEvents: any[] = []
      if (allStudentIds.length > 0) {
        const { data: rz, error: rzErr } = await supabase
          .from('razryad_history')
          .select('student_id, new_razryad, changed_at')
          .in('student_id', allStudentIds)
          .gte('changed_at', windowStart)
          .lte('changed_at', `${windowEnd}T23:59:59.999Z`)
        if (rzErr) throw rzErr
        // Only count transitions INTO a real razryad (not 'none').
        razryadEvents = (rz || []).filter((r: any) => r.new_razryad && r.new_razryad !== 'none')
      }

      // 6. Roll up per coach.
      const rows = (coaches || []).map((coach: any) => {
        const myStudentIds = new Set(studentIdsByCoach.get(coach.id) || [])
        const myParts = participations.filter((p: any) => myStudentIds.has(p.student_id))
        const myProms = promotions.filter((p: any) => myStudentIds.has(p.student_id))
        const myRaz   = razryadEvents.filter((r: any) => myStudentIds.has(r.student_id))

        const tournamentIds = new Set<string>()
        const participantStudentIds = new Set<string>()
        const places: number[] = []
        const deltas: number[] = []
        let top1 = 0
        let top3 = 0
        for (const r of myParts) {
          tournamentIds.add(r.tournament.id)
          participantStudentIds.add(r.student_id)
          if (Number.isFinite(r.place)) {
            places.push(r.place)
            if (r.place === 1) top1++
            if (r.place <= 3) top3++
          }
          if (Number.isFinite(r.rating_delta)) deltas.push(r.rating_delta)
        }

        const activeStudentsCount = myStudentIds.size
        const totalResults = myParts.length
        const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0
        const totalRatingGained = deltas.reduce((a, b) => a + b, 0)

        const composite = calcCompositeScore({
          active_students_count: activeStudentsCount,
          participants_count: participantStudentIds.size,
          total_results: totalResults,
          top3_count: top3,
          avg_rating_delta: avgDelta,
          promotions_count: myProms.length,
          new_razryads_count: myRaz.length,
        })

        return {
          coach_id: coach.id,
          coach_name: `${coach.first_name} ${coach.last_name}`.trim(),
          branches: branchesByCoach.get(coach.id) || [],
          active_students_count: activeStudentsCount,
          total_tournaments: tournamentIds.size,
          avg_place: places.length ? Math.round((places.reduce((a, b) => a + b, 0) / places.length) * 100) / 100 : null,
          top1_count: top1,
          top3_count: top3,
          total_rating_gained: totalRatingGained,
          promotions_count: myProms.length,
          new_razryads_count: myRaz.length,
          composite_score: composite,
        }
      }).sort((a, b) => b.composite_score - a.composite_score)

      return json({
        success: true,
        data: rows,
        count: rows.length,
        window: { start: windowStart, end: windowEnd },
        branch_id: branchId || null,
        weights: COACH_SCORE_WEIGHTS,
      })
    }

    if (action === 'coach_kpi_summary') {
      const coachId = p('coach_id')
      const windowStart = p('window_start')
      const windowEnd = p('window_end')
      if (!coachId) return json({ success: false, error: 'coach_id required' }, 400)
      const validationError = validateWindow(windowStart, windowEnd)
      if (validationError) return json({ success: false, error: validationError }, 400)

      const { data: coach, error: coachErr } = await supabase
        .from('coaches').select('id, first_name, last_name').eq('id', coachId).maybeSingle()
      if (coachErr) throw coachErr
      if (!coach) return json({ success: false, error: 'Coach not found' }, 404)

      const { data: students, error: stErr } = await supabase
        .from('students').select('id, first_name, last_name, status, razryad, branch_id')
        .eq('coach_id', coachId).eq('status', 'active')
      if (stErr) throw stErr
      const studentIds = (students || []).map((s: any) => s.id)

      let parts: any[] = []
      let proms: any[] = []
      let razs: any[] = []
      if (studentIds.length > 0) {
        const { data: partsData, error: pErr } = await supabase
          .from('tournament_participants')
          .select('student_id, place, rating_delta, tournament:tournaments!inner(id, tournament_date, name, league)')
          .in('student_id', studentIds)
          .gte('tournament.tournament_date', windowStart)
          .lte('tournament.tournament_date', windowEnd)
        if (pErr) throw pErr
        parts = (partsData || []).filter((r: any) => r.tournament)

        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, from_league, to_league, occurred_at')
          .in('student_id', studentIds)
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) throw evErr
        proms = ev || []

        const { data: rz, error: rzErr } = await supabase
          .from('razryad_history')
          .select('student_id, old_razryad, new_razryad, changed_at')
          .in('student_id', studentIds)
          .gte('changed_at', windowStart)
          .lte('changed_at', `${windowEnd}T23:59:59.999Z`)
        if (rzErr) throw rzErr
        razs = (rz || []).filter((r: any) => r.new_razryad && r.new_razryad !== 'none')
      }

      // Per-student breakdown.
      const byStudent = new Map<string, any>()
      for (const s of students || []) {
        byStudent.set((s as any).id, {
          student_id: (s as any).id,
          student_name: `${(s as any).first_name} ${(s as any).last_name}`.trim(),
          razryad: (s as any).razryad,
          tournaments_played: 0,
          top1_count: 0,
          top3_count: 0,
          rating_gained: 0,
          promotions: 0,
          new_razryads: 0,
        })
      }
      const tournamentIds = new Set<string>()
      const participantStudentIds = new Set<string>()
      const places: number[] = []
      const deltas: number[] = []
      let top1 = 0
      let top3 = 0
      for (const r of parts) {
        tournamentIds.add(r.tournament.id)
        participantStudentIds.add(r.student_id)
        const slot = byStudent.get(r.student_id)
        if (slot) slot.tournaments_played++
        if (Number.isFinite(r.place)) {
          places.push(r.place)
          if (r.place === 1) { top1++; if (slot) slot.top1_count++ }
          if (r.place <= 3) { top3++; if (slot) slot.top3_count++ }
        }
        if (Number.isFinite(r.rating_delta)) {
          deltas.push(r.rating_delta)
          if (slot) slot.rating_gained += r.rating_delta
        }
      }
      for (const p of proms) {
        const slot = byStudent.get(p.student_id); if (slot) slot.promotions++
      }
      for (const r of razs) {
        const slot = byStudent.get(r.student_id); if (slot) slot.new_razryads++
      }

      const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0
      const composite = calcCompositeScore({
        active_students_count: studentIds.length,
        participants_count: participantStudentIds.size,
        total_results: parts.length,
        top3_count: top3,
        avg_rating_delta: avgDelta,
        promotions_count: proms.length,
        new_razryads_count: razs.length,
      })

      return json({
        success: true,
        data: {
          coach: { id: coach.id, name: `${coach.first_name} ${coach.last_name}`.trim() },
          window: { start: windowStart, end: windowEnd },
          hero: {
            active_students_count: studentIds.length,
            participants_count: participantStudentIds.size,
            total_tournaments: tournamentIds.size,
            total_results: parts.length,
            avg_place: places.length ? Math.round((places.reduce((a, b) => a + b, 0) / places.length) * 100) / 100 : null,
            top1_count: top1,
            top3_count: top3,
            total_rating_gained: deltas.reduce((a, b) => a + b, 0),
            promotions_count: proms.length,
            new_razryads_count: razs.length,
            composite_score: composite,
          },
          students: [...byStudent.values()].sort((a, b) => b.rating_gained - a.rating_gained),
        },
      })
    }

    if (action === 'school_kpi_summary') {
      const windowStart = p('window_start')
      const windowEnd = p('window_end')
      const validationError = validateWindow(windowStart, windowEnd)
      if (validationError) return json({ success: false, error: validationError }, 400)

      const { data: students, error: stErr } = await supabase
        .from('students').select('id, status').eq('status', 'active')
      if (stErr) throw stErr
      const studentIds = (students || []).map((s: any) => s.id)
      const activeCount = studentIds.length

      let parts: any[] = []
      let proms: any[] = []
      let razs: any[] = []
      if (studentIds.length > 0) {
        const { data: partsData, error: pErr } = await supabase
          .from('tournament_participants')
          .select('student_id, place, rating_delta, tournament:tournaments!inner(id, tournament_date)')
          .in('student_id', studentIds)
          .gte('tournament.tournament_date', windowStart)
          .lte('tournament.tournament_date', windowEnd)
        if (pErr) throw pErr
        parts = (partsData || []).filter((r: any) => r.tournament)

        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, occurred_at')
          .in('student_id', studentIds)
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) throw evErr
        proms = ev || []

        const { data: rz, error: rzErr } = await supabase
          .from('razryad_history')
          .select('student_id, new_razryad, changed_at')
          .in('student_id', studentIds)
          .gte('changed_at', windowStart)
          .lte('changed_at', `${windowEnd}T23:59:59.999Z`)
        if (rzErr) throw rzErr
        razs = (rz || []).filter((r: any) => r.new_razryad && r.new_razryad !== 'none')
      }

      const tournamentIds = new Set<string>()
      const participantStudentIds = new Set<string>()
      let top3 = 0
      let top1 = 0
      let totalDelta = 0
      const deltaCount = parts.reduce((a, r) => a + (Number.isFinite(r.rating_delta) ? 1 : 0), 0)
      for (const r of parts) {
        tournamentIds.add(r.tournament.id)
        participantStudentIds.add(r.student_id)
        if (Number.isFinite(r.place)) {
          if (r.place === 1) top1++
          if (r.place <= 3) top3++
        }
        if (Number.isFinite(r.rating_delta)) totalDelta += r.rating_delta
      }

      return json({
        success: true,
        data: {
          window: { start: windowStart, end: windowEnd },
          active_students_count: activeCount,
          participants_count: participantStudentIds.size,
          participation_pct: activeCount > 0 ? Math.round((participantStudentIds.size / activeCount) * 1000) / 10 : 0,
          total_tournaments: tournamentIds.size,
          total_results: parts.length,
          top1_count: top1,
          top3_count: top3,
          total_rating_gained: totalDelta,
          avg_rating_delta: deltaCount > 0 ? Math.round((totalDelta / deltaCount) * 100) / 100 : 0,
          promotions_count: proms.length,
          new_razryads_count: razs.length,
        },
      })
    }

    return json({ success: false, error: 'Invalid action. Use: list, detail, student_history, branch_leaderboard, coach_leaderboard, coach_kpi_summary, school_kpi_summary' }, 400)
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
