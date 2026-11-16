// The invite form's rules: an email invite needs a valid address (an anonymous link needs none), and a customer with no
// project and none ticked is warned before the link is made.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function inviteEmailError(value: string, required: boolean): string | null {
  const address = value.trim()
  if (!address) return required ? 'Enter the email address this invitation is for.' : null
  return EMAIL.test(address) ? null : 'Enter a valid email address.'
}

/** The project's Share path to a customer: a customer is picked and an email is given (both needed). */
export function customerInviteInputError(input: { customerId: string, email: string }): string | null {
  if (!input.customerId.trim()) return 'Choose the customer this person belongs to.'
  return inviteEmailError(input.email, true)
}

/** The customer is picked from the list or typed as a new name: exactly one of the two, and an email. */
export function customerChoiceError(input: { customerId: string, customerName: string, email: string }): string | null {
  const picked = input.customerId.trim() !== ''
  const typed = input.customerName.trim() !== ''
  if (picked && typed) return 'Choose one customer, or type a new name, not both.'
  if (!picked && !typed) return 'Choose the customer or type a new customer\'s name.'
  return inviteEmailError(input.email, true)
}

export function emptyCustomerWarning(input: { customerProjectCount: number, tickedCount: number }): string | null {
  if (input.customerProjectCount > 0 || input.tickedCount > 0) return null
  return 'This customer has no projects yet: they will see nothing.'
}

/** Only the team's own projects can be filed under a customer, each once: the ticked ids not in the team are dropped. */
export function fileableProjectIds(requested: string[], teamProjectIds: string[]): string[] {
  const own = new Set(teamProjectIds)
  return [...new Set(requested)].filter(id => own.has(id))
}
