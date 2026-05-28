// Public Tournament Registration API.
//
// Single Deno edge function that routes on URL path + method. Used by external
// clients (Telegram bot, WhatsApp bot, "online students" site) and the public
// tournaments page. The "list" routes are open; the write routes (register +
// delete) require an x-api-key header.
//
// Mirror of the analytics-tournaments style (Deno serve + CORS + JSON helper).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-source',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

const API_KEY = Deno.env.get('CHESS_EMPIRE_API_KEY') ?? 'ce-api-2026-k8x9m2p4q7w1'
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

const REASONS = [
  'unauthorized', 'not_found', 'closed', 'full',
  'duplicate', 'invalid_input', 'server_error',
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
  return req.headers.get('x-api-key') === API_KEY
}

// Pull the source label from the inbound header. Anything outside the enum
// falls back to 'web' so a misconfigured bot doesn't blow up registration.
const SOURCES = new Set(['web', 'telegram', 'whatsapp', 'online', 'admin'])
function readSource(req: Request): string {
  const h = (req.headers.get('x-source') || '').toLowerCase()
  return SOURCES.has(h) ? h : 'web'
}

// Strip the `/tournaments-api` (or `/functions/v1/tournaments-api`) prefix from
// the incoming URL so the rest of the routing can match on the bare sub-path.
export function extractSubPath(pathname: string): string {
  const idx = pathname.indexOf('/tournaments-api')
  if (idx < 0) return pathname
  let sub = pathname.slice(idx + '/tournaments-api'.length)
  if (sub.length > 1 && sub.endsWith('/')) sub = sub.slice(0, -1)
  return sub || '/'
}

// Minimal path matcher: returns the params map if `pattern` (e.g. "/foo/:id")
// matches `path`, else null.
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean)
  const ap = path.split('/').filter(Boolean)
  if (pp.length !== ap.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      params[pp[i].slice(1)] = decodeURIComponent(ap[i])
    } else if (pp[i] !== ap[i]) {
      return null
    }
  }
  return params
}

