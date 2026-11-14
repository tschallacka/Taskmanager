import { regenerateKey } from '../../../../utils/connectTokens'

/**
 * Gives a key a new secret. The name, boards and permissions stay; the old secret stops working at once and
 * is refused as regenerated. The new secret is returned exactly once, and is never retrievable again.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = event.context.session.user.id

  const { token, keyPrefix } = await regenerateKey(userId, id)
  return {
    // Shown once, never retrievable again.
    token,
    key: { id, keyPrefix }
  }
})
