import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avatarDir, contentTypeOf, safeAvatarName } from '../../../../utils/avatarStore'

// Serves a person's stored picture. The folder and the file name are both checked, so nothing outside the store is read.
export default defineEventHandler((event) => {
  const userId = getRouterParam(event, 'userId') ?? ''
  const filename = getRouterParam(event, 'filename') ?? ''
  const named = safeAvatarName(filename)
  if (!named || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw createError({ statusCode: 404, message: 'No such picture' })
  const path = join(avatarDir(userId), filename)
  if (!existsSync(path)) throw createError({ statusCode: 404, message: 'No such picture' })
  setHeader(event, 'Content-Type', contentTypeOf(named.ext))
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  // An SVG is shown as a picture only: no script, no outside loads, even if one slipped past the upload check.
  if (named.ext === 'svg') setHeader(event, 'Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; img-src data:`)
  return readFileSync(path)
})
