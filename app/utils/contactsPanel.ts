// What the customer's panel says about its people. 'Nobody logs in' is said only when there is no contact and no
// invitation to an address waiting to be accepted.

export function showNobodyLine(contactCount: number, pendingCount: number): boolean {
  return contactCount === 0 && pendingCount === 0
}

/** The addresses of the invitations that carry one (an anonymous link carries none). */
export function pendingInvitedEmails(invitations: { email?: string | null }[]): string[] {
  return invitations.map(invite => invite.email).filter((email): email is string => Boolean(email))
}
