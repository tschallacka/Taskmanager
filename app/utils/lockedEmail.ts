// The address an invitation is tied to, carried to the sign-in and sign-up forms so it is prefilled and locked there.
// Only a well-formed address is carried; anything else is dropped.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The form link for an invitation: sign-in or sign-up, with the address when the invitation has one. */
export function inviteFormLink(token: string, mode: 'signin' | 'signup', email: string | null): string {
  const base = `/login?invite=${encodeURIComponent(token)}&${mode}=1`
  return email ? `${base}&email=${encodeURIComponent(email)}` : base
}

/** The address from the query, trimmed, or '' when it is missing, repeated or malformed. */
export function lockedEmailFromQuery(value: unknown): string {
  if (typeof value !== 'string') return ''
  const address = value.trim()
  return EMAIL.test(address) ? address : ''
}
