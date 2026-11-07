// What the "Connect your Claude" window reads and changes: a person's tokens with the boards each reaches and
// what it may do there, adding a board to a token (with its permissions copied from a board or another token),
// and editing a token's boards. The rules are in connectTokenRules.ts; the stored grants and the secrets in
// connectTokens.ts. Every change keeps the token's reach and its per-board grants in step.
import type { H3Event } from 'h3'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiKeyBoardScopes, apiKeys, user } from '../db/schema'
import type { ApiKey, ApiKeyScope } from '../db/schema'
import { isApiKeyScope } from './api-keys'
import { latestPairingOf, storeBoardScopes } from './connectTokens'
import { boardScopesOf, copyBoardScopes, isTokenExpired, readBoardGrants, scopesOfGrants } from './connectTokenRules'
import { issueKey, readKeyRequest } from './keyIssue'
import { openBoardsOf, recordKeyChange, reachedBoardsOf, storeReach, workspacesOf } from './keyReach'
import type { ReachRequest } from './keyReach'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** A token as the window lists it: what it may do on each board it reaches, and who paired it last. */
export interface ConnectTokenView {
  id: string
  name: string
  keyPrefix: string
  kind: 'access' | 'management'
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  expired: boolean
  /** The most the token may do on any board. */
  scopes: ApiKeyScope[]
  /** The boards it reaches, each with the permissions it has there. */
  boards: { id: string, name: string, workspace: string, scopes: ApiKeyScope[] }[]
  /** The last pairing of this token, or null when no agent has paired with it. */
  pairedBy: { usedAt: number, usedFrom: string | null } | null
}

/** Every token the person has in the window, and the boards they may pick from. */
export async function listConnectTokens(userId: string) {
  const rows = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.teamId)))
    .orderBy(apiKeys.createdAt)
  const [reached, grantsOf, pairings, workspaces, boards, [account]] = await Promise.all([
    reachedBoardsOf(userId, rows),
    grantsByKey(rows),
    Promise.all(rows.map(row => latestPairingOf(row.id))),
    workspacesOf(userId),
    openBoardsOf(userId),
    db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  ])
  const workspaceName = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))
  const now = Date.now()

  const tokens: ConnectTokenView[] = rows.map((key, index) => {
    const own = key.scopes.filter(isApiKeyScope)
    const grants = grantsOf.get(key.id) ?? null
    const onBoards = (reached.get(key.id) ?? []).flatMap((board) => {
      // With per-board grants, a board shows only when it is granted; a board the person lost access to drops out.
      // Without them, the token's own permissions apply to every board it reaches, except a crew's read-only link.
      const scopes = grants ? grants[board.id] : (board.readOnly ? undefined : own)
      return scopes?.length ? [{ id: board.id, name: board.name, workspace: board.workspace, scopes }] : []
    })
    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      kind: key.kind,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      expired: isTokenExpired(key.expiresAt, now),
      scopes: grants ? scopesOfGrants(grants) : own,
      boards: onBoards,
      pairedBy: pairings[index] ?? null
    }
  })

  return {
    tokens,
    boards: boards.map(board => ({
      id: board.id,
      name: board.name,
      workspace: board.teamId ? workspaceName.get(board.teamId) ?? 'Team' : 'Personal'
    })),
    canManageCrews: Boolean(account?.isInstanceAdmin)
  }
}

/**
 * Makes a token from the window: a name, a lifetime, and the boards with their permissions. Its reach is exactly
 * those boards. The secret is returned only when `reveal` is 'token'; otherwise the caller makes a pairing code.
 */
export async function createConnectToken(event: H3Event, userId: string, body: CreateConnectTokenBody) {
  const grants = readBoardGrants(body.boards)
  await requireOpenBoards(userId, Object.keys(grants))
  const request = await readKeyRequest(event, { name: body.name, scopes: scopesOfGrants(grants), expiresInDays: body.expiresInDays })
  const reach: ReachRequest = { allBoards: false, workspaceTeamIds: [], boardIds: Object.keys(grants) }
  const { token, key } = await issueKey({ userId, teamId: null, request, reach })
  await db.transaction(tx => storeBoardScopes(tx, key.id, grants))
  return { token, key }
}

/**
 * Changes what a token may do: its name, and the boards with their permissions. A board left out is taken off the
 * token. The secret stays the same. A management token is made again from its sidebar link, not edited here.
 */
export async function editConnectToken(event: H3Event, userId: string, keyId: string, body: EditConnectTokenBody) {
  const key = await ownedAccessToken(userId, keyId)
  const grants = readBoardGrants(body.boards)
  await requireOpenBoards(userId, Object.keys(grants))
  const request = await readKeyRequest(event, { name: body.name ?? key.name, scopes: scopesOfGrants(grants) })

  await db.transaction(async (tx) => {
    await tx.update(apiKeys).set({ name: request.name }).where(eq(apiKeys.id, key.id))
    await storeTokenGrants(tx, key.id, grants)
  })
  await recordKeyChange(userId, { id: key.id, name: request.name }, `Changed the token: ${describeGrants(grants)}`)
  return { ok: true }
}

/**
 * Adds a board to an older token. Its permissions come from `copyFrom` (a board of this token, or of another of the
 * person's tokens) or are given with `scopes`. Nothing else on the token changes.
 */
