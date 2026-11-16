// Which customer invitations an account claims by itself: an open link tied to one of its addresses. An anonymous
// link (no address) is never claimed this way. Pure, so it can be tested without a database.

export interface TiedCustomerInvite {
  id: string
  email: string | null
  acceptedAt: number | null
  expiresAt: number
}

export function customerInvitesToClaim(rows: TiedCustomerInvite[], addresses: string[], now: number): string[] {
  const mine = new Set(addresses.map(address => address.toLowerCase()))
  return rows
    .filter(row => row.email !== null && row.acceptedAt === null && row.expiresAt > now && mine.has(row.email.toLowerCase()))
    .map(row => row.id)
}
