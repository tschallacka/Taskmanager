import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { member, projectGuestInvitations, projectGuests, projects } from '../db/schema'
import { genId } from './projects'
import { publish, workspaceTopic } from './realtime'
import { invitesToClaim } from './pendingInviteRules'

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
