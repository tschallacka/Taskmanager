import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import { projectColumns, projectTasks, taskComments } from '../db/schema'
import type { Audience } from './auth-helpers'
import { commentVisibilityFilter, taskVisibilityFilter } from './auth-helpers'
import { officeCastOf } from './officeCast'
import { stageOf } from '../../shared/office/model'
import type { OfficeSnapshot, OfficeTask } from '../../shared/office/model'

// The office snapshot of a board: every live top-level task with the stage its column stands for, and
// the people who carry the folders. The office route and the crew_activity tool read it through this one
// function, so the office and Pia's view of who is busy cannot disagree. A board without a crew throws
// the 404 the office has always answered with: a board nobody works on has no room to show.
export async function officeSnapshotOf(project: { id: string, name: string, audience: Audience }): Promise<OfficeSnapshot> {
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
  const { crewName, cast } = await officeCastOf(project.id, assignees)
  if (!crewName) throw createError({ statusCode: 404, statusMessage: 'No crew works on this board', data: { reason: 'no-crew' } })
  return { boardId: project.id, boardName: project.name, crewName, cast, tasks }
}