// ─── OpenAPI ──────────────────────────────────────────────────────────────
// Hand-written spec — kept inline so the /openapi.json route is a single
// O(1) lookup and so the contract is reviewable in this one file.
const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Chess Empire — Tournaments API',
    version: '1.0.0',
    description: 'Public registration API for Chess Empire tournaments. Read endpoints are open; write endpoints require an x-api-key header.',
  },
  servers: [
    { url: 'https://app.chessempire.kz/api/tournaments-api', description: 'Production (Vercel proxy)' },
    { url: 'https://papgcizhfkngubwofjuo.supabase.co/functions/v1/tournaments-api', description: 'Supabase edge function direct' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
    schemas: {
      Reason: { type: 'string', enum: [...REASONS] },
      Error: {
        type: 'object',
        required: ['ok', 'reason'],
        properties: { ok: { type: 'boolean', enum: [false] }, reason: { $ref: '#/components/schemas/Reason' } },
      },
      Branch: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
        },
      },
      Tournament: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          branch_id: { type: 'string', format: 'uuid', nullable: true },
          branch: { $ref: '#/components/schemas/Branch' },
          name: { type: 'string' },
          info: { type: 'string', nullable: true },
          tournament_date: { type: 'string', format: 'date' },
          start_time: { type: 'string', nullable: true },
          time_format: { type: 'string', nullable: true },
          registration_fee: { type: 'number' },
          rounds: { type: 'integer' },
          capacity: { type: 'integer' },
          status: { type: 'string', enum: ['open', 'closed', 'cancelled'] },
          registered_count: { type: 'integer' },
        },
      },
      Registration: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          source: { type: 'string', enum: ['web', 'telegram', 'whatsapp', 'online', 'admin'] },
          registered_at: { type: 'string', format: 'date-time' },
          display_name: { type: 'string' },
        },
      },
      StudentSearchHit: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          branch: { type: 'string', nullable: true },
          current_rating: { type: 'integer', nullable: true },
        },
      },
      RegisterRequest: {
        type: 'object',
        properties: {
          student_id: { type: 'string', format: 'uuid' },
          player_name: { type: 'string' },
          external_contact: { type: 'string' },
        },
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', enum: [true] },
          registration_id: { type: 'string', format: 'uuid' },
          registered_count: { type: 'integer' },
          capacity: { type: 'integer' },
          status: { type: 'string', enum: ['open', 'closed', 'cancelled'] },
          tournament: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              date: { type: 'string', format: 'date' },
              start_time: { type: 'string', nullable: true },
              time_format: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },
  paths: {
    '/branches': {
      get: {
        summary: 'List public branches',
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: {
              type: 'object',
              properties: { ok: { type: 'boolean' }, branches: { type: 'array', items: { $ref: '#/components/schemas/Branch' } } },
            } } },
          },
        },
      },
    },
    '/tournaments': {
      get: {
        summary: 'List tournaments',
        parameters: [
          { name: 'branch_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'upcoming',  in: 'query', schema: { type: 'boolean', default: true } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, tournaments: { type: 'array', items: { $ref: '#/components/schemas/Tournament' } } },
          } } } },
        },
      },
    },
    '/tournaments/{id}': {
      get: {
        summary: 'Get one tournament',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tournament' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/tournaments/{id}/registrations': {
      get: {
        summary: 'Get the roster for a tournament (external_contact is never returned)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, registrations: { type: 'array', items: { $ref: '#/components/schemas/Registration' } } },
          } } } },
        },
      },
    },
    '/tournaments/{id}/register': {
      post: {
        summary: 'Register a player. Exactly one of student_id / player_name.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: {
          '200': { description: 'Registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } } } },
          '400': { description: 'Bad request',  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Conflict',     content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/registrations/{registration_id}': {
      delete: {
        summary: 'Cancel a registration. If the tournament was full, it re-opens.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: 'registration_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Deleted',      content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found',    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/students/search': {
      get: {
        summary: 'Autocomplete search across active+frozen students',
        parameters: [
          { name: 'q',     in: 'query', required: true, schema: { type: 'string', minLength: 2 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 8, maximum: 20 } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, students: { type: 'array', items: { $ref: '#/components/schemas/StudentSearchHit' } } },
          } } } },
        },
      },
    },
    '/openapi.json': {
      get: { summary: 'This document', responses: { '200': { description: 'OpenAPI spec' } } },
    },
  },
}

// ─── Route handlers ───────────────────────────────────────────────────────

// The supabase-js v2 types are strict about the `Database` generic, which we
// don't generate here. Cast to `any` for the route handlers — same pattern as
// the analytics-* functions, which dispatch on action and never carry typed
// row shapes through their pipeline.
interface Ctx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  req: Request
}

async function getBranches(ctx: Ctx): Promise<Response> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id, name, location')
    .not('name', 'ilike', '%НИШ%')
    .not('name', 'ilike', '%zhandosova%')
    .order('name', { ascending: true })
  if (error) throw error
  // The schema column is `location`; the public API surface calls this
  // `address` so a bot dev never has to learn the legacy column name.
  const branches = (data || []).map((b: any) => ({ id: b.id, name: b.name, address: b.location || null }))
  return ok({ branches })
}

async function listTournaments(ctx: Ctx, url: URL): Promise<Response> {
  const branchId = url.searchParams.get('branch_id')
  const upcomingParam = url.searchParams.get('upcoming')
  const upcoming = upcomingParam === null ? true : upcomingParam === 'true'

  let q = ctx.supabase
    .from('tournaments')
    .select('id, branch_id, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status, branch:branches(id, name)')
    .order('tournament_date', { ascending: true })
  if (branchId) q = q.eq('branch_id', branchId)
  if (upcoming) q = q.gte('tournament_date', new Date().toISOString().slice(0, 10))

  const { data, error } = await q
  if (error) throw error
  const rows = data || []

  // Pull all registration counts in one query so we don't N+1 the dashboard.
  const ids = rows.map((t: any) => t.id)
  const countsById = new Map<string, number>()
  if (ids.length > 0) {
    const { data: regs, error: rErr } = await ctx.supabase
      .from('tournament_registrations')
      .select('tournament_id')
      .in('tournament_id', ids)
    if (rErr) throw rErr
    for (const r of regs || []) {
      const id = (r as any).tournament_id
      countsById.set(id, (countsById.get(id) || 0) + 1)
    }
  }

  const tournaments = rows.map((t: any) => ({
    id: t.id,
    branch_id: t.branch_id,
    branch: t.branch || null,
    name: t.name,
    info: t.info,
    tournament_date: t.tournament_date,
    start_time: t.start_time,
    time_format: t.time_format,
    registration_fee: t.registration_fee,
    rounds: t.rounds,
    capacity: t.capacity,
    status: t.status,
    registered_count: countsById.get(t.id) || 0,
  }))

  return ok({ tournaments })
}

