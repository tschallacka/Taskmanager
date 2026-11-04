import { requireTeamRole } from '../../../../utils/auth-helpers'
import { attachCrew, requireOwnCrew } from '../../../../utils/crewBoards'

// "Give it a crew": makes the crew's shadow board for one of this team's boards and links the two.
// Owners and admins only, and only with a crew they made themselves.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const userId = event.context.session.user.id
  const body = await readBody<{ crewId?: unknown, projectId?: unknown }>(event)

  const crew = await requireOwnCrew(body?.crewId, userId)
  const link = await attachCrew({ crew, projectId: body?.projectId, teamId, userId })
  return { id: link.id, crewId: crew.id, projectId: link.projectId, shadowProjectId: link.shadowProjectId }
})
