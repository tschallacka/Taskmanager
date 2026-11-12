import { createError } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../db'
import { crewMail } from '../../../../../db/schema'
import { requireMailCaller } from '../../../../../utils/crewMail'
import { mailIdProblem } from '../../../../../utils/crewMailRules'

/**
 * Marks one mail delivered. Only the recipient can ack it: another person's ack is 403, not a silent no-op. Acking a
 * mail that is already delivered answers 200 with its delivered time and changes nothing.
 */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const id = String(getRouterParam(event, 'id') ?? '')
  const idProblem = mailIdProblem(id)
  if (idProblem) throw createError({ statusCode: 400, message: idProblem })
  const caller = await requireMailCaller(event, slug)
  const [row] = await db.select().from(crewMail).where(eq(crewMail.id, id))
  if (!row || row.crewId !== caller.crew.id) throw createError({ statusCode: 404, message: 'No such mail.' })
  if (row.toKey !== caller.key) throw createError({ statusCode: 403, message: 'Only the recipient can ack this mail.' })
  if (row.delivered !== null) return { id, delivered: row.delivered }
  const now = Date.now()
  await db.update(crewMail).set({ delivered: now }).where(and(eq(crewMail.id, id), isNull(crewMail.delivered)))
  return { id, delivered: now }
})
