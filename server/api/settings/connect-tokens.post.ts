import { createConnectToken } from '../../utils/connectTokenWindow'
import type { CreateConnectTokenBody } from '../../utils/connectTokenWindow'

interface CreateBody extends CreateConnectTokenBody {
  /** 'token' returns the secret once; anything else returns the key only, for a pairing code to be made for it. */
  reveal?: unknown
}

/**
 * Makes a connect token: a name, an optional lifetime, and the boards with what the token may do on each. Only
 * the boards the caller can open are accepted. The secret comes back only when the caller asks for it (reveal
 * 'token'); otherwise a pairing code is made for the token, and the agent exchanges that for the secret.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<CreateBody>(event)
  const { token, key } = await createConnectToken(event, event.context.session.user.id, body)
  const summary = {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt
  }
  // Shown once, never retrievable again.
  return body.reveal === 'token' ? { token, key: summary } : { key: summary }
})
