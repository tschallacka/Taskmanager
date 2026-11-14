import { db } from '../../db'
import { EMPTY_AGES, emptyReadBox } from '../../utils/notificationBox'

export { EMPTY_AGES }

// Empties the signed-in person's Read box: all of it (`all`), or what was archived more than `olderThanDays` ago.
// With `dryRun` it only counts, so the page can say how many will go before anyone confirms. Deletes for that person
// only; another person's archived notifications are never touched (see server/utils/notificationBox.ts).
export default defineEventHandler(async (event) => {
  const userId = event.context.session.user.id
  const body = await readBody<{ all?: unknown, olderThanDays?: unknown, dryRun?: unknown }>(event)

  const all = body.all === true
  const days = typeof body.olderThanDays === 'number' ? body.olderThanDays : null
  if (!all && (days === null || !EMPTY_AGES.includes(days))) {
    throw createError({ statusCode: 400, message: 'Say all, or an age of 30, 60, 182 or 365 days' })
  }

  return emptyReadBox(db, userId, { all, days, dryRun: body.dryRun === true })
})
