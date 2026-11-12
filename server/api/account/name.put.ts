import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { user } from '../../db/schema'
import { displayNameOf, mayChangeProfile } from '../../utils/avatarRules'

// Changes the signed-in person's own display name (1 to 60 characters, trimmed). Nobody else's name can be changed here.
export default defineEventHandler(async (event) => {
  const me = event.context.session.user.id
  const body = await readBody<{ name?: unknown, userId?: unknown }>(event)
  const target = typeof body?.userId === 'string' && body.userId ? body.userId : me
  if (!mayChangeProfile(me, target)) throw createError({ statusCode: 403, message: 'You can change only your own name.' })
  const parsed = displayNameOf(body?.name)
  if ('problem' in parsed) throw createError({ statusCode: 400, message: parsed.problem })
  await db.update(user).set({ name: parsed.name, updatedAt: new Date() }).where(eq(user.id, me))
  return { ok: true, name: parsed.name }
})
