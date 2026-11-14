import { requireTeamRole } from '../../../utils/auth-helpers'
import { CREW_SENTENCES, instanceCrewsAllowed, teamCrewsAllowed } from '../../../utils/crewPermission'

// The team level of the crew permission, and the instance level above it. Owners and admins only. `refusal` is the one
// sentence to show where crews are off (the instance's first, then the team's), or null when a crew may be made here.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const crewsAllowed = await teamCrewsAllowed(teamId)
  const instanceAllowed = await instanceCrewsAllowed()
  const refusal = !instanceAllowed ? CREW_SENTENCES.instance : !crewsAllowed ? CREW_SENTENCES.team : null
  return { crewsAllowed, instanceAllowed, refusal }
})
