import { addBoardToConnectToken } from '../../../utils/connectTokenWindow'
import type { AddBoardBody } from '../../../utils/connectTokenWindow'

/**
 * Adds one board to an older token. Its permissions are copied from a board of this token, or of another token
 * the caller owns (`copyFrom`), or given as `scopes`. The token's other boards are left as they are.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return addBoardToConnectToken(event, event.context.session.user.id, id, await readBody<AddBoardBody>(event))
})
