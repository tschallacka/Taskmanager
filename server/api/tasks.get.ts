import { db } from '../db'
import { projects, projectTasks } from '../db/schema'
import { and, eq, asc, desc, inArray, isNull, or } from 'drizzle-orm'
import { getProjectAccessFilter } from '../utils/projects'
import { audienceFor, getUserActiveTeamId } from '../utils/auth-helpers'
import { treeNeighbours } from '../utils/boardTree'

// Flat task list across every accessible project — powers global search and
// deep links into boards without loading each board first.
export default defineEventHandler(async (event) => {
  const filter = await getProjectAccessFilter(event)
  const visibleProjects = await db
    .select({ id: projects.id, userId: projects.userId, teamId: projects.teamId })
    .from(projects)
    .where(filter)

  if (!visibleProjects.length) return []

  // A contact searches only what was shared with them; on the team's own
  // boards every task is theirs to find.
  const userId = event.context.session.user.id
  const teamId = await getUserActiveTeamId(event)
  // The crew shadow boards the list adds for the real board's staff are read as staff, as on the board page. The real
  // boards the list shows beside a crew's shadow are label rows only, so their tasks are never served here.
  // A crew's shadow board the person may not see (hiddenCrewShadows) is not searched either: the same rule as the list.
  const found = await treeNeighbours(userId, visibleProjects.map(p => p.id))
  const listed = visibleProjects.filter(p => !found.hidden.has(p.id))
  const neighbourIds = new Set(found.shadowIds)
  const neighbourRows = neighbourIds.size
    ? await db.select({ id: projects.id, userId: projects.userId, teamId: projects.teamId }).from(projects).where(inArray(projects.id, [...neighbourIds]))
    : []
  const allProjects = [...listed, ...neighbourRows]
  if (!allProjects.length) return []
  const staffProjectIds = allProjects
    .filter(p => neighbourIds.has(p.id) || audienceFor(userId, teamId, p) === 'staff')
    .map(p => p.id)

  return db
    .select({
      id: projectTasks.id,
      projectId: projectTasks.projectId,
      projectName: projects.name,
      columnId: projectTasks.columnId,
      title: projectTasks.title,
      description: projectTasks.description,
      tags: projectTasks.tags,
      visibility: projectTasks.visibility,
      assigneeId: projectTasks.assigneeId,
      dueOn: projectTasks.dueOn,
      completedAt: projectTasks.completedAt,
      updatedAt: projectTasks.updatedAt
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(
      inArray(projectTasks.projectId, allProjects.map(p => p.id)),
      staffProjectIds.length === allProjects.length
        ? undefined
        : or(
            staffProjectIds.length ? inArray(projectTasks.projectId, staffProjectIds) : undefined,
            eq(projectTasks.visibility, 'customer')
          ),
      // Trashed cards stay out of global search and out of the deep links it
      // hands back, so a hit never opens a board on a card that is not drawn.
      isNull(projectTasks.deletedAt),
      // The sidebar counts cards from this list; a subtask is not one.
      isNull(projectTasks.parentTaskId)
    ))
    .orderBy(desc(projectTasks.updatedAt), asc(projectTasks.id))
})
