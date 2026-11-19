// What the customer's panel says about its people. 'Nobody logs in' is said only when there is no contact and no
// invitation to an address waiting to be accepted.

export function showNobodyLine(contactCount: number, pendingCount: number): boolean {
  return contactCount === 0 && pendingCount === 0
}

/** The invitations that carry an address (an anonymous link carries none). Each row keeps its own invitation. */
export function pendingInvitations<T extends { email?: string | null }>(invitations: T[]): (T & { email: string })[] {
  return invitations.filter((invite): invite is T & { email: string } => Boolean(invite.email))
}

/** The addresses of the invitations that carry one (an anonymous link carries none). */
export function pendingInvitedEmails(invitations: { email?: string | null }[]): string[] {
  return pendingInvitations(invitations).map(invite => invite.email)
}
