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

// =================================================================
// Phase 2 (COACH_KPI_PHASE2_SPEC.md §1) — the locked formula reads from
// the Phase 2 tournament_results / tournaments_uploads tables. Each
// sub-metric is clamped 0–1, multiplied by its weight, summed × 100.
// =================================================================
export interface Phase2SubRates {
  participation_rate: number     // 0..1+ (can exceed 1.0, that's intended)
  normalized_avg_rating_delta: number  // 0..1
  top3_finish_rate: number       // 0..1
  promotion_rate: number         // 0..1
  razryad_earned_rate: number    // 0..1
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function calcPhase2CompositeScore(r: Phase2SubRates): number {
  const score =
    clamp01(r.participation_rate)         * COACH_SCORE_WEIGHTS.participation +
    clamp01(r.normalized_avg_rating_delta) * COACH_SCORE_WEIGHTS.rating_delta +
    clamp01(r.top3_finish_rate)           * COACH_SCORE_WEIGHTS.top3 +
    clamp01(r.promotion_rate)             * COACH_SCORE_WEIGHTS.promotion +
    clamp01(r.razryad_earned_rate)        * COACH_SCORE_WEIGHTS.razryad
  return Math.round(score * 100 * 10) / 10
}

// Seed rating assigned to a brand-new student at their first rated game,
// keyed by tournament kind (COACH_KPI_PHASE2_SPEC.md §2 + "New-student
// starting ratings"). Returns null for unknown kinds.
export function seedRatingForKind(kind: string): number | null {
  switch (kind) {
    case 'league_c':  return 150
    case 'league_b':  return 450
    case 'razryad_4': return 300
    case 'razryad_3': return 550
    default: return null
  }
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
      // Phase 2 (COACH_KPI_PHASE2_SPEC.md §7): read from tournament_results +
      // tournaments_uploads; apply the locked formula in §1; tie-break by
      // participation_rate (§4).
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

      // 3. Tournaments + per-student results in window.
      const { data: uploadsInWindow, error: upErr } = await supabase
        .from('tournaments_uploads')
        .select('id, kind, tournament_date')
        .gte('tournament_date', windowStart)
        .lte('tournament_date', windowEnd)
      if (upErr) throw upErr
      const uploads = uploadsInWindow || []
      const uploadIds = uploads.map((u: any) => u.id)
      const uploadById = new Map<string, any>()
      for (const u of uploads) uploadById.set((u as any).id, u)
      const totalUploadsInWindow = uploads.length
      const razryadUploadIds = new Set(
        uploads.filter((u: any) => u.kind === 'razryad_3' || u.kind === 'razryad_4').map((u: any) => u.id)
      )

      let results: any[] = []
      if (uploadIds.length > 0 && allStudentIds.length > 0) {
        // Same URL-length pitfall as school_kpi_summary — filter client-side
        // on student_id instead of stuffing 700+ UUIDs into the query string.
        const { data: rs, error: rsErr } = await supabase
          .from('tournament_results')
          .select('upload_id, student_id, rank, score, games_played, rating_before, rating_delta, earned_razryad')
          .in('upload_id', uploadIds)
        if (rsErr) { console.error('coach_leaderboard tournament_results error', rsErr); throw rsErr }
        const allStudentSet = new Set(allStudentIds)
        results = (rs || []).filter((r: any) => allStudentSet.has(r.student_id))
      }

      // 4. League promotions in window (existing 038 trigger).
      let promotions: any[] = []
      if (allStudentIds.length > 0) {
        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, occurred_at')
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) { console.error('coach_leaderboard promotions error', evErr); throw evErr }
        const allStudentSet = new Set(allStudentIds)
        promotions = (ev || []).filter((e: any) => allStudentSet.has(e.student_id))
      }

