import { createError } from 'h3'
import { db } from '../../db'
import { userSettings } from '../../db/schema'
import { siteDefaultManner } from '../../utils/sprocketInstance'
import { isSprocketManner, resolveManner } from '../../utils/sprocketManner'

// The manner Sprocket answers this person in. `{ "manner": null }` goes back to the site default. Only the tone
// changes; what Sprocket may do is not set here.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ manner?: unknown }>(event).catch(() => null)
  if (!body || typeof body !== 'object' || !('manner' in body)) {
    throw createError({ statusCode: 400, message: 'Send { "manner": ... }: professional, friendly, concise, playful, teacher, or null for the site default.' })
  }
  const pick = body.manner === null || body.manner === '' ? null : body.manner
  if (pick !== null && !isSprocketManner(pick)) {
    throw createError({ statusCode: 400, message: 'The manner is professional, friendly, concise, playful or teacher.' })
  }

  const values = { sprocketManner: pick, updatedAt: new Date() }
  await db
    .insert(userSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values })

  return { pick, effective: resolveManner(pick, await siteDefaultManner()) }
})
