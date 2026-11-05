import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamInvitations } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { mayManageTeamInvitation } from '../../../../utils/invitations'

// The invitations still waiting to be used, each with whether the caller may withdraw it: an owner any,
// an admin only their own. The links themselves are not kept, only their hashes, so a lost link means
// inviting the address again.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const actor = await requireTeamRole(event, teamId)
  const actorId = event.context.session.user.id
  const rows = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      invitedBy: teamInvitations.invitedBy,
      createdAt: teamInvitations.createdAt,
      expiresAt: teamInvitations.expiresAt
    })
    .from(teamInvitations)
    .where(and(
      eq(teamInvitations.organizationId, teamId),
      isNull(teamInvitations.acceptedAt),
      isNull(teamInvitations.revokedAt),
      gt(teamInvitations.expiresAt, Date.now())
    ))
    .orderBy(desc(teamInvitations.createdAt))
  return rows.map(({ invitedBy, ...open }) => ({ ...open, canWithdraw: mayManageTeamInvitation(actor.role, actorId, invitedBy) }))
})
