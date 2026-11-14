import { auth } from '../../lib/auth'
import { displayNameOf, mayChangeProfile } from '../../utils/avatarRules'

// Changes the signed-in person's own display name (1 to 60 characters, trimmed). Nobody else's name can be changed here.
// It goes through better-auth's updateUser, so its user hooks run; the settings page then refreshes the session.
export default defineEventHandler(async (event) => {
  const me = event.context.session.user.id
  const body = await readBody<{ name?: unknown, userId?: unknown }>(event)
  const target = typeof body?.userId === 'string' && body.userId ? body.userId : me
  if (!mayChangeProfile(me, target)) throw createError({ statusCode: 403, message: 'You can change only your own name.' })
  const parsed = displayNameOf(body?.name)
  if ('problem' in parsed) throw createError({ statusCode: 400, message: parsed.problem })
  // updateUser acts on the session the request carries: the signed-in person's, as checked above.
  await auth.api.updateUser({ body: { name: parsed.name }, headers: event.headers })
  return { ok: true, name: parsed.name }
})
