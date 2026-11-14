// Database side of a token: regenerating its secret, revoking it, and storing what each of its boards
// may do. The rules (messages, expiry, scope per board) are in connectTokenRules.ts.
import { and, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiKeyBoardScopes, apiKeyBoards, apiKeySecrets, apiKeys, pairingCodes, projects } from '../db/schema'
import type { ApiKey, ApiKeyScope } from '../db/schema'
import { generateApiKey, isApiKeyScope } from './api-keys'
import { boardScopesOf, isTokenExpired, tokenRefusal } from './connectTokenRules'
import { genId } from './projects'
import { generatePairingCode, pairingCodeDigest, pairingRefusal, PAIRING_CODE_TTL_MS, unknownPairingCode } from './pairing'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Gives a token a new secret. The same token, name, boards and permissions; the old secret stops working
 * at once and is kept as a digest that answers token_regenerated. The new secret is returned once.
 */
export async function regenerateKey(userId: string, keyId: string): Promise<{ token: string, keyPrefix: string }> {
  return db.transaction(async (tx) => {
    const [key] = await tx.select({ id: apiKeys.id, keyHash: apiKeys.keyHash })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    if (!key) throw createError({ statusCode: 404, message: 'API key not found' })
    return rotateSecret(tx, key, Date.now(), userId)
  })
}

/**
 * Puts a new secret on a token inside the caller's transaction. The old digest is kept as replaced, so its
 * owner gets token_regenerated. Used by regenerating and by pairing a code.
 */
export async function rotateSecret(tx: Tx, key: { id: string, keyHash: string }, now = Date.now(), actorId: string | null = null): Promise<{ token: string, keyPrefix: string }> {
  const generated = generateApiKey()
  await tx.insert(apiKeySecrets).values({ id: genId(), tokenId: key.id, keyHash: key.keyHash, state: 'replaced', changedAt: now, actorId })
  await tx.update(apiKeys)
    .set({ keyHash: generated.hash, keyPrefix: generated.displayPrefix })
    .where(eq(apiKeys.id, key.id))
  return { token: generated.token, keyPrefix: generated.displayPrefix }
}

/**
 * Revokes a token: the key row goes (its boards and permissions with it), and its last secret is kept as a
 * digest that answers token_revoked. Returns false when the token is not the person's.
 */
export async function revokeKey(userId: string, keyId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx.delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning({ id: apiKeys.id, keyHash: apiKeys.keyHash, kind: apiKeys.kind })
    if (!deleted) return false
    const state = deleted.kind === 'management' ? 'revoked_management' : 'revoked'
    await tx.insert(apiKeySecrets).values({ id: genId(), tokenId: deleted.id, keyHash: deleted.keyHash, state, changedAt: Date.now(), actorId: userId })
    return true
  })
}

/**
 * Replaces what each board of a token may do. `grants` maps a board id to its permissions; a board left
 * out gets none. Runs inside the caller's transaction and marks the token as using per-board grants.
 */
export async function storeBoardScopes(tx: Tx, keyId: string, grants: Record<string, ApiKeyScope[]>, now = Date.now()): Promise<void> {
  await tx.delete(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, keyId))
  const rows = Object.entries(grants).flatMap(([projectId, scopes]) =>
    scopes.map(scope => ({ id: genId(), keyId, projectId, scope, createdAt: now })))
  if (rows.length) await tx.insert(apiKeyBoardScopes).values(rows)
  await tx.update(apiKeys).set({ boardScopesSet: true }).where(eq(apiKeys.id, keyId))
}

/**
 * Makes a one-time pairing code for one of the person's access tokens. The code is returned here, once; only
 * its digest is stored. It works for ten minutes and once, and hands over the token's boards and permissions.
 */
export async function createPairingCode(userId: string, keyId: string, now = Date.now()): Promise<{ code: string, expiresAt: number }> {
  const code = generatePairingCode()
  const digest = pairingCodeDigest(code)!
  const expiresAt = now + PAIRING_CODE_TTL_MS
  return db.transaction(async (tx) => {
    const [key] = await tx.select({ id: apiKeys.id, kind: apiKeys.kind, expiresAt: apiKeys.expiresAt })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    if (!key) throw createError({ statusCode: 404, message: 'API key not found' })
    if (key.kind !== 'access') throw createError({ statusCode: 400, message: 'Only an access token can be paired with a code' })
    if (isTokenExpired(key.expiresAt, now)) throw createError({ statusCode: 400, message: 'This token has expired. Make a new token first.' })

    await tx.insert(pairingCodes).values({ id: genId(), tokenId: key.id, codeHash: digest, createdBy: userId, expiresAt, kind: 'code' })
    return { code, expiresAt }
  })
}

