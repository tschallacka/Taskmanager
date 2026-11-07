import { requireTeamRole } from '../../../utils/auth-helpers'
import { instanceCrewsAllowed, readCrewsAllowed, setTeamCrews } from '../../../utils/crewPermission'

// Allows or denies crews for this team's boards. Only where the instance allows crews. Owners and admins only.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const crewsAllowed = readCrewsAllowed(await readBody(event))
  if (crewsAllowed && !(await instanceCrewsAllowed())) {
    throw createError({ statusCode: 403, message: 'Your admin has not allowed crews on this instance.' })
  }
  await setTeamCrews(teamId, crewsAllowed)
  return { crewsAllowed }
})
