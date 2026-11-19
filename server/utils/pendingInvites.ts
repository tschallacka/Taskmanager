import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { customerInvitations, customerMembers, member, projectGuestInvitations, projectGuests, projects, teamInvitations } from '../db/schema'
import { genId } from './projects'
import { publish, workspaceTopic } from './realtime'
import { invitesToClaim } from './pendingInviteRules'
import { customerInvitesToClaim } from './customerInviteRules'

/**
 * The owner's rule for customers too: an open link tied to one of the account's addresses is accepted by itself, and
 * the account becomes a contact of that customer. Anonymous links are never claimed here.
 */
export async function claimTiedCustomerInvites(userId: string, addresses: string[], now: number): Promise<void> {
  if (!addresses.length) return
  const lowered = addresses.map(address => address.toLowerCase())
  const rows = await db
    .select({ id: customerInvitations.id, email: customerInvitations.email, acceptedAt: customerInvitations.acceptedAt, revokedAt: customerInvitations.revokedAt, expiresAt: customerInvitations.expiresAt, customerId: customerInvitations.customerId })
    .from(customerInvitations)
    .where(and(
      gt(customerInvitations.expiresAt, now),
      inArray(sql`lower(${customerInvitations.email})`, lowered)
    ))
  const ids = customerInvitesToClaim(rows, addresses, now)
  for (const id of ids) {
    // One statement per link, so two requests cannot both take it.
    const [done] = await db
      .update(customerInvitations)
      .set({ acceptedBy: userId, acceptedAt: now })
      .where(and(eq(customerInvitations.id, id), sql`${customerInvitations.acceptedAt} is null`))
      .returning({ customerId: customerInvitations.customerId })
    if (done) {
      await db.insert(customerMembers).values({ id: genId(), customerId: done.customerId, userId, createdAt: now }).onConflictDoNothing()
    }
  }
}

// The owner's rule: one email can be invited to several boards, and a follow-up invitation to an account that already
// exists is accepted by itself. Every open board invitation sent to one of the account's addresses is claimed when the
// account accepts a customer invitation (or the invite page counts what is shared with it).

type GuestInvite = { projectId: string, role: 'editor' | 'manager', allowedDomain: string | null, invitedBy: string | null }

// Open, unexpired board invitations to these addresses (case does not matter).
async function openInvitesTo(addresses: string[], now: number) {
  const lowered = addresses.map(address => address.toLowerCase())
  return db
    .select({
      id: projectGuestInvitations.id,
      email: projectGuestInvitations.email,
      status: projectGuestInvitations.status,
      expiresAt: projectGuestInvitations.expiresAt,
      projectId: projectGuestInvitations.projectId,
      role: projectGuestInvitations.role,
      allowedDomain: projectGuestInvitations.allowedDomain,
      invitedBy: projectGuestInvitations.invitedBy
    })
    .from(projectGuestInvitations)
    .where(and(
      eq(projectGuestInvitations.status, 'open'),
      gt(projectGuestInvitations.expiresAt, now),
      inArray(sql`lower(${projectGuestInvitations.email})`, lowered)
    ))
}

/** The write path of one guest invitation: a guest row on the board, unless the person is already on its team or owns it. */
export async function acceptBoardGuest(invite: GuestInvite, userId: string, now: number): Promise<void> {
  const [board] = await db.select({ userId: projects.userId, teamId: projects.teamId }).from(projects).where(eq(projects.id, invite.projectId))
  // Someone already on the board's team has all the access a guest would get.
  const [onTeam] = board?.teamId
    ? await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, board.teamId), eq(member.userId, userId)))
    : []
  if (!onTeam && board && board.userId !== userId) {
    await db.insert(projectGuests).values({
      id: genId(),
      projectId: invite.projectId,
      userId,
      role: invite.role,
      allowedDomain: invite.role === 'manager' ? invite.allowedDomain : null,
      addedBy: invite.invitedBy,
      createdAt: now
    }).onConflictDoNothing()
  }
  if (board) {
    await publish(workspaceTopic(board.userId, board.teamId), { type: 'board', projectId: invite.projectId }).catch(() => {})
  }
}