/** What a paired agent gets: the token's secret, once, with what the token may do. */
export interface PairedToken {
  token: string
  keyPrefix: string
  name: string
  /** The most the token may do on any board. */
  scopes: ApiKeyScope[]
  /** Set when the token reaches every board its person can open. */
  allBoards: boolean
  /** The boards the token was given, each with its permissions there. */
  boards: { id: string, name: string, scopes: ApiKeyScope[] }[]
}

/**
 * Exchanges a pairing code for the token's secret. The code is single use and works for ten minutes. The
 * secret is a fresh one: the old one stops working, as with regenerating, and is returned once. `from` is the
 * client's summary, kept with the code as "paired by". A refused code gives its reason, an unknown code none.
 */
export async function redeemPairingCode(input: unknown, from: string, now = Date.now()): Promise<PairedToken> {
  const digest = pairingCodeDigest(input)
  if (!digest) throw unknownPairingCode()
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(pairingCodes)
      .set({ usedAt: now, usedFrom: from })
      .where(and(
        eq(pairingCodes.codeHash, digest),
        eq(pairingCodes.kind, 'code'),
        isNull(pairingCodes.usedAt),
        gt(pairingCodes.expiresAt, now)
      ))
      .returning({ tokenId: pairingCodes.tokenId })
    if (!claimed) {
      const [row] = await tx.select({ usedAt: pairingCodes.usedAt })
        .from(pairingCodes)
        .where(and(eq(pairingCodes.codeHash, digest), eq(pairingCodes.kind, 'code')))
      if (!row) throw unknownPairingCode()
      throw pairingRefusal(row.usedAt ? 'pairing_code_used' : 'pairing_code_expired')
    }

    const [key] = await tx.select().from(apiKeys).where(eq(apiKeys.id, claimed.tokenId))
    if (!key) throw unknownPairingCode()
    // Rolls back the claim above with the throw, so the code stays unused.
    if (isTokenExpired(key.expiresAt, now)) throw tokenRefusal('token_expired')

    const { token, keyPrefix } = await rotateSecret(tx, key, now)
    const scopes = key.scopes.filter(isApiKeyScope)
    return { token, keyPrefix, name: key.name, scopes, allBoards: key.allBoards, boards: await boardsOfToken(tx, key, scopes) }
  })
}

/** The boards of a token with their permissions: the grants stored per board, or the token's own scopes where none are stored. */
async function boardsOfToken(tx: Tx, key: ApiKey, scopes: ApiKeyScope[]): Promise<PairedToken['boards']> {
  let grants: Record<string, ApiKeyScope[]>
  if (key.boardScopesSet) {
    const rows = await tx.select({ projectId: apiKeyBoardScopes.projectId, scope: apiKeyBoardScopes.scope })
      .from(apiKeyBoardScopes)
      .where(eq(apiKeyBoardScopes.keyId, key.id))
    grants = boardScopesOf(rows)
  } else {
    const rows = await tx.select({ projectId: apiKeyBoards.projectId })
      .from(apiKeyBoards)
      .where(eq(apiKeyBoards.keyId, key.id))
    grants = Object.fromEntries(rows.map(row => [row.projectId, scopes]))
  }
  const ids = Object.keys(grants)
  if (!ids.length) return []
  const names = await tx.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, ids))
  return names.map(row => ({ id: row.id, name: row.name, scopes: grants[row.id] ?? [] }))
}

/** When a token was last paired, and by whom (the summary the exchange stored). Null when it never was. */
export async function latestPairingOf(tokenId: string): Promise<{ usedAt: number, usedFrom: string | null } | null> {
  const [row] = await db.select({ usedAt: pairingCodes.usedAt, usedFrom: pairingCodes.usedFrom })
    .from(pairingCodes)
    .where(and(eq(pairingCodes.tokenId, tokenId), isNotNull(pairingCodes.usedAt)))
    .orderBy(desc(pairingCodes.usedAt))
    .limit(1)
  return row?.usedAt ? { usedAt: row.usedAt, usedFrom: row.usedFrom } : null
}
