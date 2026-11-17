import { db } from '../../db'
import { archiveNotifications } from '../../utils/notificationBox'

// Archives notifications: the ids given, or every one still in the inbox with `all`. An archived one is read
// too, so the unread count drops with it, and it leaves the inbox for the Read box. Only the signed-in person's
// own notifications are touched.
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ ids?: unknown, all?: unknown, unreadOnly?: unknown }>(event)

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 500) : []
  if (!body.all && !ids.length) throw createError({ statusCode: 400, message: 'Say which notifications to archive, or all' })

  // unreadOnly: Archive all under the Unread filter, so the read rows the person cannot see stay in the inbox.
  return archiveNotifications(db, userId, { ids, all: body.all === true, unreadOnly: body.unreadOnly === true })
})
