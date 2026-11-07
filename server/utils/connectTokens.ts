// Database side of a token: regenerating its secret, revoking it, and storing what each of its boards
// may do. The rules (messages, expiry, scope per board) are in connectTokenRules.ts.
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { apiKeyBoardScopes, apiKeySecrets, apiKeys } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'
import { generateApiKey } from './api-keys'
import { genId } from './projects'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Gives a token a new secret. The same token, name, boards and permissions; the old secret stops working
 * at once and is kept as a digest that answers token_regenerated. The new secret is returned once.
 */
export async function regenerateKey(userId: string, keyId: string): Promise<{ token: string, keyPrefix: string }> {
  const generated = generateApiKey()
  const now = Date.now()
  return db.transaction(async (tx) => {
    const [key] = await tx.select({ id: apiKeys.id, keyHash: apiKeys.keyHash })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    if (!key) throw createError({ statusCode: 404, message: 'API key not found' })

    await tx.insert(apiKeySecrets).values({ id: genId(), tokenId: key.id, keyHash: key.keyHash, state: 'replaced', changedAt: now })
    await tx.update(apiKeys)
      .set({ keyHash: generated.hash, keyPrefix: generated.displayPrefix })
      .where(eq(apiKeys.id, key.id))
    return { token: generated.token, keyPrefix: generated.displayPrefix }
  })
}

/**
 * Revokes a token: the key row goes (its boards and permissions with it), and its last secret is kept as a
 * digest that answers token_revoked. Returns false when the token is not the person's.
 */
export async function revokeKey(userId: string, keyId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx.delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning({ id: apiKeys.id, keyHash: apiKeys.keyHash })
    if (!deleted) return false
    await tx.insert(apiKeySecrets).values({ id: genId(), tokenId: deleted.id, keyHash: deleted.keyHash, state: 'revoked', changedAt: Date.now() })
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
