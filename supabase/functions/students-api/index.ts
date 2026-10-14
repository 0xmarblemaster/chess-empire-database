// Students write API — for external integrations (e.g. AmoCRM sync).
//
// Unlike the read-only analytics-* functions, this one WRITES: create a
// student, freeze / activate (unfreeze) a student, link an amoCRM customer id
// to an existing student, correct (overwrite) a student's phone / amoCRM id,
// find by Student ID (student_code) / phone / amoCRM id, list students, list branches. Every write requires an `x-api-key` header checked against the
// CHESS_EMPIRE_WRITE_KEY env var (a NEW key, distinct from the tournament-only
// CHESS_EMPIRE_API_KEY — the two surfaces never share a key).
//
// Routing is on a `?action=` query param (create / freeze / activate /
// link_amocrm / update_contact / find / list / branches / survival-score / survival-best / survival-leaderboard); GET with no action returns the OpenAPI self-doc. Modelled on
// tournaments-api/index.ts (Deno serve + CORS + json/ok/err helpers).
//
// Product rules enforced here:
//  - Dedup on create by normalized phone OR amocrm_customer_id — never create a
//    duplicate; a dedup-hit that is frozen is reactivated.
//  - 3-day manual guard: an API freeze/activate is refused (409) when the
//    latest *manual* (dashboard/coach) status change is younger than 3 days.
//    Coaches win over automation — this is a hard product rule.
//  - Never touches student_time_slot_assignments (migration 081 blocks auto
//    slot moves at the DB level by design).
//  - Every student payload carries student_code (CE-00001, migration 096) —
//    assigned by a DB trigger, immutable, never reused, never sent on insert.
//    Wherever student_id is accepted, student_code is accepted instead; when
//    both are given they must name the same student (400
//    student_id_code_mismatch).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  normalizePhone,
  phoneDigits,
  splitFullName,
  isManualChangeRecent,
  isUuid,
  parseStudentCode,
  parseStudentRef,
  resolveStudentRef,
  parseListParams,
  LIST_MAX_LIMIT,
  STUDENT_STATUSES,
  parseAmocrmId,
  validateLinkAmocrm,
  linkAmocrm,
  validateUpdateContact,
  updateContact,
  validateSurvivalPush,
  parseLeaderboardParams,
  almatyWindowStart,
  SURVIVAL_SCORE_MAX,
} from './students-logic.mjs'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// NEW write key — deliberately separate from CHESS_EMPIRE_API_KEY (tournaments).
// Comma-separated list so each external consumer gets its own revocable key.
const WRITE_KEYS = (Deno.env.get('CHESS_EMPIRE_WRITE_KEY') ?? '')
  .split(',')
  .map((k) => k.trim())
  .filter((k) => k !== '')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CE_SECRET_KEY = Deno.env.get('CE_SECRET_KEY') ?? ''
const DB_KEY = CE_SECRET_KEY || SERVICE_ROLE_KEY
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

// Server-side parity with the dashboard's pokeChessterFreezeThaw() (commit
// c89814c). The dashboard reads these from window.supabaseConfig; server-side
// there is no such config, so we read matching env vars.
const CHESSTER_SYNC_URL = Deno.env.get('CHESSTER_SYNC_URL') ?? 'https://chesster.io/api/chess-empire/sync/freeze-thaw'
const CHESSTER_SYNC_TOKEN = Deno.env.get('CHESSTER_SYNC_TOKEN') ?? ''

const REASONS = [
  'unauthorized', 'not_found', 'invalid_input', 'invalid_branch',
  'ambiguous', 'manual_change_recent', 'student_inactive',
  'amocrm_customer_id_conflict', 'student_id_code_mismatch', 'server_error',
] as const
type Reason = typeof REASONS[number]

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function ok(extra: Record<string, unknown> = {}, status = 200): Response {
  return json({ ok: true, ...extra }, status)
}

function err(reason: Reason, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, reason, ...extra }, status)
}

function authorized(req: Request): boolean {
  return WRITE_KEYS.length > 0 && WRITE_KEYS.includes(req.headers.get('x-api-key') ?? '')
}

// parent_phone is the ONLY phone-like column on students (verified against the
// schema — there is no bare `phone` column); dedup/find match on it.
const STUDENT_SELECT = 'id, student_code, first_name, last_name, status, branch_id, amocrm_customer_id, parent_phone, branch:branches(name)'

// Normalize both the direct-select row shape (branch:{name}) and the RPC row
// shape (branch_name) into one public student object.
// deno-lint-ignore no-explicit-any
function shape(row: any) {
  const branch = row.branch_name !== undefined
    ? row.branch_name
    : (row.branch ? row.branch.name : null)
  return {
    id: row.id,
    student_code: row.student_code ?? null,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    first_name: row.first_name,
    last_name: row.last_name,
    status: row.status,
    branch_id: row.branch_id,
    branch: branch || null,
    amocrm_customer_id: row.amocrm_customer_id ?? null,
    phone: row.parent_phone ?? null,
  }
}

