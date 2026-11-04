import { requireProject } from '../../../../../utils/projects'
import { inviteGuest } from '../../../../../utils/guestInvites'
import { inviteUrl } from '../../../../../utils/invitations'

// Invites an address onto the board as a guest. A project admin invites anyone, as an editor or a
// manager guest (with the domain that manager may invite at). A manager guest invites editors at their
// own domain straight away; any other address becomes a request, with a reason, for a project admin.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = (await readBody<{ email?: unknown, role?: unknown, allowedDomain?: unknown, reason?: unknown }>(event)) ?? {}
  return inviteGuest(
    project,
    event.context.session.user.id,
    { email: body.email, role: body.role ?? 'editor', allowedDomain: body.allowedDomain, reason: body.reason },
    token => inviteUrl(event, token)
  )
})
