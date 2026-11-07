import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { instanceSettings } from '../../db/schema'
import { DEFAULT_RATE_LIMITS } from '../../utils/rateLimits'
import { requireInstanceAdmin } from '../../utils/instanceAdmin'

// The instance's rate limits on agent calls, and the defaults they fall back to. Instance admin only.
export default defineEventHandler(async (event) => {
  await requireInstanceAdmin(event)
  const [row] = await db.select({ rateLimits: instanceSettings.rateLimits }).from(instanceSettings).where(eq(instanceSettings.id, 'instance'))
  return { limits: row?.rateLimits ?? {}, defaults: DEFAULT_RATE_LIMITS }
})