// deno-lint-ignore no-explicit-any
interface Ctx { supabase: any; req: Request }

// Adapter for resolveStudentRef(): student_code → UUID.
function codeLookup(ctx: Ctx) {
  return {
    async findIdByCode(code: string) {
      const { data, error } = await ctx.supabase
        .from('students').select('id').eq('student_code', code).maybeSingle()
      if (error) throw error
      return data ? data.id : null
    },
  }
}

// Resolve student_id / student_code from a query into a UUID. Returns { id }
// or a ready error Response.
async function resolveRef(ctx: Ctx, src: Record<string, unknown>): Promise<{ id?: string; res?: Response }> {
  const ref = parseStudentRef(src)
  if (!ref.value) return { res: err('invalid_input', 400, { field: ref.field }) }
  const r = await resolveStudentRef(codeLookup(ctx), ref.value)
  if (r.error) return { res: json(r.error.body, r.error.status) }
  return { id: r.id }
}

// Fire the server-side freeze/thaw poke to Chesster. Mirrors the dashboard's
// pokeChessterFreezeThaw(): only for active/frozen, Bearer token, short
// timeout. Can NEVER throw — returns a label for the response. A failed poke is
// reported as {chesster_poke:'failed'} and the hourly reconcile cron is the
// safety net; it never rolls back or fails the API response.
async function pokeChesster(studentId: string, status: string): Promise<'ok' | 'skipped' | 'failed'> {
  if (!CHESSTER_SYNC_TOKEN) return 'skipped'
  if (status !== 'active' && status !== 'frozen') return 'skipped'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(CHESSTER_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CHESSTER_SYNC_TOKEN,
      },
      body: JSON.stringify({ external_student_id: studentId, status }),
      signal: controller.signal,
    })
    return res.ok ? 'ok' : 'failed'
  } catch (_e) {
    return 'failed'
  } finally {
    clearTimeout(timer)
  }
}

// Resolve a single student from { student_code } | { student_id } |
// { amocrm_customer_id } | { phone }. Returns { student } (null = none),
// { multiple:true } when a non-id lookup is ambiguous, or { error } (+ field)
// for a malformed selector / student_id–student_code mismatch.
async function resolveStudent(
  ctx: Ctx,
  body: Record<string, unknown>,
): Promise<{ student?: ReturnType<typeof shape> | null; multiple?: boolean; error?: Reason; field?: string }> {
  if (body.student_code !== undefined && body.student_code !== null && body.student_code !== '') {
    const ref = parseStudentRef(body)
    if (!ref.value) return { error: 'invalid_input', field: ref.field }
    const r = await resolveStudentRef(codeLookup(ctx), ref.value)
    if (r.error) return r.error.status === 404 ? { student: null } : { error: r.error.body.reason as Reason }
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('id', r.id).maybeSingle()
    if (error) throw error
    return { student: data ? shape(data) : null }
  }

  if (typeof body.student_id === 'string' && body.student_id) {
    if (!isUuid(body.student_id)) return { error: 'invalid_input' }
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('id', body.student_id).maybeSingle()
    if (error) throw error
    return { student: data ? shape(data) : null }
  }

  if (body.amocrm_customer_id !== undefined && body.amocrm_customer_id !== null && body.amocrm_customer_id !== '') {
    const amo = Number(body.amocrm_customer_id)
    if (!Number.isInteger(amo)) return { error: 'invalid_input' }
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('amocrm_customer_id', amo).limit(2)
    if (error) throw error
    if ((data || []).length > 1) return { multiple: true }
    return { student: data && data[0] ? shape(data[0]) : null }
  }

  if (typeof body.phone === 'string' && body.phone) {
    const norm = normalizePhone(body.phone)
    if (!norm) return { error: 'invalid_input' }
    const { data, error } = await ctx.supabase
      .rpc('find_students_by_phone_digits', { p_digits: phoneDigits(norm) })
    if (error) throw error
    const rows = data || []
    if (rows.length > 1) return { multiple: true }
    return { student: rows[0] ? shape(rows[0]) : null }
  }

  return { error: 'invalid_input' }
}

