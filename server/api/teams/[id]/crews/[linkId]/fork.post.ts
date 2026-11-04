import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { projects } from '../../../../../db/schema'
import { requireTeamRole } from '../../../../../utils/auth-helpers'
import { findCrewLink, requireOwnCrew } from '../../../../../utils/crewBoards'
import { forkCrew } from '../../../../../utils/crewForks'

// Forks the crew's working members for this board: each gets an account named for the board and a key
// limited to the crew's shadow board. With `rotate: true` the existing forks get new passwords and keys.
// Owners and admins only, and only for a crew they made themselves. The secrets are in this answer, once.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  await requireTeamRole(event, teamId)
  const userId = event.context.session.user.id
  const link = await findCrewLink(teamId, getRouterParam(event, 'linkId')!)
  if (!link) throw createError({ statusCode: 404, message: 'No such crew link.' })
  const crew = await requireOwnCrew(link.crewId, userId)
  const body = await readBody<{ rotate?: unknown }>(event).catch(() => ({} as { rotate?: unknown }))
  if (body?.rotate !== undefined && typeof body.rotate !== 'boolean') {
    throw createError({ statusCode: 400, message: 'rotate must be true or false.' })
  }

  const [board] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, link.projectId))
  const members = await forkCrew({ crew, link, boardName: board?.name ?? 'board', rotate: body?.rotate === true })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    base: (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, ''),
    crew: { slug: crew.slug, name: crew.name },
    board: { id: link.projectId, name: board?.name ?? '' },
    shadowBoard: { id: link.shadowProjectId },
    members
  }
})
