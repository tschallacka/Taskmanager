import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { projects } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { crewLinksOfTeam, crewsToAttach } from '../../../../utils/crewBoards'
import { forksOfLink } from '../../../../utils/crewForks'

// The crews working on this team's boards with the members forked for each, and for an owner or admin what
// they may attach: the crews they made and the team's boards. Any member sees the links (the team is
// staff on its boards). `mine` says the caller made the crew, which is who may fork it or take it off.
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const userId = event.context.session.user.id
  const membership = await requireTeamRole(event, teamId, ['owner', 'admin', 'member'])
  const canAttach = ['owner', 'admin'].includes(membership.role)

  const [rows, crews] = await Promise.all([crewLinksOfTeam(teamId, userId), crewsToAttach(userId)])
  const own = new Set(crews.map(crew => crew.id))
  const links = await Promise.all(rows.map(async link => ({
    ...link,
    mine: canAttach && own.has(link.crewId),
    forks: await forksOfLink(link.id)
  })))
  if (!canAttach) return { links, canAttach, crews: [], boards: [] }

  const boards = await db.select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.teamId, teamId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name))
  return { links, canAttach, crews, boards }
})
