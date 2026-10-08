// Students write API — for external integrations (e.g. AmoCRM sync).
//
// Unlike the read-only analytics-* functions, this one WRITES: create a
// student, freeze / activate (unfreeze) a student, find by phone, list
// branches. Every write requires an `x-api-key` header checked against the
// CHESS_EMPIRE_WRITE_KEY env var (a NEW key, distinct from the tournament-only
// CHESS_EMPIRE_API_KEY — the two surfaces never share a key).
//
// Routing is on a `?action=` query param (create / freeze / activate / find /
// branches); GET with no action returns the OpenAPI self-doc. Modelled on
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  normalizePhone,
  phoneDigits,
  splitFullName,
  isManualChangeRecent,
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
  'ambiguous', 'manual_change_recent', 'server_error',
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

function isUuid(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function authorized(req: Request): boolean {
  return WRITE_KEYS.length > 0 && WRITE_KEYS.includes(req.headers.get('x-api-key') ?? '')
}

// parent_phone is the ONLY phone-like column on students (verified against the
// schema — there is no bare `phone` column); dedup/find match on it.
const STUDENT_SELECT = 'id, first_name, last_name, status, branch_id, amocrm_customer_id, parent_phone, branch:branches(name)'

// Normalize both the direct-select row shape (branch:{name}) and the RPC row
// shape (branch_name) into one public student object.
// deno-lint-ignore no-explicit-any
function shape(row: any) {
  const branch = row.branch_name !== undefined
    ? row.branch_name
    : (row.branch ? row.branch.name : null)
  return {
    id: row.id,
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

// Resolve a single student from { student_id } | { amocrm_customer_id } |
// { phone }. Returns { student } (null = none), { multiple:true } when a
// non-id lookup is ambiguous, or { error } for a malformed selector.
async function resolveStudent(
  ctx: Ctx,
  body: Record<string, unknown>,
): Promise<{ student?: ReturnType<typeof shape> | null; multiple?: boolean; error?: Reason }> {
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
  if (r.error) return err(r.error, 400)
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

async function findStudents(ctx: Ctx, url: URL): Promise<Response> {
  const norm = normalizePhone(url.searchParams.get('phone') || '')
  if (!norm) return err('invalid_input', 400, { field: 'phone' })
  const { data, error } = await ctx.supabase
    .rpc('find_students_by_phone_digits', { p_digits: phoneDigits(norm) })
  if (error) throw error
  return ok({ phone: norm, students: (data || []).map(shape) })
}

async function listBranches(ctx: Ctx): Promise<Response> {
  const { data, error } = await ctx.supabase
    .from('branches').select('id, name').order('name', { ascending: true })
  if (error) throw error
  return ok({ branches: (data || []).map((b: any) => ({ id: b.id, name: b.name })) })
}

// ─── OpenAPI ──────────────────────────────────────────────────────────────
const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Chess Empire — Students (write) API',
    version: '1.0.0',
    description: 'Write API for external integrations (e.g. AmoCRM): create / freeze / activate students, find by phone, list branches. All actions require an x-api-key header (CHESS_EMPIRE_WRITE_KEY).',
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
      Student: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
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
          properties: { student_id: { type: 'string', format: 'uuid' }, phone: { type: 'string' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous' } },
      },
    },
    '/?action=activate': {
      post: {
        summary: 'Activate (unfreeze) a student. Refused (409) if a manual change is < 3 days old.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: { student_id: { type: 'string', format: 'uuid' }, phone: { type: 'string' }, amocrm_customer_id: { type: 'integer' } },
        } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'manual_change_recent / ambiguous' } },
      },
    },
    '/?action=find': {
      get: {
        summary: 'Find students by normalized phone',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'phone', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '400': { description: 'Bad phone' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/?action=branches': {
      get: {
        summary: 'List all branches (id + name) for integration branch mapping',
        security: [{ ApiKeyAuth: [] }],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
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
    if (method === 'GET' && action === 'find') {
      const r = await findStudents(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && action === 'branches') {
      const r = await listBranches(ctx); status = r.status; return r
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