      // 5. School-wide max abs avg-delta across coaches (denominator for
      // the normalized_avg_rating_delta sub-metric). First, compute per-coach
      // raw avg rating delta from the in-window results.
      const rawByCoach = (coaches || []).map((coach: any) => {
        const myStudentIds = new Set(studentIdsByCoach.get(coach.id) || [])
        const myResults = results.filter((r: any) => myStudentIds.has(r.student_id))
        const myProms = promotions.filter((p: any) => myStudentIds.has(p.student_id))

        // Sum rating_delta per student in window; only count students with ≥1
        // rated game (games_played >= 1) — matches the participation rule.
        const deltaByStudent = new Map<string, number>()
        const internalEntries: any[] = []
        const playedEntries: any[] = []
        const razryadParticipants = new Set<string>()
        const razryadEarners = new Set<string>()
        let top3Count = 0

        for (const r of myResults) {
          const u = uploadById.get(r.upload_id)
          if (!u) continue
          if (r.games_played >= 1) {
            playedEntries.push(r)
            const cur = deltaByStudent.get(r.student_id) || 0
            deltaByStudent.set(r.student_id, cur + (Number(r.rating_delta) || 0))
            internalEntries.push(r)
            if (Number.isFinite(r.rank) && r.rank <= 3) top3Count++
          }
          if (razryadUploadIds.has(r.upload_id) && r.games_played >= 1) {
            razryadParticipants.add(r.student_id)
            if (r.earned_razryad) razryadEarners.add(r.student_id)
          }
        }

        const deltaValues = [...deltaByStudent.values()]
        const avgDelta = deltaValues.length ? deltaValues.reduce((a, b) => a + b, 0) / deltaValues.length : 0
        const totalRatingGained = deltaValues.reduce((a, b) => a + b, 0)

        return {
          coach,
          activeStudentsCount: myStudentIds.size,
          totalUploadsInWindow,
          participationNumerator: playedEntries.length,
          internalEntries: internalEntries.length,
          top3Count,
          avgDelta,
          totalRatingGained,
          promotionsCount: myProms.length,
          razryadParticipants: razryadParticipants.size,
          razryadEarners: razryadEarners.size,
        }
      })

      const maxAbsAvgDelta = rawByCoach.reduce(
        (m, r) => Math.max(m, Math.abs(r.avgDelta)),
        0
      )

      // 6. Build rows with composite score + sub-metric rates.
      const rows = rawByCoach.map((r) => {
        const denom = r.activeStudentsCount * r.totalUploadsInWindow
        const participation_rate = denom > 0 ? r.participationNumerator / denom : 0
        const normalized_avg_rating_delta = maxAbsAvgDelta > 0
          ? Math.max(0, r.avgDelta) / maxAbsAvgDelta
          : 0
        const top3_finish_rate = r.internalEntries > 0
          ? r.top3Count / r.internalEntries
          : 0
        const promotion_rate = r.activeStudentsCount > 0
          ? r.promotionsCount / r.activeStudentsCount
          : 0
        const razryad_earned_rate = r.razryadParticipants > 0
          ? r.razryadEarners / r.razryadParticipants
          : 0

        const composite = calcPhase2CompositeScore({
          participation_rate,
          normalized_avg_rating_delta,
          top3_finish_rate,
          promotion_rate,
          razryad_earned_rate,
        })

        return {
          coach_id: r.coach.id,
          coach_name: `${r.coach.first_name} ${r.coach.last_name}`.trim(),
          branches: branchesByCoach.get(r.coach.id) || [],
          active_students_count: r.activeStudentsCount,
          total_tournaments: r.totalUploadsInWindow,
          tournament_entries: r.participationNumerator,
          avg_rating_delta: Math.round(r.avgDelta * 10) / 10,
          top3_count: r.top3Count,
          total_rating_gained: r.totalRatingGained,
          promotions_count: r.promotionsCount,
          new_razryads_count: r.razryadEarners,
          razryad_participants: r.razryadParticipants,
          participation_rate: Math.round(participation_rate * 1000) / 1000,
          composite_score: composite,
        }
      }).sort((a, b) => {
        // Primary: composite_score desc. Tie-break: participation_rate desc.
        if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score
        return b.participation_rate - a.participation_rate
      })

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

