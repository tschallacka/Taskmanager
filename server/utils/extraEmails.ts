// Extra addresses (aliases) on an account. An extra address counts only once its owner confirms it through
// the link sent to it, and then it can sign the account in and receive an invitation. Confirming and adding
// both need two-factor or a passkey on the account, so the extra address never becomes a way round them.
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { passkey, user, userEmail, verification } from '../db/schema'
import { mailEnabled, sendMail } from '../lib/mailer'
import { hashInvitationToken, newInvitationToken } from './customers'
import { isInvalidDomain } from './crewAccounts'
import { instanceNameOf } from './instanceBranding'
import { genId } from './projects'

/** How long a confirmation link stays usable. */
export const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000
const CONFIRM_PREFIX = 'extra-email:'

/** The address stored in lowercase, trimmed. Null when it is not a plausible address. */
export function cleanAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const email = input.trim().toLowerCase()
  if (email.length > 254 || /[\s<>,;"\\]/.test(email)) return null
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return null
  return email
}

/** Lowercase main and verified extra addresses of an account. */
export async function addressesOfUser(userId: string): Promise<string[]> {
  const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId))
  const extras = await db.select({ email: userEmail.email }).from(userEmail)
    .where(and(eq(userEmail.userId, userId), isNotNull(userEmail.verifiedAt)))
  return [me?.email, ...extras.map(row => row.email)]
    .filter((email): email is string => Boolean(email))
    .map(email => email.toLowerCase())
}

/** The user id of the account that holds a verified extra address. Null when no account has it. */
async function extraOwnerOf(address: string): Promise<string | null> {
  const [extra] = await db.select({ userId: userEmail.userId }).from(userEmail)
    .where(and(sql`lower(${userEmail.email}) = ${address}`, isNotNull(userEmail.verifiedAt)))
  return extra?.userId ?? null
}

/** A confirmation link carries the same kind of random token as an invitation link; these names say what it is for here. */
function newConfirmToken() {
  return newInvitationToken()
}

function hashConfirmToken(token: string) {
  return hashInvitationToken(token)
}

/** The account an address belongs to, as its main address or a verified extra one. Null when none has it. */
export async function accountOfAddress(email: string): Promise<{ userId: string, mainEmail: string } | null> {
  const address = email.trim().toLowerCase()
  const [main] = await db.select({ id: user.id, email: user.email }).from(user)
    .where(sql`lower(${user.email}) = ${address}`)
  if (main) return { userId: main.id, mainEmail: main.email }
  const userId = await extraOwnerOf(address)
  if (!userId) return null
  const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId))
  return owner ? { userId, mainEmail: owner.email } : null
}

/** The main address of the account a verified extra address belongs to. Null for a main address or an unknown one. */
export async function mainAddressForExtra(email: string): Promise<string | null> {
  const userId = await extraOwnerOf(email.trim().toLowerCase())
  if (!userId) return null
  const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId))
  return owner?.email ?? null
}

/** Whether the account has two-factor on or at least one passkey. */
export async function hasSecondFactor(userId: string): Promise<boolean> {
  const [me] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId))
  if (me?.twoFactorEnabled) return true
  const [key] = await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1)
  return Boolean(key)
}

/** Whether the account has any extra address, confirmed or still waiting for its link. */
export async function hasExtraAddresses(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: userEmail.id }).from(userEmail).where(eq(userEmail.userId, userId)).limit(1)
  return Boolean(row)
}

export async function extraAddressesOf(userId: string) {
  return db.select({ id: userEmail.id, email: userEmail.email, verifiedAt: userEmail.verifiedAt })
    .from(userEmail)
    .where(eq(userEmail.userId, userId))
}

/**
 * Adds an extra address and mails its confirmation link to that address. The link never comes back in the
 * answer: only the owner of the address may open it.
 */
