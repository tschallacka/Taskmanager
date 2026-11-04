import { requireTeamRole } from '../../../../utils/auth-helpers'
import { lastTeamRunOf, loadTeamRuleFrame, loadTeamRules, teamRuleView } from '../../../../utils/teamRuleStore'

// The team's rules in the order they run, each with its plain sentence and its last run, and the people
// a rule may name. Any member may read them.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const membership = await requireTeamRole(event, teamId, ['owner', 'admin', 'member'])
  const frame = await loadTeamRuleFrame(teamId, event.context.session.user.id)
  const rows = await loadTeamRules(teamId)

  const rules = await Promise.all(rows.map(async row => teamRuleView(row, frame.personName, await lastTeamRunOf(row.id))))
  return {
    rules,
    people: frame.people.map(person => ({ id: person.id, name: person.name })),
    canManage: ['owner', 'admin'].includes(membership.role),
    mayChangeVisibility: frame.context.mayChangeVisibility
  }
})
