import { decideDeviceRequest } from '../../utils/deviceFlowDb'

interface DecideBody {
  code?: unknown
  decision?: unknown
  boards?: unknown
}

/**
 * The person's answer to a browser connection request: approve with the boards and permissions they keep (never more
 * than the request asked for), or deny. The token is made when the agent next polls.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<DecideBody>(event)
  return decideDeviceRequest(event.context.session.user.id, body?.code, body?.decision, body?.boards)
})
