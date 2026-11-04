import { requireProject } from '../../../../../../utils/projects'
import { approveRequest } from '../../../../../../utils/guestInvites'
import { inviteUrl } from '../../../../../../utils/invitations'

// A project admin approves a guest manager's request. The invitation goes out (by mail when the
// instance can send it) and its link comes back here once.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return approveRequest(
    project,
    event.context.session.user.id,
    getRouterParam(event, 'invitationId')!,
    token => inviteUrl(event, token)
  )
})