export async function addBoardToConnectToken(event: H3Event, userId: string, keyId: string, body: AddBoardBody) {
  const key = await ownedAccessToken(userId, keyId)
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  if (!projectId) throw createError({ statusCode: 400, message: 'Pick the board to add' })

  const current = await grantsOfToken(userId, key)
  if (current[projectId]) throw createError({ statusCode: 400, message: 'That board is already on this token. Change its permissions instead.' })
  await requireOpenBoards(userId, [projectId])

  let scopes: ApiKeyScope[]
  if (body.copyFrom) {
    const fromId = typeof body.copyFrom.projectId === 'string' ? body.copyFrom.projectId : ''
    const fromToken = typeof body.copyFrom.tokenId === 'string' ? body.copyFrom.tokenId : ''
    const sourceGrants = fromToken && fromToken !== key.id
      ? await grantsOfToken(userId, await ownedAccessToken(userId, fromToken))
      : current
    if (!sourceGrants[fromId]) throw createError({ statusCode: 400, message: 'The token has no permissions on the board to copy from' })
    scopes = copyBoardScopes(sourceGrants, fromId, projectId)[projectId]!
  } else {
    scopes = readBoardGrants([{ projectId, scopes: body.scopes }])[projectId]!
  }

  const grants = { ...current, [projectId]: scopes }
  const request = await readKeyRequest(event, { name: key.name, scopes: scopesOfGrants(grants) })
  await db.transaction(tx => storeTokenGrants(tx, key.id, grants))
  await recordKeyChange(userId, { id: key.id, name: request.name }, `Added a board to the token: ${describeGrants({ [projectId]: scopes })}`)
  return { ok: true }
}

export interface CreateConnectTokenBody {
  name?: unknown
  expiresInDays?: unknown
  boards?: unknown
}

export interface EditConnectTokenBody {
  name?: unknown
  boards?: unknown
}

export interface AddBoardBody {
  projectId?: unknown
  scopes?: unknown
  copyFrom?: { tokenId?: unknown, projectId?: unknown }
}

/** The person's own access token, or a 404. A management token is refused here: it is made again from its own link. */
async function ownedAccessToken(userId: string, keyId: string): Promise<ApiKey> {
  const [key] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.teamId)))
  if (!key) throw createError({ statusCode: 404, message: 'API key not found' })
  if (key.kind !== 'access') throw createError({ statusCode: 400, message: 'A management token is made again from its link, not changed here' })
  return key
}

/** Every board must be one the person can open now. Refused otherwise, with the same answer as the token form. */
async function requireOpenBoards(userId: string, projectIds: string[]): Promise<void> {
  const open = new Set((await openBoardsOf(userId)).map(board => board.id))
  if (projectIds.some(id => !open.has(id))) throw createError({ statusCode: 400, message: 'A board is not one you can open' })
}

/** The permissions a token has on each board: the stored grants, or its own permissions on every board it reaches. */
async function grantsOfToken(userId: string, key: ApiKey): Promise<Record<string, ApiKeyScope[]>> {
  if (key.boardScopesSet) {
    const rows = await db.select({ projectId: apiKeyBoardScopes.projectId, scope: apiKeyBoardScopes.scope })
      .from(apiKeyBoardScopes)
      .where(eq(apiKeyBoardScopes.keyId, key.id))
    return boardScopesOf(rows)
  }
  const own = key.scopes.filter(isApiKeyScope)
  const reached = (await reachedBoardsOf(userId, [key])).get(key.id) ?? []
  return Object.fromEntries(reached.filter(board => !board.readOnly).map(board => [board.id, own]))
}

/** The stored grants of several tokens at once, for the list. Only tokens that have per-board grants appear. */
async function grantsByKey(keys: ApiKey[]): Promise<Map<string, Record<string, ApiKeyScope[]>>> {
  const setKeys = keys.filter(key => key.boardScopesSet).map(key => key.id)
  const result = new Map<string, Record<string, ApiKeyScope[]>>()
  if (!setKeys.length) return result
  const rows = await db.select({ keyId: apiKeyBoardScopes.keyId, projectId: apiKeyBoardScopes.projectId, scope: apiKeyBoardScopes.scope })
    .from(apiKeyBoardScopes)
    .where(inArray(apiKeyBoardScopes.keyId, setKeys))
  for (const keyId of setKeys) {
    result.set(keyId, boardScopesOf(rows.filter(row => row.keyId === keyId)))
  }
  return result
}

/**
 * Stores a token's grants: the per-board rows, the reach (exactly the granted boards) and the token's own
 * permissions, which are the union of its grants. Inside the caller's transaction.
 */
async function storeTokenGrants(tx: Tx, keyId: string, grants: Record<string, ApiKeyScope[]>): Promise<void> {
  await storeBoardScopes(tx, keyId, grants)
  await storeReach(tx, keyId, { allBoards: false, workspaceTeamIds: [], boardIds: Object.keys(grants) })
  await tx.update(apiKeys).set({ scopes: scopesOfGrants(grants) }).where(eq(apiKeys.id, keyId))
}

/** One line for the audit: each board by id and its permissions. */
function describeGrants(grants: Record<string, ApiKeyScope[]>): string {
  return Object.entries(grants).map(([projectId, scopes]) => `${projectId} (${scopes.join(', ')})`).join('; ')
}
