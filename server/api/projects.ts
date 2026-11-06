import { db } from '../db'
import { customers, projects, projectColumns } from '../db/schema'
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { getProjectAccessFilter, genId } from '../utils/projects'
import { audienceFor, getUserActiveTeamId } from '../utils/auth-helpers'
import { requireOrgCustomer } from '../utils/customers'
import { publishFromEvent } from '../utils/realtime'
import { terminalColumnIds } from '#shared/utils/board'
import { columnsForNewBoard } from '../utils/teamSettings'
import { realBoardOfCrewBoard, shadowBoardIdsSeenBy } from '../utils/crewBoardAccess'

export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id

  if (event.method === 'GET') {
    const filter = await getProjectAccessFilter(event)
    const teamId = await getUserActiveTeamId(event)
    // The crew boards the person may read (the owner, a manager of the real board, or the member who set
    // them up) are listed beside the team's own boards, marked as the crew's and read-only (Q92, Q93).
    const crewIds = await shadowBoardIdsSeenBy(userId)
    const reach = crewIds.length ? or(filter, inArray(projects.id, crewIds)) : filter
    const rows = await db
      .select({ project: projects, customerName: customers.name })
      .from(projects)
      .leftJoin(customers, eq(customers.id, projects.customerId))
      .where(getQuery(event).archived === '1' ? reach : and(reach, isNull(projects.archivedAt)))
      .orderBy(desc(projects.updatedAt))
    if (!rows.length) return []

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

    // The name of the real board each crew board works on, for its "crew board of" mark.
    const crewBoardOf = new Map(await Promise.all(rows
      .filter(({ project }) => crewIds.includes(project.id))
      .map(async ({ project }) => [project.id, (await realBoardOfCrewBoard(project.id))?.name ?? null] as const)))
    return rows.map(({ project, customerName }) => {
      const own = byProject.get(project.id) ?? []
      // A crew board reached as the real board's staff is read-only here (the server refuses any write).
      const readOnly = crewBoardOf.has(project.id) && project.teamId !== teamId
      return {
        ...project,
        customerName,
        audience: readOnly ? 'staff' as const : audienceFor(userId, teamId, project),
        readOnly,
        crewBoardOf: readOnly ? crewBoardOf.get(project.id) ?? null : null,
        terminalColumnIds: terminalColumnIds(own)
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
