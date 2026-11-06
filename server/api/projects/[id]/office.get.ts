import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../../db'
import { projectColumns, projectTasks, taskComments } from '../../../db/schema'
import { requireProject } from '../../../utils/projects'
import { commentVisibilityFilter, taskVisibilityFilter } from '../../../utils/auth-helpers'
import { officeCastOf } from '../../../utils/officeCast'
import { stageOf } from '../../../../shared/office/model'
import type { OfficeSnapshot, OfficeTask } from '../../../../shared/office/model'

// The office view of a board: every live top-level task with the stage its column stands for, and
// the people who carry the folders. Read-only, so the staff of a real board may watch its shadow board.
// A board without a crew answers 404, like a board the visitor cannot see.
export default defineEventHandler(async (event): Promise<OfficeSnapshot> => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)

  const columns = await db
    .select({ id: projectColumns.id, name: projectColumns.name })
    .from(projectColumns)
    .where(and(eq(projectColumns.projectId, project.id), isNull(projectColumns.deletedAt)))
    .orderBy(asc(projectColumns.position))
  const columnName = new Map(columns.map(c => [c.id, c.name]))

  const rows = columns.length
    ? await db
        .select({
          id: projectTasks.id,
          title: projectTasks.title,
          columnId: projectTasks.columnId,
          assigneeId: projectTasks.assigneeId,
          completedAt: projectTasks.completedAt
        })
        .from(projectTasks)
        .where(and(
          inArray(projectTasks.columnId, columns.map(c => c.id)),
          isNull(projectTasks.deletedAt),
          isNull(projectTasks.parentTaskId),
          taskVisibilityFilter(project.audience)
        ))
        .orderBy(asc(projectTasks.position))
    : []

  const counts = rows.length
    ? await db
        .select({ taskId: taskComments.taskId, total: count() })
        .from(taskComments)
        .where(and(inArray(taskComments.taskId, rows.map(t => t.id)), commentVisibilityFilter(project.audience)))
        .groupBy(taskComments.taskId)
    : []
  const commentsOf = new Map(counts.map(c => [c.taskId, Number(c.total)]))

  const tasks: OfficeTask[] = rows.map((row) => {
    const column = columnName.get(row.columnId) ?? ''
    const stage = stageOf(column)
    return {
      id: row.id,
      title: row.title,
      stage,
      column,
      assigneeId: row.assigneeId,
      completed: row.completedAt !== null,
      blocked: stage === 'blocked',
      comments: commentsOf.get(row.id) ?? 0
    }
  })

  const assignees = [...new Set(tasks.map(t => t.assigneeId).filter((id): id is string => Boolean(id)))]
  const { crewName, cast, seats } = await officeCastOf(project.id, assignees)
  // A task on a crew's own account reads at the desk of the fork that is that same person.
  for (const task of tasks) {
    const seat = task.assigneeId ? seats[task.assigneeId] : undefined
    if (seat) task.assigneeId = seat
  }
  // The office is a crew's. A board nobody works on has no room to show; the reason lets the page say so.
  if (!crewName) throw createError({ statusCode: 404, statusMessage: 'No crew works on this board', data: { reason: 'no-crew' } })
  return { boardId: project.id, boardName: project.name, crewName, cast, tasks }
})
