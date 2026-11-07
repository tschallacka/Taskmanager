import { DEVICE_REQUEST_TTL_MS, DEVICE_POLL_INTERVAL_SECONDS, readStartRequest } from '../../utils/deviceFlow'
import { chargeRateLimit, limitsFor, requestAddress } from '../../utils/rateLimits'
import { startDeviceRequest } from '../../utils/deviceFlowDb'

/**
 * Starts browser verification for an agent. No session: the agent sends the name of its client and the boards and
 * permissions it asks for. The reply holds the device code (kept by the agent, polled with), the user code and the
 * page where the person approves the request. Nothing here is a token; the token comes from the poll, once.
 */
export default defineEventHandler(async (event) => {
  // The same configurable pairing limit as the code exchange, per client address (X-Real-IP only from the proxy).
  await chargeRateLimit('pairing', `device-start:${requestAddress(event)}`, await limitsFor('pairing'), event)

  const request = readStartRequest(await readBody(event))
  setResponseHeader(event, 'cache-control', 'no-store')
  const origin = (process.env.BETTER_AUTH_URL || getRequestURL(event).origin).replace(/\/$/, '')
  const started = await startDeviceRequest(request)
  return {
    device_code: started.deviceCode,
    user_code: started.userCode,
    verification_url: `${origin}/connect-approve?code=${encodeURIComponent(started.userCode)}`,
    expires_in: Math.floor(DEVICE_REQUEST_TTL_MS / 1000),
    interval: DEVICE_POLL_INTERVAL_SECONDS
  }
})
