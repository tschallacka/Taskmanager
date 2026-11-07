import { createPairingCode } from '../../utils/connectTokens'

interface PairingCodeBody {
  tokenId?: unknown
}

/**
 * Makes a one-time pairing code for one of the caller's access tokens. The code is returned here, once, and
 * works for ten minutes. The secret is not returned: the agent gets it by exchanging the code at POST /api/pair.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<PairingCodeBody>(event)
  if (typeof body?.tokenId !== 'string' || !body.tokenId) {
    throw createError({ statusCode: 400, message: 'Pick the token to pair' })
  }
  return createPairingCode(event.context.session.user.id, body.tokenId)
})
