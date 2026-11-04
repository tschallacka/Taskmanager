// "Notify when tasks are added": a person asks to hear about every new task on a board, and each task
// that is added reaches them through the ordinary notification path, so what they may not read is dropped.
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectWatchers, projects, user } from '../db/schema'
import { notify } from './notifications'

export async function isWatching(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: projectWatchers.userId }).from(projectWatchers)
    .where(and(eq(projectWatchers.projectId, projectId), eq(projectWatchers.userId, userId)))
  return Boolean(row)
}

export async function setWatching(projectId: string, userId: string, watching: boolean): Promise<void> {
  if (watching) {
    await db.insert(projectWatchers).values({ projectId, userId, createdAt: Date.now() }).onConflictDoNothing()
  } else {
    await db.delete(projectWatchers).where(and(eq(projectWatchers.projectId, projectId), eq(projectWatchers.userId, userId)))
  }
}

/** A task was added to a board: tell the people who asked, except whoever added it. */
export async function notifyWatchersOfTask(
  board: { id: string },
  task: { id: string, title: string, visibility: 'internal' | 'customer' },
  actorId: string | null
): Promise<void> {
  const watchers = await db.select({ userId: projectWatchers.userId }).from(projectWatchers).where(eq(projectWatchers.projectId, board.id))
  if (!watchers.length) return
  const [project] = await db.select({ id: projects.id, name: projects.name, userId: projects.userId, teamId: projects.teamId, customerId: projects.customerId })
    .from(projects).where(eq(projects.id, board.id))
  if (!project) return
  const [actor] = actorId ? await db.select({ name: user.name }).from(user).where(eq(user.id, actorId)) : []
  await notify({
    project,
    task,
    actorId,
    type: 'task_added',
    recipients: watchers.map(watcher => watcher.userId),
    title: `${actor?.name ?? 'Someone'} added "${task.title}" to ${project.name}`
  })
}
