import { desc, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { teamRuleRuns } from '../../../../../db/schema'
import { requireTeamRole } from '../../../../../utils/auth-helpers'
import { RUN_PAGE_SIZE, runView } from '../../../../../utils/ruleStore'
import { findTeamRuleRow } from '../../../../../utils/teamRuleStore'

// A team rule's run log: one row per firing on a board, newest first, at most RUN_PAGE_SIZE rows.
// Any member of the team may read it.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId, ['owner', 'admin', 'member'])
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findTeamRuleRow(teamId, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  const runs = await db.select().from(teamRuleRuns).where(eq(teamRuleRuns.ruleId, row.id)).orderBy(desc(teamRuleRuns.createdAt)).limit(RUN_PAGE_SIZE)
  return { rule: { id: row.id, name: row.name }, runs: runs.map(runView) }
})
