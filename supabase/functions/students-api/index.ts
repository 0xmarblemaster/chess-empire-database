// Students write API — for external integrations (e.g. AmoCRM sync).
//
// Unlike the read-only analytics-* functions, this one WRITES: create a
// student, freeze / activate (unfreeze) a student, link an amoCRM customer id
// to an existing student, correct (overwrite) a student's phone / amoCRM id,
// find by Student ID (student_code) / phone / amoCRM id, list students, list branches, and export the
// weekly roster + rank change history (read-only). Every call requires an `x-api-key` header checked against the
// CHESS_EMPIRE_WRITE_KEY env var (a NEW key, distinct from the tournament-only
// CHESS_EMPIRE_API_KEY — the two surfaces never share a key).
//
// Routing is on a `?action=` query param (create / freeze / activate /
// link_amocrm / update_contact / find / list / branches / roster / rank_history / survival-score / survival-best / survival-leaderboard); GET with no action returns the OpenAPI self-doc. Modelled on
// tournaments-api/index.ts (Deno serve + CORS + json/ok/err helpers).
//
// Product rules enforced here:
//  - Create is idempotent on amocrm_customer_id (the Buyer ID is checked
//    first). Phones are NOT unique — siblings share a parent's phone — so a
//    phone hit only counts when the normalized full name matches too (one match
//    → that student, several → 409 ambiguous, none → a new student with the
//    same phone). A matched student that is frozen is reactivated.
//  - Phones are E.164 (+<country code><number>, libphonenumber-validated);
//    phone is optional on create when amocrm_customer_id is given.
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
  isManualChangeRecent,
  isUuid,
  parseStudentCode,
  parseStudentRef,
  resolveStudentRef,
  studentCodeLookup,
  parseListParams,
  LIST_MAX_LIMIT,
  parseRosterParams,
  rosterRow,
  nextAfterId,
  parseRankHistoryParams,
  rankHistoryRow,
  nameMap,
  userNameMap,
  EXPORT_MAX_LIMIT,
  ROSTER_STATUSES,
  STUDENT_STATUSES,
  parseAmocrmId,
  validateLinkAmocrm,
  linkAmocrm,
  validateUpdateContact,
  updateContact,
  validateCreate,
  createStudent as createStudentFlow,
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

const PHONE_MESSAGE = 'phone must be a valid number in international format with its country code (E.164, e.g. +77001234567, +351912345678); KZ numbers may also be given as 8XXXXXXXXXX or 10 digits'

// deno-lint-ignore no-explicit-any
interface Ctx { supabase: any; req: Request }

// Every student whose parent_phone is this E.164 number (exact country code;
// legacy unprefixed KZ formats only match +7). Phones are shared by siblings,
// so this is a list — never "the" student.
async function findByPhone(ctx: Ctx, e164: string): Promise<ReturnType<typeof shape>[]> {
  const { data, error } = await ctx.supabase.rpc('find_students_by_phone_e164', { p_e164: e164 })
  if (error) throw error
  return (data || []).map(shape)
}

// Adapter for resolveStudentRef(): student_code → UUID.
const codeLookup = (ctx: Ctx) => studentCodeLookup(ctx.supabase)

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
    const rows = await findByPhone(ctx, norm)
    if (rows.length > 1) return { multiple: true }
    return { student: rows[0] ?? null }
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