      // Per-coach Phase 2 read: pull uploads in window, then the coach's
      // students' results joined to those uploads. Mirrors coach_leaderboard
      // and replaces the legacy tournament_participants source (which the
      // upload flow never populates).
      const { data: uploadsInWindow, error: upErr } = await supabase
        .from('tournaments_uploads')
        .select('id, kind, tournament_date')
        .gte('tournament_date', windowStart)
        .lte('tournament_date', windowEnd)
      if (upErr) { console.error('coach_kpi_summary uploads error', upErr); throw upErr }
      const uploadsList = uploadsInWindow || []
      const uploadIdList = uploadsList.map((u: any) => u.id)
      const uploadByIdMap = new Map<string, any>()
      for (const u of uploadsList) uploadByIdMap.set((u as any).id, u)

      let parts: any[] = []
      let proms: any[] = []
      let razs: any[] = []
      if (studentIds.length > 0 && uploadIdList.length > 0) {
        const studentSet = new Set(studentIds)
        const { data: partsData, error: pErr } = await supabase
          .from('tournament_results')
          .select('upload_id, student_id, rank, score, games_played, rating_before, rating_delta, earned_razryad')
          .in('upload_id', uploadIdList)
        if (pErr) { console.error('coach_kpi_summary tournament_results error', pErr); throw pErr }
        parts = (partsData || [])
          .filter((r: any) => studentSet.has(r.student_id) && (Number(r.games_played) || 0) >= 1)
          .map((r: any) => {
            const u = uploadByIdMap.get(r.upload_id)
            return {
              student_id: r.student_id,
              place: Number(r.rank),
              rating_delta: Number(r.rating_delta) || 0,
              tournament: u
                ? { id: u.id, tournament_date: u.tournament_date, kind: u.kind }
                : null,
            }
          })
          .filter((r: any) => r.tournament)
      }

      if (studentIds.length > 0) {
        const studentSet = new Set(studentIds)
        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, from_league, to_league, occurred_at')
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) { console.error('coach_kpi_summary promotions error', evErr); throw evErr }
        proms = (ev || []).filter((e: any) => studentSet.has(e.student_id))

        const { data: rz, error: rzErr } = await supabase
          .from('razryad_history')
          .select('student_id, old_razryad, new_razryad, changed_at')
          .gte('changed_at', windowStart)
          .lte('changed_at', `${windowEnd}T23:59:59.999Z`)
        if (rzErr) { console.error('coach_kpi_summary razryad_history error', rzErr); throw rzErr }
        razs = (rz || []).filter((r: any) => studentSet.has(r.student_id) && r.new_razryad && r.new_razryad !== 'none')
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
      // Phase 2 (COACH_KPI_PHASE2_SPEC.md §7): read from tournaments_uploads +
      // tournament_results, matching the source the coach_leaderboard action
      // already uses. The legacy tournament_participants / tournaments path
      // was retired with migrations 036/037/038.
      const windowStart = p('window_start')
      const windowEnd = p('window_end')
      const validationError = validateWindow(windowStart, windowEnd)
      if (validationError) return json({ success: false, error: validationError }, 400)

      const { data: students, error: stErr } = await supabase
        .from('students').select('id, status').eq('status', 'active')
      if (stErr) { console.error('school_kpi students error', stErr); throw stErr }
      const studentIds = (students || []).map((s: any) => s.id)
      const activeCount = studentIds.length

      // Tournaments uploaded in the window — drives total_tournaments and
      // razryad-earning eligibility (razryad_3 / razryad_4 uploads only).
      const { data: uploadsInWindow, error: upErr } = await supabase
        .from('tournaments_uploads')
        .select('id, kind, tournament_date')
        .gte('tournament_date', windowStart)
        .lte('tournament_date', windowEnd)
      if (upErr) { console.error('school_kpi uploads error', upErr); throw upErr }
      const uploads = uploadsInWindow || []
      const uploadIds = uploads.map((u: any) => u.id)
      const razryadUploadIds = new Set(
        uploads.filter((u: any) => u.kind === 'razryad_3' || u.kind === 'razryad_4').map((u: any) => u.id)
      )

