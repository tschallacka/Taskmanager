import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamInvitations } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { mayManageTeamInvitation } from '../../../../utils/invitations'

// Withdraws an invitation that has not been used. Its link stops working at once. An owner may withdraw
// any; an admin only the ones they sent.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const invitationId = getRouterParam(event, 'invitationId')!
  const actor = await requireTeamRole(event, teamId)

  const [open] = await db.select({ invitedBy: teamInvitations.invitedBy }).from(teamInvitations).where(and(
    eq(teamInvitations.id, invitationId),
    eq(teamInvitations.organizationId, teamId),
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.revokedAt)
  ))
  if (!open) throw createError({ statusCode: 404, message: 'No open invitation like that' })
  if (!mayManageTeamInvitation(actor.role, event.context.session.user.id, open.invitedBy)) {
    throw createError({ statusCode: 403, message: 'Only an owner, or the person who sent an invitation, can withdraw it' })
  }

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
