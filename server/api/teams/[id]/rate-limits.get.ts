import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { teamSettings } from '../../../db/schema'
import { requireTeamRole } from '../../../utils/auth-helpers'

// This team's own rate limits (the ones it set); owners and admins only.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const [row] = await db.select({ rateLimits: teamSettings.rateLimits }).from(teamSettings).where(eq(teamSettings.teamId, teamId))
  return { limits: row?.rateLimits ?? {} }
})
