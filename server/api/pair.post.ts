import { pairingSummary } from '../utils/pairing'
import { redeemPairingCode } from '../utils/connectTokens'
import { chargeRateLimit, limitsFor, requestAddress } from '../utils/rateLimits'

interface PairBody {
  code?: unknown
}

/**
 * Exchanges a one-time pairing code for the token's secret. No session: the code is the proof. The secret comes
 * back once, with the boards and permissions the token has, and the code is spent. Every attempt counts toward
 * the rate limit, the known and the unknown alike.
 */
export default defineEventHandler(async (event) => {
  // The limit is per client address (the proxy's X-Real-IP only from the proxy itself, see requestAddress), and
  // configurable by the instance admin.
  const ip = requestAddress(event)
  await chargeRateLimit('pairing', `address:${ip}`, await limitsFor('pairing'), event)

  const body = await readBody<PairBody>(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  return redeemPairingCode(body?.code, pairingSummary(ip, getHeader(event, 'user-agent')))
})
