import { requireProject } from '../../../../../../utils/projects'
import { resendInvitation } from '../../../../../../utils/guestInvites'
import { inviteUrl } from '../../../../../../utils/invitations'

// Sends an open guest invitation again with a fresh link. It is mailed when the instance can send
// mail, and its link comes back here once. A project admin may resend any, a manager guest their own.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return resendInvitation(
    project,
    event.context.session.user.id,
    getRouterParam(event, 'invitationId')!,
    token => inviteUrl(event, token)
  )
})
