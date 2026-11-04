import { requireProject } from '../../../../../utils/projects'
import { revokeInvitation } from '../../../../../utils/guestInvites'

// Withdraws an open invitation or a waiting request. A project admin may withdraw any, a manager guest their own.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  await revokeInvitation(project, event.context.session.user.id, getRouterParam(event, 'invitationId')!)
  return { ok: true }
})
