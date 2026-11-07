import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { requireProject, requireStaff } from '../../../utils/projects'
import { instanceCrewsAllowed, teamCrewsAllowed } from '../../../utils/crewPermission'

// The board level of the crew permission, with the team and instance levels above it, for the board's settings.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)
  const [row] = await db.select({ teamId: projects.teamId, crewsAllowed: projects.crewsAllowed }).from(projects).where(eq(projects.id, id))
  return {
    crewsAllowed: Boolean(row?.crewsAllowed),
    teamAllowed: row?.teamId ? await teamCrewsAllowed(row.teamId) : false,
    instanceAllowed: await instanceCrewsAllowed()
  }
})
