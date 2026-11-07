import { editConnectToken } from '../../../utils/connectTokenWindow'
import type { EditConnectTokenBody } from '../../../utils/connectTokenWindow'

/**
 * Changes a connect token's name and its boards with their permissions. A board left out is taken off the token.
 * The secret stays the same, so no agent needs reconnecting. A token the caller does not own is a 404.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return editConnectToken(event, event.context.session.user.id, id, await readBody<EditConnectTokenBody>(event))
})
