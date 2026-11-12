// The crew mail rules that need no database: what an id, a text and a recipient must be, how long mail is kept, and how
// many mails a person may send a minute. Kept apart from crewMail.ts so the rules can be tested alone.

// The one safety stop on a text: 1 MB of UTF-8. Mail has no other size cap. Over it the send is refused with a plain
// error that states the size; a text is never cut.
export const MAIL_TEXT_SAFETY_BYTES = 1024 * 1024
export const MAIL_PENDING_LIMIT = 500
export const MAIL_FETCH_LIMIT = 50
export const MAIL_SENDS_PER_MINUTE = 30
export const MAIL_KEEP_DELIVERED_MS = 7 * 86400_000
export const MAIL_KEEP_UNDELIVERED_MS = 30 * 86400_000
// The one key whose holder may read every person's mail (Boss, 2026-11-12). Nothing else reads another person's mail.
export const MAIL_READER_KEY = 'boss'

const MAIL_ID = /^[0-9a-f]{32}$/

/** Null when the id is valid: 32 lowercase hex characters, made by the sender's client. */
export function mailIdProblem(id: unknown): string | null {
  if (typeof id !== 'string' || !MAIL_ID.test(id)) return 'id must be 32 lowercase hex characters'
  return null
}

/**
 * Null when the text is valid: a non-empty string of at most 1 MB of UTF-8. Over the safety stop the problem says the
 * size, so the sender sees why the mail was refused, and nothing is cut.
 */
export function mailTextProblem(text: unknown): string | null {
  if (typeof text !== 'string') return 'text must be a string'
  if (!text.trim()) return 'text is empty'
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAIL_TEXT_SAFETY_BYTES) {
    return `text is ${bytes} bytes; the safety limit is ${MAIL_TEXT_SAFETY_BYTES} bytes (1 MB), so the mail is not sent`
  }
  return null
}

/**
 * Whether a key may send to or receive mail: a crew member (admin or member team), not a customer or contact. `teamOf`
 * gives a person's team from the crew's people list, or undefined for a key that is not a person.
 */
export function isMailMemberKey(key: unknown, teamOf: (key: string) => string | undefined): boolean {
  if (typeof key !== 'string' || !key) return false
  const team = teamOf(key)
  return team === 'admin' || team === 'member'
}

/** The moment before which mail is deleted: delivered and older than 7 days, or undelivered and older than 30 days. */
export function mailCutoffs(now: number): { deliveredBefore: number, undeliveredBefore: number } {
  return { deliveredBefore: now - MAIL_KEEP_DELIVERED_MS, undeliveredBefore: now - MAIL_KEEP_UNDELIVERED_MS }
}
