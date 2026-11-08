import type { H3Event } from 'h3'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, apiKeyBoards, apiKeyBoardScopes, apiKeySecrets, apiKeyWorkspaces, API_KEY_SCOPES, crews, member, user } from '../db/schema'
import { boardScopesOf, isTokenExpired, tokenRefusal } from './connectTokenRules'
import { crewRefusal } from './crewPermission'
import type { ApiKey, ApiKeyScope } from '../db/schema'
import { isTeamMember } from './auth-helpers'

// Keys are recognisable on sight so they can be spotted in configs and logs.
export const API_KEY_PREFIX = 'arn_'
const SECRET_BYTES = 32
// Enough of the key to tell two of them apart in the settings list.
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 6

export interface GeneratedApiKey {
  /** The full key. Returned to the creator once and never stored. */
  token: string
  hash: string
  displayPrefix: string
}

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateApiKey(): GeneratedApiKey {
  const token = API_KEY_PREFIX + randomBytes(SECRET_BYTES).toString('base64url')
  return {
    token,
    hash: hashApiKey(token),
    displayPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH)
  }
}

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value)
}

/** What a key reaches. Each grant is intersected with what the owner can open at the time of the call. */
export interface KeyReach {
  /** Select all: every board the owner can open, now and later. */
  allBoards: boolean
  /** Whole workspaces, now and later. NULL is the owner's personal workspace. */
  workspaceTeamIds: (string | null)[]
  /** Single boards the owner ticked. */
  boardIds: string[]
}

export interface ApiKeyContext {
  keyId: string
  /** The name the key was given, as the owner sees it in the agent audit. */
  keyName: string
  userId: string
  /** The single workspace this key may touch; null for the owner's personal workspace. */
  teamId: string | null
  /** Set when the key is limited to one customer's boards; its team is then set too. */
  customerId: string | null
  /** Set when the key is limited to one board; its team is then set too. */
  projectId: string | null
  scopes: ApiKeyScope[]
  /** 'management' for the 10-minute crew token of one board; 'access' for every other key. */
  kind?: 'access' | 'management'
  /**
   * Real boards a crew may READ through a crew link, set by the MCP server for a plain read tool only
   * (see crewBoardAccess.ts). Never set on a write call, so those boards do not resolve for it.
   */
  readGrantedBoardIds?: string[]
  /** The permissions the token has on each board, when they were set per board. Null: the token's own scopes apply to every board. */
  boardScopes?: Record<string, ApiKeyScope[]> | null
  /** The permission of the tool being called, set by the MCP dispatch. A token with per-board grants reaches only the boards that grant it. */
  callScope?: ApiKeyScope
  /** What the key reaches, as its owner chose it. Every grant is still cut down to what the owner can open. */
  reach: KeyReach
  /** The workspaces the owner is a member of right now. A grant from another workspace counts for nothing. */
  memberTeamIds: string[]
}

function readBearerToken(event: H3Event): string | null {
  const header = getRequestHeader(event, 'authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

// Only touch the database when the stored value is meaningfully stale, so a busy
// agent does not issue a write per tool call.
const LAST_USED_WRITE_INTERVAL = 60_000

function touchLastUsed(keyId: string, previous: number | null, now: number) {
  if (previous && now - previous < LAST_USED_WRITE_INTERVAL) return
  db.update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, keyId))
    .catch(() => {
      // Usage tracking is best-effort; never fail a request over it.
    })
}

// Sprocket's Claude Code runs call the MCP endpoint back as the agent the person picked.
// Each run gets its own token, held only in this process's memory and resolved to that
// agent's key, so the audit names the agent and nothing new is stored.
const RUN_TOKEN_TTL = 15 * 60_000
const runTokens = new Map<string, { keyId: string, expiresAt: number }>()

/** A token that acts as the key `keyId` until `revoke` is called or the TTL runs out. */
export function issueRunToken(keyId: string): { token: string, revoke: () => void } {
  const { token, hash } = generateApiKey()
  runTokens.set(hash, { keyId, expiresAt: Date.now() + RUN_TOKEN_TTL })
  return { token, revoke: () => runTokens.delete(hash) }
}

async function findKey(token: string) {
  const hash = hashApiKey(token)
  const run = runTokens.get(hash)
  if (run) {
    if (run.expiresAt <= Date.now()) {
      runTokens.delete(hash)
      return undefined
    }
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, run.keyId))
    return key
  }

  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash))
  if (!key) return undefined
  // The lookup already matched on a digest of the full secret; this compares the
  // digests themselves so the final decision does not depend on string timing.
  const presented = Buffer.from(hash, 'hex')
  const stored = Buffer.from(key.keyHash, 'hex')
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return undefined
  return key
}

/** Refuses a key of a crew account whose crew the permission no longer reaches. A key of any other person passes. */
async function refuseIfCrewOff(userId: string): Promise<void> {
  const [owner] = await db.select({ crewId: user.crewId }).from(user).where(eq(user.id, userId))
  if (!owner?.crewId) return
  const [crew] = await db.select().from(crews).where(eq(crews.id, owner.crewId))
  const refusal = crew ? await crewRefusal(crew) : null
  if (refusal) throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: refusal, data: { code: 'crew_permission' } })
}

