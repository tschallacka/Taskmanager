// The crew monitor on the server: the board's tasks, read once, and the status of each crew member from them (the rule is
// in boardStatus.ts). The office's desk lights take their status from here.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import { projectColumns, projectTasks } from '../db/schema'
import { stageOf } from '../../shared/office/model'
import { boardStatusOf } from './boardStatus'
import type { MonitorTask } from './boardStatus'
import type { DeskStatusSource } from './deskStatus'

/** The live tasks of a board, with each one's column stage, for the monitor's rule. */
export async function boardTasksForMonitor(projectId: string): Promise<MonitorTask[]> {
  const columns = await db
    .select({ id: projectColumns.id, name: projectColumns.name })
    .from(projectColumns)
    .where(and(eq(projectColumns.projectId, projectId), isNull(projectColumns.deletedAt)))
  if (!columns.length) return []
  const columnName = new Map(columns.map(c => [c.id, c.name]))
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      columnId: projectTasks.columnId,
      assigneeId: projectTasks.assigneeId,
      parentTaskId: projectTasks.parentTaskId,
      completedAt: projectTasks.completedAt
    })
    .from(projectTasks)
    .where(and(inArray(projectTasks.columnId, columns.map(c => c.id)), isNull(projectTasks.deletedAt)))
  return rows.map((row) => {
    const column = columnName.get(row.columnId) ?? ''
    return {
      id: row.id,
      title: row.title,
      stage: stageOf(column),
      column,
      assigneeId: row.assigneeId,
      parentTaskId: row.parentTaskId,
      completed: row.completedAt !== null
    }
  })
}

/** The status source for one board: each person's busy or idle, read from its tasks once. */
export async function boardStatusSource(projectId: string): Promise<DeskStatusSource> {
  const tasks = await boardTasksForMonitor(projectId)
  return {
    async statusOf(person) {
      return person.userId ? boardStatusOf(person.userId, tasks) : null
    }
  }
}