async function getTournament(ctx: Ctx, id: string): Promise<Response> {
  if (!isUuid(id)) return err('invalid_input', 400)

  const { data: t, error } = await ctx.supabase
    .from('tournaments')
    .select('id, branch_id, name, info, tournament_date, start_time, time_format, registration_fee, rounds, capacity, status, branch:branches(id, name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!t) return err('not_found', 404)

  const { count, error: cErr } = await ctx.supabase
    .from('tournament_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', id)
  if (cErr) throw cErr

  return ok({
    tournament: {
      ...(t as Record<string, unknown>),
      registered_count: count || 0,
    },
  })
}

async function getRegistrations(ctx: Ctx, id: string): Promise<Response> {
  if (!isUuid(id)) return err('invalid_input', 400)

  // SELECT only public fields — external_contact is deliberately omitted.
  const { data, error } = await ctx.supabase
    .from('tournament_registrations')
    .select('id, source, registered_at, player_name, student:students(first_name, last_name)')
    .eq('tournament_id', id)
    .order('registered_at', { ascending: true })
  if (error) throw error

  const registrations = (data || []).map((r: any) => {
    const s = r.student
    const displayName = s
      ? `${s.first_name || ''} ${s.last_name || ''}`.trim()
      : (r.player_name || '')
    return {
      id: r.id,
      source: r.source,
      registered_at: r.registered_at,
      display_name: displayName,
    }
  })

  return ok({ registrations })
}

async function searchStudents(ctx: Ctx, url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') || '').trim()
  if (q.length < 2) return err('invalid_input', 400)

  const rawLimit = parseInt(url.searchParams.get('limit') || '8', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 8, 1), 20)

  // Use a single OR ILIKE across first_name + last_name. Status filter keeps
  // "left" students out — they shouldn't autocomplete for a future tournament.
  // ilike's pattern needs the literal `%` wrapping.
  const escaped = q.replace(/[%_]/g, m => `\\${m}`)
  const pattern = `%${escaped}%`

  const { data, error } = await ctx.supabase
    .from('students')
    .select('id, first_name, last_name, branch:branches(name), student_current_ratings(rating)')
    .in('status', ['active', 'frozen'])
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .order('last_name', { ascending: true })
    .limit(limit)
  if (error) throw error

  const students = (data || []).map((s: any) => {
    const ratingRow = Array.isArray(s.student_current_ratings) ? s.student_current_ratings[0] : null
    return {
      id: s.id,
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      branch: s.branch ? s.branch.name : null,
      current_rating: ratingRow && Number.isFinite(Number(ratingRow.rating)) ? Number(ratingRow.rating) : null,
    }
  })

  return ok({ students })
}

async function registerPlayer(ctx: Ctx, tournamentId: string): Promise<Response> {
  if (!authorized(ctx.req)) return err('unauthorized', 401)
  if (!isUuid(tournamentId)) return err('invalid_input', 400)

  let body: Record<string, unknown> = {}
  try {
    const text = await ctx.req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return err('invalid_input', 400)
  }

  const studentId = typeof body.student_id === 'string' ? body.student_id : null
  const playerName = typeof body.player_name === 'string' ? body.player_name.trim() : null
  const externalContact = typeof body.external_contact === 'string' ? body.external_contact : null

  // EXACTLY ONE of student_id / player_name. Both missing OR both set are rejected.
  const hasStudent = !!studentId && studentId.length > 0
  const hasName = !!playerName && playerName.length > 0
  if (hasStudent === hasName) return err('invalid_input', 400)
  if (hasStudent && !isUuid(studentId)) return err('invalid_input', 400)

  const source = readSource(ctx.req)

  const { data, error } = await ctx.supabase.rpc('register_for_tournament', {
    p_tournament_id: tournamentId,
    p_student_id: hasStudent ? studentId : null,
    p_player_name: hasName ? playerName : null,
    p_source: source,
    p_external_contact: externalContact,
  })
  if (error) throw error

  // Pass through the RPC envelope. Map known failure reasons to HTTP statuses.
  const result = (data || {}) as Record<string, unknown>
  if (result.ok) return json(result, 200)
  const reason = String(result.reason || 'server_error') as Reason
  const status =
    reason === 'not_found'      ? 404 :
    reason === 'duplicate'      ? 409 :
    reason === 'full'           ? 409 :
    reason === 'closed'         ? 409 :
    reason === 'invalid_input'  ? 400 : 500
  return json(result, status)
}

