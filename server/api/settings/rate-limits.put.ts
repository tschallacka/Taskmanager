import { db } from '../../db'
import { instanceSettings } from '../../db/schema'
import { readRateLimits } from '../../utils/rateLimits'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'

// Sets the instance's rate limits. A kind left out or sent as null goes back to its default.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const limits = readRateLimits(await readBody(event))
  const now = Date.now()
  await db.insert(instanceSettings)
    .values({ id: 'instance', rateLimits: limits, updatedAt: now, updatedBy: event.context.session.user.id })
    .onConflictDoUpdate({ target: instanceSettings.id, set: { rateLimits: limits, updatedAt: now, updatedBy: event.context.session.user.id } })
  return { limits }
})
