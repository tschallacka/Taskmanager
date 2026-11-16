import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { member, projectGuestInvitations, projectGuests, projects } from '../db/schema'
import { genId } from './projects'
import { invitesToClaim } from './pendingInviteRules'

/** How many open board invitations to these addresses could be claimed now (read only: the invite page counts them). */
export async function pendingBoardCountFor(addresses: string[], now: number): Promise<number> {
  if (!addresses.length) return 0
  const lowered = addresses.map(address => address.toLowerCase())
  const rows = await db
    .select({ id: projectGuestInvitations.id })
    .from(projectGuestInvitations)
    .where(and(
      eq(projectGuestInvitations.status, 'open'),
      gt(projectGuestInvitations.expiresAt, now),
      inArray(sql`lower(${projectGuestInvitations.email})`, lowered)
    ))
  return rows.length
}

// The owner's rule: one email can be invited to several boards, and a follow-up invitation to an account that already
// exists is accepted by itself. So every open board invitation sent to one of the account's addresses is claimed here,
// when the account accepts a customer invitation or signs in as an invited person.
export async function claimPendingBoardInvites(userId: string, addresses: string[], now: number): Promise<string[]> {
  if (!addresses.length) return []
  const lowered = addresses.map(address => address.toLowerCase())
  const rows = await db
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

  const ids = invitesToClaim(rows.map(row => ({ id: row.id, email: row.email, status: row.status, expiresAt: row.expiresAt })), addresses, now)
  const claimed: string[] = []
  for (const id of ids) {
    // Claimed in one statement per invitation, so two requests cannot both take it.
    const [done] = await db
      .update(projectGuestInvitations)
      .set({ status: 'accepted', acceptedBy: userId, acceptedAt: now })
      .where(and(eq(projectGuestInvitations.id, id), eq(projectGuestInvitations.status, 'open')))
      .returning({ projectId: projectGuestInvitations.projectId, role: projectGuestInvitations.role, allowedDomain: projectGuestInvitations.allowedDomain, invitedBy: projectGuestInvitations.invitedBy })
    if (!done) continue

    const [board] = await db.select({ userId: projects.userId, teamId: projects.teamId }).from(projects).where(eq(projects.id, done.projectId))
    // Someone already on the board's team, or its owner, has all the access a guest would get.
    const [onTeam] = board?.teamId
      ? await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, board.teamId), eq(member.userId, userId)))
      : []
    if (!onTeam && board && board.userId !== userId) {
      await db.insert(projectGuests).values({
        id: genId(),
        projectId: done.projectId,
        userId,
        role: done.role,
        allowedDomain: done.role === 'manager' ? done.allowedDomain : null,
        addedBy: done.invitedBy,
        createdAt: now
      }).onConflictDoNothing()
    }
    claimed.push(id)
  }
  return claimed
}
