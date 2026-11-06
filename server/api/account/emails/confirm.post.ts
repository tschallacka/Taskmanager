import { confirmExtraEmail } from '../../../utils/extraEmails'

// The confirmation link's page posts its token here, signed in to the account that added the address.
export default defineEventHandler(async (event) => {
  const body = (await readBody<{ token?: unknown }>(event)) ?? {}
  const token = typeof body.token === 'string' && /^[\w-]+$/.test(body.token) ? body.token : ''
  if (!token) throw createError({ statusCode: 410, message: 'This link is no longer valid. Add the address again.' })
  return { ok: true, ...(await confirmExtraEmail(token, event.context.session.user.id)) }
})
