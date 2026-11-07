import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { apiKeys } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { KeyLimitError, readKeyLimit, readKeyRequest, requireLimitInTeam } from '../../../../utils/keyIssue'
import { recordKeyChange, reachSummary, storeReach, teamReachOf } from '../../../../utils/keyReach'

interface EditTeamKeyBody {
  name?: string
  scopes?: string[]
  /** Limits the key to one customer's boards. */
  customerId?: string | null
  /** Limits the key to one board. Not together with customerId. */
  projectId?: string | null
}

/**
 * Changes a team key's name, permissions and what it is limited to, in place: the secret stays the
 * same and the change applies to the key's next call. Owners and admins only; the audit line names
 * who made the change.
 */
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const keyId = getRouterParam(event, 'keyId')!
  await requireTeamRole(event, teamId)
  const body = await readBody<EditTeamKeyBody>(event)

  const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.teamId, teamId)))
  if (!key) throw createError({ statusCode: 404, message: 'No such key in this team' })

  const request = await readKeyRequest(event, body)
  let limit
  try {
    limit = readKeyLimit(body)
    await requireLimitInTeam(teamId, limit)
  } catch (e) {
    if (e instanceof KeyLimitError) throw createError({ statusCode: 400, message: e.message })
    throw e
  }
  const reach = teamReachOf(teamId, limit)

  await db.transaction(async (tx) => {
    await tx.update(apiKeys).set({
      name: request.name,
      scopes: request.scopes,
      customerId: limit.customerId,
      projectId: limit.projectId,
      allBoards: false
    }).where(eq(apiKeys.id, keyId))
    await storeReach(tx, keyId, reach)
  })

  const actor = event.context.session.user.name
  await recordKeyChange(
    key.userId,
    { id: keyId, name: request.name },
    `${actor} changed the team key: permissions ${request.scopes.join(', ')}, reaches ${reachSummary(reach)}`
  )
  return { ok: true }
})
