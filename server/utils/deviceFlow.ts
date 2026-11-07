// Browser verification (device flow): an agent asks for a connection with the boards and permissions it needs, the
// person approves it in the browser, and the agent polls until it gets the token once. Pure (no database): the
// codes and their digests, the messages, the reading of a start request, the narrowing of a grant, and the poll
// rules. The database side is in deviceFlowDb.ts.
import { createError } from 'h3'
import { createHash, randomBytes, randomInt } from 'crypto'
import { API_KEY_SCOPES } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'
import { createAttemptLimiter } from './pairing'

export const DEVICE_REQUEST_TTL_MS = 10 * 60_000
export const DEVICE_POLL_INTERVAL_SECONDS = 5
// Starting a request is limited per address; polling is limited per request by the interval (slow_down).
export const DEVICE_START_RATE_LIMIT = { max: 10, windowMs: 10 * 60_000 }
export const deviceStartAttempts = createAttemptLimiter(DEVICE_START_RATE_LIMIT.max, DEVICE_START_RATE_LIMIT.windowMs)

// No look-alikes: no 0 or O, no 1, I or L.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const USER_CODE_LENGTH = 8
const MAX_CLIENT_NAME = 60
const MAX_BOARDS = 50

const AGENT_LINE = 'If you are an agent or subagent, pass this along to your main agent so they can ask the user for a new connection. Do not retry with this device code.'

export type DeviceRefusalCode = 'device_expired' | 'device_denied' | 'device_consumed'

/** The plain text an agent reads first when a request is refused. Unknown device codes get no text at all. */
export const DEVICE_REFUSAL_MESSAGES: Record<DeviceRefusalCode, string> = {
  device_expired: `This connection request has expired. Connection requests last 10 minutes. Please start a new one and ask the user to approve it in the browser. ${AGENT_LINE}`,
  device_denied: `The user denied this connection request in the browser. Please tell the user, and do not start it again unless the user asks you to. ${AGENT_LINE}`,
  device_consumed: `The token of this connection request has already been handed over, once. Please start a new connection request. ${AGENT_LINE}`
}

/** A new device code: the secret the agent polls with. Shown once, stored only as a digest. */
export function generateDeviceCode(): string {
  return randomBytes(32).toString('base64url')
}

/** A new user code, shaped XXXX-XXXX, typed or pasted on the approve page. Stored only as a digest. */
export function generateUserCode(): string {
  let body = ''
  for (let i = 0; i < USER_CODE_LENGTH; i++) body += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]
  return `${body.slice(0, 4)}-${body.slice(4)}`
}

/** The digest a device code is stored under. Null when the text cannot be a device code at all. */
export function deviceCodeDigest(input: unknown): string | null {
  if (typeof input !== 'string' || input.length < 20 || input.length > 200) return null
  return createHash('sha256').update(input).digest('hex')
}

/**
 * The digest a user code is stored under. Case, spaces and hyphens are ignored, so a code pasted with a stray
 * space still works. Null when the text cannot be a user code at all.
 */
export function userCodeDigest(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const body = input.trim().toUpperCase().replace(/[\s-]/g, '')
  if (body.length !== USER_CODE_LENGTH) return null
  for (const char of body) {
    if (!USER_CODE_ALPHABET.includes(char)) return null
  }
  return createHash('sha256').update(body).digest('hex')
}

export interface RequestedBoard {
  boardId: string
  scopes: ApiKeyScope[]
}

export interface StartRequest {
  clientName: string
  requested: RequestedBoard[]
}

/**
 * Reads the start call of an agent: the name of the client that asks, and the boards with the permissions it asks
 * for on each. Refuses what a token could never carry. Whether the boards are the person's is checked on approval.
 */