// Core status transition shared by freeze / activate and the create-time
// reactivation. Enforces the 3-day manual guard, no-ops when already in the
// target status, writes students.status + a typed status_history row, and fires
// the Chesster poke.
async function applyStatusChange(
  ctx: Ctx,
  student: ReturnType<typeof shape>,
  target: 'active' | 'frozen',
): Promise<{
  refused?: boolean; reason?: Reason; changed?: boolean;
  student?: ReturnType<typeof shape>; status_history_id?: string; chesster_poke?: string;
}> {
  // Latest *typed* row only (NULL-typed trigger rows ignored) — this is the
  // actor record the 3-day guard reasons about.
  const { data: hist, error: hErr } = await ctx.supabase
    .from('student_status_history')
    .select('changed_by_type, created_at')
    .eq('student_id', student.id)
    .not('changed_by_type', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (hErr) throw hErr
  const latest = (hist && hist[0]) || null
  if (isManualChangeRecent(latest, Date.now())) {
    return { refused: true, reason: 'manual_change_recent' }
  }

  if (student.status === target) {
    return { changed: false, student }
  }

  const prev = student.status
  const { data: upd, error: uErr } = await ctx.supabase
    .from('students').update({ status: target }).eq('id', student.id)
    .select(STUDENT_SELECT).single()
  if (uErr) throw uErr

  const { data: row, error: rErr } = await ctx.supabase
    .from('student_status_history')
    .insert([{ student_id: student.id, old_status: prev, new_status: target, changed_by_type: 'api', source: 'students-api' }])
    .select('id').single()
  if (rErr) throw rErr

  const poke = await pokeChesster(student.id, target)
  return { changed: true, student: shape(upd), status_history_id: row.id, chesster_poke: poke }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function createStudent(ctx: Ctx): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const name = splitFullName(typeof body.full_name === 'string' ? body.full_name : '')
  if (!name) return err('invalid_input', 400, { field: 'full_name' })

  const norm = normalizePhone(typeof body.phone === 'string' ? body.phone : '')
  if (!norm) return err('invalid_input', 400, { field: 'phone' })

  const branchId = typeof body.branch_id === 'string' ? body.branch_id : ''
  if (!isUuid(branchId)) return err('invalid_input', 400, { field: 'branch_id' })

  let amo: number | null = null
  if (body.amocrm_customer_id !== undefined && body.amocrm_customer_id !== null && body.amocrm_customer_id !== '') {
    amo = Number(body.amocrm_customer_id)
    if (!Number.isInteger(amo)) return err('invalid_input', 400, { field: 'amocrm_customer_id' })
  }

  // Validate the branch exists — never silently default to some other branch.
  const { data: branch, error: bErr } = await ctx.supabase
    .from('branches').select('id').eq('id', branchId).maybeSingle()
  if (bErr) throw bErr
  if (!branch) return err('invalid_branch', 400)

  // Dedup: amocrm_customer_id (exact) first, then normalized phone.
  let existing: ReturnType<typeof shape> | null = null
  if (amo !== null) {
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('amocrm_customer_id', amo).limit(2)
    if (error) throw error
    if ((data || []).length > 1) return err('ambiguous', 409)
    existing = data && data[0] ? shape(data[0]) : null
  }
  if (!existing) {
    const { data, error } = await ctx.supabase
      .rpc('find_students_by_phone_digits', { p_digits: phoneDigits(norm) })
    if (error) throw error
    const rows = data || []
    if (rows.length > 1) return err('ambiguous', 409)
    existing = rows[0] ? shape(rows[0]) : null
  }

  if (existing) {
    if (existing.status === 'frozen') {
      const r = await applyStatusChange(ctx, existing, 'active')
      if (r.refused) return ok({ existing: true, reactivated: false, reason: r.reason, student: existing })
      return ok({
        existing: true, reactivated: true, student: r.student,
        status_history_id: r.status_history_id, chesster_poke: r.chesster_poke,
      })
    }
    return ok({ existing: true, student: existing })
  }

  // New student. Defaults mirror the dashboard's addStudent() so NOT NULL
  // columns are satisfied. student_time_slot_assignments is intentionally
  // untouched (migration 081).
  const { data: inserted, error: iErr } = await ctx.supabase
    .from('students')
    .insert([{
      first_name: name.first_name,
      last_name: name.last_name,
      branch_id: branchId,
      parent_phone: norm,
      amocrm_customer_id: amo,
      status: 'active',
      razryad: 'none',
      current_level: 1,
      current_lesson: 1,
      total_lessons: 120,
    }])
    .select(STUDENT_SELECT).single()
  if (iErr) throw iErr

  const { data: row, error: rErr } = await ctx.supabase
    .from('student_status_history')
    .insert([{ student_id: inserted.id, old_status: null, new_status: 'active', changed_by_type: 'api', source: 'students-api' }])
    .select('id').single()
  if (rErr) throw rErr

  return ok({ existing: false, student: shape(inserted), status_history_id: row.id }, 201)
}

async function changeStatus(ctx: Ctx, target: 'active' | 'frozen'): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const r = await resolveStudent(ctx, body)
  if (r.error) return err(r.error, 400, r.field ? { field: r.field } : {})
  if (r.multiple) return err('ambiguous', 409)
  if (!r.student) return err('not_found', 404)

  const res = await applyStatusChange(ctx, r.student, target)
  if (res.refused) return err('manual_change_recent', 409)
  if (!res.changed) return ok({ changed: false, student: res.student })
  return ok({
    changed: true, student: res.student,
    status_history_id: res.status_history_id, chesster_poke: res.chesster_poke,
  })
}

