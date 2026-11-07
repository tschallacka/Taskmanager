// Configurable rate limits on agent calls: "at most `max` of these in each window of `windowSeconds`".
// Three kinds: tasks created (per key, on the MCP create_task tool), pairing code exchanges (per client address, on
// /api/pair) and crews or management tokens made (per user). The instance sets the defaults; a team or a board may
// add its own limit, and every limit that applies must hold, so a lower level can only tighten. The counts live in
// the database (rate_limit_hits), so they hold across processes and restarts.
import { eq, lt, sql } from 'drizzle-orm'
import { createError, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { db } from '../db'
import { instanceSettings, projects, RATE_LIMIT_KINDS, rateLimitHits, teamSettings } from '../db/schema'
import type { RateLimitKind, RateLimitSettings } from '../db/schema'
import { clientAddress, isLoopback, peerOf } from './crewGatePolicy'
import { genId } from './projects'

export interface RateLimit {
  max: number
  windowSeconds: number
  // Which level set it. Each level counts its own calls, so two limits of one window size never share a count.
  level?: 'instance' | 'team' | 'board'
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitKind, RateLimit> = {
  tasks: { max: 600, windowSeconds: 3600 },
  pairing: { max: 10, windowSeconds: 600 },
  crews: { max: 20, windowSeconds: 86400 }
}

const WHAT: Record<RateLimitKind, string> = {
  tasks: 'tasks created',
  pairing: 'pairing code exchanges',
  crews: 'crews or management tokens made'
}

const MAX_LIMIT = 100_000
const MAX_WINDOW_SECONDS = 30 * 86400
// Counts older than this are dropped; the prune runs now and then, not on every call.
const KEEP_MS = 7 * 86400_000
const PRUNE_ONE_IN = 200

export class RateLimitError extends Error {}

/** Reads a limits request: each kind is `{ max, windowSeconds }`, or null to go back to the default. Unknown kinds are refused. */
export function readRateLimits(body: unknown): RateLimitSettings {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Send the limits as an object.' })
  }
  const out: RateLimitSettings = {}
  for (const [kind, value] of Object.entries(body as Record<string, unknown>)) {
    if (!(RATE_LIMIT_KINDS as readonly string[]).includes(kind)) {
      throw createError({ statusCode: 400, message: `Unknown limit "${kind}". Use ${RATE_LIMIT_KINDS.join(', ')}.` })
    }
    if (value === null) continue
    const limit = value as { max?: unknown, windowSeconds?: unknown }
    const max = Number(limit?.max)
    const windowSeconds = Number(limit?.windowSeconds)
    if (!Number.isInteger(max) || max < 1 || max > MAX_LIMIT) {
      throw createError({ statusCode: 400, message: `${kind}: max must be a whole number from 1 to ${MAX_LIMIT}.` })
    }
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > MAX_WINDOW_SECONDS) {
      throw createError({ statusCode: 400, message: `${kind}: the window must be a whole number of seconds from 1 to ${MAX_WINDOW_SECONDS}.` })
    }
    out[kind as RateLimitKind] = { max, windowSeconds }
  }
  return out
}

/** Reads the limits a level has set, or null when it has set none. */
async function setLimitsOf(level: 'instance' | 'team' | 'board', id: string): Promise<RateLimitSettings | null> {
  if (level === 'instance') {
    const [row] = await db.select({ rateLimits: instanceSettings.rateLimits }).from(instanceSettings).where(eq(instanceSettings.id, 'instance'))
    return row?.rateLimits ?? null
  }
  if (level === 'team') {
    const [row] = await db.select({ rateLimits: teamSettings.rateLimits }).from(teamSettings).where(eq(teamSettings.teamId, id))
    return row?.rateLimits ?? null
  }
  const [row] = await db.select({ rateLimits: projects.rateLimits }).from(projects).where(eq(projects.id, id))
  return row?.rateLimits ?? null
}

