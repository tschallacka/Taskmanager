// Which customer invitations an account claims by itself: an open link tied to one of its addresses. An anonymous
// link (no address) is never claimed this way. Pure, so it can be tested without a database.

export interface TiedCustomerInvite {
  id: string
  email: string | null
  acceptedAt: number | null
  expiresAt: number
}

export function customerInvitesToClaim(rows: TiedCustomerInvite[], addresses: string[], now: number): string[] {
  return rows.filter(row => tiedInviteIsAcceptable(row, addresses, now)).map(row => row.id)
}

/** One link, for the accept by id: open, unexpired, tied to one of the account's addresses. */
export function tiedInviteIsAcceptable(row: TiedCustomerInvite, addresses: string[], now: number): boolean {
  if (row.email === null || row.acceptedAt !== null || row.expiresAt <= now) return false
  const mine = new Set(addresses.map(address => address.toLowerCase()))
  return mine.has(row.email.toLowerCase())
}
