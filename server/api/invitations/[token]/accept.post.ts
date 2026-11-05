import { db } from '../../../db'
import { customerInvitations, customerMembers, member, projectGuestInvitations, projectGuests, projects, teamInvitations } from '../../../db/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { auth } from '../../../lib/auth'
import { genId } from '../../../utils/projects'
import { isCrewUser } from '../../../utils/crewAccounts'
import { hashInvitationToken, INVITATION_COOKIE } from '../../../utils/customers'
import { lookupAddressedInvitation } from '../../../utils/invitations'
import { publish, workspaceTopic } from '../../../utils/realtime'

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
    if (session.user.email.trim().toLowerCase() !== addressed.email) {
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

    const [board] = await db.select({ userId: projects.userId, teamId: projects.teamId }).from(projects).where(eq(projects.id, claimed.projectId))
    // Someone already on the board's team has all the access a guest would get.
    const [onTeam] = board?.teamId
      ? await db.select({ id: member.id }).from(member)
          .where(and(eq(member.organizationId, board.teamId), eq(member.userId, session.user.id)))
      : []
    if (!onTeam && board && board.userId !== session.user.id) {
      await db.insert(projectGuests).values({
        id: genId(),
        projectId: claimed.projectId,
        userId: session.user.id,
        role: claimed.role,
        allowedDomain: claimed.role === 'manager' ? claimed.allowedDomain : null,
        addedBy: claimed.invitedBy,
        createdAt: now
      }).onConflictDoNothing()
    }
    if (board) {
      await publish(workspaceTopic(board.userId, board.teamId), { type: 'board', projectId: claimed.projectId }).catch(() => {})
    }
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

  deleteCookie(event, INVITATION_COOKIE, { path: '/' })
  return { ok: true, kind: 'customer' as const }
})
