import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { requireProject, requireStaff } from '../../../utils/projects'

// This board's own rate limits (the ones it set), for the board's settings.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)
  const [row] = await db.select({ rateLimits: projects.rateLimits }).from(projects).where(eq(projects.id, id))
  return { limits: row?.rateLimits ?? {} }
})