// Overwrite parent_phone and/or amocrm_customer_id on an existing student
// found strictly by student_id (the explicit correction path — link_amocrm
// never overwrites). Touches ONLY those two columns: no status / branch / coach
// change, no status_history row, no Chesster poke. Flow + outcome mapping live
// in updateContact() (students-logic.mjs); this supplies the DB adapter.
async function updateStudentContact(ctx: Ctx): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const v = validateUpdateContact(body)
  if (!v.value) return err('invalid_input', 400, { field: v.field })
  const ref = await resolveStudentRef(codeLookup(ctx), v.value)
  if (ref.error) return json(ref.error.body, ref.error.status)

  const r = await updateContact({
    async getStudent(id: string) {
      const { data, error } = await ctx.supabase
        .from('students').select(STUDENT_SELECT).eq('id', id).maybeSingle()
      if (error) throw error
      return data ? shape(data) : null
    },
    async findOwnerId(amo: number) {
      const { data, error } = await ctx.supabase
        .from('students').select('id').eq('amocrm_customer_id', amo).limit(1)
      if (error) throw error
      return data && data[0] ? data[0].id : null
    },
    async update(id: string, patch: { parent_phone?: string; amocrm_customer_id?: number }) {
      const { data, error } = await ctx.supabase
        .from('students').update(patch).eq('id', id)
        .select(STUDENT_SELECT)
      if (error) {
        if (error.code === '23505') return { uniqueViolation: true }
        throw error
      }
      return { row: data && data[0] ? shape(data[0]) : null }
    },
  }, { ...v.value, student_id: ref.id })
  return json(r.body, r.status)
}

// Write amocrm_customer_id onto an existing student found strictly by
// student_id. Touches ONLY that column: no status / branch / coach change, no
// status_history row, no Chesster poke. Flow + outcome mapping live in
// linkAmocrm() (students-logic.mjs); this supplies the DB adapter.
async function linkAmocrmId(ctx: Ctx): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const v = validateLinkAmocrm(body)
  if (!v.value) return err('invalid_input', 400, { field: v.field })
  const ref = await resolveStudentRef(codeLookup(ctx), v.value)
  if (ref.error) return json(ref.error.body, ref.error.status)

  const r = await linkAmocrm({
    async getStudent(id: string) {
      const { data, error } = await ctx.supabase
        .from('students').select('id, amocrm_customer_id').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
    async findOwnerId(amo: number) {
      const { data, error } = await ctx.supabase
        .from('students').select('id').eq('amocrm_customer_id', amo).limit(1)
      if (error) throw error
      return data && data[0] ? data[0].id : null
    },
    async setIfNull(id: string, amo: number) {
      const { data, error } = await ctx.supabase
        .from('students').update({ amocrm_customer_id: amo })
        .eq('id', id).is('amocrm_customer_id', null)
        .select('id, amocrm_customer_id')
      if (error) {
        if (error.code === '23505') return { uniqueViolation: true }
        throw error
      }
      return { row: (data && data[0]) || null }
    },
  }, { ...v.value, student_id: ref.id })
  return json(r.body, r.status)
}

// Precedence: student_code > amocrm_customer_id > phone (exact ids are the
// stronger selectors); the response mirrors the phone lookup's shape.
async function findStudents(ctx: Ctx, url: URL): Promise<Response> {
  const codeRaw = url.searchParams.get('student_code')
  if (codeRaw !== null) {
    const code = parseStudentCode(codeRaw)
    if (!code) return err('invalid_input', 400, { field: 'student_code' })
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('student_code', code)
    if (error) throw error
    return ok({ student_code: code, students: (data || []).map(shape) })
  }

  const amoRaw = url.searchParams.get('amocrm_customer_id')
  if (amoRaw !== null) {
    const amo = parseAmocrmId(amoRaw)
    if (amo === null) return err('invalid_input', 400, { field: 'amocrm_customer_id' })
    const { data, error } = await ctx.supabase
      .from('students').select(STUDENT_SELECT).eq('amocrm_customer_id', amo)
    if (error) throw error
    return ok({ amocrm_customer_id: amo, students: (data || []).map(shape) })
  }

  const norm = normalizePhone(url.searchParams.get('phone') || '')
  if (!norm) return err('invalid_input', 400, { field: 'phone' })
  const { data, error } = await ctx.supabase
    .rpc('find_students_by_phone_digits', { p_digits: phoneDigits(norm) })
  if (error) throw error
  return ok({ phone: norm, students: (data || []).map(shape) })
}

