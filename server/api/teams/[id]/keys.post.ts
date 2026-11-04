import { requireTeamRole } from '../../../utils/auth-helpers'
import { issueKey, KeyLimitError, readKeyLimit, readKeyRequest, requireLimitInTeam } from '../../../utils/keyIssue'

interface CreateTeamKeyBody {
  name?: string
  scopes?: string[]
  expiresInDays?: number | null
  /** Limits the key to one customer's boards. */
  customerId?: string | null
  /** Limits the key to one board. Not together with customerId. */
  projectId?: string | null
}

/**
 * Issues a key for this team, owned by the caller, optionally limited to one customer's boards
 * or to one board. Owners and admins only. The key is returned exactly once.
 */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const body = await readBody<CreateTeamKeyBody>(event)

  const request = await readKeyRequest(event, body)
  let limit
  try {
    limit = readKeyLimit(body)
    await requireLimitInTeam(teamId, limit)
  } catch (e) {
    if (e instanceof KeyLimitError) throw createError({ statusCode: 400, message: e.message })
    throw e
  }

  const { token, key } = await issueKey({ userId: event.context.session.user.id, teamId, request, limit })
  return {
    // Shown once, never retrievable again.
    token,
    key: {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      customerId: key.customerId,
      projectId: key.projectId
    }
  }
})
