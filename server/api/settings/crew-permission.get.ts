import { instanceCrewsAllowed } from '../../utils/crewPermission'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'

// The instance level of the crew permission: whether the instance allows crews at all. Instance admin only.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  return { crewsAllowed: await instanceCrewsAllowed() }
})
