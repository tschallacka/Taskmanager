import { requireProject } from '../../../../../../utils/projects'
import { declineRequest } from '../../../../../../utils/guestInvites'

// A project admin turns a guest manager's request down, optionally with a word for them.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = (await readBody<{ note?: unknown }>(event)) ?? {}
  await declineRequest(project, event.context.session.user.id, getRouterParam(event, 'invitationId')!, body.note)
  return { ok: true }
})
