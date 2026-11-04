import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamRules } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { findTeamRuleRow } from '../../../../utils/teamRuleStore'

// Deletes a team rule. Its run log goes with it (the runs cascade). Owners and admins only.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findTeamRuleRow(teamId, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  await db.delete(teamRules).where(eq(teamRules.id, row.id))
  return { ok: true }
})
