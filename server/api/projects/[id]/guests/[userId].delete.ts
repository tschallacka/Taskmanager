import { requireProject } from '../../../../utils/projects'
import { removeGuest } from '../../../../utils/guestInvites'

// A project admin takes a guest off the board.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  await removeGuest(project, event.context.session.user.id, getRouterParam(event, 'userId')!)
  return { ok: true }
})