// Paginated student list ordered by student_code (zero-padded, so text order
// equals numeric order up to CE-99999).
async function listStudents(ctx: Ctx, url: URL): Promise<Response> {
  const q = (k: string) => url.searchParams.get(k)
  const parsed = parseListParams({ limit: q('limit'), offset: q('offset'), branch_id: q('branch_id'), status: q('status') })
  if (!parsed.value) return err('invalid_input', 400, { field: parsed.field })
  const p = parsed.value
  let query = ctx.supabase
    .from('students').select(STUDENT_SELECT, { count: 'exact' })
    .order('student_code', { ascending: true })
    .range(p.offset, p.offset + p.limit - 1)
  if (p.branch_id) query = query.eq('branch_id', p.branch_id)
  if (p.status) query = query.eq('status', p.status)
  const { data, error, count } = await query
  if (error) throw error
  return ok({ total: count ?? 0, limit: p.limit, offset: p.offset, students: (data || []).map(shape) })
}

async function listBranches(ctx: Ctx): Promise<Response> {
  const { data, error } = await ctx.supabase
    .from('branches').select('id, name').order('name', { ascending: true })
  if (error) throw error
  return ok({ branches: (data || []).map((b: any) => ({ id: b.id, name: b.name })) })
}

// ─── Puzzle Rush (survival) ─────────────────────────────────────────────────

const SURVIVAL_NOTES = 'Chesster Puzzle Rush (survival)'

async function survivalBest(ctx: Ctx, studentId: string) {
  const { data, error } = await ctx.supabase
    .rpc('get_student_puzzle_rush_best', { p_student_id: studentId })
  if (error) throw error
  const row = (data && data[0]) || {}
  return { week: row.week_best ?? null, month: row.month_best ?? null, all: row.all_best ?? null }
}

async function findByExternalRef(ctx: Ctx, ref: string): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from('survival_scores').select('id').eq('external_ref', ref).maybeSingle()
  if (error) throw error
  return data ? data.id : null
}

// Push one Chesster Puzzle Rush Survival run. Idempotent on external_ref: a
// retry (or a concurrent duplicate losing the unique-index race) returns the
// existing row's id with duplicate:true and never inserts a second row.
async function pushSurvivalScore(ctx: Ctx): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const v = validateSurvivalPush(body)
  if (!v.value) return err('invalid_input', 400, { field: v.field, max_score: SURVIVAL_SCORE_MAX })
  const ref = await resolveStudentRef(codeLookup(ctx), v.value)
  if (ref.error) return json(ref.error.body, ref.error.status)
  const push = { ...v.value, student_id: ref.id as string }

  const { data: student, error: sErr } = await ctx.supabase
    .from('students').select('id, status').eq('id', push.student_id).maybeSingle()
  if (sErr) throw sErr
  if (!student) return err('not_found', 404)
  if (student.status !== 'active') return err('student_inactive', 409)

  const existingId = await findByExternalRef(ctx, push.external_ref)
  if (existingId) return ok({ duplicate: true, id: existingId })

  const row: Record<string, unknown> = {
    student_id: push.student_id,
    score: push.score,
    mode: 'puzzle_rush',
    source: 'chesster',
    external_ref: push.external_ref,
    notes: SURVIVAL_NOTES,
  }
  if (push.achieved_at) row.achieved_at = push.achieved_at

  const { data: inserted, error: iErr } = await ctx.supabase
    .from('survival_scores').insert([row]).select('id').single()
  if (iErr) {
    if (iErr.code === '23505') {
      const raceId = await findByExternalRef(ctx, push.external_ref)
      if (raceId) return ok({ duplicate: true, id: raceId })
    }
    throw iErr
  }

  return ok({ id: inserted.id, best: await survivalBest(ctx, push.student_id) })
}

async function getSurvivalBest(ctx: Ctx, url: URL): Promise<Response> {
  const r = await resolveRef(ctx, {
    student_id: url.searchParams.get('student_id'), student_code: url.searchParams.get('student_code'),
  })
  if (r.res) return r.res
  return ok({ student_id: r.id, best: await survivalBest(ctx, r.id!) })
}

async function getSurvivalLeaderboard(ctx: Ctx, url: URL): Promise<Response> {
  const q = (k: string) => url.searchParams.get(k)
  const parsed = parseLeaderboardParams({
    scope: q('scope'), period: q('period'), branch_id: q('branch_id'),
    student_id: q('student_id'), student_code: q('student_code'), limit: q('limit'),
  })
  if (!parsed.value) return err('invalid_input', 400, { field: parsed.field })
  const p = parsed.value
  if (p.student_code) {
    const r = await resolveRef(ctx, { student_id: p.student_id, student_code: p.student_code })
    if (r.res) return r.res
    p.student_id = r.id!
  }
  const { data, error } = await ctx.supabase.rpc('get_puzzle_rush_leaderboard', {
    p_scope: p.scope, p_period: p.period, p_branch_id: p.branch_id,
    p_student_id: p.student_id, p_limit: p.limit,
  })
  if (error) throw error
  const rows = data || []
  const start = almatyWindowStart(p.period, Date.now())
  return ok({
    scope: p.scope, period: p.period, branch_id: p.branch_id,
    window_start: start ? start.toISOString() : null,
    total_count: rows.length ? Number(rows[0].total_count) : 0,
    rows,
  })
}

