import { revokeKey } from '../../../utils/connectTokens'

/** Revokes a key. Any agent still holding it stops working at once, and its next call is told the token was revoked. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = event.context.session.user.id

  if (!await revokeKey(userId, id)) throw createError({ statusCode: 404, message: 'API key not found' })
  return { ok: true }
})