export function readStartRequest(raw: unknown): StartRequest {
  const body = (raw && typeof raw === 'object' ? raw : {}) as { client_name?: unknown, boards?: unknown }
  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  if (!clientName) throw createError({ statusCode: 400, message: 'Give the client a name, for example "Claude Code on my laptop"' })
  if (clientName.length > MAX_CLIENT_NAME) {
    throw createError({ statusCode: 400, message: `Client names are limited to ${MAX_CLIENT_NAME} characters` })
  }
  if (!Array.isArray(body.boards) || !body.boards.length) {
    throw createError({ statusCode: 400, message: 'Ask for at least one board, with the permissions you need on it' })
  }
  if (body.boards.length > MAX_BOARDS) throw createError({ statusCode: 400, message: `Ask for at most ${MAX_BOARDS} boards` })
  return { clientName, requested: readRequestedBoards(body.boards) }
}

/** The boards and permissions an agent asks for: each board once, with at least one known permission. */
export function readRequestedBoards(raw: unknown): RequestedBoard[] {
  if (!Array.isArray(raw)) throw createError({ statusCode: 400, message: 'The boards must be a list' })
  const seen = new Set<string>()
  return raw.map((item) => {
    const entry = (item && typeof item === 'object' ? item : {}) as { boardId?: unknown, scopes?: unknown }
    if (typeof entry.boardId !== 'string' || !entry.boardId) {
      throw createError({ statusCode: 400, message: 'Each board must have its boardId' })
    }
    if (seen.has(entry.boardId)) throw createError({ statusCode: 400, message: 'A board is listed twice' })
    seen.add(entry.boardId)
    const scopes = Array.isArray(entry.scopes) ? [...new Set(entry.scopes)] : []
    if (!scopes.length) throw createError({ statusCode: 400, message: 'Ask for at least one permission on each board' })
    if (scopes.some(scope => !(API_KEY_SCOPES as readonly unknown[]).includes(scope))) {
      throw createError({ statusCode: 400, message: 'One of the permissions is not known' })
    }
    return { boardId: entry.boardId, scopes: API_KEY_SCOPES.filter(scope => scopes.includes(scope)) }
  })
}

/**
 * The grant the person chose on the approve page. The person may only narrow what was asked: a board that was not
 * asked for, or a permission on a board that was not asked for it, is refused. Each board keeps at least one
 * permission, and a board left out is dropped.
 */
export function narrowGrant(requested: RequestedBoard[], chosen: unknown): RequestedBoard[] {
  if (!Array.isArray(chosen) || !chosen.length) {
    throw createError({ statusCode: 400, message: 'Keep at least one board and one permission, or deny the request' })
  }
  const asked = new Map(requested.map(board => [board.boardId, board.scopes]))
  return readRequestedBoards(chosen).map((board) => {
    const allowed = asked.get(board.boardId)
    if (!allowed) throw createError({ statusCode: 400, message: 'The request did not ask for one of the boards you picked' })
    if (board.scopes.some(scope => !allowed.includes(scope))) {
      throw createError({ statusCode: 400, message: 'The request did not ask for one of the permissions you picked' })
    }
    return board
  })
}

/** Whether a request has run past its expiry at `now`. */
export function isDeviceRequestExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now
}

/** Whether a poll came too soon after the last one: the agent is told to slow down. */
export function isPollTooSoon(lastPolledAt: number | null, now: number): boolean {
  return lastPolledAt !== null && now - lastPolledAt < DEVICE_POLL_INTERVAL_SECONDS * 1000
}

/** A 401 for a request that was denied, used or has expired, with its stable code and the sentence for the user. */
export function deviceRefusal(code: DeviceRefusalCode) {
  return createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    message: DEVICE_REFUSAL_MESSAGES[code],
    data: { code }
  })
}

/** The plain 401 for a device code that was never issued. It says nothing about which requests exist. */
export function unknownDeviceCode() {
  return createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid device code' })
}

/** Polled too soon: the agent waits the interval (and a little more) before it polls again. Not a refusal. */
export function slowDown() {
  return createError({
    statusCode: 429,
    statusMessage: 'Too Many Requests',
    message: `Poll less often: wait at least ${DEVICE_POLL_INTERVAL_SECONDS} seconds between polls, then try again.`,
    data: { code: 'slow_down', interval: DEVICE_POLL_INTERVAL_SECONDS + 5 }
  })
}
