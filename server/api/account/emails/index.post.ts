import { startExtraEmail } from '../../../utils/extraEmails'
import { appOrigin } from '../../../utils/invitations'

// Adds an extra address and mails its confirmation link to that address. The link never comes back here.
export default defineEventHandler(async (event) => {
  const body = (await readBody<{ email?: unknown }>(event)) ?? {}
  const added = await startExtraEmail(
    event.context.session.user.id,
    body.email,
    token => `${appOrigin(event)}/confirm-email/${token}`
  )
  return { id: added.id, email: added.email, verified: false }
})
