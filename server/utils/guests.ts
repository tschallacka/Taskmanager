// Guests: people from outside the team who were let onto one board. See projectGuests in the schema.
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectGuests, user } from '../db/schema'
import type { GuestRole } from '../db/schema'
import { isPublicMailDomain } from '#shared/utils/mailDomains'
import { accountOfAddress } from './extraEmails'

/** The boards a person is a guest of. */
export async function guestProjectIdsOf(userId: string): Promise<string[]> {
  const rows = await db.select({ projectId: projectGuests.projectId }).from(projectGuests).where(eq(projectGuests.userId, userId))
  return rows.map(row => row.projectId)
}

/** The guest row of a person on a board, or null when they are not a guest of it. */
export async function guestRowOf(projectId: string, userId: string) {
  const [row] = await db.select().from(projectGuests)
    .where(and(eq(projectGuests.projectId, projectId), eq(projectGuests.userId, userId)))
  return row ?? null
}

/** Lowercase, trimmed, no leading "@": what is stored and compared. Null when it is not a domain. */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const domain = input.trim().toLowerCase().replace(/^@/, '')
  if (domain.length > 253) return null
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ? domain : null
}

/**
 * A domain a project admin may whitelist for a manager guest: a real domain, and not a public mail
 * provider. Null input is "no domain". Anything else that fails is a 400 saying why.
 */
export function parseAllowedDomain(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null
  const domain = normalizeDomain(input)
  if (!domain) throw createError({ statusCode: 400, message: 'Write the domain like superfabulousshop.com' })
  if (isPublicMailDomain(domain)) {
    throw createError({ statusCode: 400, message: `${domain} is a public mail provider. Whitelist a company domain, and invite people at ${domain} one by one.` })
  }
  return domain
}

/** Lowercase and trimmed, or null when it is not an address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const email = input.trim().toLowerCase()
  if (email.length > 254 || /[\s<>,;"\\]/.test(email)) return null
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  return normalizeDomain(email.slice(at + 1)) ? email : null
}

/** The part after the last "@". */
export function domainOfEmail(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/**
 * Whether an address is at the domain. The domain itself only: `shop.com` takes `a@shop.com`, not
 * `a@mail.shop.com` and not `a@notshop.com`.
 */
export function emailInDomain(email: string, domain: string | null): boolean {
  return Boolean(domain) && domainOfEmail(email) === domain
}

export function parseGuestRole(role: unknown): GuestRole {
  if (role !== 'editor' && role !== 'manager') {
    throw createError({ statusCode: 400, message: 'A guest is an editor or a manager guest' })
  }
  return role
}

export async function accountByEmail(email: string) {
  // An address that is an account's verified extra address counts as that account, so "already on the team"
  // holds whichever of its addresses the invitation names.
  const owner = await accountOfAddress(email)
  if (!owner) return null
  const [row] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, owner.userId))
  return row ?? null
}
