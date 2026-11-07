import { readCrewsAllowed, setInstanceCrews } from '../../utils/crewPermission'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'

// Allows or denies crews on this instance. Turning it off disables every crew; a rotate turns one back on.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const crewsAllowed = readCrewsAllowed(await readBody(event))
  await setInstanceCrews(crewsAllowed, event.context.session.user.id)
  return { crewsAllowed }
})
