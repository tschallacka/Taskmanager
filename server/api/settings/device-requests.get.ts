import { requestForApproval } from '../../utils/deviceFlowDb'

/**
 * What the approve page shows for a browser connection request: the client that asks and the boards and
 * permissions it asks for, with the boards the caller cannot open marked unavailable. The code comes in the query.
 */
export default defineEventHandler(event => requestForApproval(
  event.context.session.user.id,
  getQuery(event).code
))
