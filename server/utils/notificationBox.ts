import { and, count, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { db as appDb } from '../db'
import { notifications } from '../db/schema'

// The queries behind the inbox's Archive, Unarchive and Empty routes. The database is a parameter, so a test can
// drive them with a recording fake and render the SQL they would run. Every query is bound to the signed-in person's
// id: another person's notifications are never in a where clause.

export type NotificationsDb = typeof appDb

// The ages the Read box can be emptied by, in days: 30 days, 2 months, 6 months, 1 year.
export const EMPTY_AGES = [30, 60, 182, 365]
const DAY = 86_400_000

/** The where clause for emptying: the person's archived notifications, all of them or archived before the age cut. */
export function emptyBoxWhere(userId: string, options: { all: boolean, days: number | null }, now: number) {
  return and(
    eq(notifications.userId, userId),
    isNotNull(notifications.archivedAt),
    options.all ? undefined : lt(notifications.archivedAt, now - (options.days ?? 0) * DAY)
  )
}

/** Dry run counts what would go; otherwise deletes it. Only this person's archived notifications are considered. */
export async function emptyReadBox(
  database: NotificationsDb,
  userId: string,
  options: { all: boolean, days: number | null, dryRun: boolean },
  now: number = Date.now()
): Promise<{ count: number } | { deleted: number }> {
  const where = emptyBoxWhere(userId, options, now)
  if (options.dryRun) {
    const [row] = await database.select({ total: count() }).from(notifications).where(where)
    return { count: Number(row?.total ?? 0) }
  }
  const deleted = await database.delete(notifications).where(where).returning({ id: notifications.id })
  return { deleted: deleted.length }
}

/** Archives the given notifications (or every one still in the inbox with `all`): read too, out of the inbox. */
export async function archiveNotifications(
  database: NotificationsDb,
  userId: string,
  options: { ids: string[], all: boolean },
  now: number = Date.now()
): Promise<{ archived: number }> {
  const updated = await database.update(notifications)
    // An unread one is read by archiving it; one already read keeps the time it was read.
    .set({ archivedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.archivedAt),
      options.all ? undefined : inArray(notifications.id, options.ids)
    ))
    .returning({ id: notifications.id })
  return { archived: updated.length }
}

/** Moves the given archived notifications back to the inbox. They stay read. */
export async function unarchiveNotifications(
  database: NotificationsDb,
  userId: string,
  ids: string[]
): Promise<{ unarchived: number }> {
  const updated = await database.update(notifications)
    .set({ archivedAt: null })
    .where(and(
      eq(notifications.userId, userId),
      isNotNull(notifications.archivedAt),
      inArray(notifications.id, ids)
    ))
    .returning({ id: notifications.id })
  return { unarchived: updated.length }
}
