import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../../db'
import { notifications } from '../../db/schema'

// Moves archived notifications back to the inbox: the ids given. They stay read. Only the signed-in person's
// own archived notifications are touched.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ ids?: unknown }>(event)

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 500) : []
  if (!ids.length) throw createError({ statusCode: 400, message: 'Say which notifications to move back to the inbox' })

  const updated = await db.update(notifications)
    .set({ archivedAt: null })
    .where(and(
      eq(notifications.userId, userId),
      isNotNull(notifications.archivedAt),
      inArray(notifications.id, ids)
    ))
    .returning({ id: notifications.id })

  return { unarchived: updated.length }
})
