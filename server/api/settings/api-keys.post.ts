import { getUserActiveTeamId } from '../../utils/auth-helpers'
import { issueKey, readKeyRequest } from '../../utils/keyIssue'
import { readReachRequest } from '../../utils/keyReach'
import type { ReachRequest } from '../../utils/keyReach'

interface CreateApiKeyBody {
  name?: string
  scopes?: string[]
  /** Days until the key stops working. Omit or pass null for a key that never expires. */
  expiresInDays?: number | null
  /** What the key reaches: allBoards, workspaceTeamIds (null is the personal workspace) and boardIds. */
  reach?: unknown
}

/**
 * Issues an API key for the caller. It reaches what the caller picks: Select all, whole workspaces
 * or single boards, from every board they can open. The key itself is returned exactly once — only
 * its SHA-256 digest is stored. A request without a pick (an older client) gets the workspace the
 * caller is in, as it did before. A key limited to one board or customer is made on the team page.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<CreateApiKeyBody>(event)
  const userId = event.context.session.user.id
  const request = await readKeyRequest(event, body)

  let teamId: string | null = null
  let reach: ReachRequest
  if (body.reach === undefined) {
    teamId = await getUserActiveTeamId(event)
    reach = { allBoards: false, workspaceTeamIds: [teamId], boardIds: [] }
  } else {
    reach = await readReachRequest(userId, body.reach)
  }

  const { token, key: created } = await issueKey({ userId, teamId, request, reach })

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
