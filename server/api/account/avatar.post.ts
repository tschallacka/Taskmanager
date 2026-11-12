import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { user } from '../../db/schema'
import { mayChangeProfile, svgProblem, uploadProblem } from '../../utils/avatarRules'
import { avatarDir, AVATAR_EXT } from '../../utils/avatarStore'

// Uploads the signed-in person's own picture: PNG, JPEG, WebP or SVG up to 2 MB. The type comes from the file's MIME type
// and the stored name is random, so a client's filename never reaches the disk. An SVG is checked first.
export default defineEventHandler(async (event) => {
  const me = event.context.session.user.id
  if (!mayChangeProfile(me, me)) throw createError({ statusCode: 403, message: 'You can change only your own picture.' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  if (!file?.data) throw createError({ statusCode: 400, message: 'No picture was sent.' })
  const type = file.type ?? 'application/octet-stream'
  const problem = uploadProblem({ type, bytes: file.data.length })
  if (problem) throw createError({ statusCode: 400, message: problem })
  if (type === 'image/svg+xml') {
    const svg = svgProblem(file.data.toString('utf8'))
    if (svg) throw createError({ statusCode: 400, message: svg })
  }
  const dir = avatarDir(me)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  for (const old of readdirSync(dir)) unlinkSync(join(dir, old))
  const filename = `${randomBytes(12).toString('hex')}.${AVATAR_EXT[type]!}`
  writeFileSync(join(dir, filename), file.data)
  const image = `/api/account/avatars/${me}/${filename}`
  await db.update(user).set({ image, updatedAt: new Date() }).where(eq(user.id, me))
  return { ok: true, image }
})
