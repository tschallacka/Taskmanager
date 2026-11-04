import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { teamRules } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { validateTeamRule } from '../../../../utils/teamRuleSpec'
import { findTeamRuleRow, lastTeamRunOf, loadTeamRuleFrame, storedTeamRule, teamRuleValues, teamRuleView } from '../../../../utils/teamRuleStore'

// Changes a team rule. Owners and admins only. Sending only `enabled` is the on/off switch and skips the
// checks, as for a board rule. Any other change is merged onto the stored rule and checked as a whole.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const userId = event.context.session.user.id
  const ruleId = getRouterParam(event, 'ruleId')!

  const row = await findTeamRuleRow(teamId, ruleId)
  if (!row) throw createError({ statusCode: 404, message: 'Rule not found' })

  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const frame = await loadTeamRuleFrame(teamId, userId)
  const now = Date.now()

  const keys = Object.keys(body)
  if (keys.length === 1 && keys[0] === 'enabled') {
    if (typeof body.enabled !== 'boolean') throw createError({ statusCode: 400, message: 'Say whether the rule is on or off' })
    const [updated] = await db.update(teamRules).set({ enabled: body.enabled, updatedAt: now }).where(eq(teamRules.id, row.id)).returning()
    return teamRuleView(updated!, frame.personName, await lastTeamRunOf(row.id))
  }

  const stored = storedTeamRule(row)
  const merged = {
    name: stored.name || undefined,
    enabled: stored.enabled,
    mode: stored.mode,
    trigger: stored.trigger,
    conditions: stored.conditions,
    actions: stored.actions,
    ...body
  }
  const checked = validateTeamRule(merged, frame.context)
  if (!checked.ok) {
    throw createError({ statusCode: 400, message: checked.problems.join(' '), data: { problems: checked.problems } })
  }

  const [updated] = await db.update(teamRules).set({ ...teamRuleValues(checked.rule), updatedAt: now }).where(eq(teamRules.id, row.id)).returning()
  return teamRuleView(updated!, frame.personName, await lastTeamRunOf(row.id))
})
