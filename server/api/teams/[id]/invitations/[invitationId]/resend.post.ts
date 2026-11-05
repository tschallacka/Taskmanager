import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../../../../db'
import { organization, teamInvitations, user } from '../../../../../db/schema'
import { requireTeamRole } from '../../../../../utils/auth-helpers'
import { INVITATION_TTL_MS, newInvitationToken } from '../../../../../utils/customers'
import { inviteUrl, mailInvitation, mayManageTeamInvitation } from '../../../../../utils/invitations'

// Sends an open team invitation again. Only a hash of a link is kept, so the old link cannot be shown a
// second time: a fresh one replaces it, good for another 14 days, mailed when the instance can send mail
// and returned here once otherwise. An owner may resend any, an admin only the ones they sent.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const invitationId = getRouterParam(event, 'invitationId')!
  const actor = await requireTeamRole(event, teamId)
  const actorId = event.context.session.user.id

  const [open] = await db.select({ email: teamInvitations.email, invitedBy: teamInvitations.invitedBy }).from(teamInvitations).where(and(
    eq(teamInvitations.id, invitationId),
    eq(teamInvitations.organizationId, teamId),
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.revokedAt),
    gt(teamInvitations.expiresAt, Date.now())
  ))
  if (!open) throw createError({ statusCode: 404, message: 'No open invitation like that' })
  if (!mayManageTeamInvitation(actor.role, actorId, open.invitedBy)) {
    throw createError({ statusCode: 403, message: 'Only an owner, or the person who sent an invitation, can resend it' })
  }

  const { token, tokenHash } = newInvitationToken()
  const [renewed] = await db.update(teamInvitations)
    .set({ tokenHash, expiresAt: Date.now() + INVITATION_TTL_MS })
    .where(and(eq(teamInvitations.id, invitationId), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)))
    .returning({ id: teamInvitations.id })
  if (!renewed) throw createError({ statusCode: 409, message: 'That invitation was used or withdrawn just now' })

  const [team] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, teamId))
  const [sender] = await db.select({ name: user.name }).from(user).where(eq(user.id, actorId))
  const url = inviteUrl(event, token)
  const emailed = await mailInvitation({ to: open.email, inviterName: sender?.name ?? null, what: `join ${team?.name ?? 'a team'}`, url })
  return { id: invitationId, email: open.email, url, emailed }
})
