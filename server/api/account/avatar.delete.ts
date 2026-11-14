import { existsSync, readdirSync, rmSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { user } from '../../db/schema'
import { mayChangeProfile } from '../../utils/avatarRules'
import { avatarDir } from '../../utils/avatarStore'

// Removes the signed-in person's own picture: the stored file goes, and they see their initials again.
export default defineEventHandler(async (event) => {
  const me = event.context.session.user.id
  if (!mayChangeProfile(me, me)) throw createError({ statusCode: 403, message: 'You can change only your own picture.' })
  const dir = avatarDir(me)
  if (existsSync(dir)) for (const file of readdirSync(dir)) rmSync(`${dir}/${file}`, { force: true })
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, me))
  return { ok: true }
})
