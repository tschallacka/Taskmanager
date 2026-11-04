import { requireTeamRole } from '../../../../../utils/auth-helpers'
import { findCrewLink, requireOwnCrew } from '../../../../../utils/crewBoards'
import { removeForks } from '../../../../../utils/crewForks'

// Removes the members forked for this board, with their keys and sessions. The crew stays on the board.
// Owners and admins only, and only for a crew they made themselves.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const link = await findCrewLink(teamId, getRouterParam(event, 'linkId')!)
  if (!link) throw createError({ statusCode: 404, message: 'No such crew link.' })
  await requireOwnCrew(link.crewId, event.context.session.user.id)
  await removeForks(link.id)
  return { ok: true }
})
