import { deviceStartAttempts, DEVICE_REQUEST_TTL_MS, DEVICE_POLL_INTERVAL_SECONDS, readStartRequest } from '../../utils/deviceFlow'
import { startDeviceRequest } from '../../utils/deviceFlowDb'

/**
 * Starts browser verification for an agent. No session: the agent sends the name of its client and the boards and
 * permissions it asks for. The reply holds the device code (kept by the agent, polled with), the user code and the
 * page where the person approves the request. Nothing here is a token; the token comes from the poll, once.
 */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!deviceStartAttempts.allow(ip, Date.now())) {
    throw createError({ statusCode: 429, message: 'Too many connection requests. Wait 10 minutes and try again.' })
  }

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
