import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { apiKeys } from '../../../db/schema'
import { readKeyRequest } from '../../../utils/keyIssue'
import { readReachRequest, recordKeyChange, reachSummary, storeReach } from '../../../utils/keyReach'

interface EditApiKeyBody {
  name?: string
  scopes?: string[]
  /** What the key reaches now. Left out, the boards stay as they are. */
  reach?: unknown
}

/**
 * Changes a personal key's name, permissions and boards. The secret stays the same, so no agent needs
 * reconnecting, and the change applies to the key's next call. Only the owner changes a personal key;
 * a team key is changed on the team page.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = event.context.session.user.id
  const body = await readBody<EditApiKeyBody>(event)

  const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
  if (!key) throw createError({ statusCode: 404, message: 'API key not found' })
  if (key.teamId) throw createError({ statusCode: 403, message: 'A team key is changed on the team page' })

  const request = await readKeyRequest(event, { name: body.name, scopes: body.scopes })
  const reach = body.reach === undefined ? null : await readReachRequest(userId, body.reach)

  await db.transaction(async (tx) => {
    await tx.update(apiKeys).set({ name: request.name, scopes: request.scopes }).where(eq(apiKeys.id, id))
    if (reach) await storeReach(tx, id, reach)
  })

  const boards = reach ? `, reaches ${reachSummary(reach)}` : ''
  await recordKeyChange(userId, { id, name: request.name }, `Changed the key: permissions ${request.scopes.join(', ')}${boards}`)
  return { ok: true }
})