// Buyer-ID first, then phone + name (shared family phones). Flow + outcome
// mapping live in createStudent() (students-logic.mjs); this supplies the DB
// adapter. student_time_slot_assignments is intentionally untouched (081).
async function createStudent(ctx: Ctx): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const v = validateCreate(body)
  if (!v.value) return err('invalid_input', 400, v.field === 'phone' ? { field: 'phone', message: PHONE_MESSAGE } : { field: v.field })

  const r = await createStudentFlow({
    async branchExists(branchId: string) {
      // Validate the branch exists — never silently default to some other branch.
      const { data, error } = await ctx.supabase
        .from('branches').select('id').eq('id', branchId).maybeSingle()
      if (error) throw error
      return !!data
    },
    async findByAmocrmId(amo: number) {
      const { data, error } = await ctx.supabase
        .from('students').select(STUDENT_SELECT).eq('amocrm_customer_id', amo).limit(2)
      if (error) throw error
      return (data || []).map(shape)
    },
    findByPhone: (e164: string) => findByPhone(ctx, e164),
    async linkIfNull(id: string, amo: number) {
      const { data, error } = await ctx.supabase
        .from('students').update({ amocrm_customer_id: amo })
        .eq('id', id).is('amocrm_customer_id', null)
        .select(STUDENT_SELECT)
      if (error) {
        if (error.code === '23505') return { uniqueViolation: true }
        throw error
      }
      return { row: data && data[0] ? shape(data[0]) : null }
    },
    async insert(row: Record<string, unknown>) {
      const { data: inserted, error: iErr } = await ctx.supabase
        .from('students').insert([row]).select(STUDENT_SELECT).single()
      if (iErr) {
        if (iErr.code === '23505') return { uniqueViolation: true }
        throw iErr
      }
      const { data: hist, error: rErr } = await ctx.supabase
        .from('student_status_history')
        .insert([{ student_id: inserted.id, old_status: null, new_status: 'active', changed_by_type: 'api', source: 'students-api' }])
        .select('id').single()
      if (rErr) throw rErr
      return { row: shape(inserted), status_history_id: hist.id }
    },
    activate: (student: ReturnType<typeof shape>) => applyStatusChange(ctx, student, 'active'),
  }, v.value)
  return json(r.body, r.status)
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
  if (!norm) return err('invalid_input', 400, { field: 'phone', message: PHONE_MESSAGE })
  return ok({ phone: norm, students: await findByPhone(ctx, norm) })
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

// ─── Roster + rank history (weekly rank-tracking export, read-only) ──────────

const ROSTER_SELECT = 'id, student_code, first_name, last_name, status, branch_id, coach_id, current_level, razryad, created_at'
const RANK_HISTORY_SELECT = 'id, student_id, old_razryad, new_razryad, changed_at, changed_by, source, source_derived, trainer_id_at_change, trainer_attribution, student:students(student_code)'

interface RankHistoryDbRow { student_id: string; changed_by: string | null; student: { student_code: string | null } | null }
interface UserRoleRow { user_id: string; coach_id: string | null }

// Coaches and branches are small tables — one read each beats long id lists.
async function coachNames(ctx: Ctx): Promise<Record<string, string | null>> {
  const { data, error } = await ctx.supabase.from('coaches').select('id, first_name, last_name')
  if (error) throw error
  return nameMap(data)
}

async function branchNames(ctx: Ctx): Promise<Record<string, string>> {
  const { data, error } = await ctx.supabase.from('branches').select('id, name')
  if (error) throw error
  return Object.fromEntries((data || []).map((b: { id: string; name: string }) => [b.id, b.name]))
}

// Weekly roster snapshot ordered by id. total is the exact count for the
// status filter at as_of (independent of the page / cursor).
async function getRoster(ctx: Ctx, url: URL): Promise<Response> {
  const q = (k: string) => url.searchParams.get(k)
  const parsed = parseRosterParams({ status: q('status'), limit: q('limit'), offset: q('offset'), after_id: q('after_id') })
  if (!parsed.value) return err('invalid_input', 400, { field: parsed.field })
  const p = parsed.value
  const asOf = new Date().toISOString()

  let query = ctx.supabase.from('students').select(ROSTER_SELECT).order('id', { ascending: true })
  let countQuery = ctx.supabase.from('students').select('id', { count: 'exact', head: true })
  if (p.status !== 'all') {
    query = query.eq('status', p.status)
    countQuery = countQuery.eq('status', p.status)
  }
  query = p.after_id
    ? query.gt('id', p.after_id).limit(p.limit)
    : query.range(p.offset, p.offset + p.limit - 1)

  const [rows, counted, coaches, branches] = await Promise.all([query, countQuery, coachNames(ctx), branchNames(ctx)])
  if (rows.error) throw rows.error
  if (counted.error) throw counted.error
  const data = rows.data || []
  return ok({
    as_of: asOf, status: p.status, total: counted.count ?? 0, limit: p.limit, offset: p.offset,
    after_id: p.after_id, next_after_id: nextAfterId(data, p.limit),
    students: data.map((r: Record<string, unknown>) => rosterRow(r, { branchNames: branches, coachNames: coaches })),
  })
}

