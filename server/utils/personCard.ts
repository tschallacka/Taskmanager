// What one person may see of another: only people they share a board with, and on those boards only what
// their own audience reads. Behind the hover card, the "View profile" page and the Draft task window.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import { projects, projectTasks, user } from '../db/schema'
import { reachOf } from './workspaces'

export interface SharedBoard { id: string, name: string, /** The viewer works on it as staff, so may file work on it. */ staff: boolean }

export interface PersonView {
  person: { id: string, name: string, email: string | null, image: string | null }
  boards: SharedBoard[]
  tasks: { id: string, title: string, projectId: string, projectName: string, dueOn: string | null }[]
}

/** The boards both people can open, by name. Archived boards are left out. */
export async function sharedBoards(viewerId: string, targetId: string): Promise<SharedBoard[]> {
  const viewer = await reachOf(viewerId)
  const target = await reachOf(targetId)
  const rows = await db
    .select({ id: projects.id, name: projects.name, userId: projects.userId, teamId: projects.teamId })
    .from(projects)
    .where(and(viewer.filter, target.filter, isNull(projects.archivedAt)))
    .orderBy(asc(projects.name))
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    staff: row.teamId ? viewer.teamIds.has(row.teamId) : row.userId === viewerId
  }))
}

/** The person as the viewer may see them, or null when they share no board (a stranger is not found). */
export async function personView(viewerId: string, targetId: string): Promise<PersonView | null> {
  const [account] = await db.select({ id: user.id, name: user.name, email: user.email, image: user.image }).from(user).where(eq(user.id, targetId))
  if (!account) return null

  const boards = await sharedBoards(viewerId, targetId)
  if (!boards.length && viewerId !== targetId) return null

  // An address is shown to the people who work on a board with them, not to an outside reader.
  const email = viewerId === targetId || boards.some(board => board.staff) ? account.email : null

  const rows = boards.length
    ? await db
        .select({ id: projectTasks.id, title: projectTasks.title, projectId: projectTasks.projectId, dueOn: projectTasks.dueOn, visibility: projectTasks.visibility })
        .from(projectTasks)
        .where(and(
          inArray(projectTasks.projectId, boards.map(board => board.id)),
          eq(projectTasks.assigneeId, targetId),
          isNull(projectTasks.completedAt),
          isNull(projectTasks.deletedAt),
          isNull(projectTasks.parentTaskId)
        ))
        .orderBy(asc(projectTasks.dueOn))
        .limit(30)
    : []
  const byBoard = new Map(boards.map(board => [board.id, board]))
  const tasks = rows
    // On a board the viewer only reads as an outsider, what is marked private does not exist.
    .filter(row => byBoard.get(row.projectId)!.staff || row.visibility === 'customer')
    .map(row => ({ id: row.id, title: row.title, projectId: row.projectId, projectName: byBoard.get(row.projectId)!.name, dueOn: row.dueOn ?? null }))

  return { person: { id: account.id, name: account.name, email, image: account.image }, boards, tasks }
}
