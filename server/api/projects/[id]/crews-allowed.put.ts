import { createError } from 'h3'
import { mayManageBoardCrews, readCrewsAllowed, setBoardCrews, teamCrewsAllowed, instanceCrewsAllowed } from '../../../utils/crewPermission'
import { requireProject, requireStaff } from '../../../utils/projects'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { eq } from 'drizzle-orm'

// Allows or denies crews on this board. Turning it on is refused while the team or the instance does not allow crews
// (each level only narrows the one above). A team owner or admin, or a manager of the board, may change it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)
  const userId = event.context.session.user.id
  if (!(await mayManageBoardCrews(userId, id))) {
    throw createError({ statusCode: 403, message: 'Only the team owner or admin, or a manager of this board, can change this.' })
  }
  const crewsAllowed = readCrewsAllowed(await readBody(event))
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, id))
  if (crewsAllowed && !((await instanceCrewsAllowed()) && (row?.teamId ? await teamCrewsAllowed(row.teamId) : false))) {
    throw createError({ statusCode: 403, message: 'Your admin or the team has not allowed crews, so this board cannot allow them.' })
  }
  await setBoardCrews(id, crewsAllowed)
  return { crewsAllowed }
})
