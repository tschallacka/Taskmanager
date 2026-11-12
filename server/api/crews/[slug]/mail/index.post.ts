import { setHeader, setResponseStatus } from 'h3'
import { db } from '../../../../db'
import { crewMail } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { cleanupMailOnWrite, isMailRecipient, mailError, pendingFor, requireMailCaller, sendsInLastMinute } from '../../../../utils/crewMail'
import { MAIL_PENDING_LIMIT, MAIL_SENDS_PER_MINUTE, MAIL_TEXT_SAFETY_BYTES, mailIdProblem, mailTextProblem } from '../../../../utils/crewMailRules'

// Postgres' unique violation (23505), as the driver reports it directly or wrapped in its cause.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown, cause?: { code?: unknown } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/**
 * Sends one mail to a crew member. Body: { id, to, text }. The sender is the caller's own key; a body field `from` is
 * ignored. The id is made by the sender's client, so a retried send with the same id and text is the same row (201
 * again); the same id with another sender, text or crew is 409. No board message is created. Every refusal carries its
 * reason to the sender (crewMail.ts mailError). Over the 1 MB safety stop the status is 413.
 */
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '')
  const caller = await requireMailCaller(event, slug)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  const idProblem = mailIdProblem(body.id)
  if (idProblem) throw mailError(400, idProblem)
  const textProblem = mailTextProblem(body.text)
  if (textProblem) {
    const tooLarge = typeof body.text === 'string' && Buffer.byteLength(body.text, 'utf8') > MAIL_TEXT_SAFETY_BYTES
    throw mailError(tooLarge ? 413 : 400, textProblem)
  }
  if (typeof body.to !== 'string' || !isMailRecipient(body.to)) {
    throw mailError(400, 'to must be a crew member key (for example pia, boss, susy, wren)')
  }
  const id = body.id as string
  const to = body.to
  const text = body.text as string

  const [existing] = await db.select().from(crewMail).where(eq(crewMail.id, id))
  if (existing) {
    const same = existing.crewId === caller.crew.id && existing.fromKey === caller.key && existing.toKey === to && existing.text === text
    if (!same) throw mailError(409, 'That id is already used by another mail.')
    setResponseStatus(event, 201)
    return { id }
  }

  const now = Date.now()
  if ((await sendsInLastMinute(caller.crew.id, caller.key, now)) >= MAIL_SENDS_PER_MINUTE) {
    setHeader(event, 'Retry-After', 60)
    throw mailError(429, `At most ${MAIL_SENDS_PER_MINUTE} mails a minute per sender.`)
  }
  if ((await pendingFor(caller.crew.id, to)) >= MAIL_PENDING_LIMIT) {
    throw mailError(409, `${to} has ${MAIL_PENDING_LIMIT} undelivered mails; try again later.`)
  }
  try {
    await db.insert(crewMail).values({ id, crewId: caller.crew.id, fromKey: caller.key, toKey: to, text, created: now, delivered: null })
  } catch (error) {
    // A parallel send with the same id won the insert: the same mail is 201, another mail is 409, never a 500.
    if (!isUniqueViolation(error)) throw error
    const [row] = await db.select().from(crewMail).where(eq(crewMail.id, id))
    const same = row !== undefined && row.crewId === caller.crew.id && row.fromKey === caller.key && row.toKey === to && row.text === text
    if (!same) throw mailError(409, 'That id is already used by another mail.')
    setResponseStatus(event, 201)
    return { id }
  }
  await cleanupMailOnWrite(now)
  setResponseStatus(event, 201)
  return { id }
})