/** The limits that apply to one kind: the instance's (or the default), then the team's and the board's when they set one. */
export async function limitsFor(kind: RateLimitKind, scope: { teamId?: string | null, boardId?: string | null } = {}): Promise<RateLimit[]> {
  const instance = await setLimitsOf('instance', 'instance')
  const limits: RateLimit[] = [{ ...(instance?.[kind] ?? DEFAULT_RATE_LIMITS[kind]), level: 'instance' }]
  if (scope.teamId) {
    const team = (await setLimitsOf('team', scope.teamId))?.[kind]
    if (team) limits.push({ ...team, level: 'team' })
  }
  if (scope.boardId) {
    const board = (await setLimitsOf('board', scope.boardId))?.[kind]
    if (board) limits.push({ ...board, level: 'board' })
  }
  return limits
}

/** The team and board a board id belongs to, for the limits that apply to it. Empty when there is no board. */
export async function scopeOfBoard(boardId: string | null | undefined): Promise<{ teamId?: string | null, boardId?: string | null }> {
  if (!boardId) return {}
  const [board] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, boardId))
  return { teamId: board?.teamId ?? null, boardId }
}

/** "10 minutes", "1 hour", "1 day": how a window reads to a person. */
export function describeWindow(seconds: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (seconds % 86400 === 0) return plural(seconds / 86400, 'day')
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'hour')
  if (seconds % 60 === 0) return plural(seconds / 60, 'minute')
  return plural(seconds, 'second')
}

/** The sentence a person or an agent reads when a limit is reached. */
export function refusalSentence(kind: RateLimitKind, limit: RateLimit, retryAfter: number): string {
  return `Rate limit reached: at most ${limit.max} ${WHAT[kind]} per ${describeWindow(limit.windowSeconds)}. Try again in ${retryAfter} seconds. If you are an agent or subagent, tell your main agent; do not retry in a loop.`
}

/**
 * Counts one use of `kind` for `subject` against every limit that applies, and refuses (429, with the wait) when one
 * of them is reached. With an event the wait is also the Retry-After header. Each limit counts in its own window.
 */
export async function chargeRateLimit(
  kind: RateLimitKind,
  subject: string,
  limits: RateLimit[],
  event?: H3Event
): Promise<void> {
  const now = Date.now()
  for (const limit of limits) {
    const windowMs = limit.windowSeconds * 1000
    const windowStart = Math.floor(now / windowMs) * windowMs
    const [row] = await db.insert(rateLimitHits)
      .values({ id: genId(), scope: `${kind}|${subject}|${limit.level ?? 'own'}|${limit.windowSeconds}`, windowStart, hits: 1 })
      .onConflictDoUpdate({
        target: [rateLimitHits.scope, rateLimitHits.windowStart],
        set: { hits: sql`${rateLimitHits.hits} + 1` }
      })
      .returning({ hits: rateLimitHits.hits })
    if (Math.random() * PRUNE_ONE_IN < 1) {
      void db.delete(rateLimitHits).where(lt(rateLimitHits.windowStart, now - KEEP_MS)).catch(() => undefined)
    }
    if ((row?.hits ?? 0) > limit.max) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
      if (event) setResponseHeader(event, 'Retry-After', retryAfter)
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests',
        message: refusalSentence(kind, limit, retryAfter),
        data: { code: 'rate_limited', retryAfter }
      })
    }
  }
}

/** Whether an error is a rate-limit refusal from chargeRateLimit. */
export function isRateLimited(error: unknown): boolean {
  return (error as { data?: { code?: string } })?.data?.code === 'rate_limited'
}

/**
 * The address a request counts under. The address nginx passed on (X-Real-IP) counts only when the request really
 * comes from the proxy on this machine (a loopback peer); otherwise the peer address does, so a client cannot choose
 * its own address by sending a header.
 */
export function requestAddress(event: H3Event): string {
  const peer = peerOf(event)
  if (peer.kind !== 'tcp') return 'unknown'
  if (isLoopback(peer.address)) {
    const forwarded = clientAddress(event.headers)
    if (forwarded) return forwarded
  }
  return peer.address
}
