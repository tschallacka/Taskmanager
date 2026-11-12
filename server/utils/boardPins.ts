import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { boardPins, customers, organization, projects } from '../db/schema'
import { hiddenCrewShadows } from './boardTree'
import { reachOf, workspaceTeam } from './workspaces'

/** A pinned board, with the workspace it opens in: a team, or the personal workspace (null). */
export interface PinnedBoard {
  projectId: string
  name: string
  customerName: string | null
  teamId: string | null
  teamName: string | null
}

/** The person's pins, oldest first; archived boards and boards they can no longer open are left out. */
export async function listPins(userId: string): Promise<PinnedBoard[]> {
  const { teamIds, filter } = await reachOf(userId)
  const rows = await db
    .select({
      projectId: projects.id,
      name: projects.name,
      teamId: projects.teamId,
      teamName: organization.name,
      customerName: customers.name
    })
    .from(boardPins)
    .innerJoin(projects, eq(projects.id, boardPins.projectId))
    .leftJoin(organization, eq(organization.id, projects.teamId))
    .leftJoin(customers, eq(customers.id, projects.customerId))
    .where(and(eq(boardPins.userId, userId), isNull(projects.archivedAt), filter))
    .orderBy(asc(boardPins.createdAt))

  const hidden = await hiddenCrewShadows(userId, rows.map(row => row.projectId))
  return rows.filter(row => !hidden.has(row.projectId)).map((row) => {
    const teamId = workspaceTeam(teamIds, row.teamId)
    return { ...row, teamId, teamName: teamId ? row.teamName : null }
  })
}

/** The most boards one person can have pinned at once: the sidebar's Pinned group holds eight. */
export const PIN_LIMIT = 8

/** Pins a board the person can open; 404 for any other, so a foreign id says nothing. A ninth pin is refused with 409. */
export async function pinBoard(userId: string, projectId: string) {
  const { filter } = await reachOf(userId)
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), filter))
  if (!project || (await hiddenCrewShadows(userId, [projectId])).has(projectId)) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  const pinned = await db.select({ projectId: boardPins.projectId }).from(boardPins).where(eq(boardPins.userId, userId))
  if (pinned.some(pin => pin.projectId === projectId)) return
  if (pinned.length >= PIN_LIMIT) {
    throw createError({ statusCode: 409, message: 'Eight boards are pinned already. Unpin one to pin another.' })
  }
  await db.insert(boardPins).values({ userId, projectId, createdAt: Date.now() }).onConflictDoNothing()
}

export async function unpinBoard(userId: string, projectId: string) {
  await db.delete(boardPins).where(and(eq(boardPins.userId, userId), eq(boardPins.projectId, projectId)))
}
