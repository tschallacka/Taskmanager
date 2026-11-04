import { requireProject } from '../../../../utils/projects'
import { changeGuest } from '../../../../utils/guestInvites'

// A project admin changes a guest's role, and the domain a manager guest may invite at.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = (await readBody<{ role?: unknown, allowedDomain?: unknown }>(event)) ?? {}
  await changeGuest(project, event.context.session.user.id, getRouterParam(event, 'userId')!, body)
  return { ok: true }
})
