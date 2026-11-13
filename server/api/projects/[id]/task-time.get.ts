import { sql, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { timeEntries } from '../../../db/schema'
import { routeStaffProject } from '../../../utils/projectResources'

// The minutes logged on each task of the board, from everyone on the team, all days. The List view's Time column
// reads it; a board's time for one week stays on /time.
export default defineEventHandler(async (event) => {
  const project = await routeStaffProject(event)
  const rows = await db
    .select({ taskId: timeEntries.taskId, minutes: sql<string>`sum(${timeEntries.minutes})` })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, project.id))
    .groupBy(timeEntries.taskId)
  return Object.fromEntries(rows.map(row => [row.taskId, Number(row.minutes)]))
})
