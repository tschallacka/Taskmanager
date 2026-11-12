import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../db'
import { crewMail } from '../../../../db/schema'
import { isMailRecipient, mailError, requireMailCaller } from '../../../../utils/crewMail'
import { MAIL_FETCH_LIMIT, MAIL_READER_KEY } from '../../../../utils/crewMailRules'

/**
 * The undelivered mail for one recipient, oldest first, at most 50 a call: ?to=<key>. A member reads only its own mail;
 * the boss key reads any recipient's (Boss, 2026-11-12). Nothing else reads another person's mail.
 */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const caller = await requireMailCaller(event, slug)
  const to = String(getQuery(event).to ?? '')
  if (!isMailRecipient(to)) throw mailError(400, 'to must be a crew member key.')
  if (to !== caller.key && caller.key !== MAIL_READER_KEY) {
    throw mailError(403, 'You can read only your own mail.')
  }
  const rows = await db.select().from(crewMail)
    .where(and(eq(crewMail.crewId, caller.crew.id), eq(crewMail.toKey, to), isNull(crewMail.delivered)))
    .orderBy(asc(crewMail.created))
    .limit(MAIL_FETCH_LIMIT)
  return {
    mail: rows.map(row => ({ id: row.id, from: row.fromKey, to: row.toKey, text: row.text, created: row.created }))
  }
})
