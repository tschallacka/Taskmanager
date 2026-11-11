import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db'
import { notifications } from '../../db/schema'

// Archives notifications: the ids given, or every one still in the inbox with `all`. An archived one is read
// too, so the unread count drops with it, and it leaves the inbox for the Read box. Only the signed-in person's
// own notifications are touched.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ ids?: unknown, all?: unknown }>(event)

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 500) : []
  if (!body.all && !ids.length) throw createError({ statusCode: 400, message: 'Say which notifications to archive, or all' })

  const now = Date.now()
  const updated = await db.update(notifications)
    // An unread one is read by archiving it; one already read keeps the time it was read.
    .set({ archivedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.archivedAt),
      body.all ? undefined : inArray(notifications.id, ids)
    ))
    .returning({ id: notifications.id })

  return { archived: updated.length }
})
