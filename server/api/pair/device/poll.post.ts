import { pollDeviceRequest } from '../../../utils/deviceFlowDb'

interface PollBody {
  device_code?: unknown
}

/**
 * The agent's poll for a browser connection. Pending until the person answers in the browser; then the token, once,
 * with the boards and permissions the person approved. Denied, expired and used requests are refused with a
 * message for the user and the agent. No session: the device code is the proof.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<PollBody>(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  return pollDeviceRequest(body?.device_code)
})
