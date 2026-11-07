import { pairingAttempts, pairingSummary } from '../utils/pairing'
import { redeemPairingCode } from '../utils/connectTokens'

interface PairBody {
  code?: unknown
}

/**
 * Exchanges a one-time pairing code for the token's secret. No session: the code is the proof. The secret comes
 * back once, with the boards and permissions the token has, and the code is spent. Every attempt counts toward
 * the rate limit, the known and the unknown alike.
 */
export default defineEventHandler(async (event) => {
  // Behind the proxy the address comes from X-Forwarded-For; the limit is per address.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!pairingAttempts.allow(ip, Date.now())) {
    throw createError({ statusCode: 429, message: 'Too many pairing attempts. Wait 10 minutes and try again.' })
  }

  const body = await readBody<PairBody>(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  return redeemPairingCode(body?.code, pairingSummary(ip, getHeader(event, 'user-agent')))
})