// changed_by display names: coach accounts → coach name; other staff → their
// auth email (service-role read); unknown / deleted users → null.
async function userNames(ctx: Ctx, userIds: string[], coaches: Record<string, string | null>) {
  if (userIds.length === 0) return {}
  const { data, error } = await ctx.supabase.from('user_roles').select('user_id, coach_id').in('user_id', userIds)
  if (error) throw error
  const roles: UserRoleRow[] = data || []
  const coachUsers = new Set(roles.filter((r) => r.coach_id && coaches[r.coach_id]).map((r) => r.user_id))
  const emails: Record<string, string> = {}
  await Promise.all(userIds.filter((id) => !coachUsers.has(id)).map(async (id) => {
    const { data: u } = await ctx.supabase.auth.admin.getUserById(id)
    if (u?.user?.email) emails[id] = u.user.email
  }))
  return userNameMap(roles, coaches, emails)
}

// Append-only rank change log ordered by changed_at, id. from inclusive, to
// exclusive. History starts 2026-05-18 — earlier ranks have no events.
async function getRankHistory(ctx: Ctx, url: URL): Promise<Response> {
  const q = (k: string) => url.searchParams.get(k)
  const parsed = parseRankHistoryParams({
    student_id: q('student_id'), student_code: q('student_code'), from: q('from'), to: q('to'),
    limit: q('limit'), offset: q('offset'), after_id: q('after_id'),
  })
  if (!parsed.value) return err('invalid_input', 400, { field: parsed.field })
  const p = parsed.value
  let studentId: string | null = p.student_id ?? null
  if (p.student_code) {
    const r = await resolveStudentRef(codeLookup(ctx), p)
    if (r.error) return json(r.error.body, r.error.status)
    studentId = r.id
  }

  let query = ctx.supabase.from('razryad_history').select(RANK_HISTORY_SELECT, { count: 'exact' })
    .order('changed_at', { ascending: true }).order('id', { ascending: true })
    .range(p.offset, p.offset + p.limit - 1)
  if (studentId) query = query.eq('student_id', studentId)
  if (p.from) query = query.gte('changed_at', p.from)
  if (p.to) query = query.lt('changed_at', p.to)

  const [rows, coaches] = await Promise.all([query, coachNames(ctx)])
  if (rows.error) throw rows.error
  const data: RankHistoryDbRow[] = rows.data || []
  const studentCodes = Object.fromEntries(data.map((r) => [r.student_id, r.student?.student_code ?? null]))
  const changers = [...new Set(data.map((r) => r.changed_by).filter((id): id is string => !!id))]
  const users = await userNames(ctx, changers, coaches)
  return ok({
    as_of: new Date().toISOString(), student_id: studentId, from: p.from, to: p.to,
    total: rows.count ?? 0, limit: p.limit, offset: p.offset,
    rank_changes: data.map((r) => rankHistoryRow(r, { studentCodes, coachNames: coaches, userNames: users })),
  })
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
    description: 'Write API for external integrations (e.g. AmoCRM, Chesster): create / freeze / activate students, link an amoCRM customer id to an existing student, correct the phone / amoCRM id, find by Student ID (student_code) / phone / amoCRM id, list students, list branches, export the weekly roster and rank change history (read-only), push Puzzle Rush survival scores and read Puzzle Rush rankings. All actions require an x-api-key header (CHESS_EMPIRE_WRITE_KEY). Every student carries student_code — a permanent, human-readable Student ID (CE-00001; CE-100000 after CE-99999) assigned by the database, never edited and never reused. Wherever student_id is accepted, student_code may be given instead; if both are given they must name the same student (400 student_id_code_mismatch). Phones are E.164 with any country code and are NOT unique (siblings may share one); amocrm_customer_id is unique and is the primary identity for create.',
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
      Phone: {
        type: 'string', example: '+351912345678',
        description: 'E.164 phone: + country calling code + national number, validated with libphonenumber (any country — e.g. +7, +351, +44, +420, +90). Spaces, dashes, parens and dots are ignored; a 00 prefix is read as +. Legacy KZ input without a prefix is promoted to +7 (8XXXXXXXXXX, 7XXXXXXXXXX, bare 10 digits). Invalid / impossible numbers (e.g. +3…, which is not a complete country code) are rejected with 400 invalid_input field:phone — the country code is never guessed or rewritten. Phones are NOT unique: siblings may share one.',
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
          phone: { type: 'string', nullable: true, description: 'Stored parent phone (E.164 for writes through this API; null when none)' },
        },
      },
    },
  },
  paths: {
    '/?action=create': {
      post: {
        summary: 'Create-or-activate a student. Identity is amocrm_customer_id (Buyer ID), checked first: an id that already belongs to a student returns that student (replays are idempotent). Otherwise every student with the same phone is compared by normalized full name (trim, collapsed spaces, case-insensitive, ё=е): exactly one match → that student (the Buyer ID is linked if it has none); several → 409 ambiguous for manual review; none → a NEW student with the same phone. A matched frozen student is reactivated. Phone is optional when amocrm_customer_id is given (stored as null — never a placeholder). Nothing is written on any 4xx.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['full_name', 'branch_id'],
          description: 'phone is required unless amocrm_customer_id is given',
          anyOf: [{ required: ['phone'] }, { required: ['amocrm_customer_id'] }],
          properties: {
            full_name: { type: 'string' },
            phone: { $ref: '#/components/schemas/Phone' },
            branch_id: { type: 'string', format: 'uuid' },
            amocrm_customer_id: { type: 'integer', minimum: 1, nullable: true, description: 'amoCRM Buyer ID — unique per student (a numeric string is accepted)' },
          },
        }, examples: {
          sibling_same_phone: { value: { full_name: 'Aru Sadykova', phone: '+7 700 123 45 67', branch_id: '22222222-2222-4222-8222-222222222222', amocrm_customer_id: 1002 } },
          international_phone: { value: { full_name: 'Maria Silva', phone: '+351 912 345 678', branch_id: '22222222-2222-4222-8222-222222222222', amocrm_customer_id: 1003 } },
          no_phone: { value: { full_name: 'Timur Akhmetov', branch_id: '22222222-2222-4222-8222-222222222222', amocrm_customer_id: 1004 } },
        } } } },
        responses: {
          '200': {
            description: 'Existing student (existing:true, matched_by amocrm_customer_id | phone_name; linked:true when the Buyer ID was written onto it; reactivated true/false when it was frozen). Read back by UUID or amocrm_customer_id with action=find.',
            content: { 'application/json': { examples: {
              replay_same_buyer_id: { value: { ok: true, existing: true, matched_by: 'amocrm_customer_id', student: { id: '00000000-0000-4000-8000-00000000000b', student_code: 'CE-00453', name: 'Aru Sadykova', status: 'active', amocrm_customer_id: 1002, phone: '+77001234567' } } },
              phone_and_name_match: { value: { ok: true, existing: true, matched_by: 'phone_name', linked: true, student: { id: '00000000-0000-4000-8000-00000000000a', student_code: 'CE-00452', name: 'Ali Sadykov', status: 'active', amocrm_customer_id: 1001, phone: '+77001234567' } } },
            } } },
          },
          '201': {
            description: 'Created (existing:false). Two Buyer IDs sharing one phone create two students.',
            content: { 'application/json': { examples: {
              sibling_same_phone: { value: { ok: true, existing: false, student: { id: '00000000-0000-4000-8000-00000000000b', student_code: 'CE-00453', name: 'Aru Sadykova', status: 'active', amocrm_customer_id: 1002, phone: '+77001234567' }, status_history_id: '33333333-3333-4333-8333-333333333333' } },
              international_phone: { value: { ok: true, existing: false, student: { id: '00000000-0000-4000-8000-00000000000c', student_code: 'CE-00454', name: 'Maria Silva', status: 'active', amocrm_customer_id: 1003, phone: '+351912345678' }, status_history_id: '33333333-3333-4333-8333-333333333334' } },
              no_phone: { value: { ok: true, existing: false, student: { id: '00000000-0000-4000-8000-00000000000d', student_code: 'CE-00455', name: 'Timur Akhmetov', status: 'active', amocrm_customer_id: 1004, phone: null }, status_history_id: '33333333-3333-4333-8333-333333333335' } },
            } } },
          },
          '400': {
            description: 'invalid_input (field names it: full_name, phone, branch_id, amocrm_customer_id) or invalid_branch. Nothing is written.',
            content: { 'application/json': { examples: {
              invalid_phone: { value: { ok: false, reason: 'invalid_input', field: 'phone', message: 'phone must be a valid number in international format with its country code (E.164, …)' } },
              phone_required_without_buyer_id: { value: { ok: false, reason: 'invalid_input', field: 'phone', message: '…' } },
            } } },
          },
          '401': { description: 'Unauthorized' },
          '409': {
            description: 'ambiguous — several students share this phone AND the normalized name (candidates listed for manual review); amocrm_customer_id_conflict — the phone+name match already has a different Buyer ID, or the id was taken concurrently (conflict_student_id). Nothing is written.',
            content: { 'application/json': { examples: {
              ambiguous: { value: { ok: false, reason: 'ambiguous', candidates: [{ id: '00000000-0000-4000-8000-00000000000a', student_code: 'CE-00452', name: 'Ali Sadykov', status: 'active', amocrm_customer_id: 1001, phone: '+77001234567' }, { id: '00000000-0000-4000-8000-00000000000e', student_code: 'CE-00460', name: 'Ali Sadykov', status: 'frozen', amocrm_customer_id: null, phone: '+77001234567' }] } },
              conflict: { value: { ok: false, reason: 'amocrm_customer_id_conflict', conflict_student_id: '00000000-0000-4000-8000-00000000000a' } },
            } } },
          },
        },
      },
    },
    '/?action=freeze': {
      post: {
        summary: 'Freeze a student. Refused (409) if a manual change is < 3 days old.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          description: 'One selector; precedence student_code > student_id > amocrm_customer_id > phone',
          properties: { student_code: { $ref: '#/components/schemas/StudentCode' }, student_id: { type: 'string', format: 'uuid' }, phone: { $ref: '#/components/schemas/Phone' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '400': { description: 'invalid_input / student_id_code_mismatch' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous (e.g. a phone shared by several students — use student_id / amocrm_customer_id)' } },
      },
    },
    '/?action=activate': {
      post: {
        summary: 'Activate (unfreeze) a student. Refused (409) if a manual change is < 3 days old.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          description: 'One selector; precedence student_code > student_id > amocrm_customer_id > phone',
          properties: { student_code: { $ref: '#/components/schemas/StudentCode' }, student_id: { type: 'string', format: 'uuid' }, phone: { $ref: '#/components/schemas/Phone' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '400': { description: 'invalid_input / student_id_code_mismatch' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous (e.g. a phone shared by several students — use student_id / amocrm_customer_id)' } },
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
            phone: { $ref: '#/components/schemas/Phone' },
            amocrm_customer_id: { type: 'integer', minimum: 1, description: 'Positive integer (a numeric string is accepted)' },
          },
        }, examples: {
          kz: { value: { student_id: '00000000-0000-4000-8000-000000000000', phone: '+77011234567', amocrm_customer_id: 123456 } },
          international: { value: { student_id: '00000000-0000-4000-8000-000000000000', phone: '+44 7400 123456' } },
        } } } },
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
          { name: 'phone', in: 'query', required: false, schema: { $ref: '#/components/schemas/Phone' }, description: 'Required unless student_code / amocrm_customer_id is given. Exact E.164 match (a +44 number never matches a +7 one); returns EVERY student sharing the phone (e.g. siblings). URL-encode + as %2B.' },
          { name: 'amocrm_customer_id', in: 'query', required: false, schema: { type: 'integer', minimum: 1 }, description: 'Exact amoCRM customer id; takes precedence over phone' },
        ],
        responses: {
          '200': {
            description: '{ok, student_code, students[]}, {ok, amocrm_customer_id, students[]} or {ok, phone, students[]} — phone is the normalized E.164 value; students[] holds all matches',
            content: { 'application/json': { examples: {
              shared_phone: { value: { ok: true, phone: '+77001234567', students: [{ id: '00000000-0000-4000-8000-00000000000a', student_code: 'CE-00452', name: 'Ali Sadykov', status: 'active', amocrm_customer_id: 1001, phone: '+77001234567' }, { id: '00000000-0000-4000-8000-00000000000b', student_code: 'CE-00453', name: 'Aru Sadykova', status: 'active', amocrm_customer_id: 1002, phone: '+77001234567' }] } },
            } } },
          },
          '400': { description: 'Bad student_code / phone / amocrm_customer_id (field names it)' },
          '401': { description: 'Unauthorized' },
        },
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
    '/?action=roster': {
      get: {
        summary: 'Weekly roster snapshot ordered by id: student_id, student_code, full_name, status, branch_id, branch_name, trainer_id, trainer_name, stage_id (current_level), stage_name ("Ступень N"), current_rank (never null — "none"), student_created_at (record creation, NOT training start). Read-only.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ROSTER_STATUSES, default: 'active' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: EXPORT_MAX_LIMIT, default: EXPORT_MAX_LIMIT } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'after_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Keyset cursor (next_after_id of the previous page); not combinable with offset' },
        ],
        responses: { '200': { description: '{ok, as_of, status, total, limit, offset, after_id, next_after_id, students[]} — total is the exact count for the status filter; next_after_id is null on the last page' }, '400': { description: 'Bad status / limit / offset / after_id (field names it)' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=rank_history': {
      get: {
        summary: 'Append-only rank (razryad) change log ordered by changed_at, id: rank_change_id, student_id, student_code, previous_rank, new_rank, changed_at, changed_by_id, changed_by_name, source, source_derived, trainer_id_at_change, trainer_name_at_change, trainer_attribution. History starts 2026-05-18; downgrades/corrections are included. Read-only.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'student_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'student_code', in: 'query', schema: { $ref: '#/components/schemas/StudentCode' } },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'Inclusive lower bound: ISO date (00:00 UTC) or date-time with offset' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'Exclusive upper bound, same format; must be after from' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: EXPORT_MAX_LIMIT, default: EXPORT_MAX_LIMIT } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: { '200': { description: '{ok, as_of, student_id, from, to, total, limit, offset, rank_changes[]}' }, '400': { description: 'Bad student_id / student_code / from / to / limit / offset, or student_id_code_mismatch' }, '404': { description: 'Unknown student_code' }, '401': { description: 'Unauthorized' } },
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
    if (method === 'GET' && action === 'roster') {
      const r = await getRoster(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && action === 'rank_history') {
      const r = await getRankHistory(ctx, url); status = r.status; return r
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