async function deleteRegistration(ctx: Ctx, registrationId: string): Promise<Response> {
  if (!authorized(ctx.req)) return err('unauthorized', 401)
  if (!isUuid(registrationId)) return err('invalid_input', 400)

  // Fetch the row first so we know which tournament to re-evaluate.
  const { data: existing, error: fErr } = await ctx.supabase
    .from('tournament_registrations')
    .select('id, tournament_id')
    .eq('id', registrationId)
    .maybeSingle()
  if (fErr) throw fErr
  if (!existing) return err('not_found', 404)

  const tournamentId = (existing as any).tournament_id

  const { error: dErr } = await ctx.supabase
    .from('tournament_registrations')
    .delete()
    .eq('id', registrationId)
  if (dErr) throw dErr

  // If we just freed a seat in a previously-full tournament, flip it back to
  // open. The 043 RPC closes a tournament on the last registration; without
  // this back-flip, cancellations would leave the tournament permanently closed.
  const { data: t, error: tErr } = await ctx.supabase
    .from('tournaments')
    .select('id, capacity, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (tErr) throw tErr

  if (t && (t as any).status === 'closed') {
    const { count, error: cErr } = await ctx.supabase
      .from('tournament_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (cErr) throw cErr
    if ((count || 0) < (t as any).capacity) {
      const { error: uErr } = await ctx.supabase
        .from('tournaments')
        .update({ status: 'open' })
        .eq('id', tournamentId)
      if (uErr) throw uErr
    }
  }

  return ok()
}

// ─── Entry point ──────────────────────────────────────────────────────────

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = extractSubPath(url.pathname)
  const method = req.method.toUpperCase()
  let status = 500

  try {
    if (method === 'GET' && path === '/openapi.json') {
      const r = json(OPENAPI_SPEC, 200); status = r.status; return r
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const ctx: Ctx = { supabase, req }

    let m: Record<string, string> | null = null

    if (method === 'GET' && path === '/branches') {
      const r = await getBranches(ctx); status = r.status; return r
    }
    if (method === 'GET' && path === '/tournaments') {
      const r = await listTournaments(ctx, url); status = r.status; return r
    }
    if (method === 'GET' && (m = matchPath('/tournaments/:id', path))) {
      const r = await getTournament(ctx, m.id); status = r.status; return r
    }
    if (method === 'GET' && (m = matchPath('/tournaments/:id/registrations', path))) {
      const r = await getRegistrations(ctx, m.id); status = r.status; return r
    }
    if (method === 'POST' && (m = matchPath('/tournaments/:id/register', path))) {
      const r = await registerPlayer(ctx, m.id); status = r.status; return r
    }
    if (method === 'DELETE' && (m = matchPath('/registrations/:registration_id', path))) {
      const r = await deleteRegistration(ctx, m.registration_id); status = r.status; return r
    }
    if (method === 'GET' && path === '/students/search') {
      const r = await searchStudents(ctx, url); status = r.status; return r
    }

    const r = err('not_found', 404); status = r.status; return r
  } catch (e) {
    const payload =
      e instanceof Error ? { message: e.message, name: e.name } :
      (e && typeof e === 'object') ? { message: (e as any).message, code: (e as any).code, details: (e as any).details } :
      { message: String(e) }
    console.error('tournaments-api error', payload)
    const r = err('server_error', 500)
    status = r.status
    return r
  } finally {
    console.log(`${method} ${path} ${status}`)
  }
}

serve(handle)