/**
 * Resolves the `Authorization: Bearer` key on a request into the workspace and
 * permissions it carries. Throws 401 when the key is missing, unknown, expired,
 * or no longer backed by a membership in the team it was issued for.
 */
export async function authenticateApiKey(event: H3Event): Promise<ApiKeyContext> {
  const token = readBearerToken(event)
  const unauthorized = () => createError({ statusCode: 401, message: 'Invalid or missing API key' })
  if (!token) throw unauthorized()

  const key = await findKey(token)
  if (!key) throw (await refusalForSecret(token)) ?? unauthorized()

  const now = Date.now()
  if (isTokenExpired(key.expiresAt, now)) {
    throw tokenRefusal('token_expired')
  }

  // A key pinned to a team dies with the owner's membership in it.
  if (key.teamId && !(await isTeamMember(key.userId, key.teamId))) {
    throw createError({ statusCode: 403, message: 'API key owner is no longer a member of this team' })
  }

  // A crew's own keys work only while the crew permission still reaches the crew: the three levels, checked on every call.
  await refuseIfCrewOff(key.userId)

  touchLastUsed(key.id, key.lastUsedAt, now)

  return {
    keyId: key.id,
    keyName: key.name,
    userId: key.userId,
    teamId: key.teamId,
    customerId: key.customerId,
    projectId: key.projectId,
    scopes: key.scopes.filter(isApiKeyScope),
    kind: key.kind,
    boardScopes: await loadBoardScopes(key),
    reach: await loadKeyReach(key),
    memberTeamIds: await teamIdsOf(key.userId)
  }
}

// A key made before the reach tables reads the reach its columns always gave it; the startup
// migration then moves it into the tables, and the tables are read from then on.
/**
 * The reach a key's rows give. A key made before the reach tables reads the reach its columns always gave
 * it; the startup migration then moves it into the tables, and the tables are read from then on. Pure: the
 * callers read the two tables, for one key or for a whole list, and pass the rows in.
 */
export function keyReachOf(key: ApiKey, workspaceRows: { teamId: string | null }[], boardRows: { projectId: string }[]): KeyReach {
  if (!key.boardReachSet) {
    return key.projectId
      ? { allBoards: false, workspaceTeamIds: [], boardIds: [key.projectId] }
      : { allBoards: false, workspaceTeamIds: [key.teamId], boardIds: [] }
  }
  return {
    allBoards: key.allBoards,
    workspaceTeamIds: workspaceRows.map(row => row.teamId),
    boardIds: boardRows.map(row => row.projectId)
  }
}

async function loadKeyReach(key: ApiKey): Promise<KeyReach> {
  if (!key.boardReachSet) return keyReachOf(key, [], [])
  const [workspaces, boards] = await Promise.all([
    db.select({ teamId: apiKeyWorkspaces.teamId }).from(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, key.id)),
    db.select({ projectId: apiKeyBoards.projectId }).from(apiKeyBoards).where(eq(apiKeyBoards.keyId, key.id))
  ])
  return keyReachOf(key, workspaces, boards)
}

/**
 * A refusal for a secret that belonged to a token before (regenerated or revoked), or null when the secret
 * was never issued. The caller then answers the plain 401, so nothing reveals which secrets exist.
 */
export async function refusalForSecret(token: string) {
  const [row] = await db.select({ state: apiKeySecrets.state })
    .from(apiKeySecrets)
    .where(eq(apiKeySecrets.keyHash, hashApiKey(token)))
  if (!row) return null
  return tokenRefusal(row.state.startsWith('revoked') ? 'token_revoked' : 'token_regenerated')
}

/** The permissions a key has on each board, or null when none were set per board (its own scopes then apply everywhere). */
async function loadBoardScopes(key: ApiKey): Promise<Record<string, ApiKeyScope[]> | null> {
  if (!key.boardScopesSet) return null
  const rows = await db.select({ projectId: apiKeyBoardScopes.projectId, scope: apiKeyBoardScopes.scope })
    .from(apiKeyBoardScopes)
    .where(eq(apiKeyBoardScopes.keyId, key.id))
  return boardScopesOf(rows)
}

export async function teamIdsOf(userId: string): Promise<string[]> {
  const rows = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return rows.map(row => row.teamId)
}

/** Whether a key is cut down to one customer's boards, or to single boards and not to a whole workspace. */
export function isNarrowedReach(customerId: string | null, reach: KeyReach): boolean {
  if (customerId) return true
  return !reach.allBoards && reach.workspaceTeamIds.length === 0 && reach.boardIds.length > 0
}

export function hasScope(context: ApiKeyContext, scope: ApiKeyScope): boolean {
  return context.scopes.includes(scope)
}

/**
 * The key's context for one call that needs `scope`. A token with per-board grants reaches only the boards
 * that grant the permission of the call being made, and the MCP dispatch sets that permission per tool. A
 * route that takes a key over plain HTTP must set it too, before it looks a board up: without it such a
 * token reaches no board at all and every board answers "not found".
 */
export function forCall(context: ApiKeyContext, scope: ApiKeyScope): ApiKeyContext {
  return { ...context, callScope: scope }
}
