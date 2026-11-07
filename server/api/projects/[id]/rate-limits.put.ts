import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { mayManageBoardCrews } from '../../../utils/crewPermission'
import { readRateLimits } from '../../../utils/rateLimits'
import { requireProject, requireStaff } from '../../../utils/projects'

// Sets this board's rate limits on agent calls. They add to the team's and the instance's: a limit here tightens only.
// The team owner or admin, or a manager of the board, may set it. A kind sent as null goes back to the team's and instance's.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)
  if (!(await mayManageBoardCrews(event.context.session.user.id, id))) {
    throw createError({ statusCode: 403, message: 'Only the team owner or admin, or a manager of this board, can change this.' })
  }
  const limits = readRateLimits(await readBody(event))
  await db.update(projects).set({ rateLimits: limits }).where(eq(projects.id, id))
  return { limits }
})
