// The invite form's rules: an email invite needs a valid address (an anonymous link needs none), and a customer with no
// project and none ticked is warned before the link is made.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function inviteEmailError(value: string, required: boolean): string | null {
  const address = value.trim()
  if (!address) return required ? 'Enter the email address this invitation is for.' : null
  return EMAIL.test(address) ? null : 'Enter a valid email address.'
}

export function emptyCustomerWarning(input: { customerProjectCount: number, tickedCount: number }): string | null {
  if (input.customerProjectCount > 0 || input.tickedCount > 0) return null
  return 'This customer has no projects yet: they will see nothing.'
}
