import { and, count, eq, isNotNull, lt } from 'drizzle-orm'
import { db } from '../../db'
import { notifications } from '../../db/schema'

// The ages the Read box can be emptied by, in days: 30 days, 2 months, 6 months, 1 year.
export const EMPTY_AGES = [30, 60, 182, 365]
const DAY = 86_400_000

// Empties the signed-in person's Read box: all of it (`all`), or what was archived more than `olderThanDays` ago.
// With `dryRun` it only counts, so the page can say how many will go before anyone confirms. Deletes for that person
// only; another person's archived notifications are never touched.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ all?: unknown, olderThanDays?: unknown, dryRun?: unknown }>(event)

  const all = body.all === true
  const days = typeof body.olderThanDays === 'number' ? body.olderThanDays : null
  if (!all && (days === null || !EMPTY_AGES.includes(days))) {
    throw createError({ statusCode: 400, message: 'Say all, or an age of 30, 60, 182 or 365 days' })
  }

  const where = and(
    eq(notifications.userId, userId),
    isNotNull(notifications.archivedAt),
    all ? undefined : lt(notifications.archivedAt, Date.now() - (days ?? 0) * DAY)
  )

  if (body.dryRun === true) {
    const [row] = await db.select({ total: count() }).from(notifications).where(where)
    return { count: Number(row?.total ?? 0) }
  }

  const deleted = await db.delete(notifications).where(where).returning({ id: notifications.id })
  return { deleted: deleted.length }
})
