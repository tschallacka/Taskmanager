import { count, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamRules } from '../../../../db/schema'
import { genId } from '../../../../utils/projects'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { validateTeamRule } from '../../../../utils/teamRuleSpec'
import { loadTeamRuleFrame, nextTeamRulePosition, teamRuleLimitMessage, teamRuleValues, teamRuleView } from '../../../../utils/teamRuleStore'

// Adds a rule at the end of the team's list. Owners and admins only. The team rule model checks it;
// a rule that does not pass is refused with every sentence that says what to fix.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const userId = event.context.session.user.id
  const body = await readBody(event)

  const [counted] = await db.select({ total: count() }).from(teamRules).where(eq(teamRules.teamId, teamId))
  const limit = teamRuleLimitMessage(counted?.total ?? 0)
  if (limit) throw createError({ statusCode: 400, message: limit })

  const frame = await loadTeamRuleFrame(teamId, userId)
  const checked = validateTeamRule(body, frame.context)
  if (!checked.ok) {
    throw createError({ statusCode: 400, message: checked.problems.join(' '), data: { problems: checked.problems } })
  }

  const now = Date.now()
  const [created] = await db.insert(teamRules).values({
    id: genId(),
    teamId,
    ...teamRuleValues(checked.rule),
    position: await nextTeamRulePosition(teamId),
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  }).returning()

  return teamRuleView(created!, frame.personName, null)
})
