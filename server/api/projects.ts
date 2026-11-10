import { db } from '../db'
import { customers, projects, projectColumns } from '../db/schema'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getProjectAccessFilter, genId } from '../utils/projects'
import { audienceFor, getUserActiveTeamId } from '../utils/auth-helpers'
import { requireOrgCustomer } from '../utils/customers'
import { publishFromEvent } from '../utils/realtime'
import { terminalColumnIds } from '#shared/utils/board'
import { columnsForNewBoard } from '../utils/teamSettings'
import { boardTreeFields, hiddenCrewShadows, labelRowOf, markOpenableRealBoards, memberTeamsOf, realNeighbourIsOpenable, treeNeighbours } from '../utils/boardTree'
import { crewBoardOf, mayDeleteCrewBoard } from '../utils/crewBoards'

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  if (event.method === 'GET') {
    const filter = await getProjectAccessFilter(event)
    const teamId = await getUserActiveTeamId(event)
    const archivedView = getQuery(event).archived === '1'
    const own = await db
      .select({ project: projects, customerName: customers.name })
      .from(projects)
      .leftJoin(customers, eq(customers.id, projects.customerId))
      .where(archivedView ? filter : and(filter, isNull(projects.archivedAt)))
      .orderBy(desc(projects.updatedAt))
    // The crew tree adds the shadow and real boards a person sees beside their own (see boardTree.ts). The archived
    // view adds nothing, so it answers as it did before.
    // A crew's shadow board that this person may not see (hiddenCrewShadows) is dropped from the list in both views.
    const hidden = await hiddenCrewShadows(userId, own.map(r => r.project.id))
    const visibleOwn = own.filter(r => !hidden.has(r.project.id))
    const neighbours = archivedView
      ? { shadowIds: [], realIds: [] }
      : await treeNeighbours(userId, visibleOwn.map(r => r.project.id))
    const neighbourIds = [...neighbours.shadowIds, ...neighbours.realIds]
    const added = neighbourIds.length
      ? await db
          .select({ project: projects, customerName: customers.name })
          .from(projects)
          .leftJoin(customers, eq(customers.id, projects.customerId))
          .where(inArray(projects.id, neighbourIds))
      : []
    const rows = [...visibleOwn, ...added].sort((a, b) => b.project.updatedAt - a.project.updatedAt)
    if (!rows.length) return []
    const shadowNeighbourIds = new Set(neighbours.shadowIds)
    const realNeighbourIds = new Set(neighbours.realIds)
    const tree = await boardTreeFields(rows.map(r => r.project.id), new Set(rows.map(r => r.project.id)))
    // A real board is openable here when this person belongs to its workspace (the row and the breadcrumb open it).
    const memberTeams = await memberTeamsOf(userId)
    markOpenableRealBoards(tree, memberTeams)

    // Which columns count as finished, so the sidebar can say how much of a
    // board is still open without loading the board. The tasks themselves are
    // already on the client from /api/tasks; only the shape of the board is
    // missing, and it is a handful of rows per project.
    const columns = await db
      .select({
        id: projectColumns.id,
        projectId: projectColumns.projectId,
        name: projectColumns.name
      })
      .from(projectColumns)
      .where(and(
        inArray(projectColumns.projectId, rows.map(r => r.project.id)),
        isNull(projectColumns.deletedAt)
      ))
      .orderBy(asc(projectColumns.position))

    const byProject = new Map<string, { id: string, name: string }[]>()
    for (const column of columns) {
      const list = byProject.get(column.projectId)
      if (list) list.push(column)
      else byProject.set(column.projectId, [column])
    }

    // Whether the person may delete each crew shadow board in the list: the rule crew-board.delete.ts applies.
    const deletable = new Map<string, boolean>()
    for (const { project } of rows) {
      const link = tree.get(project.id)?.role === 'shadow' ? await crewBoardOf(project.id) : undefined
      if (link) deletable.set(project.id, await mayDeleteCrewBoard(userId, link))
    }

    return rows.map(({ project, customerName }) => {
      const columnsOf = byProject.get(project.id) ?? []
      // A crew shadow added beside the list is read-only from here, and the staff of its crew's team see it as staff.
      // A real board added for a crew's member is a label row: read-only, opening nothing, with no tasks.
      // A real board that a crew's shadow leads to is an ordinary row for a person of its workspace (it opens after a
      // switch); for anyone else it is a label row: its id, name, role, read-only flag and sort time, nothing more.
      const realNeighbour = realNeighbourIds.has(project.id)
      if (realNeighbour && !realNeighbourIsOpenable(project.teamId, memberTeams)) return labelRowOf(project)
      const shadowNeighbour = shadowNeighbourIds.has(project.id)
      return {
        ...project,
        customerName,
        audience: shadowNeighbour || realNeighbour ? 'staff' as const : audienceFor(userId, teamId, project),
        ...(shadowNeighbour && { readOnly: true }),
        ...(deletable.has(project.id) && { crewDeletable: deletable.get(project.id) }),
        ...tree.get(project.id),
        terminalColumnIds: terminalColumnIds(columnsOf)
      }
    })
  }

  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  // POST — create project with the default kanban columns seeded.
  const body = await readBody<{ name?: string, customerId?: string | null }>(event)
  const teamId = await getUserActiveTeamId(event)
  const customer = body.customerId ? await requireOrgCustomer(body.customerId, teamId) : null
  const now = Date.now()
  const id = genId()

  const [project] = await db.insert(projects).values({
    id,
    userId,
    teamId,
    customerId: customer?.id ?? null,
    name: body.name?.trim() || 'Untitled project',
    createdAt: now,
    updatedAt: now
  }).returning()

  const seeded = (await columnsForNewBoard(teamId)).map((name, i) => ({
    id: genId(),
    projectId: id,
    name,
    position: i * 1000,
    createdAt: now
  }))
  await db.insert(projectColumns).values(seeded)

  await publishFromEvent(event, { type: 'projects', projectId: id })
  // Same shape the list answers with, so a board created here counts its tasks
  // the same way as one that arrived on load.
  return {
    ...project!,
    customerName: customer?.name ?? null,
    audience: 'staff' as const,
    terminalColumnIds: terminalColumnIds(seeded)
  }
})
