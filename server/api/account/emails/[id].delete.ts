import { removeExtraEmail } from '../../../utils/extraEmails'

// Takes one extra address off the signed-in account.
export default defineEventHandler(async (event) => {
  await removeExtraEmail(event.context.session.user.id, getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
