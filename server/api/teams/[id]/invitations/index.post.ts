import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { member, organization, teamInvitations, user } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { INVITATION_TTL_MS, newInvitationToken } from '../../../../utils/customers'
import { isInvalidDomain } from '../../../../utils/crewAccounts'
import { accountByEmail, normalizeEmail } from '../../../../utils/guests'
import { inviteUrl, mailInvitation, mayManageTeamInvitation } from '../../../../utils/invitations'
import { genId } from '../../../../utils/projects'

// Invites an address to join the team. Owners and admins invite members; only an owner invites an
// admin. The link comes back here once, and is mailed too when the instance can send mail. Only the
// account with that address can use it, and it lets that person create an account on a closed instance.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const actor = await requireTeamRole(event, teamId)
  const actorId = event.context.session.user.id
  const body = (await readBody<{ email?: unknown, role?: unknown }>(event)) ?? {}

  const email = normalizeEmail(body.email)
  if (!email || isInvalidDomain(email)) throw createError({ statusCode: 400, message: 'Write a valid email address' })

  const role = body.role === 'admin' ? 'admin' : 'member'
  if (role === 'admin' && actor.role !== 'owner') {
    throw createError({ statusCode: 403, message: 'Only an owner can invite an admin' })
  }

  const account = await accountByEmail(email)
  if (account) {
    const [already] = await db.select({ id: member.id }).from(member)
      .where(and(eq(member.organizationId, teamId), eq(member.userId, account.id)))
    if (already) throw createError({ statusCode: 409, message: 'That person is already on the team' })
  }

  // A new invitation replaces an open one for the same address, so only one link per person is live.
  // That is a withdrawal too, so an admin cannot replace an invitation someone else sent.
  const now = Date.now()
  const replaced = await db.select({ invitedBy: teamInvitations.invitedBy }).from(teamInvitations).where(and(
    eq(teamInvitations.organizationId, teamId),
    eq(teamInvitations.email, email),
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.revokedAt),
    gt(teamInvitations.expiresAt, now)
  ))
  if (replaced.some(open => !mayManageTeamInvitation(actor.role, actorId, open.invitedBy))) {
    throw createError({ statusCode: 403, message: 'An invitation for that address from someone else is still open. An owner or the person who sent it can withdraw it first' })
  }
  await db.update(teamInvitations).set({ revokedAt: now }).where(and(
    eq(teamInvitations.organizationId, teamId),
    eq(teamInvitations.email, email),
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.revokedAt)
  ))

  const { token, tokenHash } = newInvitationToken()
  const [invitation] = await db.insert(teamInvitations).values({
    id: genId(),
    organizationId: teamId,
    email,
    role,
    tokenHash,
    invitedBy: actorId,
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS
  }).returning()

  const [team] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, teamId))
  const [inviter] = await db.select({ name: user.name }).from(user).where(eq(user.id, actorId))
  const url = inviteUrl(event, token)
  const emailed = await mailInvitation({ to: email, inviterName: inviter?.name ?? null, what: `join ${team?.name ?? 'a team'}`, url })

  return { id: invitation!.id, email, role, expiresAt: invitation!.expiresAt, url, emailed }
})
