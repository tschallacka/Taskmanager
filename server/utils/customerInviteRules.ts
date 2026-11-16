// Which customer invitations an account claims by itself: an open link tied to one of its addresses. An anonymous
// link (no address) is never claimed this way. Pure, so it can be tested without a database.

export interface TiedCustomerInvite {
  id: string
  email: string | null
  acceptedAt: number | null
  expiresAt: number
  /** Set when the manager revoked the link; a revoked link is never claimed or accepted. */
  revokedAt?: number | null
}

/** The state a customer link is in, for the page. A used link stays used even after a revoke. */
export function customerLinkState(row: TiedCustomerInvite, now: number): 'open' | 'used' | 'revoked' | 'expired' {
  if (row.acceptedAt !== null) return 'used'
  if (row.revokedAt !== null && row.revokedAt !== undefined) return 'revoked'
  if (row.expiresAt <= now) return 'expired'
  return 'open'
}

export function customerInvitesToClaim(rows: TiedCustomerInvite[], addresses: string[], now: number): string[] {
  return rows.filter(row => tiedInviteIsAcceptable(row, addresses, now)).map(row => row.id)
}

/**
 * May the signed-in account accept a link sent to `invitedEmail`? Yes when the address is one of its verified addresses,
 * or when the account's own address is the invited one: the account was made through the link, so the holder is the
 * invitee. Any other address is refused. The caller holds the link (its token is the route's path).
 */
export function invitedAddressIsMine(input: { invitedEmail: string, verifiedAddresses: string[], signedInEmail: string | null }): boolean {
  const invited = input.invitedEmail.toLowerCase()
  const verified = input.verifiedAddresses.map(address => address.toLowerCase())
  const own = input.signedInEmail?.toLowerCase() ?? null
  return verified.includes(invited) || own === invited
}

/** One link, for the accept by id: open, unexpired, tied to one of the account's addresses. */
export function tiedInviteIsAcceptable(row: TiedCustomerInvite, addresses: string[], now: number): boolean {
  if (row.email === null || customerLinkState(row, now) !== 'open') return false
  const mine = new Set(addresses.map(address => address.toLowerCase()))
  return mine.has(row.email.toLowerCase())
}
