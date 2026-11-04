import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { issueKey, readKeyRequest } from '../../utils/keyIssue'

interface CreateApiKeyBody {
  name?: string
  scopes?: string[]
  /** Days until the key stops working. Omit or pass null for a key that never expires. */
  expiresInDays?: number | null
}

/**
 * Issues an API key for the caller's active workspace. The key itself is returned
 * exactly once — only its SHA-256 digest is stored — so the response is the one
 * chance the user has to copy it. A key limited to one board or customer is made by
 * a team's owner or admin on the team page, not here.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<CreateApiKeyBody>(event)
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)

  const request = await readKeyRequest(event, body)
  const { token, key: created } = await issueKey({ userId, teamId, request })

  return {
    // Shown once, never retrievable again.
    token,
    key: {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
      createdAt: created.createdAt,
      lastUsedAt: created.lastUsedAt,
      expiresAt: created.expiresAt
    }
  }
})