// ─── OpenAPI ──────────────────────────────────────────────────────────────
const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Chess Empire — Students (write) API',
    version: '1.0.0',
    description: 'Write API for external integrations (e.g. AmoCRM, Chesster): create / freeze / activate students, link an amoCRM customer id to an existing student, correct the phone / amoCRM id, find by Student ID (student_code) / phone / amoCRM id, list students, list branches, push Puzzle Rush survival scores and read Puzzle Rush rankings. All actions require an x-api-key header (CHESS_EMPIRE_WRITE_KEY). Every student carries student_code — a permanent, human-readable Student ID (CE-00001; CE-100000 after CE-99999) assigned by the database, never edited and never reused. Wherever student_id is accepted, student_code may be given instead; if both are given they must name the same student (400 student_id_code_mismatch).',
  },
  servers: [
    { url: 'https://papgcizhfkngubwofjuo.supabase.co/functions/v1/students-api', description: 'Supabase edge function direct' },
  ],
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    schemas: {
      Reason: { type: 'string', enum: [...REASONS] },
      Error: {
        type: 'object', required: ['ok', 'reason'],
        properties: { ok: { type: 'boolean', enum: [false] }, reason: { $ref: '#/components/schemas/Reason' } },
      },
      StudentCode: {
        type: 'string', pattern: '^CE-[0-9]{5,}$', example: 'CE-00452',
        description: 'Permanent human-readable Student ID. Assigned by the DB on create; immutable; never reused. Input is trimmed and uppercased.',
      },
      Student: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          student_code: { $ref: '#/components/schemas/StudentCode' },
          name: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          status: { type: 'string' },
          branch_id: { type: 'string', format: 'uuid', nullable: true },
          branch: { type: 'string', nullable: true },
          amocrm_customer_id: { type: 'integer', nullable: true },
          phone: { type: 'string', nullable: true },
        },
      },
    },
  },
  paths: {
    '/?action=create': {
      post: {
        summary: 'Create a student (dedups by phone / amocrm_customer_id; reactivates a frozen match)',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['full_name', 'phone', 'branch_id'],
          properties: {
            full_name: { type: 'string' }, phone: { type: 'string' },
            branch_id: { type: 'string', format: 'uuid' },
            amocrm_customer_id: { type: 'integer', nullable: true },
          },
        } } } },
        responses: { '200': { description: 'Existing / reactivated' }, '201': { description: 'Created' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' }, '409': { description: 'Ambiguous dedup match' } },
      },
    },
    '/?action=freeze': {
      post: {
        summary: 'Freeze a student. Refused (409) if a manual change is < 3 days old.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          description: 'One selector; precedence student_code > student_id > amocrm_customer_id > phone',
          properties: { student_code: { $ref: '#/components/schemas/StudentCode' }, student_id: { type: 'string', format: 'uuid' }, phone: { type: 'string' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '400': { description: 'invalid_input / student_id_code_mismatch' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous' } },
      },
    },
    '/?action=activate': {
      post: {
        summary: 'Activate (unfreeze) a student. Refused (409) if a manual change is < 3 days old.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          description: 'One selector; precedence student_code > student_id > amocrm_customer_id > phone',
          properties: { student_code: { $ref: '#/components/schemas/StudentCode' }, student_id: { type: 'string', format: 'uuid' }, phone: { type: 'string' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '400': { description: 'invalid_input / student_id_code_mismatch' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous' } },
      },
    },
    '/?action=link_amocrm': {
      post: {
        summary: 'Link an amoCRM customer id to an EXISTING student (by student_id or student_code). Changes only students.amocrm_customer_id — never status, branch, coach or status history. Never overwrites a different id. Atomic conditional write.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['amocrm_customer_id'],
          description: 'student_id or student_code is required',
          anyOf: [{ required: ['student_id'] }, { required: ['student_code'] }],
          properties: {
            student_id: { type: 'string', format: 'uuid' },
            student_code: { $ref: '#/components/schemas/StudentCode' },
            amocrm_customer_id: { type: 'integer', minimum: 1, description: 'Positive integer (a numeric string is accepted)' },
          },
        }, example: { student_id: '00000000-0000-4000-8000-000000000000', amocrm_customer_id: 123456 } } } },
        responses: {
          '200': {
            description: 'Linked (changed:true) or already linked to the same id (changed:false, no write)',
            content: { 'application/json': { examples: {
              linked: { value: { ok: true, changed: true, student: { id: '00000000-0000-4000-8000-000000000000', amocrm_customer_id: 123456 } } },
              already_linked: { value: { ok: true, changed: false, student: { id: '00000000-0000-4000-8000-000000000000', amocrm_customer_id: 123456 } } },
            } } },
          },
          '400': { description: 'invalid_input — bad UUID / student_code or amoCRM id; student_id_code_mismatch', content: { 'application/json': { example: { ok: false, reason: 'invalid_input', field: 'amocrm_customer_id' } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'not_found — no student with this UUID / student_code', content: { 'application/json': { example: { ok: false, reason: 'not_found' } } } },
          '409': {
            description: 'amocrm_customer_id_conflict — the student already has a different id, or this id belongs to another student (conflict_student_id when known). Nothing is changed.',
            content: { 'application/json': { examples: {
              different_id_on_student: { value: { ok: false, reason: 'amocrm_customer_id_conflict' } },
              id_on_other_student: { value: { ok: false, reason: 'amocrm_customer_id_conflict', conflict_student_id: '11111111-1111-4111-8111-111111111111' } },
            } } },
          },
        },
      },
    },
    '/?action=update_contact': {
      post: {
        summary: 'Correct (overwrite) parent phone and/or amoCRM customer id on an EXISTING student (by student_id or student_code). Changes only students.parent_phone / students.amocrm_customer_id — never status, branch, coach or status history. Clearing a value (null) is not supported. Phone is not unique (siblings share a parent phone); amocrm_customer_id is.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          description: 'student_id or student_code is required, plus at least one of phone / amocrm_customer_id',
          anyOf: [{ required: ['student_id'] }, { required: ['student_code'] }],
          properties: {
            student_id: { type: 'string', format: 'uuid' },
            student_code: { $ref: '#/components/schemas/StudentCode' },
            phone: { type: 'string', description: 'KZ/RU phone, normalized to +7XXXXXXXXXX' },
            amocrm_customer_id: { type: 'integer', minimum: 1, description: 'Positive integer (a numeric string is accepted)' },
          },
        }, example: { student_id: '00000000-0000-4000-8000-000000000000', phone: '+77011234567', amocrm_customer_id: 123456 } } } },
        responses: {
          '200': {
            description: 'Updated (changed:true, with updated_fields and previous values) or every provided value already current (changed:false, no write). student uses the same shape as find.',
            content: { 'application/json': { examples: {
              updated: { value: { ok: true, changed: true, updated_fields: ['amocrm_customer_id'], previous: { phone: '+77011234567', amocrm_customer_id: 111 }, student: { id: '00000000-0000-4000-8000-000000000000', phone: '+77011234567', amocrm_customer_id: 123456 } } },
              unchanged: { value: { ok: true, changed: false, student: { id: '00000000-0000-4000-8000-000000000000', phone: '+77011234567', amocrm_customer_id: 123456 } } },
            } } },
          },
          '400': { description: 'student_id_code_mismatch, or invalid_input — bad UUID / student_code, phone or amoCRM id (field names it), or neither phone nor amocrm_customer_id given (field: body)', content: { 'application/json': { example: { ok: false, reason: 'invalid_input', field: 'phone' } } } },
          '401': { description: 'Unauthorized' },
          '404': { description: 'not_found — no student with this UUID / student_code', content: { 'application/json': { example: { ok: false, reason: 'not_found' } } } },
          '409': { description: 'amocrm_customer_id_conflict — this id belongs to another student. Nothing is changed.', content: { 'application/json': { example: { ok: false, reason: 'amocrm_customer_id_conflict', conflict_student_id: '11111111-1111-4111-8111-111111111111' } } } },
        },
      },
    },
    '/?action=find': {
      get: {
        summary: 'Find students by Student ID, amoCRM customer id or normalized phone (precedence student_code > amocrm_customer_id > phone)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'student_code', in: 'query', required: false, schema: { $ref: '#/components/schemas/StudentCode' }, description: 'Exact Student ID (trimmed, uppercased; must match CE- + at least 5 digits); takes precedence over everything else' },
          { name: 'phone', in: 'query', required: false, schema: { type: 'string' }, description: 'Required unless student_code / amocrm_customer_id is given' },
          { name: 'amocrm_customer_id', in: 'query', required: false, schema: { type: 'integer', minimum: 1 }, description: 'Exact amoCRM customer id; takes precedence over phone' },
        ],
        responses: { '200': { description: '{ok, student_code, students[]}, {ok, amocrm_customer_id, students[]} or {ok, phone, students[]}' }, '400': { description: 'Bad student_code / phone / amocrm_customer_id (field names it)' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=list': {
      get: {
        summary: 'Paginated student list ordered by student_code',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: LIST_MAX_LIMIT, default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'branch_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: STUDENT_STATUSES } },
        ],
        responses: { '200': { description: '{ok, total, limit, offset, students[]} — total is the exact count for the filters' }, '400': { description: 'Bad limit / offset / branch_id / status (field names it)' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=branches': {
      get: {
        summary: 'List all branches (id + name) for integration branch mapping',
        security: [{ ApiKeyAuth: [] }],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=survival-score': {
      post: {
        summary: `Push a Chesster Puzzle Rush Survival run (score 0..${SURVIVAL_SCORE_MAX}). Idempotent on external_ref: a repeat returns {ok:true, duplicate:true, id} without a second row.`,
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['score', 'external_ref'],
          description: 'student_id or student_code is required',
          anyOf: [{ required: ['student_id'] }, { required: ['student_code'] }],
          properties: {
            student_id: { type: 'string', format: 'uuid' },
            student_code: { $ref: '#/components/schemas/StudentCode' },
            score: { type: 'integer', minimum: 0, maximum: SURVIVAL_SCORE_MAX },
            achieved_at: { type: 'string', format: 'date-time', nullable: true },
            external_ref: { type: 'string', description: 'Chesster run id (unique)' },
          },
        } } } },
        responses: { '200': { description: '{ok, id, best:{week,month,all}} or {ok, duplicate:true, id}' }, '400': { description: 'Bad input' }, '401': { description: 'Unauthorized' }, '404': { description: 'Student not found' }, '409': { description: 'student_inactive' } },
      },
    },
    '/?action=survival-best': {
      get: {
        summary: 'Student Puzzle Rush bests for the current week / month (Asia/Almaty) and all time',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'student_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'student_id or student_code is required' },
          { name: 'student_code', in: 'query', schema: { $ref: '#/components/schemas/StudentCode' } },
        ],
        responses: { '200': { description: '{ok, student_id, best:{week,month,all}}' }, '400': { description: 'Bad student_id / student_code, or student_id_code_mismatch' }, '404': { description: 'Unknown student_code' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=survival-leaderboard': {
      get: {
        summary: 'Puzzle Rush leaderboard (best per active student, competition rank). Windows in Asia/Almaty; week starts Monday.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['school', 'branch'], default: 'school' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month', 'all'], default: 'all' } },
          { name: 'branch_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Required for scope=branch; implies scope=branch when scope is omitted' },
          { name: 'student_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Appends this student\'s row (is_self) when outside the top N' },
          { name: 'student_code', in: 'query', schema: { $ref: '#/components/schemas/StudentCode' }, description: 'Alternative to student_id' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
        ],
        responses: { '200': { description: '{ok, scope, period, branch_id, window_start, total_count, rows[]} — each row carries student_id + student_code' }, '400': { description: 'Bad params' }, '401': { description: 'Unauthorized' } },
      },
    },
  },
}

