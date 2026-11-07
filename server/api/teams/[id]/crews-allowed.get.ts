import { requireTeamRole } from '../../../utils/auth-helpers'
import { instanceCrewsAllowed, teamCrewsAllowed } from '../../../utils/crewPermission'

// The team level of the crew permission, and the instance level above it. Owners and admins only.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  return { crewsAllowed: await teamCrewsAllowed(teamId), instanceAllowed: await instanceCrewsAllowed() }
})
