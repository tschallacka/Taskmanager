import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamInvitations } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'

// Withdraws an invitation that has not been used. Its link stops working at once.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const invitationId = getRouterParam(event, 'invitationId')!
  await requireTeamRole(event, teamId)

  const [revoked] = await db
    .update(teamInvitations)
    .set({ revokedAt: Date.now() })
    .where(and(
      eq(teamInvitations.id, invitationId),
      eq(teamInvitations.organizationId, teamId),
      isNull(teamInvitations.acceptedAt),
      isNull(teamInvitations.revokedAt)
    ))
    .returning({ id: teamInvitations.id })
  if (!revoked) throw createError({ statusCode: 404, message: 'No open invitation like that' })
  return { ok: true }
})
