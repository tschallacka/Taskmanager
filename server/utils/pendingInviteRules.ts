// Which pending board invitations an account claims: every open, unexpired one sent to one of its addresses.
// Pure, so it can be tested without a database.

export interface PendingBoardInvite {
  id: string
  email: string
  status: string
  expiresAt: number
}

export function invitesToClaim(rows: PendingBoardInvite[], addresses: string[], now: number): string[] {
  const mine = new Set(addresses.map(address => address.toLowerCase()))
  return rows
    .filter(row => row.status === 'open' && row.expiresAt > now && mine.has(row.email.toLowerCase()))
    .map(row => row.id)
}
