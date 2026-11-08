import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { member, user } from '../db/schema'

/** Owner or admin of a team, the role words the team settings use (a person may hold several, comma-separated). */
export function isTeamManagerRole(role: string): boolean {
  return role.split(',').some(part => part.trim() === 'owner' || part.trim() === 'admin')
}

/**
 * Whether a person is an admin of a board: an instance admin, or an owner or admin of the board's team.
 * The board backup uses it to decide who gets the sensitive material, and the board import uses the same
 * check, so the two cannot disagree about who may see or set it.
 */
export async function isBoardAdmin(userId: string, board: { teamId: string | null }): Promise<boolean> {
  const [me] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  if (me?.isInstanceAdmin) return true
  if (!board.teamId) return false
  const [row] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, board.teamId), eq(member.userId, userId)))
  return !!row && isTeamManagerRole(row.role)
}
