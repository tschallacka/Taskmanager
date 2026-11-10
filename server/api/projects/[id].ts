import { db } from '../../db'
import { projects, projectTasks } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireProject, requireStaff } from '../../utils/projects'
import { requireOrgCustomer } from '../../utils/customers'
import { projectPeople } from '../../utils/people'
import { isAccentColor } from '#shared/utils/colors'
import { closeTopic, publicProjectTopic, publishFromEvent } from '../../utils/realtime'
import { removeTaskAttachments } from '../../utils/attachments'
import { crewBoardOf, crewShadowToDelete, deleteCrewBoard } from '../../utils/crewBoards'
import { MAX_PROJECT_DESCRIPTION, parseDashboardWidgets, parseProjectStatus } from '../../utils/taskFields'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  // A crew's shadow board goes by the crew rule alone (crew-board.delete.ts), never by the ordinary one: its forked
  // accounts and its files go with it. The owner, the coupled member, a team admin or the instance admin may.
  if (event.method === 'DELETE' && await crewBoardOf(id)) {
    await crewShadowToDelete(event.context.session.user.id, id)
    await deleteCrewBoard(id)
    await publishFromEvent(event, { type: 'projects', projectId: id })
    closeTopic(publicProjectTopic(id))
    return { ok: true }
  }
  const project = await requireProject(event, id)
  // Anyone on the project may read it, so a contact can still open an archived board.
  if (event.method === 'GET') return project
  requireStaff(project)
  const userId = event.context.session.user.id

  if (event.method === 'PUT') {
    const body = await readBody<{
      name?: string
      description?: string
      status?: string | null
      dashboardWidgets?: string[] | null
      isPublic?: boolean
      publicUntil?: number | null
      labelColor?: { label?: string, color?: string | null }
      customerId?: string | null
      ownerId?: string
    }>(event)
    const name = body.name?.trim()

    // Moving a board between customers changes who outside the team can read
    // it, so the new customer is checked against the board's own organisation.
    const customerId = body.customerId === undefined
      ? undefined
      : body.customerId === null
        ? null
        : (await requireOrgCustomer(body.customerId, project.teamId)).id

    // Label colours are patched one label at a time rather than sent as a whole
    // map: two people colouring different labels on the same board would
    // otherwise each write the map they loaded and undo the other's change.
    let labelColors: Record<string, string> | undefined
    if (body.labelColor) {
      const label = body.labelColor.label?.trim().toLowerCase()
      const color = body.labelColor.color
      if (!label) throw createError({ statusCode: 400, message: 'A label is required' })
      if (color !== null && !isAccentColor(color)) {
        throw createError({ statusCode: 400, message: 'Unknown colour' })
      }
      const { [label]: _cleared, ...rest } = project.labelColors ?? {}
      // null clears the entry rather than storing an empty colour, so the label
      // goes back to the one derived from its text.
      labelColors = color === null ? rest : { ...rest, [label]: color }
    }

    // The owner is the team member the project is recorded under. Visibility comes from the
    // team, so changing it does not change who can see the project.
    if (body.ownerId !== undefined) {
      if (!project.teamId) throw createError({ statusCode: 400, message: 'A personal project has no owner to change' })
      // Only the current owner may hand the project on: the owner is what rules trust for visibility.
      if (body.ownerId !== project.userId && userId !== project.userId) {
        throw createError({ statusCode: 403, message: 'Only the project owner can hand the project to someone else' })
      }
      const people = await projectPeople(project)
      if (!people.some(p => p.id === body.ownerId && p.kind === 'staff')) {
        throw createError({ statusCode: 400, message: 'The owner must be a member of the team' })
      }
    }

    const status = body.status === undefined ? undefined : parseProjectStatus(body.status)
    const dashboardWidgets = body.dashboardWidgets === undefined ? undefined : parseDashboardWidgets(body.dashboardWidgets)

    const [updated] = await db.update(projects)
      .set({
        name: name || project.name,
        ...(typeof body.description === 'string' && { description: body.description.slice(0, MAX_PROJECT_DESCRIPTION) }),
        ...(status !== undefined && { status }),
        ...(dashboardWidgets !== undefined && { dashboardWidgets }),
        ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
        ...(body.publicUntil !== undefined && { publicUntil: body.publicUntil }),
        ...(labelColors !== undefined && { labelColors }),
        ...(customerId !== undefined && { customerId }),
        ...(body.ownerId !== undefined && { userId: body.ownerId }),
        updatedAt: Date.now()
      })
      .where(eq(projects.id, id))
      .returning()

    // Named so that anyone reading this board's public link hears about a
    // rename, or about the share being switched off under them.
    await publishFromEvent(event, { type: 'projects', projectId: id })
    if (body.isPublic === false) closeTopic(publicProjectTopic(id))
    return updated
  }

  // Anything but PUT or DELETE would otherwise fall through to the delete
  // below, which a link prefetch or a stray GET must never reach.
  if (event.method !== 'DELETE') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  // DELETE — hard delete, columns/tasks/comments cascade. The cascade cannot
  // reach the images on disk, so their task ids are collected first.
  const tasks = await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, id))
  await db.delete(projects).where(eq(projects.id, id))
  removeTaskAttachments(tasks.map(t => t.id))

  await publishFromEvent(event, { type: 'projects', projectId: id })
  closeTopic(publicProjectTopic(id))
  return { ok: true }
})