      let results: any[] = []
      if (uploadIds.length > 0 && studentIds.length > 0) {
        // Scope by upload_id only — student_id is implicit from the FK and a
        // .in() with hundreds of student UUIDs blows past PostgREST's URL limit
        // (~8KB), which surfaces here as a generic "Bad Request" with no code.
        const { data: rs, error: rsErr } = await supabase
          .from('tournament_results')
          .select('upload_id, student_id, rank, score, games_played, rating_before, rating_delta, earned_razryad')
          .in('upload_id', uploadIds)
        if (rsErr) { console.error('school_kpi tournament_results error', rsErr); throw rsErr }
        const activeStudentSet = new Set(studentIds)
        results = (rs || []).filter((r: any) => activeStudentSet.has(r.student_id))
      }

      let proms: any[] = []
      if (studentIds.length > 0) {
        // Skip the .in('student_id', ...) — see note above. We need only the
        // count of promotion events from coach-rostered students in window;
        // every student in the table is in scope at the school level anyway.
        const { data: ev, error: evErr } = await supabase
          .from('student_league_events')
          .select('student_id, event_type, occurred_at')
          .eq('event_type', 'promotion')
          .gte('occurred_at', windowStart)
          .lte('occurred_at', `${windowEnd}T23:59:59.999Z`)
        if (evErr) { console.error('school_kpi promotions error', evErr); throw evErr }
        const activeStudentSet = new Set(studentIds)
        proms = (ev || []).filter((e: any) => activeStudentSet.has(e.student_id))
      }

      // Aggregate the Phase 2 results just like coach_leaderboard does:
      //   - participants = students with games_played >= 1 in window
      //   - top3 = results with rank <= 3 (rated games only)
      //   - razryads earned = distinct students with earned_razryad on a
      //                       razryad_3/razryad_4 upload
      const participantStudentIds = new Set<string>()
      const razryadEarners = new Set<string>()
      let top1 = 0
      let top3 = 0
      let totalDelta = 0
      let deltaCount = 0
      for (const r of results) {
        if ((Number(r.games_played) || 0) < 1) continue
        participantStudentIds.add(r.student_id)
        if (Number.isFinite(r.rank)) {
          if (r.rank === 1) top1++
          if (r.rank <= 3) top3++
        }
        if (Number.isFinite(r.rating_delta)) {
          totalDelta += Number(r.rating_delta)
          deltaCount++
        }
        if (razryadUploadIds.has(r.upload_id) && r.earned_razryad) {
          razryadEarners.add(r.student_id)
        }
      }

      return json({
        success: true,
        data: {
          window: { start: windowStart, end: windowEnd },
          active_students_count: activeCount,
          participants_count: participantStudentIds.size,
          participation_pct: activeCount > 0 ? Math.round((participantStudentIds.size / activeCount) * 1000) / 10 : 0,
          total_tournaments: uploads.length,
          total_results: results.length,
          top1_count: top1,
          top3_count: top3,
          total_rating_gained: Math.round(totalDelta * 10) / 10,
          avg_rating_delta: deltaCount > 0 ? Math.round((totalDelta / deltaCount) * 100) / 100 : 0,
          promotions_count: proms.length,
          new_razryads_count: razryadEarners.size,
        },
      })
    }

    return json({ success: false, error: 'Invalid action. Use: list, detail, student_history, branch_leaderboard, coach_leaderboard, coach_kpi_summary, school_kpi_summary' }, 400)
  } catch (error) {
    // PostgREST/supabase-js errors are plain objects with { message, code, details, hint }
    // — not Error instances — so `error.message` and String(error) lose everything.
    // Serialize the full shape so the caller (and console logs) can see what failed.
    let payload: unknown
    if (error instanceof Error) {
      payload = { message: error.message, name: error.name, stack: error.stack }
    } else if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>
      payload = { message: e.message, code: e.code, details: e.details, hint: e.hint }
    } else {
      payload = { message: String(error) }
    }
    console.error('analytics-tournaments error:', payload)
    return json({ success: false, error: payload }, 500)
  }
})
