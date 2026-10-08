import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// schedule_type -> lowercase English day names (migration 043 enum + 046 DOW mapping)
const SCHEDULE_DAYS: Record<string, string[]> = {
  mon_wed: ['monday', 'wednesday'],
  tue_thu: ['tuesday', 'thursday'],
  sat_sun: ['saturday', 'sunday'],
  mon_wed_fri: ['monday', 'wednesday', 'friday'],
  wed_fri: ['wednesday', 'friday'],
}

// Trim a stored TIME ("10:00:00") down to "10:00" for display/labels.
function hhmm(t: string | null): string {
  if (!t) return ''
  return t.length >= 5 ? t.slice(0, 5) : t
}

// Fetch every row of a PostgREST query, paging past the 1000-row cap.
async function fetchAll(buildQuery: () => any): Promise<any[]> {
  const page = 1000
  const out: any[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await buildQuery().range(from, from + page - 1)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < page) break
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!authenticate(req)) return json({ success: false, error: 'Unauthorized' }, 401)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', DB_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const url = new URL(req.url)
    const p = (k: string) => url.searchParams.get(k)
    const action = p('action') || 'list'
    const limit = parseInt(p('limit') || '200')
    const offset = parseInt(p('offset') || '0')
    const today = new Date().toISOString().slice(0, 10)

    if (action !== 'list') {
      return json({ success: false, error: 'Invalid action. Use: list' }, 400)
    }

    const fBranch = p('branch_id')
    const fCoach = p('coach_id')
    const fSchedule = p('schedule_type')

    // --- 1. time_slots: fetch versions effective now, keep the current one per
    //     logical_slot_id (migrations 049/076), drop soft-deleted chains (065/083).
    const slotRows = await fetchAll(() => {
      let q = supabase.from('time_slots')
        .select('id, logical_slot_id, branch_id, coach_id, schedule_type, slot_index, start_time, end_time, label, effective_from, deleted_at')
        .lte('effective_from', today)
      if (fBranch) q = q.eq('branch_id', fBranch)
      if (fCoach) q = q.eq('coach_id', fCoach)
      if (fSchedule) q = q.eq('schedule_type', fSchedule)
      return q.order('effective_from', { ascending: true })
    })

    const currentByLogical = new Map<string, any>()
    for (const r of slotRows) {
      // effective_from ascending => the last write per logical id wins (latest version).
      currentByLogical.set(r.logical_slot_id, r)
    }
    const slots = [...currentByLogical.values()].filter((s) => s.deleted_at === null)

    // --- 2. assignments: current version per (student, chain), scoped to the
    //     same branch/schedule as the requested slots when filtered.
    const assignRows = await fetchAll(() => {
      let q = supabase.from('student_time_slot_assignments')
        .select('student_id, logical_slot_id, branch_id, schedule_type, time_slot_index, hidden, effective_from')
        .lte('effective_from', today)
        .gte('time_slot_index', 0)
      if (fBranch) q = q.eq('branch_id', fBranch)
      if (fSchedule) q = q.eq('schedule_type', fSchedule)
      return q.order('effective_from', { ascending: true })
    })
    const chainKey = (r: any) =>
      r.logical_slot_id ? `l:${r.logical_slot_id}` : `i:${r.branch_id}:${r.schedule_type}:${r.time_slot_index}`
    const currentAssign = new Map<string, any>()
    for (const r of assignRows) {
      currentAssign.set(`${r.student_id}|${chainKey(r)}`, r) // last (latest effective_from) wins
    }
    const liveAssign = [...currentAssign.values()].filter((a) => a.hidden === false)

    // --- 3. active students
    const activeStudents = new Set<string>(
      (await fetchAll(() => supabase.from('students').select('id').eq('status', 'active'))).map((s) => s.id),
    )

    // --- 4. active exclusions (migration 086)
    const exclusions = await fetchAll(() => {
      let q = supabase.from('student_slot_exclusions')
        .select('student_id, branch_id, schedule_type, logical_slot_id, time_slot_index')
        .eq('active', true)
      if (fBranch) q = q.eq('branch_id', fBranch)
      if (fSchedule) q = q.eq('schedule_type', fSchedule)
      return q
    })
    const exByLogical = new Set<string>()
    const exByIndex = new Set<string>()
    for (const e of exclusions) {
      if (e.logical_slot_id) exByLogical.add(`${e.student_id}|${e.logical_slot_id}`)
      exByIndex.add(`${e.student_id}|${e.branch_id}|${e.schedule_type}|${e.time_slot_index}`)
    }

    // --- 5. branch / coach names
    const branches = new Map<string, string>(
      (await fetchAll(() => supabase.from('branches').select('id, name'))).map((b) => [b.id, b.name]),
    )
    const coaches = new Map<string, string>(
      (await fetchAll(() => supabase.from('coaches').select('id, first_name, last_name'))).map((c) => [
        c.id,
        [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
      ]),
    )

    // --- 6. active_student_count per slot.
    // A live assignment belongs to a slot when its logical id matches, or (legacy
    // NULL-logical rows) its physical index matches within branch+schedule.
    const byLogical = new Map<string, any[]>()
    const byIndex = new Map<string, any[]>()
    for (const a of liveAssign) {
      if (!activeStudents.has(a.student_id)) continue
      if (a.logical_slot_id) {
        const k = a.logical_slot_id
        ;(byLogical.get(k) ?? byLogical.set(k, []).get(k)!).push(a)
      } else {
        const k = `${a.branch_id}|${a.schedule_type}|${a.time_slot_index}`
        ;(byIndex.get(k) ?? byIndex.set(k, []).get(k)!).push(a)
      }
    }

    function countFor(slot: any): number {
      const seen = new Set<string>()
      const consider = [
        ...(byLogical.get(slot.logical_slot_id) ?? []),
        ...(byIndex.get(`${slot.branch_id}|${slot.schedule_type}|${slot.slot_index}`) ?? []),
      ]
      for (const a of consider) {
        if (exByLogical.has(`${a.student_id}|${slot.logical_slot_id}`)) continue
        if (exByIndex.has(`${a.student_id}|${slot.branch_id}|${slot.schedule_type}|${slot.slot_index}`)) continue
        seen.add(a.student_id)
      }
      return seen.size
    }

    // --- 7. build rows
    const allRows = slots.map((s) => {
      const coachName = coaches.get(s.coach_id) || ''
      const label = s.label ?? `${coachName} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`
      return {
        group_id: s.logical_slot_id,
        slot_version_id: s.id,
        group_name: label,
        branch_id: s.branch_id,
        branch_name: branches.get(s.branch_id) || null,
        coach_id: s.coach_id,
        coach_name: coachName || null,
        schedule_type: s.schedule_type,
        days: SCHEDULE_DAYS[s.schedule_type] ?? [],
        start_time: s.start_time,
        end_time: s.end_time,
        active_student_count: countFor(s),
      }
    })

    allRows.sort((a, b) =>
      (a.branch_name || '').localeCompare(b.branch_name || '') ||
      (a.coach_name || '').localeCompare(b.coach_name || '') ||
      (a.start_time || '').localeCompare(b.start_time || ''),
    )

    const pageRows = allRows.slice(offset, offset + limit)
    return json({ success: true, data: pageRows, count: allRows.length, meta: { limit, offset } })
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