export async function startExtraEmail(
  userId: string,
  input: unknown,
  confirmUrl: (token: string) => string
): Promise<{ id: string, email: string }> {
  const email = cleanAddress(input)
  if (!email || isInvalidDomain(email)) throw createError({ statusCode: 400, message: 'Write a valid email address' })
  if (!mailEnabled) {
    throw createError({ statusCode: 503, message: 'This instance cannot send mail, so an extra address cannot be confirmed here.' })
  }
  const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId))
  if (me?.email.toLowerCase() === email) throw createError({ statusCode: 400, message: 'That is already your main address.' })
  if (await accountOfAddress(email)) throw createError({ statusCode: 409, message: 'That address is already in use.' })
  if (!(await hasSecondFactor(userId))) {
    throw createError({ statusCode: 403, message: 'Turn on two-factor or add a passkey before you add an extra address.' })
  }

  // A repeated request for the same address replaces its waiting row, so one address waits in one place.
  await db.delete(userEmail).where(and(eq(userEmail.userId, userId), eq(userEmail.email, email), isNull(userEmail.verifiedAt)))
  const id = genId()
  const now = new Date()
  await db.insert(userEmail).values({ id, userId, email, verifiedAt: null, createdAt: now })

  const { token, tokenHash } = newConfirmToken()
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS)
  await db.insert(verification).values({
    id: genId(),
    identifier: `${CONFIRM_PREFIX}${tokenHash}`,
    value: `${userId}\n${email}`,
    expiresAt,
    createdAt: now,
    updatedAt: now
  })
  const url = confirmUrl(token)
  const name = await instanceNameOf()
  const text = `Confirm ${email} as an extra address on your ${name} account.\n\nOpen this link while you are signed in to that account: ${url}\n\nThe link expires in 24 hours. If you did not add this address, ignore this email.`
  const html = `<p>Confirm ${email} as an extra address on your ${name} account.</p>`
    + `<p><a href="${url}">Confirm this address</a></p>`
    + '<p>Open the link while you are signed in to that account. It expires in 24 hours. If you did not add this address, ignore this email.</p>'
  sendMail({ to: email, subject: `Confirm your extra address on ${name}`, text, html })
    .catch(error => console.error('[extraEmails] could not send the confirmation mail', error))
  return { id, email }
}

/** Confirms an extra address for the signed-in account that added it. */
export async function confirmExtraEmail(token: string, userId: string): Promise<{ email: string }> {
  const identifier = `${CONFIRM_PREFIX}${hashConfirmToken(token)}`
  const [row] = await db.select().from(verification).where(eq(verification.identifier, identifier))
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 410, message: 'This link is no longer valid. Add the address again.' })
  }
  const [ownerId, email] = row.value.split('\n')
  if (ownerId !== userId) {
    throw createError({ statusCode: 403, message: 'Sign in to the account that added this address to confirm it.' })
  }
  if (!(await hasSecondFactor(userId))) {
    throw createError({ statusCode: 403, message: 'Turn on two-factor or add a passkey before you confirm an extra address.' })
  }
  if (await accountOfAddress(email!)) throw createError({ statusCode: 409, message: 'That address is already in use.' })

  const [claimed] = await db.update(userEmail)
    .set({ verifiedAt: new Date() })
    .where(and(eq(userEmail.userId, userId), eq(userEmail.email, email!), isNull(userEmail.verifiedAt)))
    .returning({ id: userEmail.id })
  if (!claimed) throw createError({ statusCode: 410, message: 'This link is no longer valid. Add the address again.' })
  await db.delete(verification).where(eq(verification.identifier, identifier))
  return { email: email! }
}

/**
 * Whether the account keeps a second factor when the passkey `removedId` goes: two-factor on, or another
 * passkey left. Used so the last passkey cannot leave an account with extra addresses unguarded.
 */
export async function keepsSecondFactor(userId: string, removedId: string): Promise<boolean> {
  const [me] = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId))
  if (me?.twoFactorEnabled) return true
  const [other] = await db.select({ id: passkey.id }).from(passkey)
    .where(and(eq(passkey.userId, userId), sql`${passkey.id} <> ${removedId}`))
    .limit(1)
  return Boolean(other)
}

/** Removes one of the account's own extra addresses, confirmed or not. */
export async function removeExtraEmail(userId: string, id: string): Promise<void> {
  const removed = await db.delete(userEmail)
    .where(and(eq(userEmail.id, id), eq(userEmail.userId, userId)))
    .returning({ id: userEmail.id })
  if (!removed.length) throw createError({ statusCode: 404, message: 'That address is not on your account.' })
}
