import { createError, setHeader, setResponseStatus } from 'h3'
import { db } from '../../../../db'
import { crewMail } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { cleanupMailOnWrite, isMailRecipient, pendingFor, requireMailCaller, sendsInLastMinute } from '../../../../utils/crewMail'
import { MAIL_PENDING_LIMIT, MAIL_SENDS_PER_MINUTE, MAIL_TEXT_SAFETY_BYTES, mailIdProblem, mailTextProblem } from '../../../../utils/crewMailRules'

// Postgres' unique violation (23505), as the driver reports it directly or wrapped in its cause.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown, cause?: { code?: unknown } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/**
 * Sends one mail to a crew member. Body: { id, to, text }. The sender is the caller's own key; a body field `from` is
 * ignored. The id is made by the sender's client, so a retried send with the same id and text is the same row (201
 * again); the same id with another sender, text or crew is 409. No board message is created.
 */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const caller = await requireMailCaller(event, slug)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const idProblem = mailIdProblem(body.id)
  if (idProblem) throw createError({ statusCode: 400, message: idProblem })
  const textProblem = mailTextProblem(body.text)
  if (textProblem) {
    // The reason goes to the sender: h3 sends statusMessage and data, not message. Over the safety stop it is 413.
    const tooLarge = typeof body.text === 'string' && Buffer.byteLength(body.text, 'utf8') > MAIL_TEXT_SAFETY_BYTES
    throw createError({ statusCode: tooLarge ? 413 : 400, statusMessage: textProblem, data: { error: textProblem } })
  }
  if (typeof body.to !== 'string' || !isMailRecipient(body.to)) {
    throw createError({ statusCode: 400, message: 'to must be a crew member key (for example pia, boss, susy, wren)' })
  }
  const id = body.id as string
  const to = body.to
  const text = body.text as string

  const [existing] = await db.select().from(crewMail).where(eq(crewMail.id, id))
  if (existing) {
    const same = existing.crewId === caller.crew.id && existing.fromKey === caller.key && existing.toKey === to && existing.text === text
    if (!same) throw createError({ statusCode: 409, message: 'That id is already used by another mail.' })
    setResponseStatus(event, 201)
    return { id }
  }

  const now = Date.now()
  if ((await sendsInLastMinute(caller.crew.id, caller.key, now)) >= MAIL_SENDS_PER_MINUTE) {
    setHeader(event, 'Retry-After', 60)
    throw createError({ statusCode: 429, message: `At most ${MAIL_SENDS_PER_MINUTE} mails a minute per sender.` })
  }
  if ((await pendingFor(caller.crew.id, to)) >= MAIL_PENDING_LIMIT) {
    throw createError({ statusCode: 409, message: `${to} has ${MAIL_PENDING_LIMIT} undelivered mails; try again later.` })
  }
  try {
    await db.insert(crewMail).values({ id, crewId: caller.crew.id, fromKey: caller.key, toKey: to, text, created: now, delivered: null })
  } catch (error) {
    // A parallel send with the same id won the insert: the same mail is 201, another mail is 409, never a 500.
    if (!isUniqueViolation(error)) throw error
    const [row] = await db.select().from(crewMail).where(eq(crewMail.id, id))
    const same = Boolean(row) && row.crewId === caller.crew.id && row.fromKey === caller.key && row.toKey === to && row.text === text
    if (!same) throw createError({ statusCode: 409, message: 'That id is already used by another mail.' })
    setResponseStatus(event, 201)
    return { id }
  }
  await cleanupMailOnWrite(now)
  setResponseStatus(event, 201)
  return { id }
})
