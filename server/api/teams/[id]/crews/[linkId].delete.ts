import { requireTeamRole } from '../../../../utils/auth-helpers'
import { detachCrew, findCrewLink } from '../../../../utils/crewBoards'

// Takes a crew off a board: the link goes and the crew's shadow board is archived, not deleted.
// Owners and admins only. A link of another team is simply not found.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const link = await findCrewLink(teamId, getRouterParam(event, 'linkId')!)
  if (!link) throw createError({ statusCode: 404, message: 'No such crew link.' })
  await detachCrew(link)
  return { ok: true }
})
