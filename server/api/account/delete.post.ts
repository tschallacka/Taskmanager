import { deleteAccount } from '../../utils/accountDeletion'
import { confirmMatches } from '#shared/utils/deleteAccountText'

// Deletes the signed-in person's account. The body must carry their own address, typed to confirm. The person is taken
// from the session, never from the body. A team they own, or the last instance admin, is refused with 409 (see
// utils/accountDeletion.ts), and nothing is removed.
export default defineEventHandler(async (event) => {
  const me = event.context.session.user
  const body = await readBody<{ confirm?: unknown }>(event)
  if (!confirmMatches(body?.confirm, me.email)) {
    throw createError({ statusCode: 400, message: 'Type your email address to confirm.' })
  }
  await deleteAccount(me.id)
  return { ok: true }
})
