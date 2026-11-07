// One-time pairing codes: the short code a person copies to their agent, exchanged once for the token's
// secret so the secret never goes through the chat. Pure (no database): the code format, the digest a code is
// stored under, the refusals, and the rate limit on the exchange. The database side is in connectTokens.ts.
import { createError } from 'h3'
import { createHash, randomInt } from 'crypto'

export const PAIRING_CODE_PREFIX = 'tm-pair-'
export const PAIRING_CODE_TTL_MS = 10 * 60_000
// No look-alikes: no 0 or O, no 1, I or L.
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
// 8 characters of 32 is 40 bits: a guess is hopeless within the rate limit and the 10 minutes.
// The rate limit on exchanges is configurable (rateLimits.ts), so it is not here.

const AGENT_LINE = 'If you are an agent or subagent, pass this along to your main agent so they can ask the user for a new pairing code. Do not retry with this code.'

export type PairingRefusalCode = 'pairing_code_used' | 'pairing_code_expired'

/** The plain text an agent reads first when a code is refused. Unknown codes get no text at all. */
export const PAIRING_REFUSAL_MESSAGES: Record<PairingRefusalCode, string> = {
  pairing_code_used: `This pairing code has already been used. Please make a new pairing code in the Connect window. ${AGENT_LINE}`,
  pairing_code_expired: `This pairing code has expired. Pairing codes last 10 minutes. Please make a new pairing code in the Connect window. ${AGENT_LINE}`
}

/** A new code, shaped tm-pair-XXXX-XXXX. The caller stores only its digest. */
export function generatePairingCode(): string {
  let body = ''
  for (let i = 0; i < CODE_LENGTH; i++) body += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]
  return `${PAIRING_CODE_PREFIX}${body.slice(0, 4)}-${body.slice(4)}`
}

/**
 * The digest a code is stored under. Case, spaces, hyphens and the leading tm-pair- are ignored, so a code
 * pasted with a stray space still works. Null when the text cannot be a code at all.
 */
export function pairingCodeDigest(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const body = input.trim().toUpperCase().replace(/^TM-PAIR-/, '').replace(/[\s-]/g, '')
  if (body.length !== CODE_LENGTH) return null
  for (const char of body) {
    if (!PAIRING_ALPHABET.includes(char)) return null
  }
  return createHash('sha256').update(body).digest('hex')
}

/** Whether a code has run past its expiry at `now`. */
export function isPairingCodeExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now
}

/** A refusal for a code that was used or has expired: a 401 with its stable code and the sentence for the user. */
export function pairingRefusal(code: PairingRefusalCode) {
  return createError({
    statusCode: 401,
    statusMessage: 'Unauthorized',
    message: PAIRING_REFUSAL_MESSAGES[code],
    data: { code }
  })
}

/** The plain 401 for a code that was never issued. It says nothing about which codes exist. */
export function unknownPairingCode() {
  return createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid pairing code' })
}

/** Who used a code, as stored: the client's address and user agent, kept short. */
export function pairingSummary(ip: string | undefined, userAgent: string | undefined): string {
  return `${ip ?? 'unknown address'} ${userAgent ?? 'unknown client'}`.slice(0, 300)
}
