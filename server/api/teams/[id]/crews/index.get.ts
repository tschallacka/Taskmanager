import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { projects } from '../../../../db/schema'
import { requireTeamRole } from '../../../../utils/auth-helpers'
import { crewLinksOfTeam, crewsToAttach } from '../../../../utils/crewBoards'

// The crews working on this team's boards, and for an owner or admin what they may attach: the
// crews they made and the team's boards. Any member sees the links (the team is staff on its boards).
export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'id')!
  const membership = await requireTeamRole(event, teamId, ['owner', 'admin', 'member'])
  const canAttach = ['owner', 'admin'].includes(membership.role)

  const links = await crewLinksOfTeam(teamId, event.context.session.user.id)
  if (!canAttach) return { links, canAttach, crews: [], boards: [] }

  const [crews, boards] = await Promise.all([
    crewsToAttach(event.context.session.user.id),
    db.select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.teamId, teamId), isNull(projects.archivedAt)))
      .orderBy(asc(projects.name))
  ])
  return { links, canAttach, crews, boards }
})
