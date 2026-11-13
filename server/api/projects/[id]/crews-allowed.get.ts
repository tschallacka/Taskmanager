import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { projects } from '../../../db/schema'
import { requireProject, requireStaff } from '../../../utils/projects'
import { crewPermissionRefusal, instanceCrewsAllowed, teamCrewsAllowed } from '../../../utils/crewPermission'

// The board level of the crew permission, with the team and instance levels above it, for the board's settings.
// `refusal` is the one sentence the crew permission gives this person for this board (null when crews may be made):
// the management token window shows it instead of its button, and the make route refuses with the same sentence.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const project = await requireProject(event, id)
  requireStaff(project)
  const [row] = await db.select({ teamId: projects.teamId, crewsAllowed: projects.crewsAllowed }).from(projects).where(eq(projects.id, id))
  return {
    crewsAllowed: Boolean(row?.crewsAllowed),
    teamAllowed: row?.teamId ? await teamCrewsAllowed(row.teamId) : false,
    instanceAllowed: await instanceCrewsAllowed(),
    refusal: await crewPermissionRefusal(event.context.session.user.id, id)
  }
})
