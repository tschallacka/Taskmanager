import { db } from '../../../db'
import { customerInvitations, customerMembers, member, projectGuestInvitations, projects, teamInvitations } from '../../../db/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { auth } from '../../../lib/auth'
import { genId } from '../../../utils/projects'
import { isCrewUser } from '../../../utils/crewAccounts'
import { hashInvitationToken, INVITATION_COOKIE } from '../../../utils/customers'
import { lookupAddressedInvitation } from '../../../utils/invitations'
import { addressesOfUser } from '../../../utils/extraEmails'
import { guestProjectIdsOf } from '../../../utils/guests'
import { sharedProjectIds } from '../../../utils/sharedProjectIds'
import { acceptBoardGuest, claimPendingBoardInvites, claimTiedCustomerInvites } from '../../../utils/pendingInvites'

// Turns the signed-in account into a member of the invitation's team, a guest of its board, or a
// contact of its customer. A link is spent by the first account that accepts it; a team or board
// link only by the account with the address it was sent to.
export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) throw createError({ statusCode: 401, message: 'Sign in to accept this invitation' })

  // Crew accounts are contacts only where their crew provisioned them; no invitation
  // is ever theirs to spend, so the link stays unspent for someone else.
  if (await isCrewUser(session.user.id)) {
    throw createError({ statusCode: 403, message: 'Crew accounts cannot accept invitations.' })
  }

  const token = getRouterParam(event, 'token') ?? ''
  const now = Date.now()
  const tokenHash = hashInvitationToken(token)

  const addressed = await lookupAddressedInvitation(token)
  if (addressed === 'used' || addressed === 'expired') {
    throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })
  }
  if (addressed !== 'missing') {
    // Any verified address of the account counts: its main one or an extra one that was confirmed.
    if (!(await addressesOfUser(session.user.id)).includes(addressed.email)) {
      // The address is not repeated here: the person who was invited knows it.
      throw createError({
        statusCode: 403,
        message: 'This invitation was sent to another address than the one of the account you are signed in with. Sign in with the invited address to accept it.'
      })
    }

    if (addressed.kind === 'team') {
      const [claimed] = await db
        .update(teamInvitations)
        .set({ acceptedBy: session.user.id, acceptedAt: now })
        .where(and(
          eq(teamInvitations.tokenHash, tokenHash),
          isNull(teamInvitations.acceptedAt),
          isNull(teamInvitations.revokedAt),
          gt(teamInvitations.expiresAt, now)
        ))
        .returning({ organizationId: teamInvitations.organizationId, role: teamInvitations.role })
      if (!claimed) throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })

      const [already] = await db.select({ id: member.id }).from(member)
        .where(and(eq(member.organizationId, claimed.organizationId), eq(member.userId, session.user.id)))
      if (!already) {
        await db.insert(member).values({
          id: genId(),
          organizationId: claimed.organizationId,
          userId: session.user.id,
          role: claimed.role,
          createdAt: new Date()
        })
      }
      deleteCookie(event, INVITATION_COOKIE, { path: '/' })
      return { ok: true, kind: 'team' as const, organizationId: claimed.organizationId }
    }

    const [claimed] = await db
      .update(projectGuestInvitations)
      .set({ status: 'accepted', acceptedBy: session.user.id, acceptedAt: now })
      .where(and(
        eq(projectGuestInvitations.tokenHash, tokenHash),
        eq(projectGuestInvitations.status, 'open'),
        gt(projectGuestInvitations.expiresAt, now)
      ))
      .returning({
        projectId: projectGuestInvitations.projectId,
        role: projectGuestInvitations.role,
        allowedDomain: projectGuestInvitations.allowedDomain,
        invitedBy: projectGuestInvitations.invitedBy
      })
    if (!claimed) throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })

    await acceptBoardGuest(claimed, session.user.id, now)
    deleteCookie(event, INVITATION_COOKIE, { path: '/' })
    return { ok: true, kind: 'board' as const, projectId: claimed.projectId }
  }

  // Claimed in one statement, so two people opening the same link at once
  // cannot both get in on it.
  const [claimed] = await db
    .update(customerInvitations)
    .set({ acceptedBy: session.user.id, acceptedAt: now })
    .where(and(
      eq(customerInvitations.tokenHash, tokenHash),
      isNull(customerInvitations.acceptedAt),
      gt(customerInvitations.expiresAt, now)
    ))
    .returning({ customerId: customerInvitations.customerId })

  if (!claimed) throw createError({ statusCode: 410, message: 'This invitation is no longer valid' })

  await db
    .insert(customerMembers)
    .values({ id: genId(), customerId: claimed.customerId, userId: session.user.id, createdAt: now })
    .onConflictDoNothing()

  // The owner's rule: a board invitation already sent to this account's address is accepted by itself now.
  await claimPendingBoardInvites(session.user.id, await addressesOfUser(session.user.id), now)
  // The same for a customer link tied to one of the account's addresses (the owner's rule).
  await claimTiedCustomerInvites(session.user.id, await addressesOfUser(session.user.id), now)

  // The projects shared with this person as a customer contact: the customer's own projects and the boards they
  // hold as a guest. The landing opens the one or lists the several (see utils/inviteLanding).
  const customerShared = await db.select({ id: projects.id }).from(projects).where(eq(projects.customerId, claimed.customerId))
  const guestShared = await guestProjectIdsOf(session.user.id)

  deleteCookie(event, INVITATION_COOKIE, { path: '/' })
  return { ok: true, kind: 'customer' as const, sharedProjectIds: sharedProjectIds(customerShared.map(project => project.id), guestShared) }
})
