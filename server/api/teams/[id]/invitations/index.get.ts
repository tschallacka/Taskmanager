import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamInvitations } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'

// The invitations still waiting to be used. The links themselves are not kept, only their hashes,
// so a lost link means inviting the address again.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  return db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
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
})