// ─── Entry point ──────────────────────────────────────────────────────────

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const method = req.method.toUpperCase()
  const action = url.searchParams.get('action')
  let status = 500

  try {
    // Public self-doc: GET with no action.
    if (method === 'GET' && !action) {
      const r = json(OPENAPI_SPEC, 200); status = r.status; return r
    }

    // Everything else is key-gated.
    if (!authorized(req)) {
      const r = err('unauthorized', 401); status = r.status; return r
    }

    const supabase = createClient(SUPABASE_URL, DB_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const ctx: Ctx = { supabase, req }

    if (method === 'POST' && action === 'create') {
      const r = await createStudent(ctx); status = r.status; return r
    }
    if (method === 'POST' && action === 'freeze') {
      const r = await changeStatus(ctx, 'frozen'); status = r.status; return r
    }
    if (method === 'POST' && action === 'activate') {
      const r = await changeStatus(ctx, 'active'); status = r.status; return r
    }
    if (method === 'POST' && action === 'link_amocrm') {
      const r = await linkAmocrmId(ctx); status = r.status; return r
    }
    if (method === 'POST' && action === 'update_contact') {
      const r = await updateStudentContact(ctx); status = r.status; return r
    }
    if (method === 'GET' && action === 'find') {
      const r = await findStudents(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && action === 'list') {
      const r = await listStudents(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && action === 'branches') {
      const r = await listBranches(ctx); status = r.status; return r
    }
    if (method === 'POST' && action === 'survival-score') {
      const r = await pushSurvivalScore(ctx); status = r.status; return r
    }
    if (method === 'GET' && action === 'survival-best') {
      const r = await getSurvivalBest(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && action === 'survival-leaderboard') {
      const r = await getSurvivalLeaderboard(ctx, url); status = r.status; return r
    }

    const r = err('not_found', 404); status = r.status; return r
  } catch (e) {
    const payload =
      e instanceof Error ? { message: e.message, name: e.name } :
      (e && typeof e === 'object') ? { message: (e as any).message, code: (e as any).code, details: (e as any).details } :
      { message: String(e) }
    console.error('students-api error', payload)
    const r = err('server_error', 500)
    status = r.status
    return r
  } finally {
    console.log(`${method} ${url.pathname}?action=${action ?? ''} ${status}`)
  }
}

serve(handle)
