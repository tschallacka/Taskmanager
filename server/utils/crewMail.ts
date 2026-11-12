// The crew mail routes' shared part: who the caller is in this crew, and the cleanup that keeps the table bounded. The
// person key comes from the caller's own account (its crew address), never from the request body, so a body field
// `from` is ignored. A key of another crew, a customer or a non-crew key is refused with 403.
import { and, count, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { db } from '../db'
import { crewMail, user, type Crew } from '../db/schema'
import { authenticateApiKey } from './api-keys'
import { crewBySlug, CREW_PEOPLE } from './crewProvisioning'
import { personKeyOf } from './crewAccounts'
import { isMailMemberKey, mailCutoffs } from './crewMailRules'

export interface MailCaller {
  crew: Crew
  /** The caller's person key in this crew (pia, wick, boss ...). */
  key: string
}

export function teamOfKey(key: string): string | undefined {
  return CREW_PEOPLE.find(person => person.key === key)?.team
}

/** Whether a key may be a mail recipient or sender: a crew member (admin or member team), not a customer or contact. */
export function isMailRecipient(key: string): boolean {
  return isMailMemberKey(key, teamOfKey)
}

/** The caller's key, checked to be a member key of the crew named in the route. Throws 403 otherwise. */
export async function requireMailCaller(event: H3Event, slug: string): Promise<MailCaller> {
  const context = await authenticateApiKey(event)
  const crew = await crewBySlug(slug)
  const [account] = await db.select({ crewId: user.crewId, email: user.email }).from(user).where(eq(user.id, context.userId))
  if (!account || account.crewId !== crew.id) {
    throw createError({ statusCode: 403, message: 'This key is not a member of this crew.' })
  }
  const key = personKeyOf(crew.slug, account.email)
  if (!isMailMemberKey(key, teamOfKey)) {
    throw createError({ statusCode: 403, message: 'Only a crew member key can use the crew mail.' })
  }
  return { crew, key }
}

let lastCleanup = 0
const CLEANUP_EVERY_MS = 86400_000

/** Deletes the mail past its keep time, at most once a day, on a write. Never fails the write that calls it. */
export async function cleanupMailOnWrite(now: number): Promise<void> {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return
  lastCleanup = now
  try {
    const cut = mailCutoffs(now)
    await db.delete(crewMail).where(or(
      and(isNotNull(crewMail.delivered), lt(crewMail.delivered, cut.deliveredBefore)),
      and(isNull(crewMail.delivered), lt(crewMail.created, cut.undeliveredBefore))
    ))
  } catch (error) {
    console.error('[crew-mail] cleanup did not run', (error as Error).name)
  }
}

/** How many mails a sender sent in the last minute (the rate limit counts these). */
export async function sendsInLastMinute(crewId: string, fromKey: string, now: number): Promise<number> {
  const [row] = await db.select({ n: count() }).from(crewMail).where(and(
    eq(crewMail.crewId, crewId),
    eq(crewMail.fromKey, fromKey),
    gt(crewMail.created, now - 60_000)
  ))
  return Number(row?.n ?? 0)
}

/** How many undelivered mails wait for one recipient. */
export async function pendingFor(crewId: string, toKey: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(crewMail).where(and(
    eq(crewMail.crewId, crewId),
    eq(crewMail.toKey, toKey),
    isNull(crewMail.delivered)
  ))
  return Number(row?.n ?? 0)
}

export type { Crew }
