import { db } from '../../../db'
import { teamSettings } from '../../../db/schema'
import { requireTeamRole } from '../../../utils/auth-helpers'
import { readRateLimits } from '../../../utils/rateLimits'

// Sets this team's rate limits on agent calls. They add to the instance's: a limit here tightens, never loosens.
// Owners and admins only. A kind sent as null goes back to the instance's limit.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const limits = readRateLimits(await readBody(event))
  const now = Date.now()
  await db.insert(teamSettings)
    .values({ teamId, rateLimits: limits, updatedAt: now })
    .onConflictDoUpdate({ target: teamSettings.teamId, set: { rateLimits: limits, updatedAt: now } })
  return { limits }
})