/** The projects with an open invitation to these addresses, each once: the invite page counts them as shared. */
export async function pendingBoardProjectIdsFor(addresses: string[], now: number): Promise<string[]> {
  if (!addresses.length) return []
  const rows = await openInvitesTo(addresses, now)
  return [...new Set(rows.filter(row => row.status === 'open' && row.expiresAt > now).map(row => row.projectId))]
}

/**
 * How many open team and board invitations tied to these addresses the account has not accepted. The projects page
 * runs the sign-in claim when there is any, so an account with only a team or a board invite gets them accepted too.
 */
export async function countPendingTeamAndBoardInvites(addresses: string[], now: number): Promise<number> {
  if (!addresses.length) return 0
  const lowered = addresses.map(address => address.toLowerCase())
  const teams = await db
    .select({ acceptedAt: teamInvitations.acceptedAt, revokedAt: teamInvitations.revokedAt })
    .from(teamInvitations)
    .where(and(gt(teamInvitations.expiresAt, now), inArray(sql`lower(${teamInvitations.email})`, lowered)))
  const boards = invitesToClaim((await openInvitesTo(addresses, now)).map(row => ({ id: row.id, email: row.email, status: row.status, expiresAt: row.expiresAt })), addresses, now)
  return teams.filter(row => row.acceptedAt === null && row.revokedAt === null).length + boards.length
}

/**
 * The team's rule for sign-in: an open team invitation to one of the account's addresses is accepted by itself, and the
 * account becomes a member of that team with the invited role. A revoked or used invitation is never claimed.
 */
export async function claimPendingTeamInvites(userId: string, addresses: string[], now: number): Promise<void> {
  if (!addresses.length) return
  const lowered = addresses.map(address => address.toLowerCase())
  const rows = await db
    .select({ id: teamInvitations.id, email: teamInvitations.email, acceptedAt: teamInvitations.acceptedAt, revokedAt: teamInvitations.revokedAt, expiresAt: teamInvitations.expiresAt })
    .from(teamInvitations)
    .where(and(gt(teamInvitations.expiresAt, now), inArray(sql`lower(${teamInvitations.email})`, lowered)))
  const ids = rows.filter(row => row.acceptedAt === null && row.revokedAt === null).map(row => row.id)
  for (const id of ids) {
    // Claimed in one statement per invitation, so two requests cannot both take it.
    const [done] = await db
      .update(teamInvitations)
      .set({ acceptedBy: userId, acceptedAt: now })
      .where(and(eq(teamInvitations.id, id), sql`${teamInvitations.acceptedAt} is null`, sql`${teamInvitations.revokedAt} is null`))
      .returning({ organizationId: teamInvitations.organizationId, role: teamInvitations.role })
    if (!done) continue
    const [already] = await db.select({ id: member.id }).from(member)
      .where(and(eq(member.organizationId, done.organizationId), eq(member.userId, userId)))
    if (!already) {
      await db.insert(member).values({ id: genId(), organizationId: done.organizationId, userId, role: done.role, createdAt: new Date() })
    }
  }
}

/** Claims every open board invitation to these addresses: the invitation is accepted and the account becomes a guest. */
export async function claimPendingBoardInvites(userId: string, addresses: string[], now: number): Promise<void> {
  if (!addresses.length) return
  const rows = await openInvitesTo(addresses, now)
  const ids = invitesToClaim(rows.map(row => ({ id: row.id, email: row.email, status: row.status, expiresAt: row.expiresAt })), addresses, now)
  for (const id of ids) {
    // Claimed in one statement per invitation, so two requests cannot both take it.
    const [done] = await db
      .update(projectGuestInvitations)
      .set({ status: 'accepted', acceptedBy: userId, acceptedAt: now })
      .where(and(eq(projectGuestInvitations.id, id), eq(projectGuestInvitations.status, 'open')))
      .returning({ projectId: projectGuestInvitations.projectId, role: projectGuestInvitations.role, allowedDomain: projectGuestInvitations.allowedDomain, invitedBy: projectGuestInvitations.invitedBy })
    if (done) await acceptBoardGuest(done, userId, now)
  }
}
