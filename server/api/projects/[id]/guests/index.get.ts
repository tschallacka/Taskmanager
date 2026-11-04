import { requireProject } from '../../../../utils/projects'
import { listGuests } from '../../../../utils/guestInvites'

// Who is a guest of this board, and which invitations and requests are open. For a project admin and
// for a manager guest; anyone else is told they cannot share the board.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return listGuests(project, event.context.session.user.id)
})
